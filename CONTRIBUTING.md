# Contributing to Enkap ERP

First off — thank you for considering a contribution. Enkap is an ambitious project and we could not build it alone. Whether you fix a typo, add a new feature, write tests, or improve documentation, every contribution matters.

---

## Table of Contents

- [Who We Are Looking For](#who-we-are-looking-for)
- [Ways to Contribute](#ways-to-contribute)
- [Development Setup](#development-setup)
- [Architecture Primer](#architecture-primer)
- [Code Style](#code-style)
- [Submitting a Pull Request](#submitting-a-pull-request)
- [Issue Labels](#issue-labels)
- [Community](#community)

---

## Who We Are Looking For

We are actively looking for contributors with experience in any of the following:

| Skill Area | What You Would Work On |
|-----------|------------------------|
| **NestJS / TypeScript** | Microservice business logic, REST APIs, guards, interceptors |
| **Next.js / React** | Dashboard UI, new pages, component library (shadcn/ui) |
| **React Native / Expo** | Mobile app — offline sync, native UI, EAS builds |
| **PostgreSQL / TypeORM** | Schema migrations, query optimization, multi-tenant patterns |
| **DevOps / Kubernetes** | Helm charts, CI/CD pipelines, Istio, infrastructure as code |
| **Java / BouncyCastle** | GİB e-signature module (XAdES-T) |
| **Python / FastAPI** | ML inference service (XGBoost, Prophet, SHAP) |
| **Turkish Tax Law / GİB** | Domain expertise — reviewing compliance logic, UBL-TR spec accuracy |
| **Technical Writing** | Documentation, API docs, tutorials |
| **UI/UX Design** | Figma mockups, accessibility improvements |

You do **not** need to be a senior engineer. If you are learning and want to work on something meaningful, we have issues labeled `good first issue` specifically for you.

---

## Ways to Contribute

### Report a Bug

Open a [GitHub Issue](https://github.com/your-org/enkap/issues/new?template=bug_report.md) and include:
- Steps to reproduce
- Expected vs actual behavior
- Service name and relevant logs
- OS, Node version, Docker version

### Suggest a Feature

Open a [GitHub Issue](https://github.com/your-org/enkap/issues/new?template=feature_request.md) describing:
- The problem you are trying to solve
- Your proposed solution
- Any alternatives you considered

For large changes, please open a discussion first before writing code. Architecture decisions affect many services.

### Pick Up an Existing Issue

Browse [open issues](https://github.com/your-org/enkap/issues) and look for:
- `good first issue` — well-defined, small scope, great for getting started
- `help wanted` — we need hands on this, any skill level welcome
- `bug` — confirmed defects ready for fixing
- `enhancement` — approved features ready for implementation

Leave a comment to claim an issue before starting work.

### Improve Documentation

Every service has a `CLAUDE.md` file and the root `README.md`. If something is unclear, wrong, or missing — a PR fixing it is just as valuable as a code change.

---

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/enkap.git
cd enkap
git remote add upstream https://github.com/your-org/enkap.git
```

### 2. Install dependencies

```bash
# Requires Node >= 20 and pnpm >= 9
pnpm install
```

### 3. Start infrastructure

```bash
docker compose up -d postgres redis pgbouncer rabbitmq
```

### 4. Run migrations and seed

```bash
pnpm db:migrate
pnpm demo:seed   # optional demo data
```

### 5. Start the service(s) you are working on

```bash
# All services (heavy on RAM — ~8 GB recommended)
pnpm dev

# Just one service + web
pnpm --filter @enkap/financial-service dev
pnpm --filter @enkap/web dev
```

### 6. Run tests before submitting

```bash
pnpm test:unit
pnpm typecheck
pnpm lint
```

---

## Architecture Primer

Before writing code, please understand these non-negotiable architectural rules:

### Tenant Isolation

Every query must be scoped to the current tenant. Use `getTenantContext()` — never pass `tenantId` as a function parameter.

```typescript
// ✅ Correct
const { tenantId } = getTenantContext();
const ds = await TenantDataSourceManager.getDataSource(tenantId);

// ❌ Wrong — tenantId as parameter is a security boundary violation
async function getInvoices(tenantId: string) { }
```

### Money — Always Kurus

All monetary values are stored as integer **kurus** (1/100 of a Turkish Lira). Never store floats.

```typescript
// ✅ DB: integer kurus
const unitPriceKurus = 15000;  // = 150.00 ₺

// ✅ Display: kurusToTl() from @/lib/format
formatCurrency(kurusToTl(unitPriceKurus))  // → ₺150,00

// ❌ Never
const tl = amount / 100;  // floating point errors
```

### Migrations

Never run DDL from application code. All schema changes go through the migration runner in `apps/tenant-service/src/provisioning/`. Create a new versioned migration file (`V069_...`) — never modify existing ones.

### No `any`

```typescript
// ❌
const data: any = response;

// ✅
const data: InvoiceDto = response;
// or
const data: unknown = response;
```

### Service Communication

- **Synchronous (HTTP)** — use `HttpService` from `@nestjs/axios` + `firstValueFrom()`
- **Asynchronous (events)** — use RabbitMQ via the service's publisher class
- **Never** import one service's module directly into another

---

## Code Style

We use ESLint and Prettier. Configuration lives in the root of the monorepo.

```bash
# Check
pnpm lint

# Auto-fix
pnpm lint:fix

# Format
pnpm format
```

**Key conventions:**
- Business logic comments in **Turkish**, technical comments in **English**
- Logger messages: `this.logger.log(...)` / `this.logger.error(...)` — never `console.log`
- Parallel async operations: `await Promise.all([...])` instead of sequential awaits
- No speculative abstractions — solve the problem in front of you

---

## Submitting a Pull Request

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-123-short-description
   ```

2. **Write your changes.** Keep the scope focused — one PR, one concern.

3. **Add tests** for new business logic. At minimum, unit tests for service methods.

4. **Run the full check suite:**
   ```bash
   pnpm lint && pnpm typecheck && pnpm test:unit
   ```

5. **Commit** with a clear message:
   ```
   feat(financial): add automatic purchase invoice on goods receipt

   After a successful GRN, purchase-service now fires a POST to
   financial-service to create a draft IN-direction invoice.
   The call is fire-and-forget to avoid blocking the receipt flow.
   ```

6. **Push and open a PR** against `main`. Fill in the PR template — describe what changed and why.

7. **Respond to review feedback.** We aim to review PRs within 3 business days.

### PR Rules

- PRs must pass all CI checks (lint, typecheck, unit tests)
- Breaking changes require a `BREAKING CHANGE:` footer in the commit message
- UI changes should include a screenshot or screen recording
- Do not force-push to a PR branch after review has started

---

## Issue Labels

| Label | Meaning |
|-------|---------|
| `good first issue` | Small, well-defined, no deep context required |
| `help wanted` | We actively need a contributor for this |
| `bug` | Confirmed defect |
| `enhancement` | Approved new feature |
| `compliance` | Turkish tax / GİB / SGK related |
| `performance` | Query or runtime optimization |
| `docs` | Documentation only |
| `mobile` | React Native specific |
| `infra` | DevOps / Kubernetes / CI |
| `question` | Discussion, not yet triaged |
| `wontfix` | Out of scope or intentional behavior |

---

## Community

- **GitHub Discussions** — architecture questions, ideas, general chat
- **GitHub Issues** — bug reports and feature requests
- **Pull Requests** — code contributions

We are building in public. All design decisions happen in issues and PRs — there are no private Slack rooms where real decisions are made.

---

## Code of Conduct

Be respectful. We welcome contributors regardless of experience level, background, nationality, or native language. Technical disagreements are fine — personal attacks are not.

---

Thank you for helping make Enkap better. 🙏
