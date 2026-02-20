# Billing and Entitlements (v1)

## Goals
- Keep core communication free.
- Offer paid tiers for users/teams that want to contribute and unlock premium features.
- Enforce entitlements server-side only.
- Keep billing architecture auditable and secure.

## Product Tiers

### Free
- Core messaging (DMs, servers/channels)
- Basic AI usage (small monthly quota)
- Standard uploads
- Community support

### Ripcord Pro (User)
- Higher AI monthly quota
- Larger upload limits
- Premium UI customization packs
- Faster search/history indexing priority
- Priority support queue

### Ripcord Team (Server/Org)
- Pooled AI credits for the server
- Admin security and audit exports
- Advanced policy controls
- Higher storage and upload limits
- Priority support + SLA options (later)

## Entitlement Model
Entitlements are the only runtime source of truth. Plans map to entitlements; clients never decide access.

Examples:
- `ai.monthly_tokens`
- `upload.max_file_mb`
- `themes.premium_enabled`
- `audit.export_enabled`
- `support.priority`

Resolution precedence:
1. Explicit account override (admin/support operations)
2. Active subscription plan entitlements
3. Free-tier defaults

## Services

### Billing Service
Responsibilities:
- Plan catalog management
- Subscription lifecycle (create/update/cancel/renew)
- Invoice state sync
- Entitlement materialization

### Webhook Ingest
Responsibilities:
- Verify provider signatures
- Idempotent processing by provider event id
- Persist raw event + processing result
- Trigger entitlement recalculation

### Entitlement Guard (shared middleware)
Responsibilities:
- Server-side checks on API and gateway actions
- Deny by default when entitlement absent
- Emit audit event on denied premium action attempts (sampled)

## Database Schema (v1)

```sql
-- Plans
CREATE TABLE plans (
  id UUID PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,                 -- free | pro | team
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,                -- user | server
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  interval TEXT NOT NULL,                    -- month | year
  features_jsonb JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscription owner mapped to either user or server account
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  account_type TEXT NOT NULL,                -- user | server
  account_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES plans(id),
  provider TEXT NOT NULL,                    -- stripe | lemonsqueezy | ...
  provider_subscription_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,                      -- trialing | active | past_due | canceled | incomplete
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_owner ON subscriptions(account_type, account_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Provider customer reference
CREATE TABLE payment_customers (
  id UUID PRIMARY KEY,
  account_type TEXT NOT NULL,
  account_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_customer_id),
  UNIQUE(account_type, account_id, provider)
);

-- Invoices and payment state
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  provider_invoice_id TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL,                      -- draft | open | paid | void | uncollectible
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Raw billing events for audit and replay safety
CREATE TABLE billing_events (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_jsonb JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  process_status TEXT NOT NULL DEFAULT 'pending', -- pending | processed | failed
  error_text TEXT,
  UNIQUE(provider, provider_event_id)
);

-- Materialized entitlement state
CREATE TABLE entitlements (
  id UUID PRIMARY KEY,
  account_type TEXT NOT NULL,
  account_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  feature_value_jsonb JSONB NOT NULL,
  source TEXT NOT NULL,                      -- free_default | plan | override
  source_ref TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(account_type, account_id, feature_key)
);
CREATE INDEX idx_entitlements_owner ON entitlements(account_type, account_id);
```

## Security Requirements
- Verify webhook signature on every callback.
- Reject stale timestamped webhook payloads.
- Idempotent event processing by `(provider, provider_event_id)` unique key.
- Use server-to-server API calls for final invoice/subscription verification before entitlement updates.
- Keep billing PII and payment metadata out of chat/event logs.
- Encrypt sensitive billing fields at rest where required by provider/legal posture.
- Scope admin billing actions with step-up authentication.

## Runtime Enforcement
All premium actions check entitlements in backend middleware, never in client logic only.

Examples:
- AI request -> check `ai.monthly_tokens` and current usage
- Upload -> check `upload.max_file_mb`
- Theme pack -> check `themes.premium_enabled`
- Audit export -> check `audit.export_enabled`

## Failure Handling
- Grace period on failed renewal (e.g., 3-7 days).
- During grace: keep premium features active but show billing warning.
- After grace: downgrade entitlements to free defaults; do not delete user/server data.
- Store downgrade reason/event for audit and support handling.

## Initial Entitlement Matrix (starter)

| Feature | Free | Pro (User) | Team (Server) |
|---|---:|---:|---:|
| ai.monthly_tokens | 100k | 2M | 10M pooled |
| upload.max_file_mb | 25 | 200 | 500 |
| themes.premium_enabled | false | true | true |
| audit.export_enabled | false | false | true |
| support.priority | false | true | true |

> Values are placeholders for tuning after usage/cost modeling.

## Open Questions
- Payment provider choice (Stripe recommended first).
- Tax/VAT handling by region.
- Trial strategy (e.g., Pro 14-day, Team 30-day).
- Annual discount and grandfathering policy.
