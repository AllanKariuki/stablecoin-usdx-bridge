import type { Wallet } from '@damp/web-shared/api';
import { Field, Select } from '@damp/web-shared/ui';
import { isFrozen, walletOptionLabel } from '../hooks/useWallets';

/**
 * "Which wallet is this from" — mandatory on every money-moving form
 * (frontend-ui-prd §4). Frozen wallets are listed but not selectable, so the
 * user can see why their money isn't available.
 */
export default function WalletSelect({
  label,
  wallets,
  value,
  onChange,
  hint,
  error,
  exclude,
}: {
  label: string;
  wallets: Wallet[];
  value: string;
  onChange: (id: string) => void;
  hint?: string;
  error?: string;
  exclude?: string;
}) {
  return (
    <Field label={label} hint={hint} error={error}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          Choose a wallet
        </option>
        {wallets
          .filter((w) => w.id !== exclude)
          .map((w) => (
            <option key={w.id} value={w.id} disabled={isFrozen(w)}>
              {walletOptionLabel(w)}
              {isFrozen(w) ? ' (frozen)' : ''}
            </option>
          ))}
      </Select>
    </Field>
  );
}
