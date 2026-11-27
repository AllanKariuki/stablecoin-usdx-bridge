import { useCallback } from 'react';
import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { paymentsApi, type PaymentIntent } from '@damp/web-shared/api/payments';
import { formatDateTime, usePolling } from '@damp/web-shared/lib';
import { Button, Callout, KeyValueList, LinkButton, MonoRef, MoneyText, StatusBadge } from '@damp/web-shared/ui';
import { MOVE_POLL_MS, MOVE_TERMINAL, moveFailureCopy } from '../lib/move';

/**
 * The deposit/withdraw result step: poll the intent every 3s and walk the
 * customer through the rail's lifecycle — REQUIRES_ACTION (approve on the
 * phone), PROCESSING, then SETTLED (with a link to the credited wallet) or
 * FAILED (friendly reason plus retry). `load` is memoised on the intent id so
 * the poll survives re-renders without restarting.
 */
export default function IntentStatus({
  intent,
  successTitle,
  successBody,
  onRetry,
}: {
  intent: PaymentIntent;
  successTitle: string;
  successBody: string;
  onRetry: () => void;
}) {
  const load = useCallback(() => paymentsApi.intent(intent.id), [intent.id]);
  const { data, error } = usePolling(load, MOVE_POLL_MS, (i) => MOVE_TERMINAL.has(i.status.toUpperCase()));
  const current = data ?? intent;
  const status = current.status.toUpperCase();
  const terminal = MOVE_TERMINAL.has(status);

  if (terminal && status === 'SETTLED') {
    return (
      <div className="flex flex-col items-start gap-4 animate-rise" role="status" data-testid="move-success">
        <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
          <CheckCircle2 className="size-7" aria-hidden />
        </span>
        <h2 className="text-2xl font-extrabold tracking-tight text-navy">{successTitle}</h2>
        <p className="max-w-md text-sm text-muted">{successBody}</p>
        <KeyValueList
          className="w-full"
          items={[
            { label: 'Status', value: <StatusBadge status={current.status} /> },
            { label: 'Amount', value: <MoneyText money={current.amount} /> },
            { label: 'Reference', value: <MonoRef value={current.id} /> },
            { label: 'Settled', value: formatDateTime(current.settledAt) },
          ]}
        />
        {current.walletId && <LinkButton to={`/wallets/${current.walletId}`}>View balance</LinkButton>}
      </div>
    );
  }

  const requiresAction = status === 'REQUIRES_ACTION';
  const failed = terminal && status === 'FAILED';

  return (
    <div className="flex flex-col gap-4 animate-rise" role="status" data-testid="move-intent-status">
      <span className={failed ? 'grid size-14 place-items-center rounded-[18px] bg-danger-tint text-danger-ink' : 'grid size-14 place-items-center rounded-[18px] bg-action-tint text-action'}>
        {failed ? <TriangleAlert className="size-7" aria-hidden /> : <LoaderCircle className="size-7 animate-spin" aria-hidden />}
      </span>
      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-navy">
          {failed ? 'This didn’t go through' : requiresAction ? 'Approve the prompt on your phone' : 'Moving your money'}
        </h2>
        <p className="mt-1 max-w-md text-sm text-muted">
          {requiresAction
            ? 'We’ve sent the request to your provider. Nothing is booked to your wallet until you approve it on your phone.'
            : 'Your provider has accepted the request. We’ll credit your wallet the moment they confirm.'}
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
      {current.customerAction && (
        <Callout tone="warn" title="Your action needed">
          {current.customerAction}
        </Callout>
      )}
      {failed && (
        <Callout tone="danger" title="It didn’t complete">
          {current.failureReason ? moveFailureCopy(current.failureReason) : 'Nothing was moved. You can try again.'}
        </Callout>
      )}
      {terminal && status === 'CANCELLED' && (
        <Callout tone="warn" title="This was cancelled">No money moved. Start again whenever you’re ready.</Callout>
      )}
      {Boolean(error) && <Callout tone="warn">We can’t reach the update right now — retrying automatically.</Callout>}
      {failed && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
          <LinkButton to="/payments" variant="ghost">
            View payment activity
          </LinkButton>
        </div>
      )}
    </div>
  );
}
