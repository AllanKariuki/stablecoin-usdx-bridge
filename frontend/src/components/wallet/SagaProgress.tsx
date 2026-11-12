import { ExternalLink } from 'lucide-react';
import type { SagaStatus, SagaTransfer } from '../../types/issuance/sagaTransfer';

const STATUS_LABELS: Record<SagaStatus, string> = {
  PENDING: 'Queued for the chain',
  BURN_CONFIRMED: 'Burn confirmed',
  MINT_SUBMITTED: 'Mint submitted, waiting for finality',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  COMPENSATED: 'Failed and reversed',
};

const STATUS_STYLES: Record<SagaStatus, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  BURN_CONFIRMED: 'bg-blue-100 text-blue-700',
  MINT_SUBMITTED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  COMPENSATED: 'bg-amber-100 text-amber-800',
};

/**
 * Renders one saga as core-ledger reports it. The status label for a
 * redemption that has submitted its burn but not yet seen finality is
 * derived from the presence of a source hash, because core-ledger keeps such
 * a saga in PENDING until the burn is final.
 */
export default function SagaProgress({ transfer }: { transfer: SagaTransfer }) {
  const burnInFlight = transfer.kind === 'REDEEM' && transfer.status === 'PENDING' && transfer.sourceTxHash !== '';
  const label = burnInFlight ? 'Burn submitted, waiting for finality' : STATUS_LABELS[transfer.status];
  const hash = transfer.kind === 'REDEEM' ? transfer.sourceTxHash : transfer.destTxHash;
  const url = transfer.kind === 'REDEEM' ? transfer.sourceTxUrl : transfer.destTxUrl;

  return (
    <div className="mt-4 p-4 rounded-lg border border-gray-200 bg-gray-50" data-testid="saga-progress">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          {transfer.kind === 'REDEEM' ? 'Redemption' : 'Issuance'} of {transfer.amount.display} USD-X
        </span>
        <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_STYLES[transfer.status]}`}>{label}</span>
      </div>

      {hash && (
        <p className="text-sm text-gray-600 break-all">
          {transfer.kind === 'REDEEM' ? 'Burn' : 'Mint'} tx:{' '}
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">
              {hash}
              <ExternalLink className="w-3 h-3" />
            </a>
          ) : (
            <span className="font-mono">{hash}</span>
          )}
        </p>
      )}

      {!transfer.terminal && transfer.attempts > 0 && transfer.lastError && (
        <p className="text-xs text-amber-700 mt-2">
          Retrying (attempt {transfer.attempts}): {transfer.lastError}
        </p>
      )}
      {transfer.status === 'FAILED' && transfer.lastError && (
        <p className="text-xs text-red-700 mt-2">{transfer.lastError}</p>
      )}
    </div>
  );
}
