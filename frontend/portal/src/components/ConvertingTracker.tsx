import { CheckCircle2, LoaderCircle } from 'lucide-react';
import { paymentsApi, type PaymentIntent } from '@damp/web-shared/api/payments';
import { formatDateTime, usePolling } from '@damp/web-shared/lib';
import { Callout, KeyValueList, LinkButton, MonoRef, MoneyText, StatusBadge } from '@damp/web-shared/ui';
import { INTENT_POLL_MS, intentFailureCopy } from '../lib/converting';

const TERMINAL = new Set(['SETTLED', 'FAILED', 'CANCELLED']);

/**
 * A CONVERTING intent's settlement story: the USD-X burn is on chain, so
 * this polls the intent every 5s and walks the customer to the outcome —
 * a receipt on SETTLED, the failure reason (in customer words) otherwise.
 */
export default function ConvertingTracker({ intent }: { intent: PaymentIntent }) {
  const { data, error } = usePolling(() => paymentsApi.intent(intent.id), INTENT_POLL_MS, (i) => TERMINAL.has(i.status.toUpperCase()));
  const current = data ?? intent;
  const terminal = TERMINAL.has(current.status.toUpperCase());
  const succeeded = current.status.toUpperCase() === 'SETTLED';

  if (terminal && succeeded) {
    return (
      <div className="flex flex-col items-start gap-4 animate-rise" role="status">
        <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h2 className="text-2xl font-extrabold tracking-tight text-navy">Payment sent</h2>
        <KeyValueList
          className="w-full"
          items={[
            { label: 'Status', value: <StatusBadge status={current.status} /> },
            { label: 'Amount', value: <MoneyText money={current.amount} /> },
            { label: 'Reference', value: <MonoRef value={current.id} /> },
            { label: 'Settled', value: formatDateTime(current.settledAt) },
          ]}
        />
        <LinkButton to="/payments" variant="secondary">
          View payment activity
        </LinkButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-rise" role="status" data-testid="converting-tracker">
      <span className="grid size-14 place-items-center rounded-[18px] bg-action-tint text-action">
        <LoaderCircle className="size-7 animate-spin" aria-hidden />
      </span>
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-navy">USD-X is settling</h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          Your USD-X is being redeemed to dollars on chain. The payment is booked once the burn confirms — usually a few minutes. You can leave this page.
        </p>
      </div>
      <KeyValueList
        className="w-full"
        items={[
          { label: 'Status', value: <StatusBadge status={current.status} /> },
          { label: 'Amount', value: <MoneyText money={current.amount} /> },
          { label: 'Reference', value: <MonoRef value={current.id} /> },
          { label: 'Started', value: formatDateTime(current.createdAt) },
        ]}
      />
      {error ? <Callout tone="warn">We can’t reach the update right now — retrying automatically.</Callout> : null}
      {terminal && current.status.toUpperCase() === 'FAILED' && (
        <Callout tone="danger" title="This payment failed">
          {current.failureReason ? intentFailureCopy(current.failureReason) : 'It didn’t complete. Nothing was lost.'}
        </Callout>
      )}
      {terminal && current.status.toUpperCase() === 'CANCELLED' && (
        <Callout tone="warn" title="This payment was cancelled">No money moved. You can start a new payment whenever you’re ready.</Callout>
      )}
    </div>
  );
}
