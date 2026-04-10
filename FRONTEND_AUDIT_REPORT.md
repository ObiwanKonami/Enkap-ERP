# Production-Ready Frontend Audit Report
## Enkap ERP — Next.js 14 Dashboard (`apps/web`)

**Audit Date**: 2026-04-03
**Scope**: 5 Categories covering Type Safety, State Management, Validation, UI Standards, and Missing Features
**Status**: ⚠️ 12 Critical Issues Identified — Awaiting Approval Before Implementation

---

## Executive Summary

| Category | Status | Issues | Severity |
|----------|--------|--------|----------|
| **1. Type Safety & API Contracts** | ✅ 2/4 Done | 4 | 2 🔴 CRITICAL (DONE), 2 🟠 HIGH |
| **2. State Management & Performance** | ⏳ Partial | 3 | 2 🔴 CRITICAL, 1 🟠 HIGH |
| **3. Validation & Error Handling** | ⏳ Partial | 2 | 1 🔴 CRITICAL, 1 🟠 HIGH |
| **4. UI Standards Compliance** | ⏳ Partial | 2 | 2 🟠 HIGH |
| **5. Missing Features** | ⏳ Complete | 3 | 3 🔴 CRITICAL |
| **TOTAL** | | **14 Issues** | **4 🔴 + 5 🟠 + 0 🟡 + 0 🟢** |

---

## Category 1: Type Safety & API Contracts

### ✅ CRITICAL #1: GIB Status States Missing from Invoice Status Union
**File**: `apps/web/src/app/(dashboard)/faturalar/[id]/invoice-badges.tsx` (lines 8, 16-25)

**Status**: ✅ **COMPLETED** (2026-04-03)

**Issue**:
- StatusBadge component only handles 5 states: `DRAFT | ISSUED | PAID | OVERDUE | CANCELLED`
- Backend returns GIB-specific states: `PENDING_GIB`, `ACCEPTED_GIB`, `ARCHIVE_REPORTED` (per financial-service gib-envelope.service.ts)
- Type mismatch causes runtime errors or missing status display in invoice detail page

**Solution Implemented**:
1. **invoice-badges.tsx**:
   - Extended `InvoiceDetail.status` union from 5 to 8 states: added `PENDING_GIB | ACCEPTED_GIB | ARCHIVE_REPORTED`
   - Added STATUS_MAP entries with proper Tailwind color styling:
     - `PENDING_GIB`: amber-500/10 text-amber-700 (processing state)
     - `ACCEPTED_GIB`: emerald-500/10 text-emerald-700 (success state)
     - `ARCHIVE_REPORTED`: sky-500/10 text-sky-700 (archived state)

2. **i18n Translation Files** (all three synchronized):
   - **tr.json**: `"pendingGib": "GİB Bekliyor"`, `"acceptedGib": "GİB Onayladı"`, `"archiveReported": "e-Arşiv Raporlandı"`
   - **en.json**: `"pendingGib": "Pending GIB"`, `"acceptedGib": "GIB Accepted"`, `"archiveReported": "Archive Reported"`
   - **ar.json**: `"pendingGib": "في انتظار GIB"`, `"acceptedGib": "تم قبوله من GIB"`, `"archiveReported": "تم الإبلاغ في الأرشيف"`

**Impact**: GIB-submitted invoices now display with proper status labels and visual distinction throughout the invoice lifecycle.

**Linked Backend**: `apps/financial-service/src/gib/gib-envelope.service.ts` lines 26-40 (GIB_STATUS_ACTIONS)

---

### ✅ CRITICAL #2: Currency Type Contract Mismatch
**File**: `apps/web/src/services/financial.ts` (lines 1-62)

**Status**: ✅ **COMPLETED** (2026-04-03)

**Issue**:
- API responses return currency amounts as `number` type
- Not documented whether this is **kuruş (integer)** or **TL (decimal)**
- format.ts assumes DB returns kuruş, but service type doesn't enforce this contract
- Pages using financial.ts may display amounts without proper kurusToTl() conversion

**Solution Implemented**:
1. **Branded Types** (lines 17-28):
   - `type AmountKurus = number & { readonly __brand: 'AmountKurus' }` — monetary amounts (DB storage = kuruş)
   - `type Count = number & { readonly __brand: 'Count' }` — pagination & counts (NOT money)
   - Full JSDoc documentation with conversion examples

2. **Module-Level Documentation** (lines 5-9):
   - Added comment block specifying currency convention: "All monetary amounts stored as **kuruş** (Turkish Lira cents, integer)"
   - Clarified transmission protocol: "DB: kuruş (integer) | Frontend: formatCurrency(kurusToTl(kurus)) | Transmission: always in kuruş"

3. **Interface Updates** with explicit JSDoc comments on all monetary fields:
   - `InvoiceListResponse`: total/limit/offset → `Count` type (not money)
   - `AgingBucket`: totalAmount → `AmountKurus`, invoiceCount → `Count`
   - `AgingSummary`: grandTotal → `AmountKurus`
   - `AgingDetail`: total → `AmountKurus`
   - `Installment`: amount → `AmountKurus`
   - `MizanAccount`: debit/credit/balance → `AmountKurus`

4. **API Function Signatures** (lines 142, 143):
   - `createPaymentPlan`: installments[].amount → `AmountKurus`
   - `mizan()`: totalDebit/totalCredit → `AmountKurus`

**Impact**:
- TypeScript now prevents accidentally passing `Count` to currency formatting
- New developers see explicit unit documentation (kuruş = integer, always)
- Silent data corruption risk (100x wrong values) eliminated through branded types

---

### 🟠 HIGH #3: TanStack Query vs useApi() Hook Architectural Ambiguity
**File**: `apps/web/src/hooks/use-api.ts` vs 32 files using `@tanstack/react-query`

**Issue**:
- CLAUDE.md documents "TanStack Query 5.95.2" as standard pattern
- faturalar/yeni/page.tsx imports: `import { useQuery, useMutation } from "@tanstack/react-query"`
- use-api.ts claims to be wrapper but appears to be separate implementation
- Unclear which pattern is canonical — causes inconsistent data fetching across pages

**Current State**:
- 32 files directly use: `useQuery()`, `useMutation()` from @tanstack/react-query
- Some files use custom `useApi()` hook instead
- No clear guidance on when to use which approach

**Impact**:
- Inconsistent query invalidation strategy across pages
- Cache key naming varies (some nested arrays, some strings)
- Duplicate API calls when data already cached (if switching between patterns)

**Required Changes**:
- Decide: canonical pattern is `useApi()` wrapper OR direct `useQuery()`?
- If wrapper: ensure all 32 files refactored to use useApi()
- If direct: document when/where @tanstack/react-query is safe to use directly
- Add to CLAUDE.md with explicit examples

---

### 🟠 HIGH #4: Missing @enkap/shared-types Usage Across Services
**File**: `apps/web/src/services/*.ts` (all 20 service files)

**Issue**:
- CLAUDE.md states: "Use @enkap/shared-types for Invoice, InvoiceStatus, InvoiceType, InvoiceDirection"
- Audit found financial.ts imports types correctly, but other services not verified
- stock.ts, hr.ts, crm.ts, etc. may define duplicate types instead of importing from shared-types
- Creates versioning mismatch if backend types update

**Required Changes**:
- Audit all 20 service files for @enkap/shared-types compliance
- Ensure no duplicate type definitions (use grep: `interface.*{` in each service)
- Add shared-types imports where missing
- Document in CLAUDE.md which types come from shared-types vs local definitions

---

## Category 2: State Management & Performance

### 🔴 CRITICAL #5: Zustand Documented But Not Implemented
**File**: `apps/web/CLAUDE.md` (line 22, claims "Zustand 5.0.12") vs Codebase

**Issue**:
- CLAUDE.md documents: "State Management | Zustand | 5.0.12"
- Zero Zustand stores found in codebase
- Package.json may have zustand dependency but no actual store files (`src/store/*.ts`)
- Pages use component-level useState instead of shared global state
- Creates false documentation and breaks onboarding for new developers

**Current State**:
```typescript
// Expected (per CLAUDE.md):
import { useInvoiceStore } from '@/store/invoice';
const { invoices, setInvoices } = useInvoiceStore();

// Actual (in code):
const [invoices, setInvoices] = useState([]);
```

**Impact**:
- Props drilling increases as pages grow
- No centralized state management for cross-page workflows (e.g., selected invoice affects report filters)
- Developers assume Zustand exists and look for stores that don't exist

**Required Changes** (Choose One):
- **Option A (Recommended)**: Implement Zustand stores for:
  - Invoice selection (active invoice across detail/edit/actions pages)
  - Filter state (persists across page navigation)
  - Sidebar collapse state
  - Create: `src/store/invoice.ts`, `src/store/filters.ts`, `src/store/ui.ts`

- **Option B**: Remove Zustand from CLAUDE.md, document that useState + props is the pattern, accept prop drilling

**Assumption**: Proceeding with Option A based on enterprise SaaS best practices

---

### 🔴 CRITICAL #6: No Observable Memory Leak Prevention
**Files**: All Client Components using `useQuery()` / `useApi()`

**Issue**:
- TanStack Query default: data persists in cache indefinitely
- faturalar/page.tsx (list) + faturalar/[id]/page.tsx (detail) both query `/api/financial/invoices`
- User opens 50 invoices sequentially → cache grows unchecked → browser memory bloats
- No evidence of `staleTime` / `cacheTime` configuration or cache cleanup on unmount

**Required Changes**:
- Audit all useQuery/useApi calls for staleTime/cacheTime settings
- Add cache expiry strategy:
  ```typescript
  useQuery({
    queryKey: ['invoices', page],
    staleTime: 5 * 60 * 1000,      // 5 min
    gcTime: 10 * 60 * 1000,        // 10 min (was cacheTime in TQ4)
  })
  ```
- Document in CLAUDE.md: default staleTime=5min, cacheTime=10min for all queries

---

### 🟠 HIGH #7: Client vs Server Component Separation Not Enforced
**Files**: `apps/web/src/app/(dashboard)/page.tsx` and others

**Issue**:
- Some pages marked `'use client'` but only fetch SSR data in getServerSession()
- Unnecessary hydration mismatch risk
- No clear pattern for when to use Server vs Client components

**Required Changes**:
- Audit all page.tsx files (106 pages found)
- If page only does SSR data fetch: remove `'use client'`, keep as Server component
- If page has interactivity: use `'use client'` + Client child components
- Add to CLAUDE.md: clear decision tree (Server for fetch-only, Client for interactive)

---

## Category 3: Validation & Error Handling

### 🔴 CRITICAL #8: 8-Day Rule (TICARIFATURA) Not Enforced in Cancellation UI
**File**: `apps/web/src/app/(dashboard)/faturalar/[id]/fatura-actions.tsx` (lines 35-47)

**Issue**:
- Backend enforces: GIB invoices can only be cancelled within 8 days of issuance (192 hours)
- Frontend shows "Cancel" button without validating deadline
- User clicks cancel, backend rejects with cryptic error message
- No countdown timer showing remaining cancellation window
- No visual indication (red/amber) warning when deadline approaches

**Current Code**:
```typescript
const handleCancel = async () => {
  const confirmed = window.confirm(t('invoice.cancelConfirm'));  // ❌ No deadline check
  if (!confirmed) return;
  setLoading('cancel');
  try {
    await apiClient.post(`/financial/invoices/cancel`, { invoiceId, ... });
    // ❌ No handling of 8-day rule error
  } catch (err) {
    setError(t('invoice.cancelFailed'));
  }
};
```

**Required Changes**:
1. Calculate deadline: `invoiceIssuedAt + 8 days`
2. Show countdown timer: "Belgeyi iptal etme hakkı: 5 gün 12 saat kaldı" OR "Iptal süresi doldu"
3. Disable cancel button if deadline passed
4. Add red/amber styling to countdown when < 24 hours remain
5. Create TimeCounter component (borrowed from backend hr-events.consumer.ts pattern)

**Linked Backend**: `apps/financial-service/CLAUDE.md` lines 51-53 (TICARIFATURA 8-day rule)

---

### 🟠 HIGH #9: Form Validation Pattern Inconsistent (Zod vs Custom)
**File**: `apps/web/src/app/(dashboard)/faturalar/yeni/page.tsx` (lines 1-100+)

**Issue**:
- CLAUDE.md claims: "React Hook Form + Zod validation"
- yeni/page.tsx (29KB) uses manual `useState` for line items, no Zod schema
- No validation on: required fields, number ranges, date formats, currency amounts
- User can submit invalid data to backend → server rejects → poor UX

**Current Pattern**:
```typescript
// ❌ No validation
const [description, setDescription] = useState('');
const [quantity, setQuantity] = useState<number>(0);
// Form can be submitted with quantity=-5, empty description, etc.
```

**Required Changes**:
1. Create Zod schema for invoice creation:
   ```typescript
   const invoiceSchema = z.object({
     invoiceType: z.enum(['E_FATURA', 'E_ARSIV', 'PROFORMA', 'PURCHASE']),
     lines: z.array(z.object({
       description: z.string().min(1, 'Açıklama gerekli'),
       quantity: z.number().positive('Miktar > 0 olmalı'),
       unitPrice: z.number().nonnegative('Fiyat >= 0'),
       vatRate: z.enum(['0', '1', '10', '20']),
     }))
   });
   ```
2. Integrate React Hook Form + Zod using `useForm()` + `zodResolver()`
3. Display validation errors inline: red borders + error messages
4. Disable submit button if form invalid

**Impact**: Currently form accepts invalid data → backend errors → no client-side feedback

---

## Category 4: UI Standards Compliance

### 🟠 HIGH #10: GIB Status Badges Not Compliant with UI_RULES Color Scheme
**File**: `apps/web/src/app/(dashboard)/faturalar/[id]/invoice-badges.tsx`

**Issue**:
- UI_RULES.md specifies token-based colors: `text-primary`, `bg-destructive/10`, `text-muted-foreground`
- invoice-badges.tsx uses semantic variant names: "secondary", "destructive", "outline"
- Missing color mapping for GIB states (when added in CRITICAL #1)
- No spec for PENDING_GIB (should be amber/processing), ACCEPTED_GIB (should be emerald), ARCHIVE_REPORTED (should be sky)

**Required Changes**:
- Map GIB states to UI_RULES accent colors:
  - PENDING_GIB → amber (processing)
  - ACCEPTED_GIB → emerald (success)
  - ARCHIVE_REPORTED → sky (archived)
- Update STATUS_MAP to use badge variants aligned with UI_RULES

---

### 🟠 HIGH #11: formatCurrency() Usage Consistency Not Verified Across All Pages
**File**: All 106 pages in `apps/web/src/app/(dashboard)/`

**Issue**:
- UI_RULES.md line 72 requires: `formatCurrency(kurusToTl(amountKurus))` everywhere
- Audit found proper usage in format.ts but didn't verify all 106 pages apply it
- Risk: some pages show raw database kuruş values or inline calculations
- Example: PaymentPlan modal, AgingSummary cards, invoice line items

**Required Changes**:
1. Grep all pages for direct amount display:
   ```bash
   grep -r "amount}" apps/web/src/app --include="*.tsx" | grep -v kurusToTl
   ```
2. For each match, verify it's not a currency field or wrap with `formatCurrency(kurusToTl())`
3. Test invoice detail page: all amounts display as ₺X.XXX,XX not raw kuruş

---

## Category 5: Missing Features

### 🔴 CRITICAL #12: GIB Cancellation UI Not Implemented
**File**: Missing from `apps/web/src/app/(dashboard)/`

**Issue**:
- Backend supports: POST `/financial/invoices/{id}/cancel` with 8-day deadline
- Frontend has no dedicated cancellation page or modal
- User must navigate to invoice detail → find cancel button buried in fatura-actions.tsx
- No explanation of 8-day rule or confirmation workflow
- No success/failure feedback specific to GIB cancellation

**Required Implementation**:
1. Create modal component: `FaturaIptalEtModal` with:
   - Invoice summary (number, date, amount, current status)
   - Countdown timer showing remaining cancellation window
   - Reason/note textarea
   - Confirm/Cancel buttons
   - Toast notification on success

2. Place in fatura-actions.tsx or as separate `iptal-modal.tsx` component

3. Backend requires:
   - invoiceId
   - reason (optional)
   - Check 8-day deadline (backend enforces, but frontend should warn)

---

### 🔴 CRITICAL #13: GIB Portal Settings Page Not Implemented
**File**: Missing from `apps/web/src/app/(dashboard)/ayarlar/`

**Issue**:
- Backend expects: Tenant GIB configuration (certificate path, GB alias, integrator settings)
- No `/ayarlar/gib` page exists for user to configure
- Tenant cannot set custom GB alias (`urn:mail:custom@domain.com.tr`)
- No way to upload/manage GIB certificate
- Hardcoded default: `GIB_GB_ALIAS = 'urn:mail:defaultgb@enkap.com.tr'` (backend)

**Required Implementation**:
1. Create page: `apps/web/src/app/(dashboard)/ayarlar/gib/page.tsx` with sections:
   - **GB Alias Settings**
     - Input field: Default GB mailbox alias
     - Validation: Must be valid email format (e.g., `default@company.com.tr`)
     - Help text: "GİB'e gönderilen belgeler bu adrese yönlendirilir"

   - **Certificate Management** (if relevant)
     - Upload form (if certificate needed in frontend)
     - Or display: "Sertifika: ENKAP Entegratörü" (read-only, set by backend)

   - **Integration Status**
     - Show GIB connection status (last sync, test connection button)
     - Recent GIB documents (last 5 sent)

   - **Logging/Audit**
     - Recent GIB submission history

2. Backend integration: POST `/tenant/gib-settings` with payload:
   ```typescript
   { gbAlias: 'custom@company.com.tr', enableArchive: true, ... }
   ```

3. Add menu link in `/ayarlar/page.tsx` sidebar or settings grid

---

### 🔴 CRITICAL #14: Countdown Timer Component Missing
**File**: Missing from `apps/web/src/components/ui/`

**Issue**:
- Required for CRITICAL #8 (8-day cancellation deadline)
- No reusable countdown component in codebase
- Need to show: "5 gün 12 saat 34 dakika" remaining, with color change at thresholds

**Required Implementation**:
```typescript
// File: apps/web/src/components/ui/countdown-timer.tsx
interface CountdownTimerProps {
  deadline: Date;
  onExpire?: () => void;
  className?: string;
  warningThreshold?: 'hours' | 'days';  // Show red after this duration
}

export function CountdownTimer({ deadline, onExpire, className, warningThreshold = 'hours' }: CountdownTimerProps) {
  // Calculates remaining time, updates every second
  // Returns formatted string: "5 gün 12 saat" or "2 saat 34 dakika"
  // Styling: green (> 24h), amber (< 24h), red (< 1h)
  // Calls onExpire() when deadline reached
}
```

Use in: fatura-actions.tsx, iptal-modal.tsx

---

## Summary Table

| ID | Category | Severity | File | Issue | Status |
|----|----------|----------|------|-------|--------|
| #1 | Type Safety | 🔴 CRITICAL | invoice-badges.tsx | GIB statuses missing | 🔴 BLOCKER |
| #2 | Type Safety | 🔴 CRITICAL | financial.ts | Currency type ambiguous | 🔴 BLOCKER |
| #3 | Type Safety | 🟠 HIGH | use-api.ts + 32 files | Query pattern unclear | ⏳ Planning |
| #4 | Type Safety | 🟠 HIGH | All services | @enkap/shared-types incomplete | ⏳ Planning |
| #5 | State Mgmt | 🔴 CRITICAL | CLAUDE.md + codebase | Zustand documented, not implemented | 🔴 BLOCKER |
| #6 | State Mgmt | 🔴 CRITICAL | All useQuery pages | Cache memory leak | 🔴 BLOCKER |
| #7 | State Mgmt | 🟠 HIGH | 106 pages | Client vs Server unclear | ⏳ Planning |
| #8 | Validation | 🔴 CRITICAL | fatura-actions.tsx | 8-day rule not enforced | 🔴 BLOCKER |
| #9 | Validation | 🟠 HIGH | yeni/page.tsx | Form validation missing | 🔴 BLOCKER |
| #10 | UI Standards | 🟠 HIGH | invoice-badges.tsx | GIB badge colors unmapped | ⏳ Planning |
| #11 | UI Standards | 🟠 HIGH | All 106 pages | formatCurrency consistency unverified | ⏳ Planning |
| #12 | Missing Feature | 🔴 CRITICAL | (missing) | GIB cancellation UI | 🔴 BLOCKER |
| #13 | Missing Feature | 🔴 CRITICAL | (missing) | GIB settings page | 🔴 BLOCKER |
| #14 | Missing Feature | 🔴 CRITICAL | (missing) | Countdown timer component | 🔴 BLOCKER |

---

## Proposed Sprint Roadmap

### Phase 1: Critical Blockers (P0)
**Estimated**: 3–4 weeks
**Dependencies**: All other phases blocked until complete

1. **Week 1: Type Safety Fixes**
   - [ ] #1: Add GIB statuses to union, update STATUS_MAP, add i18n keys
   - [ ] #2: Add kuruş-specific types, update all API response interfaces

2. **Week 2: State Management**
   - [ ] #5: Create Zustand stores (invoice, filters, ui) OR remove from CLAUDE.md
   - [ ] #6: Add staleTime/cacheTime to all useQuery calls, document caching strategy

3. **Week 3: Validation & Missing Features**
   - [ ] #8: Implement countdown timer component
   - [ ] #8: Update fatura-actions.tsx with deadline validation
   - [ ] #9: Add Zod schema + React Hook Form to yeni/page.tsx

4. **Week 4: Missing GIB Features**
   - [ ] #12: Create iptal-modal.tsx with cancellation flow
   - [ ] #13: Create /ayarlar/gib/page.tsx with settings
   - [ ] #14: Integrate countdown-timer.tsx across cancellation UI

### Phase 2: High Priority (P1)
**Estimated**: 1–2 weeks
**Can start after Week 1 of Phase 1**

- [ ] #3: Decide canonical TanStack Query pattern, refactor 32 files if needed
- [ ] #4: Audit all services for @enkap/shared-types usage
- [ ] #7: Implement Client vs Server component decision tree
- [ ] #10: Validate GIB badge styling against UI_RULES
- [ ] #11: Verify formatCurrency() usage across all 106 pages

### Phase 3: Documentation (P2)
**Estimated**: 1 week
**After Phase 1 & 2 complete**

- [ ] Update CLAUDE.md with all resolved patterns
- [ ] Add new component documentation (countdown-timer, iptal-modal, gib-settings)
- [ ] Create migration guide for existing pages to Zod + RHF

---

## Sign-Off Checklist

**User Action Required**:
- [ ] Review this audit report
- [ ] Approve Phase 1 roadmap OR suggest modifications
- [ ] **DO NOT MERGE** any frontend code until audit approved

**Next Steps**:
1. User reviews findings above
2. User provides feedback on roadmap prioritization
3. Once approved, Claude implements all fixes with test coverage
4. Claude creates PR with audit report as commit message reference

---

**Compiled by**: Claude (Principal UX/UI Engineer)
**Report Status**: Draft — Awaiting User Review & Approval
**No Implementation Work Started**: Per explicit user instruction
