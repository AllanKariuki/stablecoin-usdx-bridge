import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileText } from 'lucide-react';
import { apiErrorMessage, newIdempotencyKey } from '@damp/web-shared/api';
import { paymentsApi, resolvePaymentLink, type PaymentIntent } from '@damp/web-shared/api/payments';
import { useAuth } from '@damp/web-shared/auth';
import { formatDate, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, ErrorState, HeroPanel, KeyValueList, LinkButton, Logo, MonoRef, MoneyText, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';

/**
 * Where an invoice's payment link lands. Opens without an account (the token
 * is the credential, and resolves at services/payments directly); paying
 * needs one, because money moves wallet to wallet inside the platform.
 */
export default function PayInvoicePage() {
  const { payToken = '' } = useParams();
  const { status, login, register, hasRole } = useAuth();
  const invoice = useAsync(() => resolvePaymentLink(payToken), [payToken]);
  const signedIn = status === 'authenticated';
  // The pay endpoint takes the invoice id, which the public view withholds;
  // a signed-in payer finds it among the invoices addressed to them.
  const payable = useAsync(() => (signedIn && hasRole('customer', 'company') ? paymentsApi.invoices('payer') : Promise.resolve([])), [signedIn]);
  const match = payable.data?.find((i) => i.number === invoice.data?.number && i.status.toUpperCase() === 'OPEN');
  const key = useMemo(() => newIdempotencyKey(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paid, setPaid] = useState<PaymentIntent | null>(null);

  const pay = async () => {
    if (!match) return;
    setBusy(true);
    setError(null);
    try {
      setPaid(await paymentsApi.payInvoice(match.id, key));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const here = `/pay/${encodeURIComponent(payToken)}`;

  return (
    <div className="min-h-dvh bg-shell">
      <HeroPanel className="rounded-none">
        <header className="mx-auto flex w-full max-w-lg items-center justify-between gap-4 px-6 py-6">
          <Logo size={36} subtitle="Payment link" inverted />
        </header>
      </HeroPanel>
      <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
        <Card className="animate-rise">
          {invoice.loading ? (
            <SkeletonRows rows={3} />
          ) : invoice.error ? (
            <ErrorState title="This link can’t be used" message={invoice.error instanceof Error ? invoice.error.message : 'Try again later.'} onRetry={invoice.reload} />
          ) : invoice.data ? (
            paid ? (
              <div className="flex flex-col items-start gap-4" role="status">
                <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
                  <CheckCircle2 className="size-7" aria-hidden />
                </span>
                <h1 className="text-2xl font-extrabold tracking-tight text-navy">Payment sent</h1>
                <KeyValueList className="w-full" items={[{ label: 'Status', value: <StatusBadge status={paid.status} /> }, { label: 'Reference', value: <MonoRef value={paid.id} /> }]} />
                <LinkButton to="/home" variant="secondary">
                  Go to your account
                </LinkButton>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <div className="flex items-start gap-3">
                  <span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-action-tint text-action">
                    <FileText className="size-6" aria-hidden />
                  </span>
                  <div>
                    <p className="eyebrow">Invoice {invoice.data.number}</p>
                    <MoneyText money={invoice.data.amount} size="xl" className="mt-1 text-navy" />
                  </div>
                </div>
                <KeyValueList
                  items={[
                    { label: 'For', value: invoice.data.description || '—' },
                    ...(invoice.data.payerName ? [{ label: 'Billed to', value: invoice.data.payerName }] : []),
                    { label: 'Due', value: formatDate(invoice.data.dueDate) },
                  ]}
                />
                {error && <Callout tone="danger">{error}</Callout>}
                {!signedIn ? (
                  <div className="flex flex-col gap-2">
                    <Button size="lg" onClick={() => void login({ returnTo: here })}>
                      Sign in to pay
                    </Button>
                    <Button variant="secondary" onClick={() => void register({ returnTo: here })}>
                      New to DAMP? Open an account
                    </Button>
                  </div>
                ) : payable.loading ? (
                  <SkeletonRows rows={1} />
                ) : match ? (
                  <Button size="lg" onClick={pay} loading={busy}>
                    Pay {invoice.data.amount.display}
                  </Button>
                ) : (
                  <Callout tone="warn" title="This invoice isn’t addressed to your account">
                    Sign in with the account the invoice was sent to, or ask the sender to issue it to you.
                  </Callout>
                )}
                <p className="text-xs text-muted">Payment moves from your DAMP wallet to the sender’s in a single ledger transaction.</p>
              </div>
            )
          ) : null}
        </Card>
      </main>
    </div>
  );
}
