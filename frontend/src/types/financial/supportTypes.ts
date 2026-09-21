/**
 * Support, Help, and Notification Types
 * Types for customer support, help center, and notification management
 */

// ============================================================================
// NOTIFICATION TYPES
// ============================================================================

export type NotificationType = 'transaction' | 'payment' | 'security' | 'system' | 'promotion' | 'reminder' | 'alert' | 'support';
export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';
export type NotificationChannel = 'email' | 'sms' | 'push' | 'in_app';
export type NotificationStatus = 'sent' | 'delivered' | 'read' | 'archived';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  channel: NotificationChannel;
  status: NotificationStatus;
  isRead: boolean;
  actionUrl?: string;
  actionLabel?: string;
  icon?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  readAt?: string;
  expiresAt?: string;
}

export interface NotificationPreference {
  id: string;
  userId: string;
  type: NotificationType;
  enableEmail: boolean;
  enableSMS: boolean;
  enablePush: boolean;
  enableInApp: boolean;
  quietHoursStart?: string; // HH:mm format
  quietHoursEnd?: string;
  frequency?: 'immediate' | 'daily' | 'weekly' | 'never';
  updatedAt: string;
}

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  subject?: string;
  title: string;
  message: string;
  htmlContent?: string;
  variables: string[]; // e.g., ['firstName', 'amount', 'date']
  isActive: boolean;
  createdAt: string;
}

export interface NotificationQueue {
  id: string;
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  recipient: string; // email, phone number, or device token
  sentAt?: string;
  failureReason?: string;
  retryCount: number;
  maxRetries: number;
}

// ============================================================================
// SUPPORT TICKET TYPES
// ============================================================================

export type TicketStatus = 'open' | 'in_progress' | 'waiting_customer' | 'on_hold' | 'resolved' | 'closed' | 'reopened';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';
export type TicketCategory = 'account' | 'payment' | 'transaction' | 'technical' | 'security' | 'billing' | 'general' | 'other';

export interface SupportTicket {
  id: string;
  userId: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  description: string;
  messages: TicketMessage[];
  attachments: TicketAttachment[];
  assignedTo?: string;
  assignedTeam?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  closedAt?: string;
  reopenedAt?: string;
  responseTime?: number; // in minutes
  resolutionTime?: number; // in minutes
  satisfactionScore?: number; // 1-5
  satisfactionComment?: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderName: string;
  senderType: 'customer' | 'agent' | 'system';
  senderAvatar?: string;
  message: string;
  attachments?: string[];
  isInternal?: boolean; // not visible to customer
  createdAt: string;
  editedAt?: string;
  editedBy?: string;
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
}

export interface TicketTemplate {
  id: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  defaultAssignee?: string;
  responseTemplate?: string;
  tags?: string[];
  isActive: boolean;
}

// ============================================================================
// HELP CENTER TYPES
// ============================================================================

export type ArticleStatus = 'draft' | 'published' | 'archived';
export type ArticleCategory = 'getting-started' | 'account' | 'deposits' | 'withdrawals' | 'payments' | 'trading' | 'investments' | 'security' | 'fees' | 'troubleshooting' | 'other';

export interface HelpArticle {
  id: string;
  title: string;
  slug: string;
  category: ArticleCategory;
  content: string;
  htmlContent?: string;
  excerpt?: string;
  author?: string;
  status: ArticleStatus;
  views: number;
  helpfulCount: number;
  unhelpfulCount: number;
  tags?: string[];
  relatedArticles?: string[]; // article IDs
  videoUrl?: string;
  images?: string[];
  publishedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: ArticleCategory;
  order: number;
  views: number;
  helpfulCount: number;
  unhelpfulCount: number;
  relatedArticles?: string[];
  isActive: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface HelpCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  articleCount: number;
  faqCount: number;
  order: number;
  isActive: boolean;
}

export interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  category: ArticleCategory;
  videoUrl: string;
  thumbnailUrl?: string;
  duration: number; // in seconds
  views: number;
  transcript?: string;
  relatedArticles?: string[];
  publishedAt: string;
  updatedAt: string;
}

// ============================================================================
// FEEDBACK TYPES
// ============================================================================

export type FeedbackType = 'bug' | 'feature_request' | 'suggestion' | 'complaint' | 'compliment' | 'other';
export type FeedbackStatus = 'new' | 'acknowledged' | 'under_review' | 'in_progress' | 'completed' | 'won_t_fix' | 'closed';

export interface UserFeedback {
  id: string;
  userId: string;
  type: FeedbackType;
  title: string;
  description: string;
  category?: string;
  status: FeedbackStatus;
  rating?: number; // 1-5
  attachments?: string[];
  assignedTo?: string;
  response?: string;
  respondedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRequest {
  id: string;
  userId: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: FeedbackStatus;
  upvotes: number;
  downvotes: number;
  comments: FeatureComment[];
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureComment {
  id: string;
  featureRequestId: string;
  userId: string;
  userName: string;
  comment: string;
  createdAt: string;
}

// ============================================================================
// CONTACT TYPES
// ============================================================================

export interface ContactForm {
  id: string;
  name: string;
  email: string;
  phoneNumber?: string;
  subject: string;
  category: TicketCategory;
  message: string;
  attachments?: string[];
  status: 'received' | 'processing' | 'responded' | 'archived';
  response?: string;
  respondedAt?: string;
  submittedAt: string;
}

export interface ContactChannel {
  id: string;
  type: 'email' | 'phone' | 'chat' | 'social_media';
  displayName: string;
  identifier: string; // email, phone number, social handle
  description?: string;
  operatingHours?: {
    dayOfWeek: number; // 0-6
    startTime: string; // HH:mm
    endTime: string;
  }[];
  responseTimeMinutes?: number;
  isActive: boolean;
}

export interface ChatSession {
  id: string;
  userId: string;
  agentId?: string;
  agentName?: string;
  status: 'active' | 'waiting' | 'closed';
  messages: ChatMessage[];
  startedAt: string;
  endedAt?: string;
  duration?: number; // in seconds
  rating?: number; // 1-5
  notes?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderType: 'customer' | 'agent' | 'system';
  message: string;
  attachments?: string[];
  read: boolean;
  readAt?: string;
  createdAt: string;
}

// ============================================================================
// KNOWLEDGE BASE TYPES
// ============================================================================

export interface KnowledgeBase {
  id: string;
  title: string;
  description?: string;
  content: string;
  category: ArticleCategory;
  tags: string[];
  author?: string;
  views: number;
  rating?: number; // average 1-5
  isPublished: boolean;
  publishedAt?: string;
  updatedAt: string;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  type: 'article' | 'faq' | 'tutorial' | 'ticket';
  title: string;
  excerpt: string;
  url: string;
  category: ArticleCategory;
  relevanceScore: number; // 0-100
  views?: number;
}

// ============================================================================
// ANNOUNCEMENT TYPES
// ============================================================================

export type AnnouncementType = 'maintenance' | 'feature' | 'security' | 'promotion' | 'general';
export type AnnouncementStatus = 'draft' | 'scheduled' | 'active' | 'expired' | 'archived';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  title: string;
  content: string;
  htmlContent?: string;
  status: AnnouncementStatus;
  priority: NotificationPriority;
  targetAudience?: string; // segmentation
  startDate: string;
  endDate?: string;
  icon?: string;
  actionUrl?: string;
  actionLabel?: string;
  dismissible: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// STATUS PAGE TYPES
// ============================================================================

export type ServiceStatus = 'operational' | 'degraded' | 'outage' | 'maintenance';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface StatusPage {
  id: string;
  serviceName: string;
  status: ServiceStatus;
  description?: string;
  lastUpdated: string;
}

export interface ServiceComponent {
  id: string;
  name: string;
  description?: string;
  status: ServiceStatus;
  groupId?: string;
  order: number;
  isMonitored: boolean;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: 'investigating' | 'identified' | 'monitoring' | 'resolved';
  affectedComponents: string[]; // component IDs
  startTime: string;
  resolvedTime?: string;
  updates: IncidentUpdate[];
  createdAt: string;
  updatedAt: string;
}

export interface IncidentUpdate {
  id: string;
  incidentId: string;
  status: string;
  message: string;
  timestamp: string;
}
