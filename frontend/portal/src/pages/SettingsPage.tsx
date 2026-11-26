import { useState } from 'react';
import { ExternalLink, KeyRound, Plus, Webhook } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { NOTIFICATION_EVENTS, notificationsApi } from '@damp/web-shared/api/notifications';
import { accountConsoleUrl, Can, ROLE_LABELS, useAuth } from '@damp/web-shared/auth';
import { formatDateTime, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, buttonClass, Callout, Card, CardHeader, Checkbox, ConfirmDialog, DataTable, Field, Input, KeyValueList, Modal, MonoRef, PageHeader } from '@damp/web-shared/ui';

export default function SettingsPage() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader eyebrow="Settings" title="Settings" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description="From your sign-in account." />
          <KeyValueList
            items={[
              { label: 'Name', value: user?.name ?? '—' },
              { label: 'Email', value: user?.email || '—' },
              { label: 'Account type', value: <span className="inline-flex gap-1">{user?.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>)}</span> },
              ...(user?.orgId ? [{ label: 'Organisation', value: <MonoRef value={user.orgId} /> }] : []),
              { label: 'User reference', value: <MonoRef value={user?.id ?? ''} /> },
            ]}
          />
        </Card>
        <Card className="reveal">
          <CardHeader title="Security" description="Password, two-step sign-in and active sessions are managed on your DAMP account page." />
          <div className="flex flex-col gap-3">
            <Callout tone="info">We never ask for your password inside the app. If a page here does, it isn’t us.</Callout>
            <a href={accountConsoleUrl()} target="_blank" rel="noreferrer" className={buttonClass('secondary', 'md', 'w-fit no-underline')}>
              <KeyRound className="size-4" aria-hidden />
              Manage password and sign-in
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
        </Card>
        <Can anyOf={['notifications:webhooks:manage']}>
          <Webhooks />
        </Can>
      </div>
    </>
  );
}

function Webhooks() {
  const hooks = useAsync(() => notificationsApi.webhooks(), []);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  return (
    <Card className="lg:col-span-2 reveal">
      <CardHeader
        title="Webhooks"
        description="Have DAMP call your server when events happen. Requests are signed with X-DAMP-Signature."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
            Add endpoint
          </Button>
        }
      />
      <DataTable
        caption="Webhook endpoints"
        rows={hooks.data}
        loading={hooks.loading}
        error={hooks.error ? apiErrorMessage(hooks.error) : undefined}
        onRetry={hooks.reload}
        rowKey={(h) => h.id}
        empty={{ title: 'No endpoints', body: 'Add an HTTPS URL to start receiving events.', icon: <Webhook className="size-6" aria-hidden /> }}
        columns={[
          { key: 'url', header: 'URL', render: (h) => <span className="break-all font-mono text-[13px] text-navy">{h.url}</span> },
          { key: 'events', header: 'Events', render: (h) => <span className="text-[13px] text-muted">{h.events.length ? h.events.join(', ') : 'All events'}</span> },
          { key: 'created', header: 'Added', hideOnMobile: true, render: (h) => <span className="text-muted">{formatDateTime(h.createdAt)}</span> },
          {
            key: 'del',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (h) => (
              <Button size="sm" variant="ghost" onClick={() => setDeleting(h.id)}>
                Remove
              </Button>
            ),
          },
        ]}
      />
      <AddWebhookModal open={adding} onClose={() => setAdding(false)} onAdded={hooks.reload} />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remove this endpoint?"
        confirmLabel="Remove"
        variant="warn"
        consequence="DAMP stops sending events to it immediately."
        onConfirm={async () => {
          try {
            await notificationsApi.deleteWebhook(deleting!);
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
          hooks.reload();
        }}
      />
    </Card>
  );
}

function AddWebhookModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const close = () => {
    setUrl('');
    setEvents([]);
    setSecret(null);
    setError(null);
    onClose();
  };
  const submit = async () => {
    if (!/^https:\/\//.test(url) && !/^http:\/\/localhost/.test(url)) return setError('Use an https:// URL.');
    setBusy(true);
    setError(null);
    try {
      const created = await notificationsApi.createWebhook({ url, events });
      setSecret(created.secret);
      onAdded();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      title={secret ? 'Save your signing secret' : 'Add a webhook endpoint'}
      footer={
        secret ? (
          <Button onClick={close}>I’ve saved it</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Add endpoint
            </Button>
          </>
        )
      }
    >
      {secret ? (
        <div className="flex flex-col gap-3">
          <Callout tone="warn" title="Shown once">This secret can’t be retrieved again. Store it where your server can read it.</Callout>
          <MonoRef value={secret} truncate={false} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Endpoint URL">
            <Input type="url" placeholder="https://example.com/damp/webhooks" value={url} onChange={(e) => setUrl(e.target.value.trim())} />
          </Field>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-[13px] font-bold text-ink">Events (none selected = all)</legend>
            {NOTIFICATION_EVENTS.map((e) => (
              <Checkbox
                key={e.event}
                label={e.label}
                checked={events.includes(e.event)}
                onChange={(ev) => setEvents((prev) => (ev.target.checked ? [...prev, e.event] : prev.filter((x) => x !== e.event)))}
              />
            ))}
          </fieldset>
          {error && <Callout tone="danger">{error}</Callout>}
        </div>
      )}
    </Modal>
  );
}
