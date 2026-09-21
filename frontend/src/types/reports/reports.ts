// Types for Reports functionality
export interface FlightData {
  id: string;
  flightNumber: string;
  aircraftType: string;
  route: string;
  departure: {
    airport: string;
    scheduledTime: string;
    actualTime?: string;
  };
  arrival: {
    airport: string;
    scheduledTime: string;
    actualTime?: string;
  };
  status: 'Scheduled' | 'In-Flight' | 'Completed' | 'Delayed' | 'Cancelled';
  delay?: number;
  passengers: number;
  fuelConsumption?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CrewMember {
  id: string;
  employeeId: string;
  fullName: string;
  position: 'Captain' | 'First Officer' | 'Flight Engineer' | 'Flight Attendant' | 'Purser';
  licenseNumber: string;
  licenseExpiry: string;
  baseLocation: string;
  status: 'Active' | 'Inactive' | 'On Leave' | 'Training';
  flightHours: {
    total: number;
    thisMonth: number;
    thisYear: number;
  };
  certifications: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CrewSchedule {
  id: string;
  crewMemberId: string;
  flightId: string;
  scheduleDate: string;
  startTime: string;
  endTime: string;
  position: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
}

export interface MaintenanceRecord {
  id: string;
  aircraftId: string;
  aircraftRegistration: string;
  maintenanceType: 'Routine' | 'Scheduled' | 'Unscheduled' | 'Emergency';
  workOrderNumber: string;
  description: string;
  scheduledDate: string;
  completedDate?: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';
  technician: string;
  cost: number;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  nextMaintenanceDate?: string;
  partsUsed: Array<{
    partNumber: string;
    partName: string;
    quantity: number;
    cost: number;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SafetyIncident {
  id: string;
  incidentNumber: string;
  flightNumber?: string;
  aircraftId?: string;
  incidentType: 'Safety' | 'Security' | 'Medical' | 'Technical' | 'Weather';
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  description: string;
  location: string;
  reportedBy: string;
  reportedDate: string;
  status: 'Open' | 'Under Investigation' | 'Resolved' | 'Closed';
  actionsTaken?: string;
  followUpRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceRecord {
  id: string;
  auditType: string;
  auditor: string;
  auditDate: string;
  status: 'Compliant' | 'Non-Compliant' | 'Pending' | 'Under Review';
  score: number;
  findings: string[];
  requirements: string[];
  nextAuditDate: string;
  certificateNumber: string;
  issuedBy: string;
  validUntil: string;
  attachments: string[];
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  errors?: string[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  message?: string;
}

// Filter Types
export interface FlightReportFilters {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  flightNumber?: string;
  route?: string;
  aircraftType?: string;
  status?: string[];
}

export interface CrewReportFilters {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  crewId?: string;
  baseLocation?: string;
  position?: string[];
  status?: string[];
}

export interface MaintenanceReportFilters {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  aircraftId?: string;
  maintenanceType?: string[];
  status?: string[];
  priority?: string[];
}

export interface SafetyReportFilters {
  dateRange?: {
    startDate: string;
    endDate: string;
  };
  incidentType?: string[];
  severity?: string[];
  status?: string[];
}

// Dashboard Metrics Types
export interface FlightMetrics {
  totalFlights: number;
  onTimePerformance: number;
  activeRoutes: number;
  fuelEfficiency: number;
  averageDelay: number;
  completedFlights: number;
  cancelledFlights: number;
  performanceChange: {
    flights: number;
    onTime: number;
    routes: number;
    efficiency: number;
  };
}

export interface CrewMetrics {
  activeCrew: number;
  scheduledToday: number;
  totalFlightHours: number;
  utilizationRate: number;
  trainingDue: number;
  licenseExpirations: number;
  certificationsActive: number;
}

export interface MaintenanceMetrics {
  pendingTasks: number;
  completedThisMonth: number;
  overdueTasks: number;
  totalCost: number;
  averageCompletionTime: number;
  criticalTasks: number;
  aircraftGrounded: number;
}

export interface SafetyMetrics {
  openIncidents: number;
  resolvedThisMonth: number;
  criticalIncidents: number;
  averageResolutionTime: number;
  safetyScore: number;
  improvementTrend: number;
}

// State Interfaces for Redux Slices
export interface FlightReportsState {
  flights: FlightData[];
  metrics: FlightMetrics | null;
  filters: FlightReportFilters;
  loading: boolean;
  error: string | null;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  lastUpdated: string | null;
}

export interface CrewReportsState {
  crewMembers: CrewMember[];
  schedules: CrewSchedule[];
  metrics: CrewMetrics | null;
  filters: CrewReportFilters;
  loading: boolean;
  error: string | null;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  lastUpdated: string | null;
}

export interface MaintenanceReportsState {
  maintenanceRecords: MaintenanceRecord[];
  metrics: MaintenanceMetrics | null;
  filters: MaintenanceReportFilters;
  loading: boolean;
  error: string | null;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  lastUpdated: string | null;
}

export interface SafetyReportsState {
  incidents: SafetyIncident[];
  complianceRecords: ComplianceRecord[];
  metrics: SafetyMetrics | null;
  filters: SafetyReportFilters;
  loading: boolean;
  error: string | null;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
  lastUpdated: string | null;
}

// Additional Stats Types for API Service
export interface FlightStats {
  totalFlights: number;
  onTimePerformance: number;
  activeRoutes: number;
  fuelEfficiency: number;
  trending: {
    totalFlights: string;
    onTimePerformance: string;
    activeRoutes: string;
    fuelEfficiency: string;
  };
}

export interface CrewStats {
  activeCrew: number;
  scheduledToday: number;
  totalFlightHours: number;
  efficiency: number;
  trending: {
    activeCrew: string;
    scheduledToday: string;
    totalFlightHours: string;
    efficiency: string;
  };
}

export interface MaintenanceStats {
  aircraftStatus: number;
  pendingTasks: number;
  criticalIssues: number;
  complianceRate: number;
  trending: {
    aircraftStatus: string;
    pendingTasks: string;
    criticalIssues: string;
    complianceRate: string;
  };
}

export interface SafetyStats {
  safetyScore: number;
  incidentRate: number;
  trainingCompletion: number;
  auditScore: number;
  trending: {
    safetyScore: string;
    incidentRate: string;
    trainingCompletion: string;
    auditScore: string;
  };
}

// API Response wrapper
export interface ApiResponse<T> {
  data: T;
  isFromAPI: boolean;
  error?: string;
}
