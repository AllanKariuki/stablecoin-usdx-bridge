import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AUDIT, PROVISIONING_ACTOR } from '../src/audit/audit-actions';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';
import { DbService } from '../src/db/db.service';
import { KeycloakAdminClient } from '../src/keycloak/keycloak-admin.client';
import { MembershipsRepository } from '../src/memberships/memberships.repository';
import { OrgsRepository } from '../src/orgs/orgs.repository';
import { PartiesRepository } from '../src/parties/parties.repository';
import { ProvisioningService } from '../src/provisioning/provisioning.service';

/**
 * Real Postgres, in identity_test. Keycloak and core-ledger are stand-ins;
 * what is under test is that a party, its membership and their audit events
 * commit or roll back together.
 */
const TEST_DATABASE_URL =
  process.env.IDENTITY_TEST_DATABASE_URL ??
  'postgres://identity:identity@localhost:55433/identity_test?sslmode=disable';

describe('identity audit producer (real Postgres)', () => {
  let db: DbService;
  let memberships: MembershipsRepository;
  let parties: PartiesRepository;
  let provisioning: ProvisioningService;
  const users = new Map<string, { attributes?: Record<string, string[]> }>();

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    parties = new PartiesRepository(db);
    memberships = new MembershipsRepository(db);
    const keycloak = {
      getUser: async (id: string) => ({ id, username: id, email: `${id}@damp.local`, ...users.get(id) }),
      getUserGroups: async () => [{ id: 'g', name: 'acme', path: '/orgs/acme' }],
    } as unknown as KeycloakAdminClient;
    const ledger = { ensureDefaultWallet: async () => undefined } as unknown as CoreLedgerClient;
    provisioning = new ProvisioningService(parties, new OrgsRepository(db), memberships, keycloak, ledger, db);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  async function auditFor(subject: string) {
    const { rows } = await db.query<{ action: string; payload: Record<string, unknown> }>(
      `SELECT action, payload FROM audit_outbox WHERE payload->>'on_behalf_of' = $1 ORDER BY id`,
      [subject],
    );
    return rows;
  }

  it('audits a person party once, on creation only', async () => {
    const subject = `kc-${randomUUID()}`;
    const first = await provisioning.resolveBySubject(subject);
    await provisioning.resolveBySubject(subject);

    const events = await auditFor(subject);
    expect(events.map((e) => e.action)).toEqual([AUDIT.partyCreated]);
    expect(events[0].payload).toMatchObject({
      actor: PROVISIONING_ACTOR,
      subject_type: 'PARTY',
      subject_id: first.partyId,
      after_state: { type: 'PERSON', keycloakSubject: subject },
    });
  });

  it('audits the org and the owner membership a company login is granted', async () => {
    const subject = `kc-${randomUUID()}`;
    const keycloakOrg = `org_${randomUUID()}`;
    users.set(subject, { attributes: { org_id: [keycloakOrg] } });
    const { partyId, orgId } = await provisioning.resolveBySubject(subject);

    const events = await auditFor(subject);
    expect(events.map((e) => e.action)).toEqual([AUDIT.partyCreated, AUDIT.orgCreated, AUDIT.membershipGranted]);
    expect(events[2].payload).toMatchObject({
      subject_type: 'MEMBERSHIP',
      after_state: { partyId, orgId, role: 'owner' },
      metadata: { keycloakOrgId: keycloakOrg, keycloakGroup: '/orgs/acme' },
    });
  });

  it('rolls the party and its audit event back together when the membership fails', async () => {
    const subject = `kc-${randomUUID()}`;
    users.set(subject, { attributes: { org_id: [`org_${randomUUID()}`] } });
    const spy = jest.spyOn(memberships, 'ensure').mockRejectedValueOnce(new Error('boom'));
    try {
      await expect(provisioning.resolveBySubject(subject)).rejects.toThrow('boom');
    } finally {
      spy.mockRestore();
    }
    expect(await parties.findBySubject(subject)).toBeNull();
    expect(await auditFor(subject)).toEqual([]);
  });
});
