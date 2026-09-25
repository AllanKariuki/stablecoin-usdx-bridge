/** The subset of Keycloak's UserRepresentation identity actually reads. */
export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  attributes?: Record<string, string[]>;
}

/** The subset of Keycloak's GroupRepresentation identity actually reads. */
export interface KeycloakGroup {
  id: string;
  name: string;
  path: string;
}
