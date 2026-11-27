import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { paymentsApi } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { humanize, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, Card, CardHeader, DataTable } from '@damp/web-shared/ui';
import AddPayeeModal from '../../components/AddPayeeModal';

export default function PayeesTab() {
  const payees = useAsync(() => paymentsApi.beneficiaries(), []);
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Payees"
        description="People and businesses you pay. Pick one from “Pay someone” in Activity."
        actions={
          <Can anyOf={['payments:write:own']}>
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
              Add payee
            </Button>
          </Can>
        }
      />
      <DataTable
        caption="Payees"
        rows={payees.data}
        loading={payees.loading}
        error={payees.error ? apiErrorMessage(payees.error) : undefined}
        onRetry={payees.reload}
        rowKey={(p) => p.id}
        empty={{ title: 'No payees yet', body: 'Save someone once, then pay them in a couple of taps.', icon: <Users className="size-6" aria-hidden /> }}
        columns={[
          { key: 'name', header: 'Name', render: (p) => <span className="font-semibold text-ink">{p.name}</span> },
          { key: 'kind', header: 'Type', render: (p) => <Badge tone="neutral">{humanize(p.kind)}</Badge> },
          { key: 'ref', header: 'Account', render: (p) => <span className="font-mono text-[13px] text-navy">{p.accountRef}</span> },
          { key: 'ccy', header: 'Currency', align: 'right', render: (p) => p.currency },
        ]}
      />
      <AddPayeeModal open={adding} onClose={() => setAdding(false)} onAdded={payees.reload} />
    </Card>
  );
}
