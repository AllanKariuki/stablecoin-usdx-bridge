import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check, FileText, X } from 'lucide-react';
import { apiErrorMessage, kycApi } from '@damp/web-shared/api';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  ConfirmDialog,
  DataTable,
  ErrorState,
  KeyValueList,
  MonoRef,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@damp/web-shared/ui';
import { BackLink, DetailGrid } from '../../components/Detail';
import { JsonBlock } from '../../components/JsonBlock';

const kb = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export default function KycCase() {
  const { caseId = '' } = useParams();
  const kase = useAsync(() => kycApi.caseDetail(caseId), [caseId]);
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | null>(null);

  if (kase.error) {
    return (
      <>
        <BackLink to="/kyc">KYC review</BackLink>
        <ErrorState title="This case didn't load" message={apiErrorMessage(kase.error)} onRetry={kase.reload} />
      </>
    );
  }
  const c = kase.data;
  const decidable = c?.status === 'PENDING_REVIEW';

  return (
    <>
      <BackLink to="/kyc">KYC review</BackLink>
      <PageHeader
        eyebrow="KYC case"
        title={c ? `${c.requestedTier} request` : <Skeleton className="h-8 w-48" />}
        description={c && <MonoRef value={c.id} truncate={false} />}
        actions={
          decidable && (
            <Can anyOf={['kyc:review']}>
              <Button variant="warn" icon={<X className="size-4" aria-hidden />} onClick={() => setDecision('REJECT')}>
                Reject…
              </Button>
              <Button icon={<Check className="size-4" aria-hidden />} onClick={() => setDecision('APPROVE')}>
                Approve…
              </Button>
            </Can>
          )
        }
      />

      {c?.status === 'PENDING_APPROVAL' && (
        <Callout tone="info" title="Waiting for a second approver" className="mb-5">
          A reviewer approved this case. The tier is granted only once the maker-checker request
          {c.approvalRequestId ? <> <span className="font-mono">{c.approvalRequestId}</span></> : null} is approved.
        </Callout>
      )}

      <DetailGrid
        main={
          <>
            <Card>
              <CardHeader title="Documents" description="Uploaded straight to object storage. The SHA-256 is what the applicant’s browser computed." />
              <DataTable
                caption="Submitted documents"
                rows={c?.documents}
                loading={kase.loading}
                rowKey={(d) => d.id}
                empty={{ icon: <FileText className="size-6" aria-hidden />, title: 'No documents', body: 'The applicant has not uploaded anything for this case.' }}
                columns={[
                  { key: 'kind', header: 'Document', render: (d) => <span className="font-semibold">{humanize(d.kind)}</span> },
                  { key: 'type', header: 'Type', render: (d) => <span className="text-[13px] text-muted">{d.contentType} · {kb(d.sizeBytes)}</span>, hideOnMobile: true },
                  { key: 'hash', header: 'SHA-256', render: (d) => <MonoRef value={d.sha256} />, hideOnMobile: true },
                  { key: 'status', header: 'Status', align: 'right', render: (d) => <StatusBadge status={d.status} /> },
                ]}
              />
            </Card>
            <Card className="reveal">
              <CardHeader title="Screening result" description="The provider’s raw response. Never shown to the applicant." />
              {c ? <JsonBlock value={c.providerResult} /> : <Skeleton className="h-24 w-full" />}
            </Card>
          </>
        }
        side={
          <Card className="reveal">
            <CardHeader title="Case" />
            {!c ? (
              <Skeleton className="h-28 w-full" />
            ) : (
              <KeyValueList
                items={[
                  { label: 'Status', value: <StatusBadge status={c.status} /> },
                  { label: 'Party', value: <MonoRef value={c.partyId} /> },
                  { label: 'Risk score', value: c.riskScore ?? '—' },
                  { label: 'Submitted', value: formatDateTime(c.submittedAt) },
                  { label: 'Decided', value: formatDateTime(c.decidedAt) },
                  { label: 'Reviewed by', value: c.reviewedBy || '—', mono: Boolean(c.reviewedBy) },
                  { label: 'Review notes', value: c.reviewNotes || '—' },
                  ...(c.rejectionReason ? [{ label: 'Rejection reason', value: c.rejectionReason }] : []),
                ]}
              />
            )}
          </Card>
        }
      />

      {c && (
        <ConfirmDialog
          open={decision !== null}
          onClose={() => setDecision(null)}
          title={decision === 'APPROVE' ? 'Approve this KYC case?' : 'Reject this KYC case?'}
          variant={decision === 'APPROVE' ? 'primary' : 'warn'}
          confirmLabel={decision === 'APPROVE' ? 'Approve' : 'Reject'}
          requireReason
          reasonLabel={decision === 'APPROVE' ? 'Review notes' : 'Reason (shown to the applicant)'}
          consequence={
            decision === 'APPROVE'
              ? `This opens a maker-checker request. ${c.requestedTier} and its limits are granted only after a second person approves it.`
              : 'The case closes as rejected and the applicant sees the reason you give. They can open a new case.'
          }
          onConfirm={async (notes) => {
            try {
              await kycApi.review(c.id, decision!, notes);
              kase.reload();
            } catch (err) {
              throw new Error(apiErrorMessage(err));
            }
          }}
        />
      )}
    </>
  );
}
