import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@damp/web-shared/ui';
import SwapCard from '../components/SwapCard';

/**
 * The full-width convert screen (slice 5a). Slice 5b may grow this into a
 * richer flow; today it is the Swap card, pre-seeded from
 * /convert?from=<walletId>&to=<CCY> deep links.
 */
export default function ConvertPage() {
  const [params] = useSearchParams();
  const initialFromId = useMemo(() => params.get('from') ?? undefined, [params]);
  const initialToCurrency = useMemo(() => params.get('to') ?? undefined, [params]);
  return (
    <>
      <PageHeader eyebrow="Move money" title="Convert" description="Swap between your wallets at a live rate, or move between dollars and USD-X on the peg." />
      <div className="mx-auto max-w-xl">
        <SwapCard initialFromId={initialFromId} initialToCurrency={initialToCurrency} />
      </div>
    </>
  );
}
