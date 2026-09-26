export interface Org {
  id: string;
  orgId: string; // the Keycloak group's org_id attribute (e.g. "org_demo_co") — the natural key
  slug: string;
  name: string;
  createdAt: Date;
}
