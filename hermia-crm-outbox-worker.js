/* Hermia CRM outbox worker template.
 * Deploy in Cloudflare Dashboard after wiring secrets/bindings.
 * Required vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * CRM credentials must be supplied by a secure integration layer; never place them in Supabase payloads.
 */

const MAX_SIMPRO_CALLS_PER_SECOND = 5;
const MAX_ATTEMPTS = 8;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function backoffMs(attempt, retryAfterHeader) {
  const retryAfter = Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, 120000);
  }
  const base = 1000 * 2 ** Math.max(0, attempt - 1);
  return Math.min(base + Math.floor(Math.random() * 250), 120000);
}

function retryable(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

async function supabase(env, path, init = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

function providerAdapter(item, env) {
  switch (item.crm_provider) {
    case 'simpro':
      return {
        maxCallsPerSecond: MAX_SIMPRO_CALLS_PER_SECOND,
        async execute() {
          // Replace with the tenant's secure Simpro adapter call.
          // Do not hardcode a build URL, company ID or API key here.
          throw new Error('Simpro adapter is not wired: provide a secure tenant integration resolver');
        },
      };
    case 'aroflo':
    case 'salesforce':
    case 'custom_api':
      return {
        maxCallsPerSecond: 1,
        async execute() {
          throw new Error(`${item.crm_provider} adapter is not wired: provide a secure tenant integration resolver`);
        },
      };
    default:
      throw new Error(`Unsupported CRM provider: ${item.crm_provider}`);
  }
}

async function claim(env, limit = 1) {
  return supabase(env, 'rpc/claim_hermia_crm_outbox', {
    method: 'POST',
    body: JSON.stringify({ p_limit: Math.max(1, Math.min(Number(limit) || 1, 10)) }),
  });
}

async function mark(env, item, patch) {
  return supabase(env, `hermia_crm_outbox?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  });
}

async function processOne(item, env) {
  if (Number(item.attempt_count) > MAX_ATTEMPTS) {
    await mark(env, item, { status: 'dead_letter', last_error: 'Maximum attempts exceeded' });
    return { id: item.id, status: 'dead_letter' };
  }

  const adapter = providerAdapter(item, env);
  try {
    const result = await adapter.execute(item, env);
    await mark(env, item, {
      status: 'succeeded',
      provider_record_id: result?.provider_record_id || null,
      last_http_status: result?.status || 200,
      last_error: null,
    });
    return { id: item.id, status: 'succeeded' };
  } catch (error) {
    const message = String(error?.message || error);
    const retry = /\b429\b|timeout|temporar|rate limit/i.test(message);
    if (!retry || Number(item.attempt_count) >= MAX_ATTEMPTS) {
      await mark(env, item, { status: 'dead_letter', last_error: message.slice(0, 2000) });
      return { id: item.id, status: 'dead_letter', error: message };
    }
    const delay = backoffMs(Number(item.attempt_count), null);
    await mark(env, item, {
      status: 'retrying',
      last_error: message.slice(0, 2000),
      next_attempt_at: new Date(Date.now() + delay).toISOString(),
    });
    return { id: item.id, status: 'retrying', delay_ms: delay };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'hermia-crm-outbox', version: '1.0' });
    }
    if (request.method !== 'POST' || url.pathname !== '/outbox/process') {
      return json({ error: 'Not found' }, 404);
    }
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Worker secrets are not configured' }, 503);
    }

    const items = await claim(env, 1);
    const results = [];
    for (const item of items || []) {
      // Sequential processing is deliberate: it prevents burst traffic to a single CRM build.
      results.push(await processOne(item, env));
    }
    return json({ ok: true, claimed: results.length, results });
  },
};
