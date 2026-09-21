/**
 * KYC (Know Your Customer) & User Profile Types
 * Types for identity verification, KYC compliance, and user profiles
 */

// ============================================================================
// USER PROFILE TYPES
// ============================================================================

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profileImage?: string;
  dateOfBirth?: string;
  address?: Address;
  kycStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  kycLevel: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  verified?: boolean;
}

export interface UserProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  dateOfBirth: string;
  gender?: 'male' | 'female' | 'other';
  nationality: string;
  profession?: string;
  company?: string;
  bio?: string;
  profilePicture?: string;
  idNumber?: string;
  idType?: string;
  address?: Address;
  emergencyContact?: {
    name: string;
    phoneNumber: string;
    relationship: string;
  };
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// KYC TYPES
// ============================================================================

export type KYCStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type KYCLevel = 1 | 2 | 3;
export type DocumentType = 'id_card' | 'passport' | 'drivers_license' | 'utility_bill' | 'bank_statement' | 'selfie' | 'proof_of_address';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';
export type IDType = 'national_id' | 'passport' | 'drivers_license' | 'voter_id';

export interface KYCProfile {
  userId: string;
  status: KYCStatus;
  level: KYCLevel;
  verificationDate?: string;
  expiryDate?: string;
  rejectionReason?: string;
  personalInfo: KYCPersonalInfo;
  address: Address;
  documents: KYCDocument[];
  updatedAt: string;
}

export interface KYCPersonalInfo {
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  idType: IDType;
  idNumber: string;
  phoneNumber: string;
  email: string;
}

export interface KYCDocument {
  id: string;
  type: DocumentType;
  status: DocumentStatus;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  reviewedAt?: string;
  rejectionReason?: string;
  expiryDate?: string;
}

export interface KYCVerification {
  id: string;
  userId: string;
  type: 'email' | 'phone' | 'identity' | 'address' | 'biometric';
  status: 'pending' | 'verified' | 'failed';
  verificationMethod: string;
  verifiedAt?: string;
  attempts: number;
  lastAttemptAt?: string;
}

export interface KYCApprovalWorkflow {
  id: string;
  userId: string;
  level: KYCLevel;
  status: 'pending' | 'approved' | 'rejected';
  requiredDocuments: DocumentType[];
  submittedDocuments: KYCDocument[];
  assignedTo?: string;
  submittedAt: string;
  reviewedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
  notes?: string;
}

// ============================================================================
// IDENTITY VERIFICATION TYPES
// ============================================================================

export interface IdentityVerification {
  id: string;
  userId: string;
  idType: IDType;
  idNumber: string;
  issuanceDate?: string;
  expiryDate?: string;
  issuingCountry: string;
  issuingState?: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender?: string;
  status: DocumentStatus;
  extractedAt?: string;
  verifiedAt?: string;
  documentImage?: {
    front: string; // URL
    back?: string; // URL
  };
}

export interface BiometricVerification {
  id: string;
  userId: string;
  type: 'fingerprint' | 'face' | 'iris' | 'voice';
  status: 'pending' | 'verified' | 'failed';
  biometricData: string; // encrypted/hashed data
  template?: string; // biometric template
  confidenceScore?: number; // 0-100
  verifiedAt?: string;
  failureReason?: string;
}

export interface LivenessCheck {
  id: string;
  userId: string;
  status: 'pending' | 'completed' | 'failed';
  videoUrl?: string;
  livenessScore?: number; // 0-100
  completedAt?: string;
  failureReason?: string;
}

// ============================================================================
// SANCTIONS & COMPLIANCE TYPES
// ============================================================================

export type ComplianceCheckType = 'pep' | 'sanctions' | 'aml' | 'fraud' | 'politically_exposed_person';
export type ComplianceStatus = 'pending' | 'cleared' | 'flagged' | 'blocked';

export interface ComplianceCheck {
  id: string;
  userId: string;
  checkType: ComplianceCheckType;
  status: ComplianceStatus;
  result?: {
    isMatch: boolean;
    matchScore?: number;
    details?: string;
  };
  performedAt: string;
  nextCheckDue?: string;
}

export interface SanctionsScreening {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  country?: string;
  status: ComplianceStatus;
  screeningDate: string;
  matches?: SanctionsMatch[];
  risk_level?: 'low' | 'medium' | 'high' | 'critical';
}

export interface SanctionsMatch {
  id: string;
  sanctionsList: string; // e.g., 'OFAC', 'EU', 'UN'
  matchedName: string;
  matchScore: number; // 0-100
  details?: string;
}

export interface AMLCheck {
  id: string;
  userId: string;
  status: ComplianceStatus;
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  checkDate: string;
  findings?: string[];
  recommendation?: string;
}

// ============================================================================
// VERIFICATION LIMIT TYPES
// ============================================================================

export interface VerificationLimits {
  level: KYCLevel;
  dailyTransactionLimit: number; // in base currency
  monthlyTransactionLimit: number;
  dailyWithdrawalLimit: number;
  monthlyWithdrawalLimit: number;
  walletLimit: number; // number of wallets
  singleTransactionLimit: number;
  description: string;
}

export interface UserLimits {
  userId: string;
  kycLevel: KYCLevel;
  dailyTransactionLimit: number;
  monthlyTransactionLimit: number;
  dailyUsed: number;
  monthlyUsed: number;
  dailyWithdrawalLimit: number;
  dailyWithdrawalUsed: number;
  lastReset: string;
}

// ============================================================================
// DOCUMENT MANAGEMENT TYPES
// ============================================================================

export interface DocumentUpload {
  id: string;
  userId: string;
  documentType: DocumentType;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  uploadedAt: string;
  expiryDate?: string;
  status: DocumentStatus;
}

export interface DocumentVerification {
  id: string;
  documentId: string;
  userId: string;
  verificationMethod: 'manual' | 'automated' | 'hybrid';
  status: DocumentStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  reviewNotes?: string;
  approvalScore?: number; // 0-100 for automated checks
}

// ============================================================================
// AUDIT & HISTORY TYPES
// ============================================================================

export interface KYCAuditLog {
  id: string;
  userId: string;
  action: string;
  oldValue?: any;
  newValue?: any;
  performedBy?: string;
  performedAt: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface VerificationHistory {
  id: string;
  userId: string;
  type: DocumentType;
  status: DocumentStatus;
  attemptNumber: number;
  completedAt: string;
  documentId: string;
  result?: any;
}

// ============================================================================
// NOTIFICATION & REMINDER TYPES
// ============================================================================

export interface KYCNotification {
  id: string;
  userId: string;
  type: 'verification_started' | 'verification_approved' | 'verification_rejected' | 'document_expired' | 'level_upgraded' | 'action_required';
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
  readAt?: string;
}

export interface DocumentExpiryReminder {
  id: string;
  userId: string;
  documentType: DocumentType;
  documentId: string;
  expiryDate: string;
  remindersSent: number;
  lastReminderSent?: string;
  isActive: boolean;
}
