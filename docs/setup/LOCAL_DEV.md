# Local Development (v1)

## Goal
Spin up a developer instance fast with predictable defaults and clean docs.

## Prerequisites
- Node.js 22+
- pnpm 9+
- Docker + Docker Compose
- OpenSSL (for local cert tooling)

## Quick Start
```bash
pnpm install
cp .env.example .env
pnpm dev:infra
pnpm dev
```

## Infra Services (Docker)
- Postgres (primary relational store)
- Redis (cache, presence, rate limits)
- MinIO (S3-compatible object store for encrypted blobs)

## Apps (planned dev commands)
- `pnpm dev:auth`
- `pnpm dev:api`
- `pnpm dev:gateway`
- `pnpm dev:billing`
- `pnpm dev:client`

## DB Notes
- Migrations are source-of-truth.
- No manual schema drift in local DB.
- Seed scripts create a local admin user and demo server.
