import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@damp/web-shared/ui';

/**
 * services/identity manages parties, organisations and memberships, but none
 * of its routes are on the gateway's table (services/auth-proxy's
 * authztable) or proxied by bff. Rather than show invented data, the page
 * says so plainly and points at what does work today.
 */
export default function Directory() {
  return (
    <>
      <PageHeader eyebrow="Admin" title="Users & organisations" description="Search parties, see their memberships and assign roles." />
      <Card className="reveal">
        <EmptyState icon={<Users className="size-6" aria-hidden />} title="Not exposed through the gateway yet">
          The identity service owns this directory, but its API isn’t routed through the gateway, so the console can’t read it. Until it
          is, manage users and roles in the Keycloak admin console, and look up a party’s wallets by id from{' '}
          <Link to="/wallets">Wallets</Link>.
        </EmptyState>
      </Card>
    </>
  );
}
