import axios from 'axios';
import { SUPERSET_CONFIG } from '../config/supersetConfig';

// Types for Superset API responses
export interface GuestTokenRequest {
  user: {
    username: string;
    first_name: string;
    last_name: string;
  };
  resources: Array<{
    type: 'dashboard' | 'chart';
    id: string;
  }>;
  rls?: Array<{
    clause: string;
  }>;
}

export interface GuestTokenResponse {
  token: string;
}

export interface DashboardInfo {
  id: string;
  dashboard_title: string;
  url: string;
  thumbnail_url?: string;
  changed_on: string;
  changed_by: {
    first_name: string;
    last_name: string;
  };
}

class SupersetService {
  private readonly baseUrl: string;
  private readonly apiClient;

  constructor() {
    this.baseUrl = SUPERSET_CONFIG.SUPERSET_URL;
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Generate a guest token for embedded dashboard access
   */
  async generateGuestToken(request: GuestTokenRequest): Promise<string> {
    try {
      const response = await this.apiClient.post<GuestTokenResponse>(
        '/api/v1/security/guest_token/',
        request
      );
      return response.data.token;
    } catch (error) {
      console.error('Error generating guest token:', error);
      throw new Error('Failed to generate guest token');
    }
  }

  /**
   * Get dashboard information
   */
  async getDashboardInfo(dashboardId: string): Promise<DashboardInfo> {
    try {
      const response = await this.apiClient.get<DashboardInfo>(
        `/api/v1/dashboard/${dashboardId}`
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard info:', error);
      throw new Error('Failed to fetch dashboard information');
    }
  }

  /**
   * Get dashboard export URL
   */
  getDashboardExportUrl(dashboardId: string, format: 'pdf' | 'png' = 'pdf'): string {
    return `${this.baseUrl}/api/v1/dashboard/${dashboardId}/export/${format}/`;
  }

  /**
   * Get available dashboards (requires authentication)
   */
  async getAvailableDashboards(): Promise<DashboardInfo[]> {
    try {
      const response = await this.apiClient.get<{ result: DashboardInfo[] }>('/api/v1/dashboard/');
      return response.data.result || [];
    } catch (error) {
      console.error('Error fetching available dashboards:', error);
      throw new Error('Failed to fetch available dashboards');
    }
  }

  /**
   * Check if Superset instance is accessible
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/health');
      return response.status === 200;
    } catch (error) {
      console.error('Superset health check failed:', error);
      return false;
    }
  }

  /**
   * Create a guest token with default permissions for a specific dashboard
   */
  async createDashboardGuestToken(
    dashboardId: string,
    username: string = 'guest',
    firstName: string = 'Guest',
    lastName: string = 'User'
  ): Promise<string> {
    const tokenRequest: GuestTokenRequest = {
      user: {
        username,
        first_name: firstName,
        last_name: lastName,
      },
      resources: [
        {
          type: 'dashboard',
          id: dashboardId,
        },
      ],
    };

    return this.generateGuestToken(tokenRequest);
  }
}

// Create and export a singleton instance
export const supersetService = new SupersetService();

// Helper function to check if Superset is properly configured
export const validateSupersetConfig = (): boolean => {
  if (!SUPERSET_CONFIG.SUPERSET_URL) {
    console.warn('Superset URL not configured. Please set REACT_APP_SUPERSET_URL in your environment variables.');
    return false;
  }

  const requiredDashboards = Object.values(SUPERSET_CONFIG.DASHBOARDS);
  const missingDashboards = requiredDashboards.filter(id => !id || id.includes('dashboard'));
  
  if (missingDashboards.length > 0) {
    console.warn('Some dashboard IDs are not configured. Please set the following environment variables:');
    console.warn('- REACT_APP_CREW_DASHBOARD_ID');
    console.warn('- REACT_APP_FLIGHT_DASHBOARD_ID');
    console.warn('- REACT_APP_MAINTENANCE_DASHBOARD_ID');
    console.warn('- REACT_APP_SAFETY_DASHBOARD_ID');
    return false;
  }

  return true;
};

export default SupersetService;
