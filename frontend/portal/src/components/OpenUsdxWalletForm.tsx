import { useState, type FormEvent } from 'react';
import { apiErrorMessage, ledgerApi, type Wallet } from '@damp/web-shared/api';
import { Button, Callout, Card, Field, Input, Select } from '@damp/web-shared/ui';

/**
 * "Open a USD-X wallet" — the chain picker + createUsdxWallet flow from
 * UsdxPage/IssueRedeemForm, extracted so the Add-wallet wizard and the
 * Swap card can reuse it. Ethereum mints to an address the user gives;
 * Solana USD-X is held in an account DAMP looks after.
 */
export default function OpenUsdxWalletForm({ onOpened, compact = false }: { onOpened: (w: Wallet) => void; compact?: boolean }) {
  const [chain, setChain] = useState('ETHEREUM');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOpened(await ledgerApi.createUsdxWallet({ chain, address: chain === 'SOLANA' ? undefined : address }));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className={compact ? 'border-0 p-0 shadow-none' : 'max-w-xl'}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {!compact && (
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-navy">Open a USD-X wallet</h2>
            <p className="mt-1 text-sm text-muted">You need one before you can issue. Pick the chain your USD-X should live on.</p>
          </div>
        )}
        <Field label="Chain">
          <Select value={chain} onChange={(e) => setChain(e.target.value)}>
            <option value="ETHEREUM">Ethereum (Sepolia)</option>
            <option value="SOLANA">Solana (devnet)</option>
          </Select>
        </Field>
        {chain === 'ETHEREUM' ? (
          <Field label="Your Ethereum address" hint="USD-X is minted to this address.">
            <Input className="font-mono" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value.trim())} />
          </Field>
        ) : (
          <Callout tone="info">Solana USD-X is held in an account DAMP looks after for you; your balance is tracked on the ledger.</Callout>
        )}
        {error && <Callout tone="danger">{error}</Callout>}
        <Button type="submit" loading={busy} disabled={chain === 'ETHEREUM' && !/^0x[0-9a-fA-F]{40}$/.test(address)}>
          Open USD-X wallet
        </Button>
      </form>
    </Card>
  );
}
