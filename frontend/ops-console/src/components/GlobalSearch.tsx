import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { ledgerApi, apiStatus } from '@damp/web-shared/api';
import { useAuth } from '@damp/web-shared/auth';

/**
 * Find a wallet or a transaction by id. The gateway has no cross-entity
 * search, so this asks both lookups the caller is allowed to make and opens
 * whichever one knows the id.
 */
export function GlobalSearch() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!can('wallets:read:any', 'transactions:read:any')) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = query.trim();
    if (!id) return;
    setBusy(true);
    setMessage(null);
    const found = (p: Promise<unknown>) => p.then(() => true, (err) => (apiStatus(err) === 404 || apiStatus(err) === 400 ? false : Promise.reject(err)));
    try {
      const [wallet, tx] = await Promise.all([
        can('wallets:read:any') ? found(ledgerApi.wallet(id)) : Promise.resolve(false),
        can('transactions:read:any') ? found(ledgerApi.transaction(id)) : Promise.resolve(false),
      ]);
      if (wallet) navigate(`/wallets/${encodeURIComponent(id)}`);
      else if (tx) navigate(`/transactions/${encodeURIComponent(id)}`);
      else setMessage('No wallet or transaction has that id.');
      if (wallet || tx) setQuery('');
    } catch {
      setMessage('Search is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form role="search" onSubmit={submit} className="relative w-full max-w-md">
      <label htmlFor="global-search" className="sr-only">
        Find a wallet or transaction by id
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <input
        id="global-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setMessage(null);
        }}
        placeholder="Wallet or transaction id"
        autoComplete="off"
        spellCheck={false}
        className="min-h-11 w-full rounded-control border border-line bg-canvas pr-10 pl-10 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-subtle focus:border-action focus:bg-surface focus:ring-3 focus:ring-action/20 focus:outline-none"
        aria-describedby={message ? 'global-search-msg' : undefined}
      />
      {busy && <Loader2 className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-action" aria-label="Searching" />}
      {message && (
        <p id="global-search-msg" role="status" className="absolute top-full left-0 mt-1.5 rounded-[10px] border border-line bg-surface px-3 py-1.5 text-xs font-semibold text-warn-ink shadow-pop">
          {message}
        </p>
      )}
    </form>
  );
}
