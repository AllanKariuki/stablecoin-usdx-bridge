export interface Notification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    title: string;
    message: string;
    duration?: number;
    isCountdown?: boolean;
    countdownValue?: number;
}

export interface FlightNotification {
    id: string;
    flightId: string;
    flightNumber: string;
    type: 'departure' | 'arrival' | 'delay' | 'cancellation' | 'gate_change' | 'weather_alert' | 'maintenance' | 'emergency';
    priority: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    message: string;
    timestamp: string;
    acknowledged: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    status: 'active' | 'investigating' | 'resolved' | 'dismissed';
    category: 'operational' | 'safety' | 'customer_service' | 'maintenance';
    affectedPassengers?: number;
    estimatedDelay?: number; // in minutes
    newGate?: string;
    newTime?: string;
    weatherConditions?: string;
    createdBy: string;
    updatedAt: string;
    escalationLevel?: number;
    escalationHistory?: Array<{
        timestamp: string;
        level: number;
        by: string;
        note: string;
    }>;
    relatedAlerts?: string[];
    actionRequired?: boolean;
    assignedTo?: string;
    resolvedAt?: string;
    resolvedBy?: string;
}

export interface SystemAlert {
    id: string;
    type: 'system_failure' | 'network_issue' | 'security_breach' | 'maintenance_window' | 'performance_degradation' | 'data_backup' | 'license_expiry' | 'capacity_warning';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    timestamp: string;
    source: string; // e.g., 'radar_system', 'database', 'network_monitor'
    status: 'open' | 'active' | 'investigating' | 'resolved' | 'dismissed';
    acknowledged: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    affectedSystems: string[];
    impact: 'none' | 'minor' | 'moderate' | 'major' | 'critical';
    estimatedResolutionTime?: string;
    actualResolutionTime?: string;
    workaround?: string;
    solution?: string;
    createdBy: string;
    assignedTo?: string;
    updatedAt: string;
    escalationLevel?: number;
    escalationHistory?: Array<{
        timestamp: string;
        level: number;
        by: string;
        note: string;
    }>;
    resolvedAt?: string;
    resolvedBy?: string;
    maintenanceWindow?: {
        startTime: string;
        endTime: string;
        description: string;
    };
    metrics?: {
        affectedUsers?: number;
        systemUptime?: number;
        performanceImpact?: number;
    };
    relatedIncidents?: string[];
}

export interface NotificationFilter {
    type?: string;
    priority?: string;
    severity?: string;
    status?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    acknowledged?: boolean;
    assignedTo?: string;
    flightNumber?: string;
    source?: string;
}