/**
 * The role → permission table generated from shared/authz/permissions.yaml
 * (`make authz-gen`). Tokens carry roles only; the UI expands them with the
 * same table auth-proxy uses, to decide what to *show*. The API's 403 is
 * still the real gate.
 */
export type { Permission, Role } from '../../../../shared/authz/generated/permissions';
export { ROLE_PERMISSIONS, expandRoles, hasPermission } from '../../../../shared/authz/generated/permissions';

import type { Role } from '../../../../shared/authz/generated/permissions';
import { ROLE_PERMISSIONS } from '../../../../shared/authz/generated/permissions';

export const ALL_ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

export const isRole = (value: string): value is Role => (ALL_ROLES as string[]).includes(value);

export const ROLE_LABELS: Record<Role, string> = {
  customer: 'Personal',
  company: 'Business',
  admin: 'Admin',
  compliance: 'Compliance',
  treasury: 'Treasury',
  auditor: 'Auditor',
};
