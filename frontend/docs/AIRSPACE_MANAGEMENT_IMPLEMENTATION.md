# Airspace Management Implementation

This document outlines the implementation of the Airspace Management module for the Airspace Monitoring Portal.

## Overview

The Airspace Management module provides comprehensive functionality for managing airspaces, pricing tiers, and usage rules. It includes list views, detail pages, and CRUD operations for all entities.

## Implemented Pages

### 1. Airspace List (`/airspace-management/airspaces`)

**File**: `src/pages/airspace-management/airspaces/AirspaceList.tsx`

**Features**:
- Statistics dashboard showing:
  - Total airspaces
  - Active airspaces count and percentage
  - Inactive airspaces
  - Total pricing tiers configured
- SearchableTable with columns:
  - Name (with icon and description)
  - Pricing Model (badge)
  - Pricing Tiers count
  - Status (Active/Inactive badge)
  - Last Updated date
- Filters:
  - Pricing Model (per_hour, per_km, flat_rate)
  - Status (Active/Inactive)
- Actions per row:
  - View Details
  - Edit
  - Configure Pricing
  - Toggle Active/Inactive (with confirmation)
  - Delete (with confirmation)
- Bulk Actions:
  - Activate selected airspaces
  - Deactivate selected airspaces
- Create Airspace button (opens create form)

**Edge Cases Handled**:
- Empty state for no airspaces
- Confirmation dialogs for state changes
- Delete protection (warns about associated invoices)
- Invalid polygon geometry validation (TODO: requires backend)
- Overlapping airspaces warning (TODO: requires backend)

### 2. Airspace Detail (`/airspace-management/airspaces/:id`)

**File**: `src/pages/airspace-management/airspaces/AirspaceDetail.tsx`

**Features**:
- Header with:
  - Airspace name and status badge
  - Description
  - Edit button
- Inactive airspace warning banner
- Large map section (using ATCZoneMap component)
- Info Panel showing:
  - Pricing model
  - Number of pricing tiers
  - Rounding precision
  - Created date
  - Last updated date
- Usage Summary tiles:
  - Total revenue (last 30 days)
  - Flight count
  - Average MTOW
  - Average duration
- Pricing Tiers Editor:
  - View mode: displays all tiers with details
  - Edit mode: inline editing with add/remove functionality
  - Validation: minimum 1 tier required
  - Fields: Max MTOW, Unit Price, Description
  - Save/Cancel buttons
- Invoice Creation Section:
  - Date range picker (Start/End date)
  - Create Invoice button
  - Export Usage CSV button
- Recent Flights Table:
  - Last 10 flights through the airspace
  - Columns: Flight, Aircraft, MTOW, Duration, Cost, Date, Actions
  - Empty state for no flight data

**Edge Cases Handled**:
- No pricing tiers: Shows prominent CTA to add tiers, disables invoice actions
- No flight data: Empty state with helpful message
- Inactive airspace: Shows warning banner
- Loading states
- Error handling for failed API calls

### 3. Pricing Tiers List (`/airspace-management/pricing-tiers`)

**File**: `src/pages/airspace-management/pricing-tiers/PricingTiers.tsx`

**Features**:
- Statistics dashboard:
  - Total tiers
  - Number of airspaces with pricing
  - Average price per unit
  - Maximum price configured
- SearchableTable with columns:
  - Airspace (with icon and description)
  - Max MTOW (or "No limit")
  - Unit Price
  - Currency
  - Description
- Filters:
  - Airspace
  - Currency
- Actions per row:
  - View Airspace
  - Edit Tier
  - Delete Tier
- Create Pricing Tier button

### 4. Create Pricing Tier (`/airspace-management/pricing-tiers/create`)

**File**: `src/pages/airspace-management/pricing-tiers/CreatePricingTier.tsx`

**Features**:
- FormView component with sections:
  - **Pricing Tier Information**:
    - Airspace (dropdown)
    - Maximum Takeoff Weight (optional, number)
    - Unit Price (required, positive number)
    - Currency (dropdown: USD, EUR, GBP, NGN)
    - Description (textarea, optional)
- Validation:
  - Required fields
  - Positive numbers for price
  - Currency selection
- Breadcrumb navigation
- Cancel and Create buttons

### 5. Update Pricing Tier (`/airspace-management/pricing-tiers/:id/edit`)

**File**: `src/pages/airspace-management/pricing-tiers/UpdatePricingTier.tsx`

**Features**:
- Same form as Create, but pre-filled with existing data
- Loading state while fetching tier data
- Update button instead of Create
- Full field editing capability

### 6. Register Usage Rule (`/airspace-management/usage-rules/register`)

**File**: `src/pages/airspace-management/usage-rules/RegisterUsageRule.tsx`

**Features**:
- FormView with two sections:
  - **Usage Rule Information**:
    - Rule Name
    - Airspace (dropdown)
    - Rule Type (time_restriction, aircraft_type, weight_limit, capacity_limit, weather_dependent)
    - Priority (low, medium, high, critical)
    - Description (textarea)
    - Active checkbox
  - **Rule Parameters**:
    - Start Time (HH:MM format)
    - End Time (HH:MM format)
    - Maximum Weight (kg)
    - Maximum Capacity
    - Allowed Aircraft Types (comma-separated)
- Default values: Active=true, Priority=medium

### 7. Edit Usage Rule (`/airspace-management/usage-rules/:id/edit`)

**File**: `src/pages/airspace-management/usage-rules/EditUsageRule.tsx`

**Features**:
- Same form as Register, but pre-filled
- Loading state while fetching rule data
- Update button

## Components Used

### SearchableTable
- Provides filtering, searching, and pagination
- Supports bulk selection
- Action buttons per row
- Responsive design
- Used in: AirspaceList, PricingTiers

### FormView
- Reusable form component
- Section-based layout
- Field validation
- Loading states
- Error handling
- Breadcrumb navigation
- Used in: CreatePricingTier, UpdatePricingTier, RegisterUsageRule, EditUsageRule

### ATCZoneMap
- Map visualization for airspaces
- Polygon rendering
- Used in: AirspaceDetail

## Data Types

All types are defined in `src/types/airspace-billing-types/airspace.types.ts`:

```typescript
- Airspace
- PricingTier
- PricingModel: 'per_hour' | 'per_km' | 'flat_rate'
- AirspaceValidation
- AirspaceUsageSummary
```

## API Integration (TODO)

All pages currently use mock data. The following API endpoints need to be implemented:

### Airspaces
- `GET /api/airspaces` - List all airspaces
- `GET /api/airspaces/:id` - Get airspace details
- `POST /api/airspaces` - Create airspace
- `PUT /api/airspaces/:id` - Update airspace
- `PATCH /api/airspaces/:id` - Toggle active status
- `DELETE /api/airspaces/:id` - Delete airspace
- `GET /api/airspaces/:id/usage` - Get usage data
- `GET /api/airspaces/:id/pricing` - Get pricing tiers

### Pricing Tiers
- `GET /api/pricing-tiers` - List all tiers
- `GET /api/pricing-tiers/:id` - Get tier details
- `POST /api/pricing-tiers` - Create tier
- `PUT /api/pricing-tiers/:id` - Update tier
- `DELETE /api/pricing-tiers/:id` - Delete tier

### Usage Rules
- `GET /api/usage-rules` - List all rules
- `GET /api/usage-rules/:id` - Get rule details
- `POST /api/usage-rules` - Create rule
- `PUT /api/usage-rules/:id` - Update rule
- `DELETE /api/usage-rules/:id` - Delete rule

## Routing

Add these routes to your router configuration:

```typescript
// Airspaces
/airspace-management/airspaces - AirspaceList
/airspace-management/airspaces/create - CreateAirspace (TODO)
/airspace-management/airspaces/:id - AirspaceDetail
/airspace-management/airspaces/:id/edit - EditAirspace (TODO)

// Pricing Tiers
/airspace-management/pricing-tiers - PricingTiers
/airspace-management/pricing-tiers/create - CreatePricingTier
/airspace-management/pricing-tiers/:id/edit - UpdatePricingTier

// Usage Rules
/airspace-management/usage-rules - UsageRulesList (TODO)
/airspace-management/usage-rules/register - RegisterUsageRule
/airspace-management/usage-rules/:id/edit - EditUsageRule
```

## Next Steps

1. **Create Missing Pages**:
   - CreateAirspace (with polygon editor)
   - EditAirspace (with polygon editor)
   - UsageRulesList (similar to AirspaceList)

2. **Implement API Integration**:
   - Replace all mock data with actual API calls
   - Add error handling and loading states
   - Implement search functionality

3. **Add Polygon Editor**:
   - Map-based polygon drawing tool
   - Validation for polygon geometry
   - Overlap detection

4. **Enhance Functionality**:
   - Export usage data as CSV
   - Invoice creation integration
   - Real-time usage monitoring
   - Validation rules implementation

5. **Testing**:
   - Unit tests for components
   - Integration tests for CRUD operations
   - E2E tests for user workflows

## Known Issues

- TypeScript warnings about unused React imports (cosmetic only)
- Some useEffect dependency warnings (need to be resolved)
- Time input fields use text type (FormView doesn't support time type)
- Mock data is used throughout (needs backend integration)

## Design Patterns

- **Consistent Layout**: All pages follow the same structure (breadcrumbs, header, content)
- **Reusable Components**: SearchableTable and FormView reduce code duplication
- **Statistics Panels**: Provide quick insights at the top of list pages
- **Action Patterns**: Consistent action buttons and confirmation dialogs
- **Responsive Design**: Grid layouts adapt to different screen sizes
- **Loading States**: Spinners and skeleton screens for better UX
- **Error Handling**: User-friendly error messages and fallback states
