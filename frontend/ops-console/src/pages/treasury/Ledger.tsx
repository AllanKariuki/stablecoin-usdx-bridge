import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, CheckCircle2, Lock, Scale } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { ledgerAdminApi, type LedgerAccount, type PeriodClosure } from '@damp/web-shared/api/ledger-admin';
import { Can } from '@damp/web-shared/auth';
import { humanize, useAsync } from '@damp/web-shared/lib';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  LoadMore,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  Tabs,
} from '@damp/web-shared/ui';

type Tab = 'trial-balance' | 'integrity' | 'accounts' | 'close';

const CURRENCIES = ['USD', 'USDX', 'EUR', 'KES'];

export default function Ledger() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'trial-balance';
  return (
    <>
      <PageHeader eyebrow="Treasury" title="Ledger" description="core-ledger's own books: double-entry, append-only. Figures are decimal strings exactly as the ledger reports them." />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { value: 'trial-balance', label: 'Trial balance' },
          { value: 'integrity', label: 'Integrity' },
          { value: 'accounts', label: 'Accounts' },
          { value: 'close', label: 'Period close' },
        ]}
      />
      {tab === 'trial-balance' && <TrialBalanceTab />}
      {tab === 'integrity' && <IntegrityTab />}
      {tab === 'accounts' && <AccountsTab />}
      {tab === 'close' && <PeriodCloseTab />}
    </>
  );
}

function TrialBalanceTab() {
  const [currency, setCurrency] = useState('USD');
  const tb = useAsync(() => ledgerAdminApi.trialBalance(currency), [currency]);
  return (
    <Card>
      <CardHeader
        title="Trial balance"
        description={tb.data ? `As of ${tb.data.as_of}` : undefined}
        actions={
          <div className="flex items-center gap-3">
            {tb.data && (
              <Badge tone={tb.data.balanced ? 'cyan' : 'warn'} icon={tb.data.balanced ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertOctagon className="size-3.5" aria-hidden />}>
                {tb.data.balanced ? 'Balanced' : 'Not balanced'}
              </Badge>
            )}
            <label className="sr-only" htmlFor="tb-ccy">
              Currency
            </label>
            <Select id="tb-ccy" value={currency} onChange={(e) => setCurrency(e.target.value)} className="min-h-10 w-28 text-sm">
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </div>
        }
      />
      <DataTable
        caption={`Trial balance, ${currency}`}
        rows={tb.data?.lines}
        loading={tb.loading}
        error={tb.error ? apiErrorMessage(tb.error) : undefined}
        onRetry={tb.reload}
        rowKey={(l) => l.gl_code}
        empty={{ icon: <Scale className="size-6" aria-hidden />, title: `No ${currency} postings yet` }}
        columns={[
          { key: 'gl', header: 'GL code', render: (l) => <span className="font-mono text-[12.5px] font-semibold text-navy">{l.gl_code}</span> },
          { key: 'name', header: 'Account', render: (l) => l.name },
          { key: 'type', header: 'Type', render: (l) => humanize(l.type), hideOnMobile: true },
          { key: 'dr', header: 'Debits', align: 'right', render: (l) => <span className="font-mono tabular-nums">{l.debits}</span> },
          { key: 'cr', header: 'Credits', align: 'right', render: (l) => <span className="font-mono tabular-nums">{l.credits}</span> },
          { key: 'bal', header: 'Balance', align: 'right', render: (l) => <span className="font-mono font-semibold tabular-nums">{l.balance}</span> },
        ]}
      />
      {tb.data && (
        <div className="mt-3 flex flex-wrap justify-end gap-6 border-t border-line pt-3 font-mono text-sm">
          <span>
            <span className="mr-2 font-sans text-xs text-muted">Total debits</span>
            {tb.data.total_debits}
          </span>
          <span>
            <span className="mr-2 font-sans text-xs text-muted">Total credits</span>
            {tb.data.total_credits}
          </span>
        </div>
      )}
    </Card>
  );
}

function IntegrityTab() {
  const report = useAsync(() => ledgerAdminApi.integrity(), []);
  if (report.error) return <ErrorState message={apiErrorMessage(report.error)} onRetry={report.reload} />;
  const r = report.data;
  return (
    <Card>
      <CardHeader
        title="Running balance integrity"
        description="Recomputes every account's balance from its journal lines and compares it with the stored running balance."
        actions={
          <Button size="sm" variant="secondary" onClick={report.reload} loading={report.loading}>
            Re-check
          </Button>
        }
      />
      {!r ? (
        <Skeleton className="h-20 w-full" />
      ) : r.healthy ? (
        <Callout tone="success" title="Every account agrees">
          Stored running balances match the balances derived from the journal.
        </Callout>
      ) : (
        <>
          <Callout tone="warn" title={`${r.divergences.length} account${r.divergences.length === 1 ? '' : 's'} diverge`} className="mb-4">
            A running balance no longer matches its journal. Treat this as an incident: do not close the period.
          </Callout>
          <DataTable
            caption="Divergent accounts"
            rows={r.divergences}
            rowKey={(d) => d.gl_code}
            columns={[
              { key: 'gl', header: 'GL code', render: (d) => <span className="font-mono font-semibold">{d.gl_code}</span> },
              { key: 'run', header: 'Stored running', align: 'right', render: (d) => <span className="font-mono">{d.running}</span> },
              { key: 'der', header: 'Derived from journal', align: 'right', render: (d) => <span className="font-mono">{d.derived}</span> },
            ]}
          />
        </>
      )}
    </Card>
  );
}

function AccountsTab() {
  const [pages, setPages] = useState<LedgerAccount[][]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [more, setMore] = useState(false);
  const first = useAsync(async () => {
    const res = await ledgerAdminApi.accounts({ limit: 100 });
    setPages([res.accounts]);
    setCursor(res.next_cursor || undefined);
    return res;
  }, []);

  const loadMore = async () => {
    if (!cursor) return;
    setMore(true);
    try {
      const res = await ledgerAdminApi.accounts({ cursor, limit: 100 });
      setPages((p) => [...p, res.accounts]);
      setCursor(res.next_cursor || undefined);
    } finally {
      setMore(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Chart of accounts" />
      <DataTable
        caption="Ledger accounts"
        rows={first.loading ? undefined : pages.flat()}
        loading={first.loading}
        error={first.error ? apiErrorMessage(first.error) : undefined}
        onRetry={first.reload}
        rowKey={(a) => a.id}
        empty={{ title: 'No accounts' }}
        columns={[
          { key: 'gl', header: 'GL code', render: (a) => <span className="font-mono text-[12.5px] font-semibold text-navy">{a.gl_code}</span> },
          { key: 'name', header: 'Name', render: (a) => a.name },
          { key: 'type', header: 'Type', render: (a) => humanize(a.type), hideOnMobile: true },
          { key: 'ccy', header: 'Currency', render: (a) => a.currency },
          { key: 'bal', header: 'Balance', align: 'right', render: (a) => <span className="font-mono tabular-nums">{a.balance || '—'}</span> },
          { key: 'status', header: 'Status', align: 'right', render: (a) => <StatusBadge status={a.status} />, hideOnMobile: true },
        ]}
      />
      <LoadMore hasMore={Boolean(cursor)} loading={more} onClick={loadMore} />
    </Card>
  );
}

function PeriodCloseTab() {
  const [currency, setCurrency] = useState('');
  const [date, setDate] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<PeriodClosure | null>(null);

  return (
    <Card>
      <CardHeader title="Close a period" description="After a close, nothing can be posted with a value date on or before the closing date." />
      <Can
        anyOf={['ledger:admin']}
        fallback={
          <Callout tone="info" title="Treasury only">
            Closing a period needs ledger administration rights. You can still read the trial balance and integrity reports.
          </Callout>
        }
      >
        <div className="flex max-w-xl flex-col gap-4">
          <Callout tone="danger" title="This is a direct ledger posting">
            A period close is one of the highest-impact actions in the console. It cannot be undone from here, and every later correction
            must be posted into an open period. Run the integrity check first.
          </Callout>
          {closed && (
            <Callout tone="success" title="Period closed">
              <KeyValueList
                items={[
                  { label: 'Closing date', value: closed.closing_date },
                  { label: 'Currency', value: closed.currency || 'All currencies' },
                  { label: 'Closure', value: closed.id, mono: true },
                ]}
              />
            </Callout>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Closing date" error={error}>
              <Input type="date" value={date} onChange={(e) => (setDate(e.target.value), setError(null))} />
            </Field>
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value="">All currencies</option>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div>
            <Button variant="danger" icon={<Lock className="size-4" aria-hidden />} onClick={() => (date ? setConfirm(true) : setError('Choose the closing date.'))}>
              Close period…
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title={`Close ${currency || 'every currency'} through ${date}?`}
          variant="danger"
          confirmLabel="Close period"
          requireReason
          reasonLabel="Reason for closing"
          consequence={
            <>
              Postings with a value date on or before <strong>{date}</strong> {currency ? `in ${currency}` : 'in every currency'} will be refused
              from now on. This is recorded as a ledger closure in your name.
            </>
          }
          onConfirm={async (reason) => {
            try {
              setClosed(await ledgerAdminApi.closePeriod({ currency: currency || undefined, closing_date: date, reason }));
            } catch (err) {
              throw new Error(apiErrorMessage(err));
            }
          }}
        />
      </Can>
    </Card>
  );
}
