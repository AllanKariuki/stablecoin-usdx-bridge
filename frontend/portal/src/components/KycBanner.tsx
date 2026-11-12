import { ShieldCheck } from 'lucide-react';
import { kycApi } from '@damp/web-shared/api';
import { useAuth } from '@damp/web-shared/auth';
import { useAsync, humanize } from '@damp/web-shared/lib';
import { Callout, LinkButton } from '@damp/web-shared/ui';

/**
 * Shown on Home when verification is the next thing standing between the
 * user and what they want to do. Silent when there's nothing to say, or the
 * KYC service can't be reached (the Verification page shows that error).
 */
export default function KycBanner() {
  const { can } = useAuth();
  const status = useAsync(() => (can('kyc:submit') ? kycApi.status() : Promise.resolve(null)), []);
  const s = status.data;
  if (!s) return null;

  if (s.openCase?.status === 'REJECTED') {
    return (
      <Callout tone="warn" title="Your verification was declined" action={<LinkButton to="/verification" size="sm" variant="secondary">See why</LinkButton>}>
        You can read the reason and send updated documents.
      </Callout>
    );
  }
  if (s.openCase && s.openCase.status !== 'APPROVED') {
    return (
      <Callout tone="info" title={`Verification ${humanize(s.openCase.status).toLowerCase()}`} action={<LinkButton to="/verification" size="sm" variant="secondary">View</LinkButton>}>
        We’re checking your documents for {humanize(s.openCase.requestedTier)}. We’ll notify you when there’s a decision.
      </Callout>
    );
  }
  if (!s.can.deposit || !s.can.issue) {
    return (
      <Callout
        tone="navy"
        title="Verify your identity to unlock more"
        action={
          <LinkButton to="/verification" size="sm" icon={<ShieldCheck className="size-4" aria-hidden />}>
            Get verified
          </LinkButton>
        }
      >
        You’re on {humanize(s.tier)}.{' '}
        {s.nextTierRequires ? `${humanize(s.nextTierRequires.tier)} lets you ${[!s.can.deposit && 'deposit', !s.can.issue && 'issue USD-X'].filter(Boolean).join(' and ')}.` : ''}
      </Callout>
    );
  }
  return null;
}
