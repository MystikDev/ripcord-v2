# Ripcord v2 — Guiding Principles

These principles apply to ALL design and development decisions.

## 1. Modern & Slick Client
- Extremely modern UI/UX — premium feel, not a Discord clone
- Custom design system with logos, assets, and brand identity
- Glass morphism, fluid animations, dark-first theme
- Every interaction should feel polished and intentional

## 2. Well-Documented & Structured Code
- Every module, service, and function documented
- Clear separation of concerns
- Consistent code style and patterns across the monorepo
- Architecture decision records for non-obvious choices

## 3. Security is Non-Negotiable
- Server cannot be hacked — defense in depth, zero trust
- Client-side security: CSP, XSS prevention, secure storage
- E2EE by default for all private communications
- Regular security audit patterns baked into the codebase
- No shortcuts on auth, sessions, or data validation

## 4. Dead-Simple Server Setup
- One-command deployment (docker compose up)
- Automated database migrations on startup
- Sane defaults, minimal configuration required
- Clear setup documentation for self-hosters

## 5. Feature Parity+ with Discord
- Push-to-talk voice chat
- Screen sharing
- Video calls
- Everything Discord does, done better
- AI-native features as a differentiator
