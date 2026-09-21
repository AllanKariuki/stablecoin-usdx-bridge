import type { FlightNotification, SystemAlert } from './notification';

export type AlertSource = 'flight' | 'system';

// The base shared type for alerts
export interface BaseAlert {
    id: string;
    title: string;
    timestamp: string;
    acknowledged: boolean;
    acknowledgedBy?: string;
    acknowledgedAt?: string;
    updatedAt: string;
    createdBy: string;
    assignedTo?: string;
    escalationLevel?: number;
    escalationHistory?: Array<{
        timestamp: string;
        level: number;
        by: string;
        note: string;
    }>;
    resolvedAt?: string;
    resolvedBy?: string;
}

// Type guard to check if an alert is a flight notification
export function isFlightNotification(alert: AlertItem): alert is FlightNotification & { sourceType: AlertSource } {
    return alert.sourceType === 'flight';
}

// Type guard to check if an alert is a system alert
export function isSystemAlert(alert: AlertItem): alert is SystemAlert & { sourceType: AlertSource } {
    return alert.sourceType === 'system';
}

// Combine both alert types with a discriminator field
export type AlertItem = (
    | (Omit<FlightNotification, keyof BaseAlert> & BaseAlert)
    | (Omit<SystemAlert, keyof BaseAlert> & BaseAlert)
) & {
    sourceType: AlertSource;
};
