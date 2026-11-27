import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, CircleDollarSign, Clock, Percent, Scale } from 'lucide-react';
import { Card, PageHeader } from '@damp/web-shared/ui';
import SwapCard from '../components/SwapCard';
import ConversionHistory from '../components/ConversionHistory';

const HOW = [
  { icon: <Scale className="size-4" aria-hidden />, title: 'Live from several sources', body: 'Each pair is priced from multiple market sources, blended into one rate.' },
  { icon: <Clock className="size-4" aria-hidden />, title: 'Good for ~30 seconds', body: 'A quote stays valid for about 30 seconds, then re-quotes itself automatically.' },
  { icon: <Percent className="size-4" aria-hidden />, title: 'One fee, shown up front', body: 'The spread is the only fee — there are no hidden charges.' },
  { icon: <CircleDollarSign className="size-4" aria-hidden />, title: 'Dollars and USD-X are 1:1', body: 'Issuing and redeeming USD-X carries no spread: one dollar for one USD-X.' },
  { icon: <ArrowLeftRight className="size-4" aria-hidden />, title: 'USD-X goes via dollars', body: 'Any other USD-X pair converts in two steps: USD-X → USD, then USD → your target.' },
];

/**
 * The full convert screen (slice 5b): the Swap card on the left with a
 * "how conversion works" explainer beside it, and the caller's conversion
 * history underneath. Keeps the /convert?from=<walletId>&to=<CCY> deep links.
 */
export default function ConvertPage() {
  const [params] = useSearchParams();
  const initialFromId = useMemo(() => params.get('from') ?? undefined, [params]);
  const initialToCurrency = useMemo(() => params.get('to') ?? undefined, [params]);
  return (
    <>
      <PageHeader eyebrow="Move money" title="Convert" description="Swap between your wallets at a live rate, or move between dollars and USD-X on the peg." />
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <SwapCard initialFromId={initialFromId} initialToCurrency={initialToCurrency} />
        <Card>
          <h2 className="text-base font-bold text-ink">How conversion works</h2>
          <ul className="mt-4 flex flex-col gap-4">
            {HOW.map((h) => (
              <li key={h.title} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-[10px] bg-action-tint text-action">{h.icon}</span>
                <div>
                  <p className="text-sm font-bold text-ink">{h.title}</p>
                  <p className="text-[13px] leading-relaxed text-muted">{h.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="mt-8">
        <ConversionHistory />
      </div>
    </>
  );
}
