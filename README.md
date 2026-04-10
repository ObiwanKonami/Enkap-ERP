<div align="center">

# Enkap ERP

**Open-source, multi-tenant, AI-powered ERP platform built for Turkish SMEs**

[![License](https://img.shields.io/badge/license-Enkap%20Community%20License-blue)](./LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?logo=typescript)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red?logo=nestjs)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org/)

[Getting Started](#-getting-started) · [Architecture](#-architecture) · [Services](#-services) · [Contributing](./CONTRIBUTING.md) · [License](./LICENSE.md)

</div>

---

## What is Enkap?

Enkap is a **fully open-source, production-grade ERP platform** designed specifically for the Turkish market. It handles the full business lifecycle — from procurement and inventory to payroll, e-invoicing (GİB), and fleet management — under a single, beautifully designed interface.

**Why Enkap exists:**
- Existing ERP software in Turkey is either too expensive, too rigid, or built on decades-old architecture.
- Enkap is built on modern microservices, designed to scale, and ships with first-class compliance for Turkish regulations (e-Fatura, e-İrsaliye, SGK, KDV, KVKK).
- Every business, from a 10-person workshop to a 500-person manufacturer, should have access to world-class software.

---

## Key Features

| Module | Capabilities |
|--------|-------------|
| **Financial** | Sales & purchase invoicing, GİB e-Fatura / e-Arşiv submission, AR/AP, double-entry accounting |
| **Inventory** | Multi-warehouse stock, lot/serial tracking, FIFO/LIFO costing, e-commerce sync |
| **Procurement** | Purchase orders, goods receipt (GRN), automatic purchase invoicing, approval workflows |
| **Sales** | Sales orders, delivery management, customer portal |
| **e-Waybill** | UBL-TR 2.1 compliant e-İrsaliye, GİB submission, XAdES-T signing |
| **HR & Payroll** | Employee management, payroll (2025 SGK rules), leave tracking, advance payments |
| **Fleet** | Vehicle & driver management, GPS tracking, HGS/toll integration, maintenance logs |
| **CRM** | Contacts, leads, activity timeline, Kanban pipeline |
| **Treasury** | Cash accounts, bank reconciliation, multi-currency (TRY, USD, EUR, AED, SAR) |
| **AI** | XGBoost sales forecasting, Prophet demand planning, Isolation Forest anomaly detection |
| **Manufacturing** | BOM, MRP, work orders |

---

## Architecture

Enkap is a **microservices monorepo** powered by [Turborepo](https://turbo.build/) and [pnpm workspaces](https://pnpm.io/workspaces).

```
┌─────────────────────────────────────────────────────┐
│                  Presentation Layer                 │
│        Web (Next.js 14)  │  Mobile (React Native)  │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│              API Gateway (Kong)                     │
│        Rate limiting · mTLS · IP filtering          │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│          18 NestJS Microservices + 2 FastAPI         │
│              (see Services section below)           │
└──────┬──────────────────┬──────────────────┬────────┘
       │                  │                  │
  ┌────▼────┐       ┌─────▼─────┐     ┌─────▼─────┐
  │PostgreSQL│       │   Redis   │     │ RabbitMQ  │
  │   16    │       │     7     │     │           │
  └─────────┘       └───────────┘     └───────────┘
```

**Multi-tenancy model:** Schema-per-tenant on PostgreSQL. Every tenant's data is completely isolated at the database level. Tenant routing is handled transparently via `AsyncLocalStorage` — no tenant ID ever leaks through function arguments.

**Tech stack at a glance:**

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 10 + Fastify + TypeORM |
| Frontend | Next.js 14 + React 19 + shadcn/ui + Tailwind CSS 4 |
| Mobile | React Native 0.76 + Expo EAS + WatermelonDB (offline) |
| Database | PostgreSQL 16 (schema-per-tenant) |
| Cache | Redis 7 |
| Messaging | RabbitMQ (topic exchange, persistent) |
| Auth | JWT (JTI revocable) + OAuth2 + FCM push |
| Observability | OpenTelemetry + Jaeger + Grafana + Prometheus |
| GİB Signing | Java 17 + BouncyCastle (XAdES-T) |
| Secrets | HashiCorp Vault (per-tenant AES-256) |
| Orchestration | Kubernetes + Istio strict mTLS |
| CI/CD | GitHub Actions |
| ML/AI | FastAPI + XGBoost + Prophet + SHAP |

---

## Services

| Port | Service | Purpose |
|------|---------|---------|
| 3001 | `auth-service` | JWT, OAuth2, RBAC, FCM |
| 3002 | `tenant-service` | Provisioning, white-label, admin |
| 3003 | `financial-service` | Invoicing, KDV, GİB, accounting |
| 3004 | `stock-service` | Products, warehouses, movements |
| 3005 | `ml-inference` | XGBoost, Prophet, SHAP (FastAPI) |
| 3006 | `webhook-hub` | Outbox pattern, webhook delivery |
| 3007 | `hr-service` | Payroll, employees, SGK, leave |
| 3008 | `billing-service` | iyzico, subscriptions, dunning |
| 3009 | `crm-service` | Contacts, leads, pipeline |
| 3010 | `analytics-service` | Platform metrics, BI, cohorts |
| 3011 | `purchase-service` | Purchase orders, goods receipt |
| 3012 | `order-service` | Sales orders, shipments |
| 3013 | `treasury-service` | Cash, bank, reconciliation |
| 3014 | `manufacturing-service` | BOM, MRP, work orders |
| 3016 | `ai-assistant` | LLM, OCR, document analysis (FastAPI) |
| 3017 | `fleet-service` | Vehicles, drivers, GPS, HGS |
| 3018 | `waybill-service` | e-İrsaliye, UBL-TR, GİB |
| 3019 | `notification-service` | Email / SMS / push via RabbitMQ |
| 3000 | `web` | Next.js dashboard |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker + Docker Compose
- Java 17 (for GİB signing module only)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/your-org/enkap.git
cd enkap

# 2. Install all dependencies (monorepo)
pnpm install

# 3. Start infrastructure
docker compose up -d postgres redis pgbouncer rabbitmq

# 4. Run database migrations
pnpm db:migrate

# 5. Seed demo data (optional)
pnpm demo:seed

# 6. Start all services in development mode
pnpm dev
```

The web dashboard will be available at [http://localhost:3000](http://localhost:3000).

### Running a single service

```bash
# Only the financial service
pnpm --filter @enkap/financial-service dev

# Only the web dashboard
pnpm --filter @enkap/web dev
```

### Running tests

```bash
pnpm test:unit      # Unit tests (all services)
pnpm test:integ     # Integration tests (requires Docker)
pnpm test:e2e       # End-to-end tests
pnpm test:load      # Load tests
```

---

## Project Structure

```
enkap/
├── apps/
│   ├── auth-service/
│   ├── financial-service/
│   ├── stock-service/
│   ├── purchase-service/
│   ├── waybill-service/
│   ├── hr-service/
│   ├── fleet-service/
│   ├── crm-service/
│   ├── web/                    # Next.js dashboard
│   ├── mobile/                 # React Native + Expo
│   └── ...                     # 18 services total
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   ├── database/               # Tenant isolation, RBAC, guards
│   ├── health/                 # OpenTelemetry, Prometheus
│   ├── mailer/                 # Nodemailer + Turkish templates
│   └── reporting/              # PDF/Excel builders
├── infrastructure/
│   ├── docker/
│   ├── kubernetes/
│   └── terraform/
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

---

## Turkish Compliance

Enkap is built with Turkish regulatory requirements as first-class citizens:

- **e-Fatura / e-Arşiv** — GİB UBL-TR 2.1, XAdES-T XML signing (Java 17 + BouncyCastle)
- **e-İrsaliye** — Full waybill lifecycle, GİB submission, automatic creation from purchase/sales flows
- **KDV** — Rates: %0, %1, %10, %20 with proper line-level calculation
- **SGK** — 2025 payroll rules, minimum wage (22.104,67 ₺), SGK ceiling (165.785,03 ₺)
- **KVKK** — Data residency in Turkey, per-tenant AES-256 encryption, audit logs
- **Muhasebe** — TDHP chart of accounts, double-entry journal generation
- **Döviz** — TRY, USD, EUR, AED (UAE), SAR (KSA) with exchange rate management

---

## Contributing

We welcome contributions of all sizes — bug fixes, new features, documentation, translations, and more.

Please read our **[CONTRIBUTING.md](./CONTRIBUTING.md)** for:
- How to pick up an issue
- Code style and architecture guidelines
- How to run the test suite
- Pull request process

---

## License

Enkap is released under the **Enkap Community License**.

- **Free** for personal and non-commercial use
- **Free** for open-source projects and academic research
- **Commercial use** (running Enkap to operate a for-profit business) requires a commercial license
- **Prohibited** to copy, modify, and sell Enkap or a derivative product without a commercial license

See [LICENSE.md](./LICENSE.md) for full terms.

For commercial licensing inquiries: **resulsari@mail.com**

---

## Roadmap

- [ ] Mobile app (React Native) — offline-first, EAS build
- [ ] GİB e-Defter (electronic ledger) submission
- [ ] Multi-currency bank reconciliation (Garanti, İş Bankası, Akbank APIs)
- [ ] AI assistant (LLM-powered document OCR + accounting suggestion)
- [ ] Marketplace integrations (Trendyol, Hepsiburada, Amazon TR)
- [ ] White-label portal for vendors and customers
- [ ] REST + GraphQL API for third-party integrations

---

<div align="center">

Built with care in Turkey 🇹🇷 — for businesses everywhere.

</div>
