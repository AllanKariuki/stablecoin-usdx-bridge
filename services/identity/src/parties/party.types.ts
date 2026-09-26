export type PartyType = 'PERSON' | 'ORGANIZATION' | 'SUB_ACCOUNT';

export interface Party {
  id: string;
  keycloakSubject: string;
  type: PartyType;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
}
