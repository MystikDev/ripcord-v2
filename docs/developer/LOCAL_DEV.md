# Local Dev Quickstart

## Prereqs
- Node.js 20+
- Docker

## 1) Start infra
```bash
docker compose up -d postgres redis
```

## 2) Install deps
```bash
npm install
```

## 3) Configure env
```bash
cp .env.example .env
```

## 4) Run migrations
```bash
npm run db:migrate
```

## 5) Start services
```bash
npm run dev
```

- API: http://localhost:4000/health
- Gateway WS: ws://localhost:4001

## Security defaults for local
- Never log plaintext message payloads
- Use sample/test keys only
- Treat `.env` as secret (never commit)
