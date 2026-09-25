import { Injectable, Logger } from '@nestjs/common';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { KeycloakAdminClient } from '../keycloak/keycloak-admin.client';
import { MembershipsRepository } from '../memberships/memberships.repository';
import { OrgsRepository } from '../orgs/orgs.repository';
import { Party, PartyType } from '../parties/party.types';
import { PartiesRepository } from '../parties/parties.repository';

export interface PartyResolution {
  partyId: string;
  orgId: string;
}

/**
 * Just-in-time provisioning: the first time services/auth-proxy resolves a
 * given Keycloak subject (see auth-proxy's
 * internal/identityclient.IdentityHTTPResolver, which calls
 * GET /internal/parties/by-subject/:subject on every cache-miss request),
 * this creates the party (and, for a company login, an org + membership)
 * and ensures the default wallet — there is no separate signup endpoint or
 * Keycloak event listener wired up, so "the first request from a subject
 * identity hasn't seen before" *is* "signs up" from this service's point of
 * view. Every later call for the same subject is a straight DB read, not a
 * repeat Keycloak Admin API round trip.
 */
@Injectable()
export class ProvisioningService {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly parties: PartiesRepository,
    private readonly orgs: OrgsRepository,
    private readonly memberships: MembershipsRepository,
    private readonly keycloak: KeycloakAdminClient,
    private readonly coreLedger: CoreLedgerClient,
  ) {}

  async resolveBySubject(subject: string): Promise<PartyResolution> {
    const existing = await this.parties.findBySubject(subject);
    if (existing) {
      return { partyId: existing.id, orgId: (await this.memberships.primaryOrgIdFor(existing.id)) ?? '' };
    }
    return this.provision(subject);
  }

  private async provision(subject: string): Promise<PartyResolution> {
    const user = await this.keycloak.getUser(subject);
    // A company account's own login carries the org_id attribute directly
    // (see infra/keycloak/realms/damp-realm.json's company@damp.local user)
    // — its party record *is* the org acting as itself, per
    // docs/building-plan.md's "Identity is three layers" decision, which is
    // what lets it hold wallets under its own party id with zero ledger
    // schema change.
    const orgAttr = user.attributes?.org_id?.[0];
    const type: PartyType = orgAttr ? 'ORGANIZATION' : 'PERSON';
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

    let party: Party;
    try {
      party = await this.parties.insert({
        keycloakSubject: subject,
        type,
        email: user.email ?? null,
        displayName,
      });
    } catch (err) {
      const winner = isUniqueViolation(err) ? await this.parties.findBySubject(subject) : null;
      if (!winner) {
        throw err;
      }
      // A concurrent first-login for the same subject lost the race on
      // keycloak_subject's UNIQUE constraint (Postgres 23505) — the winner
      // already created (and, below, wallet-provisioned) the party this
      // request needs, so re-read rather than fail it.
      return { partyId: winner.id, orgId: (await this.memberships.primaryOrgIdFor(winner.id)) ?? '' };
    }

    let orgId = '';
    if (orgAttr) {
      const groups = await this.keycloak.getUserGroups(subject);
      const orgGroup = groups.find((g) => g.path.startsWith('/orgs/'));
      const name = orgGroup?.name ?? orgAttr;
      const org = await this.orgs.ensure({ orgId: orgAttr, slug: name, name });
      await this.memberships.ensure(party.id, org.id, 'owner');
      orgId = org.id;
    }

    await this.coreLedger.ensureDefaultWallet(party.id);

    this.logger.log(`provisioned party ${party.id} (${type}) for subject ${subject}`);
    return { partyId: party.id, orgId };
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
