/* Hermia integration contract
 * Shared, deterministic helpers for Hookdeck -> Make -> App Worker -> CRM workflows.
 * No credentials, tenant IDs or customer data belong in this file.
 */

export const CONTRACT_VERSION = '1.0';

export const CHANNELS = Object.freeze([
  'email',
  'whatsapp',
  'outlook',
  'web_form',
  'instagram',
  'facebook',
  'google_business',
  'api',
  'customer_portal',
]);

export const CRM_PROVIDERS = Object.freeze([
  'simpro',
  'aroflo',
  'salesforce',
  'custom_api',
]);

export const WORKFLOW_STATUSES = Object.freeze([
  'draft',
  'testing',
  'published',
  'retired',
]);

// This is the code safe to give a client or type into Make. It is not an
// authentication secret and must not replace the internal tenant UUID.
export const MAKE_CLIENT_CODE_PATTERN = /^HM-[A-Z0-9]{6}$/;

export function normalizeMakeClientCode(value) {
  const code = String(value ?? '').trim().toUpperCase();
  if (!MAKE_CLIENT_CODE_PATTERN.test(code)) {
    throw new Error('make_client_code must look like HM-ABC123');
  }
  return code;
}

export function makeClientCodeFromTenantId(tenantId) {
  const hex = requireNonEmpty(tenantId, 'tenant_id').replace(/-/g, '').toUpperCase();
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let value = 0;
  for (const character of hex.slice(0, 6)) value = (value * 16 + parseInt(character, 16)) >>> 0;
  let suffix = '';
  for (let index = 0; index < 6; index += 1) {
    suffix = alphabet[value % alphabet.length] + suffix;
    value = Math.floor(value / alphabet.length);
  }
  return `HM-${suffix}`;
}

export const LEAD_STATUSES = Object.freeze([
  'received',
  'qualifying',
  'qualified',
  'needs_human_review',
  'rejected',
  'completed',
]);

export function requireNonEmpty(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} is required`);
  return text;
}

export function normalizeTenantContext(input = {}) {
  return {
    tenant_id: requireNonEmpty(input.tenant_id, 'tenant_id'),
    make_client_code: input.make_client_code
      ? normalizeMakeClientCode(input.make_client_code)
      : makeClientCodeFromTenantId(input.tenant_id),
    workflow_id: requireNonEmpty(input.workflow_id, 'workflow_id'),
    workflow_version: Number.isInteger(input.workflow_version)
      ? input.workflow_version
      : 1,
    lead_code: requireNonEmpty(input.lead_code, 'lead_code'),
    channel: CHANNELS.includes(input.channel) ? input.channel : 'api',
    crm_provider: CRM_PROVIDERS.includes(input.crm_provider)
      ? input.crm_provider
      : 'custom_api',
  };
}

export function getProviderEventId(input = {}) {
  return String(
    input.provider_event_id ||
      input.message_id ||
      input.event_id ||
      input.hookdeck_event_id ||
      '',
  ).trim();
}

export function buildIdempotencyKey(input = {}) {
  const context = normalizeTenantContext(input);
  const providerEventId = getProviderEventId(input);
  if (!providerEventId) throw new Error('provider_event_id is required for idempotency');
  return [context.tenant_id, context.channel, providerEventId].join(':');
}

export function buildQualificationRequest(input = {}) {
  const context = normalizeTenantContext(input);
  return {
    contract_version: CONTRACT_VERSION,
    idempotency_key: buildIdempotencyKey(input),
    tenant: context,
    source: {
      provider_event_id: getProviderEventId(input),
      thread_id: String(input.thread_id || '').trim() || null,
      received_at: input.received_at || new Date().toISOString(),
    },
    message: {
      text: String(input.text || ''),
      attachments: Array.isArray(input.attachments) ? input.attachments : [],
    },
    lead: {
      current_step: Number.isInteger(input.current_step) ? input.current_step : 1,
      status: input.status || 'qualifying',
    },
  };
}

export function isRetryableCrmStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

export function simproBackoffMs(attempt, retryAfterMs = null) {
  const explicit = Number(retryAfterMs);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.min(explicit, 120000);
  const base = 1000 * 2 ** Math.max(0, Number(attempt) - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(base + jitter, 120000);
}

export function assertNoSecretValues(value) {
  const serialized = JSON.stringify(value || {});
  if (/bearer\s+[A-Za-z0-9._-]{12,}|api[_-]?key\s*[:=]\s*[^\s,}]+|client_secret/i.test(serialized)) {
    throw new Error('Secret-like values must not be stored in the workflow payload');
  }
  return true;
}
