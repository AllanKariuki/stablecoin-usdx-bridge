import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Banknote, Coins, Sparkles } from 'lucide-react';
import { apiErrorMessage, walletsApi, type Currency, type Wallet } from '@damp/web-shared/api';
import { useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Field, Input, LinkButton, Modal } from '@damp/web-shared/ui';
import { currencyMeta } from '../lib/currency';
import CurrencyIcon from './CurrencyIcon';
import OpenUsdxWalletForm from './OpenUsdxWalletForm';

type Type = 'fiat' | 'crypto' | 'usdx';

const TYPES: Array<{ value: Type; title: string; body: string; icon: typeof Banknote }> = [
  { value: 'fiat', title: 'Fiat', body: 'USD, EUR, GBP and KES — held at our custodian.', icon: Banknote },
  { value: 'crypto', title: 'Crypto', body: 'BTC, ETH and SOL — held on chain for you.', icon: Coins },
  { value: 'usdx', title: 'USD-X', body: 'The dollar on chain — one wallet per chain.', icon: Sparkles },
];

/**
 * Add-a-wallet wizard: type → currency (from GET /currencies, minus the
 * currencies the user already holds) → label + confirm → success with the
 * right CTA. USD-X reuses the chain-picking OpenUsdxWalletForm flow.
 */
export default function AddWalletWizard({ open, onClose, wallets, onAdded }: { open: boolean; onClose: () => void; wallets: Wallet[]; onAdded?: (w: Wallet) => void }) {
  const currencies = useAsync<Currency[]>(() => walletsApi.currencies());
  const [step, setStep] = useState(1);
  const [type, setType] = useState<Type>('fiat');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Wallet | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setType('fiat');
    setCode('');
    setLabel('');
    setBusy(false);
    setError(null);
    setCreated(null);
  }, [open]);

  const held = useMemo(() => new Set(wallets.map((w) => w.currency)), [wallets]);
  const choices = useMemo(
    () => (currencies.data ?? []).filter((c) => !held.has(c.code) && c.code !== 'USDX' && (type === 'fiat' ? c.kind === 'FIAT' : c.kind === 'CRYPTO')),
    [currencies.data, held, type],
  );

  const confirm = async () => {
    if (!code) return;
    if (label.length > 64) return setError('Keep the label to 64 characters or fewer.');
    setBusy(true);
    setError(null);
    try {
      const w = await walletsApi.createWallet({ currency: code, label: label.trim() || undefined });
      setCreated(w);
      setStep(4);
      onAdded?.(w);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const done = created;
  const successCta = done
    ? done.currency === 'USDX'
      ? { to: '/convert?to=USDX', label: 'Buy USD-X' }
      : type === 'fiat'
        ? { to: '/move/deposit', label: 'Fund it' }
        : { to: `/convert?to=${done.currency}`, label: `Buy ${done.currency}` }
    : null;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={step === 4 ? 'Wallet added' : `Add a wallet — step ${step} of 4`}
      size="md"
      footer={
        step === 4 ? (
          <LinkButton to={successCta?.to ?? '/wallets'} onClick={onClose} iconRight={<Sparkles className="size-4" aria-hidden />}>
            {successCta?.label ?? 'Done'}
          </LinkButton>
        ) : (
          <>
            {step > 1 && (
              <Button variant="secondary" icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => (setStep((s) => s - 1), setError(null))} disabled={busy}>
                Back
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {!(step === 2 && type === 'usdx') && (
              <Button onClick={step === 3 ? confirm : () => (setStep((s) => s + 1), setError(null))} disabled={step === 2 && !code} loading={busy}>
                {step === 3 ? 'Add wallet' : 'Continue'}
              </Button>
            )}
          </>
        )
      }
    >
      {step === 1 && (
        <div className="flex flex-col gap-3" role="radiogroup" aria-label="Wallet type">
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className={
                type === t.value
                  ? 'flex cursor-pointer items-center gap-3 rounded-2xl border border-action/50 bg-action-tint p-4 text-left'
                  : 'flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-left hover:border-action/30'
              }
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-navy text-cyan">
                <t.icon className="size-5" aria-hidden />
              </span>
              <span>
                <span className="block text-sm font-bold text-navy">{t.title}</span>
                <span className="block text-[13px] text-muted">{t.body}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {step === 2 && type === 'usdx' && <OpenUsdxWalletForm compact onOpened={(w) => (setCreated(w), setStep(4), onAdded?.(w))} />}

      {step === 2 && type !== 'usdx' && (
        <div className="flex flex-col gap-3">
          {currencies.loading ? (
            <p className="text-sm text-muted">Loading currencies…</p>
          ) : currencies.error ? (
            <Callout tone="danger">{apiErrorMessage(currencies.error)}</Callout>
          ) : choices.length === 0 ? (
            <Callout tone="info">You already hold every {type === 'fiat' ? 'fiat' : 'crypto'} currency we support.</Callout>
          ) : (
            <div role="radiogroup" aria-label="Currency">
              {choices.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="radio"
                  aria-checked={code === c.code}
                  onClick={() => setCode(c.code)}
                  className={
                    code === c.code
                      ? 'flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-action/50 bg-action-tint p-3.5 text-left'
                      : 'flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-left hover:border-action/30'
                  }
                >
                  <CurrencyIcon currency={c.code} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-navy">{c.name}</span>
                    <span className="block font-mono text-xs text-muted">{c.code}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          {code && (
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CurrencyIcon currency={code} size="sm" />
              Opening a {currencyMeta(code).name} wallet
            </p>
          )}
          <Field label="Label" hint="Shown on your dashboard. Keep it short." optional>
            <Input maxLength={64} placeholder={`My ${code || 'wallet'}`} value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          {error && <Callout tone="danger">{error}</Callout>}
        </div>
      )}

      {step === 4 && done && (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span className="grid size-14 place-items-center rounded-2xl bg-cyan-tint text-cyan-ink">
            <Sparkles className="size-6" aria-hidden />
          </span>
          <h3 className="text-base font-bold text-navy">
            {currencyMeta(done.currency).name} wallet added
          </h3>
          <p className="max-w-sm text-sm leading-relaxed text-muted">
            {type === 'fiat' ? 'Add money from your bank or mobile money, then convert into anything you hold.' : `Your ${done.currency} wallet is open. Buy ${done.currency} from another wallet in seconds.`}
          </p>
        </div>
      )}
    </Modal>
  );
}
