# Airspace Billing - Page Specifications

Complete page-by-page requirements for the frontend redesign.

---

## Table of Contents

- [Page Specifications](#page-specifications)
  - [1. Reports Dashboard](#1-reports-dashboard)
  - [2. Airspaces List](#2-airspaces-list)
  - [3. Airspace Details](#3-airspace-details)
  - [4. Flights List](#4-flights-list)
  - [5. Flight Details](#5-flight-details)
  - [6. Flight Usage Explorer](#6-flight-usage-explorer)
  - [7. Manual Usage Entry](#7-manual-usage-entry)
  - [8. Billing & Invoices List](#8-billing--invoices-list)
  - [9. Invoice Detail](#9-invoice-detail)
  - [10. Reconciliation](#10-reconciliation)
  - [11. Integrations & Sync Status](#11-integrations--sync-status)
  - [12. Settings: Billing Settings](#12-settings-billing-settings)
  - [13. Reports: Exports](#13-reports-exports)
  - [14. Billing Disputes](#14-billing-disputes)
  - [15. User Management](#15-user-management)
- [Navigation & Routing](#navigation--routing)
- [Design Principles](#design-principles)
- [Notes & Recommendations](#notes--recommendations)

---

## Page Specifications

### 1. Reports Dashboard

**Route:** `/`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/reports/revenue?start=&end=&granularity=day` | `RevenuePoint[]` |
| `GET /api/reports/top-airlines?start=&end=` | `TopAirlineEntry[]` |
| `GET /api/reports/dashboard?start=&end=` | `DashboardStats` |
| `GET /api/airspaces` | For filter dropdown |

#### Components

- **DateRangePicker** - with presets: Today, Last 7 days, Last 30 days, Custom
- **CurrencySelector** - if multi-currency enabled
- **RevenueLineChart** (Recharts) - shows revenue over time
- **TopAirlinesTable** - sortable, clickable rows drill to airline detail
- **DashboardStatsCards** - KPIs (total revenue, flights, pending/overdue invoices)
- **AirspaceUsageHeatmap** - mini-map (lazy-load)
- **Export CSV button** - triggers `POST /api/reports/export`

#### Actions & Interactions

- Filter by airspace, airline, date range
- Click on chart point → drills to detailed report
- Export button → generates CSV/XLSX

#### Edge Cases

- **No data**: Show empty state with CTA to configure pricing and data feeds
- **Loading state**: Skeleton cards and chart placeholders
- **Date range too large**: Show warning and suggest narrower range

---

### 2. Airspaces List

**Route:** `/airspaces`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/airspaces` | `Airspace[]` |

#### Components

- **Table** with columns: name, pricingModel, active status, lastUpdated, actions
- **Create Airspace button** → opens polygon editor modal
- **Search & filter bar**
- **Bulk actions toolbar** - activate/deactivate selected

#### Actions

- **Create**: Opens modal with map + pricing tier editor
- **Edit**: Inline edit or modal
- **Toggle active/inactive**: PATCH request with confirmation
- **Delete**: Soft-delete with confirmation (only if no associated invoices)
- **View details**: Navigate to airspace detail page
- **Configure pricing**: Direct link to pricing editor

#### Edge Cases

- **Invalid polygon geometry**: Show validation errors before save
- **Overlapping airspaces**: Warning if overlap detected (if not allowed)
- **No pricing tiers**: Disable invoice-related actions

---

### 3. Airspace Details

**Route:** `/airspaces/:id`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/airspaces/:id` | `Airspace` |
| `GET /api/airspaces/:id/usage?start=&end=` | `FlightUsage[]` + summary |
| `GET /api/airspaces/:id/pricing` | `PricingTier[]` |

#### Components

- **Large Map** (Mapbox/Leaflet) with polygon highlighted
- **Airspace Info Panel** - name, description, pricing model, status
- **Pricing Tiers Editor** - list + add/edit/delete tier
- **Usage Summary Tiles** - total revenue, flight count, avg MTOW, avg duration
- **Recent Flights Table** - last 10 flights through this airspace
- **Action Buttons**:
  - "Create Invoice for Period" → opens invoice creation modal
  - "Export Usage CSV"
  - "Edit Airspace"

#### Actions

- Edit pricing tiers (add/remove, adjust prices)
- Create bulk invoice from usage
- Export usage data
- View linked invoices

#### Edge Cases

- **No pricing tiers**: Show prominent CTA to add tiers, disable invoice actions
- **No flight data**: Empty state with suggestion to check integrations
- **Inactive airspace**: Show banner warning

---

### 4. Flights List

**Route:** `/flights`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/flights?start=&end=&airspaceId=&airline=&status=&page=&pageSize=` | `PaginatedResponse<Flight>` |

#### Components

- **Filters Panel**: airspace select, airline select, date range, status multiselect
- **Virtualized Table** (react-window or similar) with columns:
  - Callsign, Airline, Registration, Aircraft Type, MTOW, Status, Last Seen, Actions
- **Pagination controls**
- **Bulk action toolbar** - calculate usage, create draft invoices

#### Actions

- **Calculate Usage**: For flights missing usage entries
- **Create Draft Invoice**: Quick action from flight row
- **Override MTOW**: Opens modal to manually set MTOW
- **View Details**: Navigate to flight detail page
- **Bulk Select**: Enable bulk operations on checked rows

#### Edge Cases

- **Flights lacking MTOW**: Show "estimated" or "missing" badge, enable override flow
- **No track data**: Show manual usage entry option
- **Large result set**: Use pagination + virtual scrolling

---

### 5. Flight Details

**Route:** `/flights/:id`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/flights/:id` | `Flight` |
| `GET /api/flights/:id/usage?airspaceId=` | `FlightUsage[]` |

#### Components

- **Flight Header**: callsign, airline logo, registration, aircraft type, MTOW (editable)
- **Map View**: Full track with highlighted segments inside airspace(s)
- **Usage Box**: Per-airspace breakdown:
  - Entry/exit times
  - Duration, distance
  - Applied pricing tier
  - Computed charge (preview)
- **Action Buttons**:
  - "Create Draft Invoice"
  - "Link to Existing Invoice"
  - "Override MTOW" (if permissions allow)
- **Audit Log**: Timeline of usage computations and overrides
- **Related Invoices**: If already billed

#### Actions

- Edit MTOW → recalculates usage
- Create invoice from usage
- Add manual usage entry if missing
- View linked invoices

#### Edge Cases

- **No track points inside airspace**: Show manual usage entry form
- **Multiple airspaces**: Show tabs or sections per airspace
- **Already invoiced**: Disable edit actions, show "Billed" badge

---

### 6. Flight Usage Explorer

**Route:** `/flights/usage`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/flight-usage?airspaceId=&start=&end=&unbilledOnly=&page=` | `PaginatedResponse<FlightUsage>` |

#### Components

- **Table of FlightUsage rows** with columns:
  - Flight callsign (linked), Airspace, Entry/Exit, Duration, Distance, MTOW, Computed Amount, Status, Actions
- **Filters**: airspace, date range, status, unbilled only toggle
- **Bulk reconciliation controls**: Select multiple → create invoices

#### Actions

- **Mark as matched**: Link to existing invoice
- **Create invoice lines**: Add selected usages to new/draft invoice
- **Override computation**: Manually adjust amount
- **View flight details**: Navigate to flight page

#### Edge Cases

- **Unbilled usages**: Highlight in table
- **Manual overrides**: Show indicator/icon
- **Computation errors**: Display error message, allow retry

---

### 7. Manual Usage Entry

**Route:** `/flights/manual-usage`

#### Purpose

Enter manual usage when automated detection fails or for offline flights.

#### Components

**Form Fields:**
- Flight ID (searchable dropdown) OR free-text callsign
- Airspace (select)
- Entry Time (datetime picker)
- Exit Time (datetime picker)
- Duration (auto-calculated or manual)
- Distance KM (optional)
- MTOW (required, number input)
- Notes (textarea)

**Other Components:**
- **Preview Panel**: Shows computed charge based on inputs
- **Save Button**: Creates FlightUsage with `manualOverride=true`

#### Actions

- Save → creates usage entry
- Preview charge calculation
- Link to existing flight (if Flight ID provided)

#### Edge Cases

- **Validation**: Entry time must be before exit time, MTOW must be positive
- **Missing airspace pricing**: Show error, cannot save
- **Duplicate detection**: Warn if similar usage already exists

---

### 8. Billing & Invoices List

**Route:** `/billing/invoices`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/invoices?status=&airline=&start=&end=&page=` | `PaginatedResponse<Invoice>` |

#### Components

- **Filters**: Status badges (clickable), airline select, date range, search by invoice number
- **Table** with columns:
  - Invoice #, Status badge, Airline, Airspace, Period, Amount, Due Date, Actions
- **Bulk actions**: Issue selected drafts, send emails
- **Create Invoice button** → opens creation modal

#### Actions

- **View**: Navigate to invoice detail
- **Issue**: Changes DRAFT → ISSUED (generates invoice number)
- **Mark Paid**: Records payment and updates status
- **Download PDF**: Fetches or generates PDF
- **Send Email**: Triggers email to airline contact
- **Cancel**: Sets status to CANCELLED

#### Edge Cases

- **Draft invoices without lines**: Disable Issue action
- **Overdue invoices**: Highlight in red
- **Multi-currency**: Show all amounts in selected base currency with conversion

---

### 9. Invoice Detail

**Route:** `/billing/invoices/:id`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/invoices/:id` | `Invoice` |
| `GET /api/invoices/:id/payments` | `Payment[]` |

#### Components

- **Header**: Invoice number, status badge, airline info, date range
- **Lines Editor** (editable in DRAFT state):
  - Table: description, quantity, unit, unit price, amount
  - Add/remove line buttons
  - Inline editing
- **Linked Usages Table**: Shows FlightUsage entries with direct links to flights
- **Totals Panel**: Subtotal, tax, total (calculated)
- **Payments Panel**:
  - Record payment form
  - Payment history list
- **Action Buttons**:
  - Issue (DRAFT → ISSUED)
  - Mark Paid
  - Download PDF
  - Send Email
  - Cancel
- **Audit Timeline**: Events with timestamps and user info
- **Notes Section**: Editable notes

#### Actions

- **Issue**: Generates invoice number, sets issuedAt timestamp
- **Record Payment**: Opens modal, creates Payment, may update status to PAID
- **Edit Lines**: Only in DRAFT state
- **Download PDF**: Client-side render or fetch from server
- **Send Email**: Triggers backend email service

#### Edge Cases

- **Partial payments**: Allow multiple payments until total reached
- **Overpayment**: Show warning
- **Status transitions**: Validate allowed transitions (see INVOICE_TRANSITIONS)
- **Locked invoice**: Cannot edit after ISSUED (except payments)

---

### 10. Reconciliation

**Route:** `/billing/reconciliation`

#### Purpose

Match unbilled FlightUsage entries to invoices or create new draft invoices.

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/flight-usage?status=UNMATCHED` | Unbilled usages |
| `GET /api/invoices?status=DRAFT` | Current drafts |

#### Components

- **Split View**:
  - **Left**: Unmatched usages table (filterable by airline/airspace)
  - **Right**: Draft invoices panel
- **Drag & Drop**: Drag usage from left → invoice on right to add line
- **Auto-Suggest**: Button to auto-create invoices grouped by airline + period
- **Create New Draft**: Opens modal to create new invoice for selected usages

#### Actions

- Drag usage to draft invoice → adds invoice line
- Bulk select usages → "Create Invoice" button
- Auto-reconcile by airline/period

#### Edge Cases

- **Mixed currencies**: Warn when adding usage in different currency
- **No draft invoices**: Prompt to create one
- **Already matched usages**: Filter out or show "Matched" badge

---

### 11. Integrations & Sync Status

**Route:** `/integrations/sync-status`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/integrations` | `ADSBFeedConfig[]` + `SyncStatus[]` |

#### Components

- **Integration Cards**: One per data source
  - Name, endpoint, health status (color-coded)
  - Last sync time, item count
  - Test connection button
  - Trigger manual sync button
- **Health Indicators**: 
  - ✅ OK (green)
  - ⚠️ WARN (yellow)
  - ❌ ERROR (red)
  - ❓ UNKNOWN (gray)
- **Sync History**: Recent sync attempts with timestamps and errors

#### Actions

- **Test Connection**: `POST /api/integrations/:id/test` → shows result
- **Trigger Manual Sync**: `POST /api/integrations/:id/sync`
- **Edit Config**: Opens modal to update endpoint/credentials
- **Activate/Deactivate**: Toggle isActive

#### Edge Cases

- **Failed sync**: Show error message and suggested action
- **Stale data**: Warn if last sync was > X hours ago
- **No integrations**: Empty state with "Add Integration" CTA

---

### 12. Settings: Billing Settings

**Route:** `/billing/settings`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/settings/billing` | `BillingSettings` |

#### Components

**Form Fields:**
- Default Currency (select)
- Default Tax Rate (number, %)
- Rounding Precision (number, decimal places)
- Invoice Number Prefix (text)
- Invoice Number Format (text with template)
- Payment Due Days (number)
- Auto-Generate Invoices (toggle)
- Invoice Footer Text (textarea)

**Invoice Template Editor:**
- Logo upload
- Company details (name, address, contact, bank info)

**Action Buttons:**
- **Preview Button**: Shows sample invoice with current settings
- **Save Button**: `PATCH /api/settings/billing`

#### Actions

- Save settings
- Preview invoice template
- Reset to defaults

#### Edge Cases

- **Invalid format**: Validate invoice number format template
- **Preview fails**: Show error, suggest checking template syntax
- **Permission required**: Only `billing_admin`/`admin` can edit

---

### 13. Reports: Exports

**Route:** `/reports/exports`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/reports/exports` | `ExportJob[]` (user's recent exports) |

#### Components

**Export Form:**
- Report Type (select: revenue, usage, invoices, flights, disputes)
- Format (select: CSV, XLSX, PDF, JSON)
- Date Range (picker)
- Filters (airspaces, airlines)
- Submit button

**Export Jobs Table:**
- Status, Report Type, Created, Download Link, Expiry
- Refresh button
- **Download Button**: Appears when job status = COMPLETED

#### Actions

- **Create Export**: `POST /api/reports/export` → returns ExportJob
- **Poll Status**: `GET /api/reports/exports/:jobId` until COMPLETED
- **Download**: Fetches signed URL from `job.downloadUrl`

#### Edge Cases

- **Large export**: Show progress indicator, may take minutes
- **Failed export**: Show error message, allow retry
- **Expired download**: Prompt to re-generate
- **Rate limiting**: Warn if too many exports requested

---

### 14. Billing Disputes

**Route:** `/billing/disputes`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/disputes?status=&invoiceId=&page=` | `PaginatedResponse<Dispute>` |

#### Components

- **Filters**: Status, Invoice #, Date range
- **Table** with columns:
  - Invoice #, Airline, Raised Date, Reason, Requested Adjustment, Status, Actions
- **Create Dispute button** (opens modal)

#### Actions

- **View Details**: Opens dispute detail modal/page
- **Approve**: Accepts adjustment, may create credit note
- **Reject**: Closes dispute with resolution note
- **Update Status**: Under Review → Approved/Rejected

#### Edge Cases

- **Approved disputes**: Auto-create credit note or adjustment invoice
- **Rejected disputes**: Require resolution notes
- **Permissions**: Only `billing_admin` can approve/reject

---

### 15. User Management

**Route:** `/admin/users`

#### Data Required

| Endpoint | Response Type |
|----------|--------------|
| `GET /api/users?role=&page=` | `PaginatedResponse<UserProfile>` |

#### Components

- **Table**: Username, Full Name, Email, Roles, Status, Last Login, Actions
- **Create User button** → opens form modal
- **Filters**: Role, Active/Inactive

#### Actions

- **Create**: Opens modal with form (username, email, roles)
- **Edit**: Update user details and roles
- **Activate/Deactivate**: Toggle isActive
- **View Audit Log**: Shows user's actions

#### Edge Cases

- **Self-edit**: Cannot change own roles or deactivate self
- **Admin role**: Require confirmation before granting
- **Duplicate username/email**: Validate uniqueness

---

## Navigation & Routing

### Main Menu Structure

```
Dashboard (/)
├── Airspaces (/airspaces)
│   └── Details (/airspaces/:id)
├── Flights (/flights)
│   ├── List (/flights)
│   ├── Details (/flights/:id)
│   ├── Usage Explorer (/flights/usage)
│   └── Manual Entry (/flights/manual-usage)
├── Billing (/billing)
│   ├── Invoices (/billing/invoices)
│   ├── Invoice Detail (/billing/invoices/:id)
│   ├── Reconciliation (/billing/reconciliation)
│   ├── Disputes (/billing/disputes)
│   └── Settings (/billing/settings)
├── Reports (/reports)
│   ├── Dashboard (/) [default]
│   └── Exports (/reports/exports)
├── Integrations (/integrations)
│   └── Sync Status (/integrations/sync-status)
└── Admin (/admin)
    └── Users (/admin/users)
```

### Permission-based Access

- Use `MenuItem.requiredPermissions` to show/hide menu items
- Use route guards to protect pages based on user permissions

---

## Design Principles

### Visual Artifacts

- **Functional applications**: Prioritize performance, responsive controls, clear UI
- **Landing pages**: Consider emotional impact, modern aesthetics, micro-animations
- **Default to contemporary design**: Dark mode support, glassmorphism, vibrant gradients
- **Include animations**: Hover effects, transitions, loading states
- **Accessibility**: Proper contrast, semantic markup, keyboard navigation

### State Management

- **No browser storage**: Never use localStorage/sessionStorage
- **React state**: Use useState, useReducer for in-memory state
- **Server-driven**: Fetch fresh data, don't rely on client-side caching

---

## Notes & Recommendations

### Core Principles

- **Immutable Snapshots**: Always snapshot MTOW and pricing when creating FlightUsage and InvoiceLine so historical invoices stay auditable.
- **Audit Metadata**: Store `computedBy`, `pricingTierId`, `computedAmount`, `manualOverride` on FlightUsage and Invoice for complete audit trail.
- **Override Mechanism**: Provide clear UI for `manualOverride` with required notes explaining why.
- **Server-driven Pagination**: Keep table payloads small, request summary aggregates separately.

### Implementation Guidelines

- **Validation**: Validate state transitions (e.g., DRAFT → ISSUED requires lines), polygon geometry, MTOW values.
- **Error Handling**: Always show user-friendly error messages, suggest corrective actions.
- **Loading States**: Use skeleton loaders, progress indicators, optimistic updates where appropriate.
- **Real-time Updates**: Consider WebSocket connections for live flight tracking and invoice status changes.

### Future Considerations

- **Data Retention**: Implement policies for flight tracks, audit logs, export files.
- **Multi-tenancy**: Prepare for future multi-tenant support with `tenantId` fields.

---

**Last Updated:** November 10, 2025
