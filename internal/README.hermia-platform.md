# Hermia platform foundation

These additive files define the tenant-aware workflow contract and CRM outbox foundation for Hookdeck → Make → App Worker → CRM delivery.

## What is live today

The public configuration journey still uses the existing Simpro/AroFlo and Gmail/Outlook connection routes. The configuration payload now records neutral inbound/outbound channel choices and flags Salesforce/other CRM selections as requiring connector setup. No unsupported CRM is represented as live.

## Files

- `hermia_integration_contract.js` — tenant, workflow, channel, CRM and idempotency contract.
- `supabase_hermia_multitenant.sql` — additive tables for workflow versions, lead context, event receipts and CRM outbox state.
- `hermia-crm-outbox-worker.js` — Cloudflare Dashboard deployment template for sequential outbox processing and retry/backoff. It intentionally stops with an explicit adapter-not-wired error until a secure per-tenant integration resolver is supplied.

## Simpro protection

The outbox is designed for sequential processing, search-before-create adapters, persisted provider IDs and retryable 429 handling. It does not assume `Retry-After`, OAuth behaviour, or whether the 10 requests/second limit is shared beyond the official documentation supplied for this task.

## Required next integration work

1. Add a secure tenant integration resolver; do not store CRM keys in workflow payloads.
2. Implement and test each CRM adapter separately.
3. Add Make idempotency checks using `tenant_id + channel + provider_event_id`.
4. Enable the adapter only after a real sandbox test passes.
