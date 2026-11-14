import { useState } from 'react';
import { FilePlus2, Send, ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { reservesApi, type Attestation } from '@damp/web-shared/api/reserves';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, Checkbox, ConfirmDialog, DataTable, Drawer, KeyValueList, MonoRef, MoneyText, PageHeader, StatusBadge } from '@damp/web-shared/ui';
import { JsonBlock } from '../../components/JsonBlock';

export default function Attestations() {
  const list = useAsync(() => reservesApi.attestations(), []);
  const status = useAsync(() => reservesApi.status(), []);
  const [creating, setCreating] = useState(false);
  const [acknowledge, setAcknowledge] = useState(false);
  const [selected, setSelected] = useState<Attestation | null>(null);
  const [publishing, setPublishing] = useState(false);
  const openBreaks = status.data?.openBreaks ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Treasury"
        title="Attestations"
        description="Point-in-time statements of USD-X issued against its backing, tied to the reconciliation run they were prepared from."
        actions={
          <Can anyOf={['reserves:manage']}>
            <Button icon={<FilePlus2 className="size-4" aria-hidden />} onClick={() => (setAcknowledge(false), setCreating(true))}>
              Prepare attestation
            </Button>
          </Can>
        }
      />
      <Card>
        <DataTable
          caption="Attestations"
          rows={list.data}
          loading={list.loading}
          error={list.error ? apiErrorMessage(list.error) : undefined}
          onRetry={list.reload}
          rowKey={(a) => a.id}
          onRowClick={setSelected}
          empty={{ icon: <ShieldCheck className="size-6" aria-hidden />, title: 'No attestations yet' }}
          columns={[
            { key: 'asof', header: 'As of', render: (a) => formatDateTime(a.asOf) },
            { key: 'issued', header: 'Issued', align: 'right', render: (a) => <MoneyText money={a.issued} /> },
            { key: 'backing', header: 'Backing', align: 'right', render: (a) => <MoneyText money={a.backing} />, hideOnMobile: true },
            { key: 'cust', header: 'Custodian', align: 'right', render: (a) => <MoneyText money={a.custodianTotal} />, hideOnMobile: true },
            { key: 'status', header: 'Status', align: 'right', render: (a) => <StatusBadge status={a.status} /> },
          ]}
        />
      </Card>

      <ConfirmDialog
        open={creating}
        onClose={() => setCreating(false)}
        title="Prepare an attestation?"
        confirmLabel="Prepare"
        consequence="Snapshots the current reserve status — issued, backing, custodian balance and on-chain supply — into a draft attestation linked to the latest reconciliation run. Publishing is a separate step."
        onConfirm={async () => {
          try {
            await reservesApi.createAttestation({ acknowledgeBreaks: openBreaks.length > 0 ? acknowledge : undefined });
            list.reload();
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
        }}
      >
        {openBreaks.length > 0 && (
          <div className="flex flex-col gap-3">
            <Callout tone="warn" title={`${openBreaks.length} reconciliation break${openBreaks.length === 1 ? ' is' : 's are'} open`}>
              rms refuses to attest over open breaks unless you acknowledge them. Acknowledged breaks are written onto the attestation.
            </Callout>
            <Checkbox label="Attest anyway and record the open breaks on it" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} />
          </div>
        )}
      </ConfirmDialog>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title="Attestation"
          footer={
            !selected.publishedAt && (
              <Can anyOf={['reserves:manage']}>
                <Button icon={<Send className="size-4" aria-hidden />} onClick={() => setPublishing(true)}>
                  Publish…
                </Button>
              </Can>
            )
          }
        >
          <div className="flex flex-col gap-5">
            <KeyValueList
              items={[
                { label: 'Attestation', value: <MonoRef value={selected.id} /> },
                { label: 'Status', value: <StatusBadge status={selected.status} /> },
                { label: 'As of', value: formatDateTime(selected.asOf) },
                { label: 'USD-X issued', value: <MoneyText money={selected.issued} /> },
                { label: 'Backing', value: <MoneyText money={selected.backing} /> },
                { label: 'Custodian total', value: <MoneyText money={selected.custodianTotal} /> },
                { label: 'Reconciliation run', value: <MonoRef value={selected.reconciliationRunId} /> },
                { label: 'Prepared by', value: selected.preparedBy, mono: true },
                { label: 'Published', value: formatDateTime(selected.publishedAt) },
              ]}
            />
            <JsonBlock label="Chain supply and breaks at preparation" value={selected.chainSupply} />
          </div>
          <ConfirmDialog
            open={publishing}
            onClose={() => setPublishing(false)}
            title="Publish this attestation?"
            confirmLabel="Publish"
            consequence="Publishing makes these figures the platform's public statement of reserves as of this date. It cannot be unpublished — a correction is a new attestation."
            onConfirm={async () => {
              try {
                const next = await reservesApi.publishAttestation(selected.id);
                setSelected(next);
                list.reload();
              } catch (err) {
                throw new Error(apiErrorMessage(err));
              }
            }}
          />
        </Drawer>
      )}
    </>
  );
}
