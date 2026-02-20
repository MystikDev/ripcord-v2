# AI Architecture (v1)

## Services
- AI Orchestrator
- AI Context Service
- AI Safety Service
- Optional AI Memory/Index Service

## Security Model
- ACL-scoped context only
- Per-request redaction (PII/secrets)
- Provider policy controls (no training on customer data by default)
- Full audit trail for AI actions

## Phase 1 Features
- /summarize
- /catch-up
- draft reply assist
- action item extraction
