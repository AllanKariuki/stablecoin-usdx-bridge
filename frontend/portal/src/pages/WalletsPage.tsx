import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, FileText, MoreHorizontal, Pencil, Plus, Star, Wallet as WalletIcon } from 'lucide-react';
import { apiErrorMessage, ratesApi, walletsApi, type Wallet } from '@damp/web-shared/api';
import { Can } from '@damp/web-shared/auth';
import { useAsync } from '@damp/web-shared/lib';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Input, Modal, PageHeader, Skeleton, StatusBadge, toast } from '@damp/web-shared/ui';
import { useWallets } from '../hooks/useWallets';
import CurrencyIcon from '../components/CurrencyIcon';
import AddWalletWizard from '../components/AddWalletWizard';
import { currencyMeta, SECTION_LABEL, walletSection, type WalletSection } from '../lib/currency';
import { boardRates, formatUsd, walletUsdValue, type RateMap } from '../lib/portfolio';
import { toggleBalancesHidden, useBalancesHidden } from '../lib/balancesVisibility';

/** The small "…" actions menu: set default, rename, view statement. */
function WalletMenu({ wallet, multiInCurrency, onChanged }: { wallet: Wallet; multiInCurrency: boolean; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="relative">
      <IconButton label={`Actions for ${wallet.label || wallet.currency}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="-mr-2 -mt-1 size-9">
        <MoreHorizontal className="size-4" aria-hidden />
      </IconButton>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-20 mt-1 w-44 rounded-control border border-line bg-surface p-1 shadow-pop animate-pop">
            {multiInCurrency && !wallet.isDefault && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-canvas"
                onClick={() => {
                  setOpen(false);
                  void walletsApi.updateWallet(wallet.id, { isDefault: true }).then(
                    () => (onChanged(), toast(`${wallet.currency}${wallet.chain ? ` on ${wallet.chain.toLowerCase()}` : ''} is now your default.`)),
                    (err) => toast(apiErrorMessage(err), 'danger'),
                  );
                }}
              >
                <Star className="size-3.5 text-warn" aria-hidden /> Set as default
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-semibold text-ink hover:bg-canvas"
              onClick={() => (setOpen(false), setRenaming(true))}
            >
              <Pencil className="size-3.5 text-action" aria-hidden /> Rename
            </button>
            <Link to={`/wallets/${wallet.id}`} role="menuitem" className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px] font-semibold text-ink no-underline hover:bg-canvas">
              <FileText className="size-3.5 text-action" aria-hidden /> View statement
            </Link>
          </div>
        </>
      )}
      <RenameWalletModal wallet={wallet} open={renaming} onClose={() => setRenaming(false)} onRenamed={onChanged} />
    </div>
  );
}

function RenameWalletModal({ wallet, open, onClose, onRenamed }: { wallet: Wallet; open: boolean; onClose: () => void; onRenamed: () => void }) {
  const [label, setLabel] = useState(wallet.label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (label.length > 64) return setError('Keep the label to 64 characters or fewer.');
    setBusy(true);
    setError(null);
    try {
      await walletsApi.updateWallet(wallet.id, { label: label.trim() || undefined });
      onRenamed();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={`Rename ${wallet.label || wallet.currency}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="rename-wallet-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="rename-wallet-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Label" hint="Up to 64 characters. Shown on your dashboard and statements." error={error ?? undefined}>
          <Input value={label} onChange={(e) => (setLabel(e.target.value), setError(null))} autoFocus />
        </Field>
      </form>
    </Modal>
  );
}

function WalletCard({ wallet, rates, hidden, multiInCurrency, onChanged }: { wallet: Wallet; rates: RateMap; hidden: boolean; multiInCurrency: boolean; onChanged: () => void }) {
  const usd = walletUsdValue(wallet, rates);
  const isDefault = wallet.isDefault ?? !multiInCurrency; // a single wallet is the default implicitly
  return (
    <article className="lift group flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CurrencyIcon currency={wallet.currency} chain={wallet.chain} size="lg" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-bold text-ink">
              {wallet.label || currencyMeta(wallet.currency).name}
              {isDefault && <Star className="size-3.5 shrink-0 fill-warn text-warn" aria-label="Default wallet" />}
            </p>
            <p className="text-xs text-muted">
              {currencyMeta(wallet.currency).name}
              {wallet.chain ? ` · on ${wallet.chain.toLowerCase()}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge status={wallet.status} />
          <WalletMenu wallet={wallet} multiInCurrency={multiInCurrency} onChanged={onChanged} />
        </div>
      </div>
      <Link to={`/wallets/${wallet.id}`} className="-m-1 flex flex-col gap-1 rounded-[14px] p-1 no-underline hover:bg-canvas">
        <span className="font-mono text-xl font-bold tabular-nums text-navy">{hidden ? '••••••' : wallet.balance.display}</span>
        <span className="text-xs text-muted">{hidden ? '••••••' : usd === null ? 'Price unavailable in USD' : formatUsd(usd)}</span>
      </Link>
    </article>
  );
}

export default function WalletsPage() {
  const wallets = useWallets();
  const rates = useAsync(() => ratesApi.rates('USD'), []);
  const hidden = useBalancesHidden();
  const [adding, setAdding] = useState(false);
  const rateMap = useMemo(() => boardRates(rates.data), [rates.data]);

  const groups = useMemo(() => {
    const sections: Record<WalletSection, Wallet[]> = { fiat: [], crypto: [], usdx: [] };
    for (const w of wallets.data ?? []) sections[walletSection(w)].push(w);
    return sections;
  }, [wallets.data]);

  const countFor = (currency: string) => (wallets.data ?? []).filter((w) => w.currency === currency).length;

  return (
    <>
      <PageHeader
        eyebrow="Wallets"
        title="Your wallets"
        description="One balance per currency, plus USD-X on each chain you use."
        actions={
          <>
            <IconButton label={hidden ? 'Show balances' : 'Hide balances'} aria-pressed={hidden} onClick={toggleBalancesHidden} className="border border-line-strong">
              {hidden ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
            </IconButton>
            <Can anyOf={['wallets:write:own']}>
              <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
                Add wallet
              </Button>
            </Can>
          </>
        }
      />

      {wallets.loading && !wallets.data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i}>
              <Skeleton className="w-24" />
              <Skeleton className="mt-4 h-8 w-40" />
              <Skeleton className="mt-6 w-32" />
            </Card>
          ))}
        </div>
      ) : wallets.error ? (
        <Card>
          <ErrorState message={apiErrorMessage(wallets.error)} onRetry={wallets.reload} />
        </Card>
      ) : !wallets.data?.length ? (
        <Card>
          <EmptyState icon={<WalletIcon className="size-6" aria-hidden />} title="No wallets yet" action={<Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>Add a wallet</Button>}>
            A wallet opens the first time money arrives in a currency — or add one now.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {(['fiat', 'crypto', 'usdx'] as WalletSection[]).map((section) =>
            groups[section].length ? (
              <section key={section} aria-labelledby={`wallets-${section}`}>
                <h2 id={`wallets-${section}`} className="eyebrow mb-3">
                  {SECTION_LABEL[section]}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {groups[section].map((w) => (
                    <WalletCard key={w.id} wallet={w} rates={rateMap} hidden={hidden} multiInCurrency={countFor(w.currency) > 1} onChanged={() => (wallets.reload(), rates.reload())} />
                  ))}
                </div>
              </section>
            ) : null,
          )}
        </div>
      )}

      <AddWalletWizard open={adding} onClose={() => setAdding(false)} wallets={wallets.data ?? []} onAdded={() => (wallets.reload(), rates.reload())} />
    </>
  );
}
