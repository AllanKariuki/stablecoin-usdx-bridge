import { humanize } from '@damp/web-shared/lib';
import { Badge, type Tone } from '@damp/web-shared/ui';

const severityTone = (s: string): Tone => (/crit|high/i.test(s) ? 'warn' : /med/i.test(s) ? 'info' : 'neutral');

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={severityTone(severity)}>{humanize(severity)}</Badge>;
}
