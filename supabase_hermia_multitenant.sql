-- Hermia multi-tenant workflow foundation.
-- Additive migration: does not clear existing customers, configuration routes or lead progress.

create table if not exists public.hermia_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_key text not null,
  -- Human-facing Make code, e.g. HM-7K2Q9A. Keep tenant_id as the internal key.
  client_code text check (client_code is null or client_code ~ '^HM-[A-Z0-9]{6}$'),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','testing','published','retired')),
  industry text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique (tenant_id, workflow_key, version)
);

create index if not exists hermia_workflows_published_idx
  on public.hermia_workflows (tenant_id, workflow_key, status, version desc);

create table if not exists public.hermia_tenant_codes (
  tenant_id uuid primary key,
  client_code text not null unique check (client_code ~ '^HM-[A-Z0-9]{6}$'),
  created_at timestamptz not null default now()
);

create index if not exists hermia_workflows_client_code_idx
  on public.hermia_workflows (tenant_id, client_code)
  where client_code is not null;

create table if not exists public.hermia_lead_context (
  lead_code text primary key,
  tenant_id uuid not null,
  workflow_id uuid not null references public.hermia_workflows(id),
  workflow_version integer not null,
  current_step integer not null default 1 check (current_step > 0),
  status text not null default 'received' check (status in ('received','qualifying','qualified','needs_human_review','rejected','completed')),
  inbound_channel text not null,
  outbound_channel text,
  crm_provider text,
  crm_record_id text,
  crm_customer_id text,
  crm_site_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hermia_lead_context_tenant_idx
  on public.hermia_lead_context (tenant_id, status, updated_at desc);

create table if not exists public.hermia_event_receipts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  idempotency_key text not null unique,
  provider_event_id text not null,
  channel text not null,
  lead_code text,
  status text not null default 'received' check (status in ('received','processing','processed','ignored','failed')),
  response jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists hermia_event_receipts_tenant_idx
  on public.hermia_event_receipts (tenant_id, received_at desc);

create table if not exists public.hermia_crm_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_code text not null,
  crm_provider text not null,
  operation text not null,
  idempotency_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','succeeded','retrying','dead_letter')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_http_status integer,
  last_error text,
  provider_record_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists hermia_crm_outbox_due_idx
  on public.hermia_crm_outbox (crm_provider, status, next_attempt_at);

-- Atomically claim one due outbox item. The caller performs the CRM request
-- and updates the row; no CRM key is stored in this table.
create or replace function public.claim_hermia_crm_outbox(p_limit integer default 1)
returns setof public.hermia_crm_outbox
language sql
security definer
set search_path = public
as $$
  update public.hermia_crm_outbox as o
     set status = 'processing',
         attempt_count = o.attempt_count + 1,
         updated_at = now()
   where o.id in (
     select id
       from public.hermia_crm_outbox
      where status in ('pending','retrying')
        and next_attempt_at <= now()
      order by next_attempt_at, created_at
      for update skip locked
      limit greatest(1, least(coalesce(p_limit, 1), 50))
   )
  returning o.*;
$$;

revoke all on function public.claim_hermia_crm_outbox(integer) from public;
