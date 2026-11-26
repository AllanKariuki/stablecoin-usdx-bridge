import { useState, type FormEvent } from 'react';
import { Radar } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { complianceApi, type ScreeningResult } from '@damp/web-shared/api/compliance';
import { Badge, Button, Callout, Card, CardHeader, EmptyState, Field, Input, KeyValueList, PageHeader, Select } from '@damp/web-shared/ui';
import { JsonBlock } from '../../components/JsonBlock';

type Subject = 'PARTY' | 'ADDRESS' | 'BANK_ACCOUNT';

const OUTCOME = {
  CLEAR: { tone: 'cyan', label: 'Clear' },
  REVIEW: { tone: 'warn', label: 'Needs review' },
  REJECT: { tone: 'danger', label: 'Match — reject' },
} as const;

/** Ad-hoc sanctions/risk screening of a party, address or bank account. Read-only: it records nothing on the subject. */
export default function Screening() {
  const [type, setType] = useState<Subject>('ADDRESS');
  const [subject, setSubject] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ subject: string; value: ScreeningResult } | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) return setError('Enter something to screen.');
    setBusy(true);
    setError(null);
    try {
      setResult({ subject: subject.trim(), value: await complianceApi.screen(type, subject.trim()) });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Compliance" title="Screening" description="Check a party, wallet address or bank account against the screening provider." />
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Card>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Field label="Subject type">
              <Select value={type} onChange={(e) => setType(e.target.value as Subject)}>
                <option value="ADDRESS">Wallet address</option>
                <option value="PARTY">Party id</option>
                <option value="BANK_ACCOUNT">Bank account</option>
              </Select>
            </Field>
            <Field label="Subject" error={error}>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="font-mono" spellCheck={false} autoComplete="off" />
            </Field>
            <Button type="submit" loading={busy} icon={<Radar className="size-4" aria-hidden />}>
              Screen
            </Button>
          </form>
        </Card>
        <Card className="reveal">
          <CardHeader title="Result" />
          {!result ? (
            <EmptyState icon={<Radar className="size-6" aria-hidden />} title="Nothing screened yet" className="py-8">
              Results are shown here and are not saved.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-4">
              <KeyValueList
                items={[
                  { label: 'Subject', value: result.subject, mono: true },
                  { label: 'Outcome', value: <Badge tone={OUTCOME[result.value.outcome].tone}>{OUTCOME[result.value.outcome].label}</Badge> },
                  { label: 'Risk score', value: result.value.riskScore },
                  { label: 'Matches', value: result.value.matches.length },
                ]}
              />
              {result.value.outcome !== 'CLEAR' && (
                <Callout tone="warn">Open a case or an enforcement request if this needs action — screening alone changes nothing.</Callout>
              )}
              <JsonBlock label="Matches" value={result.value.matches} />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
