import { ArrowDownToLine, Coins } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { Card, ErrorState, FeatureCard, PageHeader, SkeletonRows } from '@damp/web-shared/ui';
import IssueRedeemForm from '../components/IssueRedeemForm';
import { useWallets } from '../hooks/useWallets';

export default function UsdxPage() {
  const wallets = useWallets();
  return (
    <>
      <PageHeader hero eyebrow="USD-X" title="Issue and redeem USD-X" description="Turn dollars into USD-X on chain, or back again. Each step is tracked until it’s final." />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <FeatureCard icon={<Coins className="size-5" aria-hidden />} iconTone="action" title="Issue USD-X">
          Dollars are reserved on the ledger first, then the same amount is minted on Ethereum or Solana.
        </FeatureCard>
        <FeatureCard icon={<ArrowDownToLine className="size-5" aria-hidden />} iconTone="cyan" title="Redeem to dollars">
          USD-X is burned on chain first, then the dollars are released back to your wallet.
        </FeatureCard>
      </div>

      {wallets.loading && !wallets.data ? (
        <Card>
          <SkeletonRows rows={3} />
        </Card>
      ) : wallets.error ? (
        <Card>
          <ErrorState message={apiErrorMessage(wallets.error)} onRetry={wallets.reload} />
        </Card>
      ) : (
        <IssueRedeemForm wallets={wallets.data ?? []} onChanged={wallets.reload} />
      )}
    </>
  );
}
