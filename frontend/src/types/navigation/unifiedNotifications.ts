export interface BaseNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  isRead: boolean;
  readAt?: string;
  category: 'system' | 'notam' | 'general';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface SystemNotification extends BaseNotification {
  category: 'system';
  systemType: 'maintenance' | 'security' | 'update' | 'alert';
  level: 'info' | 'warning' | 'error' | 'success';
  actionRequired?: boolean;
  actionUrl?: string;
}

export interface NotamNotification extends BaseNotification {
  category: 'notam';
  notam_id: string;
  location: string;
  start_time: string;
  end_time: string;
  schedule?: string;
  description: string;
  lower_limit: string;
  upper_limit: string;
  type: string;
  status: "ACTIVE" | "EXPIRED" | "FUTURE";
  created_at?: string;
  source?: string;
}

export interface GeneralNotification extends BaseNotification {
  category: 'general';
  type: 'info' | 'reminder' | 'announcement';
  source?: string;
  expiresAt?: string;
  actionRequired?: boolean;
  actionUrl?: string;
}

export type UnifiedNotification = SystemNotification | NotamNotification | GeneralNotification;

export interface NotificationStats {
  total: number;
  unread: number;
  byCategory: {
    system: number;
    notam: number;
    general: number;
  };
  byPriority: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
}

export interface UnifiedNotificationsState {
  notifications: UnifiedNotification[];
  loading: boolean;
  error: string | null;
  stats: NotificationStats;
  lastUpdated: string | null;
}
