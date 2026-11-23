import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Clock, Search, Wallet } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, Field, Input, PageHeader } from '@damp/web-shared/ui';

import { readRecent, type LookupKind as Kind } from '../recent';

const META: Record<Kind, { title: string; noun: string; path: string; icon: typeof Wallet; description: string }> = {
  wallet: {
    title: 'Wallets',
    noun: 'wallet',
    path: '/wallets',
    icon: Wallet,
    description: 'Open any wallet by id to see its balance and statement.',
  },
  transaction: {
    title: 'Transactions',
    noun: 'transaction',
    path: '/transactions',
    icon: ArrowLeftRight,
    description: 'Open any transaction by id to see every ledger entry it posted.',
  },
};

/**
 * The gateway can read any single wallet or transaction for staff, but has
 * no "list everyone's" endpoint — so lookup is by id, from an alert, a
 * case, an audit event or a customer's report.
 */
function Lookup({ kind }: { kind: Kind }) {
  const meta = META[kind];
  const navigate = useNavigate();
  const [id, setId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recent = readRecent(kind);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!id.trim()) return setError(`Enter a ${meta.noun} id.`);
    navigate(`${meta.path}/${encodeURIComponent(id.trim())}`);
  };

  return (
    <>
      <PageHeader eyebrow="Lookup" title={meta.title} description={meta.description} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <Field label={`${meta.noun[0].toUpperCase()}${meta.noun.slice(1)} id`} error={error} className="flex-1">
              <Input
                value={id}
                onChange={(e) => {
                  setId(e.target.value);
                  setError(null);
                }}
                placeholder={kind === 'wallet' ? 'e.g. 3f2a…' : 'e.g. tx_…'}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
              />
            </Field>
            <Button type="submit" icon={<Search className="size-4" aria-hidden />}>
              Open
            </Button>
          </form>
        </Card>
        <Card className="reveal">
          <CardHeader title="Recently opened" />
          {recent.length === 0 ? (
            <EmptyState icon={<Clock className="size-6" aria-hidden />} title="Nothing yet" className="py-6">
              {meta.title} you open appear here, on this device only.
            </EmptyState>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {recent.map((r) => (
                <li key={r}>
                  <Link to={`${meta.path}/${encodeURIComponent(r)}`} className="flex min-h-10 items-center gap-2 rounded-[10px] px-2 font-mono text-[13px] text-action no-underline hover:bg-canvas">
                    <meta.icon className="size-4 text-subtle" aria-hidden />
                    <span className="truncate">{r}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

export const WalletLookup = () => <Lookup kind="wallet" />;
export const TransactionLookup = () => <Lookup kind="transaction" />;
