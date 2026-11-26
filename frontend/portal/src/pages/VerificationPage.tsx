import { useState } from 'react';
import { Check, FileUp, Lock, ShieldCheck, X } from 'lucide-react';
import { apiErrorMessage, kycApi, type KycDocument, type KycStatus } from '@damp/web-shared/api';
import { useAuth } from '@damp/web-shared/auth';
import { cx, formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, CardHeader, DataTable, ErrorState, Field, Input, KeyValueList, PageHeader, Select, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';

const ACCEPTED = 'image/jpeg,image/png,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

/** What the current tier allows, as a checklist — capability, not just colour. */
function Capabilities({ can }: { can: KycStatus['can'] }) {
  const rows: Array<[string, boolean]> = [
    ['Deposit', can.deposit],
    ['Withdraw', can.withdraw],
    ['Issue USD-X', can.issue],
    ['Bridge between chains', can.bridge],
  ];
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map(([label, ok]) => (
        <li key={label} className={cx('flex items-center gap-3 rounded-[14px] border px-3.5 py-2.5', ok ? 'border-cyan/40 bg-cyan-tint' : 'border-line bg-neutral-tint')}>
          <span className={cx('grid size-7 shrink-0 place-items-center rounded-full', ok ? 'bg-cyan text-cyan-ink' : 'bg-line-strong text-neutral-ink')}>
            {ok ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : <Lock className="size-3.5" aria-hidden />}
          </span>
          <span className={cx('flex-1 text-[13px] font-bold', ok ? 'text-cyan-ink' : 'text-neutral-ink')}>{label}</span>
          <span className="sr-only">{ok ? 'allowed' : 'not yet allowed'}</span>
        </li>
      ))}
    </ul>
  );
}

export default function VerificationPage() {
  const status = useAsync(() => kycApi.status(), []);
  const cases = useAsync(() => kycApi.myCases(), []);
  const reload = () => {
    status.reload();
    cases.reload();
  };

  return (
    <>
      <PageHeader eyebrow="Verification" title="Identity verification" description="Your verification tier sets what you can do and how much you can move." />
      {status.loading ? (
        <Card>
          <SkeletonRows rows={4} />
        </Card>
      ) : status.error ? (
        <Card>
          <ErrorState message={apiErrorMessage(status.error)} onRetry={status.reload} />
        </Card>
      ) : status.data ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-5">
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid size-12 place-items-center rounded-[16px] bg-action-tint text-action">
                  <ShieldCheck className="size-6" aria-hidden />
                </span>
                <div>
                  <p className="eyebrow">Current tier</p>
                  <p className="text-2xl font-extrabold tracking-tight text-navy">{humanize(status.data.tier)}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{status.data.description}</p>

              <div className="mt-5 flex flex-col gap-2">
                <div className="flex items-center gap-3 rounded-[14px] border border-action bg-action-tint px-3.5 py-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-action text-[11px] font-extrabold text-white">{status.data.tierRank}</span>
                  <span className="flex-1 text-[13px] font-bold text-action-ink">
                    {humanize(status.data.tier)}
                    <span className="sr-only"> (current tier)</span>
                  </span>
                  <span className="text-xs font-semibold text-action-ink">{status.data.limits.daily} {status.data.limits.currency} / day</span>
                </div>
                {status.data.nextTierRequires && (
                  <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-3.5 py-2.5">
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-tint text-[11px] font-extrabold text-neutral-ink">{status.data.tierRank + 1}</span>
                    <span className="flex-1 text-[13px] font-bold text-ink">
                      {humanize(status.data.nextTierRequires.tier)}
                      <span className="sr-only"> (next tier)</span>
                    </span>
                    <span className="text-xs text-muted">Next tier</span>
                  </div>
                )}
              </div>
            </Card>
            <Card>
              <CardHeader title="What you can do" />
              <Capabilities can={status.data.can} />
              <h3 className="eyebrow mb-1 mt-5">Limits ({status.data.limits.currency})</h3>
              <KeyValueList
                items={[
                  { label: 'Per transaction', value: status.data.limits.singleTransaction, mono: true },
                  { label: 'Per day', value: status.data.limits.daily, mono: true },
                  { label: 'Per month', value: status.data.limits.monthly, mono: true },
                ]}
              />
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <NextStep status={status.data} onChanged={reload} />
            <Card>
              <CardHeader title="Your verification requests" />
              <DataTable
                caption="Verification requests"
                rows={cases.data}
                loading={cases.loading}
                error={cases.error ? apiErrorMessage(cases.error) : undefined}
                onRetry={cases.reload}
                rowKey={(c) => c.id}
                empty={{ title: 'No requests yet', body: 'Start one above to move up a tier.' }}
                columns={[
                  { key: 'tier', header: 'For', render: (c) => <span className="font-semibold">{humanize(c.requestedTier)}</span> },
                  { key: 'status', header: 'Status', render: (c) => <StatusBadge status={c.status} /> },
                  { key: 'when', header: 'Submitted', hideOnMobile: true, render: (c) => <span className="text-muted">{formatDateTime(c.submittedAt ?? c.createdAt)}</span> },
                  { key: 'why', header: 'Notes', render: (c) => <span className="text-[13px] text-muted">{c.rejectionReason || '—'}</span> },
                ]}
              />
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}

/**
 * The one thing to do next: start a request, upload what's missing and
 * submit, or wait for review. Uploads go browser → object storage directly.
 */
function NextStep({ status, onChanged }: { status: KycStatus; onChanged: () => void }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<KycDocument[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [profile, setProfile] = useState({ fullName: user?.name ?? '', email: user?.email ?? '', country: 'KE' });

  const open = status.openCase;
  const next = status.nextTierRequires;

  if (open && !['DRAFT', 'REJECTED'].includes(open.status)) {
    return (
      <Callout tone="info" title={`Request ${humanize(open.status).toLowerCase()}`}>
        We’re reviewing your request for {humanize(open.requestedTier)}. Every approval is checked by two people, so it can take a little while — we’ll notify you either way.
      </Callout>
    );
  }
  if (!next) {
    return <Callout tone="success" title="You’re fully verified">There’s no higher tier to apply for.</Callout>;
  }

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!open || open.status === 'REJECTED') {
    return (
      <Card>
        <CardHeader title={`Apply for ${humanize(next.tier)}`} description="You’ll need these documents:" />
        <ul className="mb-4 flex list-disc flex-col gap-1 pl-5 text-sm text-ink">
          {next.documents.map((d) => (
            <li key={d}>{humanize(d)}</li>
          ))}
        </ul>
        {error && <Callout tone="danger" className="mb-4">{error}</Callout>}
        <Button loading={busy} onClick={() => run(() => kycApi.openCase(next.tier))}>
          Start verification
        </Button>
      </Card>
    );
  }

  const upload = async (kind: string, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('Files must be 10 MB or smaller.');
    setUploading(kind);
    setError(null);
    try {
      setDocs(await kycApi.uploadDocument(open.id, kind, file));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(null);
    }
  };

  const have = new Set(docs.map((d) => d.kind));
  const missing = next.documents.filter((d) => !have.has(d));

  return (
    <Card>
      <CardHeader title={`Documents for ${humanize(next.tier)}`} description="JPEG, PNG or PDF, up to 10 MB each. Files go straight to secure storage." />
      <ul className="m-0 mb-5 flex list-none flex-col gap-2 p-0">
        {next.documents.map((kind) => {
          const doc = docs.find((d) => d.kind === kind);
          return (
            <li key={kind} className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3">
              <span className="flex items-center gap-2.5 text-sm font-semibold text-ink">
                {doc ? <Check className="size-4 text-cyan-ink" strokeWidth={3} aria-hidden /> : <X className="size-4 text-subtle" aria-hidden />}
                {humanize(kind)}
                {doc && <StatusBadge status={doc.status} />}
              </span>
              <label className={cx('inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line-strong px-3 text-[13px] font-semibold text-navy hover:bg-canvas', uploading && 'pointer-events-none opacity-60')}>
                <FileUp className="size-3.5" aria-hidden />
                {uploading === kind ? 'Uploading…' : doc ? 'Replace' : 'Upload'}
                <input type="file" accept={ACCEPTED} className="sr-only" onChange={(e) => void upload(kind, e.target.files?.[0])} />
              </label>
            </li>
          );
        })}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full legal name">
          <Input autoComplete="name" value={profile.fullName} onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} />
        </Field>
        <Field label="Email">
          <Input type="email" autoComplete="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
        </Field>
        <Field label="Country of residence">
          <Select value={profile.country} onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value }))}>
            {[['KE', 'Kenya'], ['UG', 'Uganda'], ['TZ', 'Tanzania'], ['NG', 'Nigeria'], ['GB', 'United Kingdom'], ['US', 'United States'], ['DE', 'Germany']].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {error && <Callout tone="danger" className="mt-4">{error}</Callout>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">{missing.length ? `Still needed: ${missing.map(humanize).join(', ')}` : 'All documents uploaded.'}</p>
        <Button loading={busy} disabled={missing.length > 0 || !profile.fullName.trim() || !profile.email.trim()} onClick={() => run(() => kycApi.submit(open.id, profile))}>
          Submit for review
        </Button>
      </div>
    </Card>
  );
}
