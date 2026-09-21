# DAMP User Portal - Frontend Architecture

## Overview

The DAMP (Digital Assets Management Platform) User Portal is a production-grade React + TypeScript application that provides comprehensive fiat and cryptocurrency trading functionality. This document outlines the architecture, conventions, and best practices for the frontend implementation.

## Tech Stack

- **Framework**: React 18 + TypeScript (strict mode)
- **Routing**: Next.js App Router (for SSR/SSG capabilities)
- **Styling**: Tailwind CSS with custom design tokens
- **State Management**:
  - React Query (TanStack Query) for server state
  - Zustand for UI/global state
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts (with fallback to Chart.js for advanced features)
- **WebSockets**: Custom hooks with reconnection logic
- **Testing**: Jest + React Testing Library + Cypress (E2E)
- **Component Docs**: Storybook 7+
- **Internationalization**: react-intl
- **API Mocking**: MSW (Mock Service Worker)

## Project Structure

```
src/
├── app/                    # Next.js app router pages
│   ├── (auth)/            # Auth layout group
│   │   ├── login/
│   │   └── register/
│   ├── (portal)/          # Main portal layout group
│   │   ├── dashboard/
│   │   ├── balances/
│   │   ├── trading/
│   │   ├── deposit/
│   │   ├── withdraw/
│   │   ├── kyc/
│   │   ├── notifications/
│   │   └── settings/
│   └── layout.tsx
├── components/
│   ├── dashboard/         # Dashboard-specific components
│   ├── trading/           # Trading components (OrderBook, PriceChart, etc.)
│   ├── wallet/            # Wallet & balance components
│   ├── kyc/              # KYC flow components
│   ├── layouts/          # Layout components (Nav, Sidebar)
│   ├── forms/            # Reusable form components
│   └── ui/               # Base UI components (Button, Card, Modal, etc.)
├── hooks/
│   ├── useSocket.ts      # WebSocket hook
│   ├── useAuth.ts        # Authentication hook
│   ├── useBalance.ts     # Balance management
│   └── useTradingPair.ts # Trading pair state
├── lib/
│   ├── api/              # API client functions
│   ├── utils/            # Utility functions
│   │   ├── money.ts      # Money formatting & conversion
│   │   ├── validation.ts # Zod schemas
│   │   └── format.ts     # Date, number formatting
│   └── constants.ts      # App constants
├── stores/
│   ├── uiStore.ts        # UI state (theme, modals, selected pair)
│   ├── authStore.ts      # Auth state
│   └── notificationStore.ts
├── types/
│   ├── api.ts            # API contract interfaces
│   ├── trading.ts        # Trading types
│   └── wallet.ts         # Wallet types
├── styles/
│   └── globals.css       # Global styles + Tailwind imports
├── mocks/                # MSW handlers for development
│   ├── handlers/
│   └── browser.ts
└── __tests__/            # Test files mirror src structure
```

## Core Principles

### 1. Money Handling

**Critical**: All monetary values MUST use integer smallest-unit representation across the entire codebase.

```typescript
// ✅ CORRECT
const btcAmount = 100000000; // 1 BTC = 100,000,000 satoshis
const usdAmount = 5000; // $50.00 = 5000 cents

// ❌ WRONG
const btcAmount = 1.0; // NEVER use floats for money
```

Helper functions:
- `toSmallestUnit(amount: number, decimals: number): number`
- `fromSmallestUnit(amount: number, decimals: number): number`
- `formatCurrency(amount: number, currency: Currency): string`

### 2. Type Safety

- All API responses must have TypeScript interfaces
- Use `zod` for runtime validation of user inputs
- Enable TypeScript strict mode
- No `any` types except for genuinely dynamic data with proper type guards

### 3. Security

- **Never** store secrets in frontend code
- Use environment variables for API URLs only
- Implement CSP headers at Next.js config level
- Clear sensitive data on logout
- Implement idle session timeout
- No localStorage for tokens (use httpOnly cookies when possible)

### 4. Accessibility

- WCAG 2.1 AA compliance minimum
- Semantic HTML throughout
- ARIA labels for dynamic content
- Keyboard navigation for all interactive elements
- Focus management in modals and forms
- aria-live regions for notifications and dynamic updates
- High contrast mode support

### 5. Performance

- Code-splitting per route (automatic with Next.js App Router)
- Lazy load heavy components (charts, modals)
- Windowed lists for large datasets (react-window)
- Image optimization with Next.js Image
- Memoization for expensive calculations
- React Query caching strategy

## API Contracts

All API contracts are defined in `src/types/api.ts`. Frontend uses these exact shapes:

```typescript
export type Currency = 'USD'|'EUR'|'KES'|'BTC'|'ETH'|'USDC'|'USDT';

export interface User {
  id: string;
  email: string;
  displayName?: string;
  kycStatus: 'NONE'|'PENDING'|'VERIFIED'|'REJECTED';
  createdAt: string;
}

export interface Wallet {
  id: string;
  userId: string;
  currency: Currency;
  type: 'FIAT'|'CRYPTO';
  available: number; // smallest unit integer
  reserved: number; // smallest unit integer
  address?: string; // for crypto
  metadata?: Record<string, any>;
}
```

See `src/types/api.ts` for complete contracts.

## State Management Strategy

### Server State (React Query)

Use React Query for all server-side data:
- Automatic caching and invalidation
- Background refetching
- Optimistic updates for mutations
- Error retry logic

```typescript
// Example: Fetch user balances
const { data: wallets, isLoading, error } = useQuery({
  queryKey: ['wallets', userId],
  queryFn: () => api.wallets.list(userId),
  staleTime: 30000, // 30 seconds
  refetchInterval: 60000, // 1 minute background refetch
});
```

### UI State (Zustand)

Use Zustand for client-only state:
- Theme preference (light/dark)
- Modal open/close states
- Selected trading pair
- Sidebar collapsed state
- Notification queue

```typescript
// Example: UI store
export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  selectedPair: 'BTC-USD',
  setSelectedPair: (pair) => set({ selectedPair: pair }),
  // ...
}));
```

## WebSocket Integration

Real-time updates via WebSocket channels:

```typescript
const { data: orderbook, isConnected } = useSocket({
  channel: `orderbook:${pair}`,
  onMessage: (update) => {
    // Handle orderbook update
  },
  reconnectDelay: 1000,
  maxReconnectAttempts: 10,
});
```

Channels:
- `balances` - Wallet balance updates
- `orderbook:<pair>` - Order book depth updates
- `trades:<pair>` - Recent trades feed
- `orders` - User's order status updates
- `notifications` - System notifications

## Forms & Validation

All forms use React Hook Form + Zod:

```typescript
const orderSchema = z.object({
  side: z.enum(['BUY', 'SELL']),
  type: z.enum(['MARKET', 'LIMIT']),
  amount: z.string().refine((val) => parseFloat(val) > 0, {
    message: 'Amount must be positive',
  }),
  price: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderSchema>;
```

## Component Guidelines

### Componentization

- Components should be small, focused, and reusable
- Separate container (logic) from presentational (UI) components
- Use compound component pattern for complex UIs (e.g., Modal)
- Export both named and default exports for flexibility

### Props

```typescript
interface ComponentProps {
  // Required props first
  userId: string;
  onSubmit: (data: FormData) => void;
  
  // Optional props with defaults
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  
  // Conditional props
  kycRequired?: boolean;
  
  // Standard props
  className?: string;
  children?: React.ReactNode;
}
```

### Error Boundaries

Wrap all page-level components with error boundaries:

```tsx
<ErrorBoundary fallback={<ErrorPage />}>
  <Dashboard />
</ErrorBoundary>
```

## Testing Strategy

### Unit Tests (Jest + RTL)

- Test component rendering and interactions
- Test hooks in isolation
- Test utility functions
- Mock external dependencies

```typescript
// Example: Component test
describe('OrderForm', () => {
  it('validates amount is positive', async () => {
    render(<OrderForm onSubmit={mockSubmit} />);
    
    const amountInput = screen.getByLabelText('Amount');
    await userEvent.type(amountInput, '-10');
    
    const submitButton = screen.getByRole('button', { name: /submit/i });
    await userEvent.click(submitButton);
    
    expect(screen.getByText(/amount must be positive/i)).toBeInTheDocument();
  });
});
```

### Integration Tests

- Test complete user flows
- Use MSW to mock API responses
- Test WebSocket interactions

### E2E Tests (Cypress)

Key flows to test:
1. User registration → KYC → deposit fiat → trade
2. Place market order → order fills → balance updates
3. Withdraw crypto with whitelist verification

## Styling Conventions

### Tailwind Usage

```typescript
// ✅ CORRECT: Use Tailwind utility classes
<button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
  Submit
</button>

// ✅ CORRECT: Use cn() for conditional classes
<div className={cn(
  "p-4 rounded-lg",
  variant === 'success' && "bg-green-100 text-green-800",
  variant === 'error' && "bg-red-100 text-red-800"
)}>
```

### Design Tokens

```css
/* tailwind.config.ts */
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: { /* blue scale */ },
        success: { /* green scale */ },
        danger: { /* red scale */ },
        warning: { /* yellow scale */ },
      },
      spacing: {
        18: '4.5rem',
      },
      borderRadius: {
        'card': '1rem',
      },
    },
  },
}
```

## Internationalization

Use react-intl for all user-facing strings:

```typescript
import { FormattedMessage } from 'react-intl';

<FormattedMessage
  id="dashboard.welcome"
  defaultMessage="Welcome, {name}"
  values={{ name: user.displayName }}
/>
```

## KYC & Compliance Integration

Components must support KYC gating:

```typescript
interface ActionButtonProps {
  kycRequired?: boolean;
  kycStatus?: User['kycStatus'];
  onKycRequired?: () => void;
}

const WithdrawButton: React.FC<ActionButtonProps> = ({
  kycRequired,
  kycStatus,
  onKycRequired,
  ...props
}) => {
  const isDisabled = kycRequired && kycStatus !== 'VERIFIED';
  
  return (
    <Tooltip
      content={isDisabled ? 'Complete KYC to withdraw' : ''}
    >
      <Button
        {...props}
        disabled={isDisabled}
        onClick={isDisabled ? onKycRequired : props.onClick}
      />
    </Tooltip>
  );
};
```

## Performance Optimization

### Code Splitting

```typescript
// Lazy load heavy components
const TradingPage = lazy(() => import('./pages/trading/TradingPage'));
const PriceChart = lazy(() => import('./components/trading/PriceChart'));
```

### Memoization

```typescript
// Expensive calculations
const portfolioValue = useMemo(() => {
  return wallets.reduce((total, wallet) => {
    const rate = exchangeRates[wallet.currency];
    return total + (wallet.available + wallet.reserved) * rate;
  }, 0);
}, [wallets, exchangeRates]);
```

### Virtual Lists

```typescript
import { FixedSizeList } from 'react-window';

<FixedSizeList
  height={600}
  itemCount={trades.length}
  itemSize={50}
  width="100%"
>
  {({ index, style }) => (
    <TradeRow style={style} trade={trades[index]} />
  )}
</FixedSizeList>
```

## Development Workflow

### Local Setup

```bash
# Install dependencies
npm install

# Start dev server with MSW mocking
npm run dev

# Run Storybook
npm run storybook

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# E2E tests
npm run cypress:open
```

### Environment Variables

```env
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws
NEXT_PUBLIC_ENV=development
```

### Git Workflow

- Feature branches: `feat/trading-orderbook`
- Bug fixes: `fix/balance-calculation`
- Husky pre-commit: lint + type check + tests
- PR requires: tests passing, no lint errors, Storybook build

## CI/CD

GitHub Actions workflow:
1. Lint & type check
2. Run unit tests
3. Run E2E tests
4. Build Storybook
5. Build production bundle
6. Deploy to staging/production

## Accessibility Testing

- Run `axe` in Storybook
- Manual keyboard navigation testing
- Screen reader testing (NVDA/JAWS)
- Color contrast checker

## Browser Support

- Chrome/Edge: Last 2 versions
- Firefox: Last 2 versions
- Safari: Last 2 versions
- Mobile: iOS Safari 13+, Chrome Android

## Monitoring & Error Tracking

- Sentry for error tracking
- Web Vitals monitoring
- Custom performance marks for key user flows
- Analytics for user behavior (privacy-compliant)

## Contributing

1. Read this document thoroughly
2. Follow TypeScript strict mode - no `any` without justification
3. Write tests for new components/features
4. Update Storybook stories
5. Follow accessibility guidelines
6. Use smallest-unit integers for all money values
7. Add JSDoc comments for complex logic

## Resources

- [React Query Docs](https://tanstack.com/query/latest)
- [Zustand Docs](https://zustand-demo.pmnd.rs/)
- [React Hook Form](https://react-hook-form.com/)
- [Zod Validation](https://zod.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Storybook](https://storybook.js.org/)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

## Contact

For questions or clarifications, contact the frontend team lead or create an issue in the repository.
