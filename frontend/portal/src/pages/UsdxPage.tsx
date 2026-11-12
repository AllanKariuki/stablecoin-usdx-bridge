import { apiErrorMessage } from '@damp/web-shared/api';
import { Card, ErrorState, PageHeader, SkeletonRows } from '@damp/web-shared/ui';
import IssueRedeemForm from '../components/IssueRedeemForm';
import { useWallets } from '../hooks/useWallets';

export default function UsdxPage() {
  const wallets = useWallets();
  return (
    <>
      <PageHeader eyebrow="USD-X" title="Issue and redeem USD-X" description="Turn dollars into USD-X on chain, or back again. Each step is tracked until it’s final." />
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
