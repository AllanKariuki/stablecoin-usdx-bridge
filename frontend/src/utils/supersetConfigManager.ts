// Superset Configuration Manager
// This utility helps validate and manage Superset configuration across different environments

import { SUPERSET_CONFIG, getCurrentSupersetConfig, buildDashboardUrl } from '../config/supersetConfig';

export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface EnvironmentInfo {
  name: string;
  supersetUrl: string;
  dashboardsConfigured: number;
  totalDashboards: number;
  authConfigured: boolean;
}

/**
 * Validate the current Superset configuration
 */
export const validateSupersetConfiguration = (): ConfigValidationResult => {
  const result: ConfigValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };

  // Check if Superset URL is configured
  const config = getCurrentSupersetConfig();
  if (!config.url || config.url.includes('localhost')) {
    if (!config.url) {
      result.errors.push('Superset URL is not configured');
      result.isValid = false;
    } else {
      result.warnings.push('Using localhost Superset URL - make sure this is intentional for development');
    }
  }

  // Check if dashboard IDs are configured
  const dashboards = SUPERSET_CONFIG.DASHBOARDS;
  const defaultIds = Object.values(dashboards).filter(id => id.includes('dashboard'));
  
  if (defaultIds.length > 0) {
    result.warnings.push(`${defaultIds.length} dashboard(s) still using default IDs`);
    result.suggestions.push('Update dashboard IDs in your environment variables');
  }

  // Check if authentication is properly configured
  if (SUPERSET_CONFIG.AUTH_CONFIG.useGuestToken && !SUPERSET_CONFIG.AUTH_CONFIG.staticGuestToken) {
    result.suggestions.push('Consider setting up guest token generation for better security');
  }

  // Check if all required environment variables are set
  const requiredEnvVars = [
    'VITE_SUPERSET_URL',
    'VITE_CREW_DASHBOARD_ID',
    'VITE_FLIGHT_DASHBOARD_ID',
    'VITE_MAINTENANCE_DASHBOARD_ID',
    'VITE_SAFETY_DASHBOARD_ID'
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !import.meta.env[envVar]);
  if (missingEnvVars.length > 0) {
    result.errors.push(`Missing environment variables: ${missingEnvVars.join(', ')}`);
    result.isValid = false;
  }

  return result;
};

/**
 * Get information about the current environment configuration
 */
export const getEnvironmentInfo = (): EnvironmentInfo => {
  const config = getCurrentSupersetConfig();
  const dashboards = SUPERSET_CONFIG.DASHBOARDS;
  
  const configuredDashboards = Object.values(dashboards).filter(
    id => id && !id.includes('dashboard')
  ).length;

  return {
    name: import.meta.env.MODE || 'development',
    supersetUrl: config.url,
    dashboardsConfigured: configuredDashboards,
    totalDashboards: Object.keys(dashboards).length,
    authConfigured: !!SUPERSET_CONFIG.AUTH_CONFIG.staticGuestToken || 
                   SUPERSET_CONFIG.AUTH_CONFIG.useGuestToken
  };
};

/**
 * Test connectivity to Superset instance
 */
export const testSupersetConnectivity = async (): Promise<{
  connected: boolean;
  responseTime?: number;
  error?: string;
}> => {
  const config = getCurrentSupersetConfig();
  const startTime = Date.now();

  try {
    const response = await fetch(`${config.url}/health`, {
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        connected: true,
        responseTime
      };
    } else {
      return {
        connected: false,
        error: `HTTP ${response.status}: ${response.statusText}`
      };
    }
  } catch (error) {
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * Generate configuration report for debugging
 */
export const generateConfigurationReport = async (): Promise<string> => {
  const validation = validateSupersetConfiguration();
  const envInfo = getEnvironmentInfo();
  const connectivity = await testSupersetConnectivity();

  const report = `
# Superset Configuration Report
Generated: ${new Date().toISOString()}

## Environment Information
- Environment: ${envInfo.name}
- Superset URL: ${envInfo.supersetUrl}
- Dashboards Configured: ${envInfo.dashboardsConfigured}/${envInfo.totalDashboards}
- Authentication: ${envInfo.authConfigured ? 'Configured' : 'Not Configured'}

## Connectivity Test
- Connected: ${connectivity.connected ? 'Yes' : 'No'}
${connectivity.responseTime ? `- Response Time: ${connectivity.responseTime}ms` : ''}
${connectivity.error ? `- Error: ${connectivity.error}` : ''}

## Configuration Validation
- Overall Status: ${validation.isValid ? 'Valid' : 'Invalid'}

### Errors (${validation.errors.length})
${validation.errors.map(error => `- ${error}`).join('\n')}

### Warnings (${validation.warnings.length})
${validation.warnings.map(warning => `- ${warning}`).join('\n')}

### Suggestions (${validation.suggestions.length})
${validation.suggestions.map(suggestion => `- ${suggestion}`).join('\n')}

## Dashboard URLs
${Object.entries(SUPERSET_CONFIG.DASHBOARDS).map(([key, id]) => 
  `- ${key}: ${buildDashboardUrl(id, false)}`
).join('\n')}

## Environment Variables Used
- VITE_SUPERSET_URL: ${import.meta.env.VITE_SUPERSET_URL || 'Not set'}
- VITE_CREW_DASHBOARD_ID: ${import.meta.env.VITE_CREW_DASHBOARD_ID || 'Not set'}
- VITE_FLIGHT_DASHBOARD_ID: ${import.meta.env.VITE_FLIGHT_DASHBOARD_ID || 'Not set'}
- VITE_MAINTENANCE_DASHBOARD_ID: ${import.meta.env.VITE_MAINTENANCE_DASHBOARD_ID || 'Not set'}
- VITE_SAFETY_DASHBOARD_ID: ${import.meta.env.VITE_SAFETY_DASHBOARD_ID || 'Not set'}
- VITE_SUPERSET_USE_GUEST_TOKEN: ${import.meta.env.VITE_SUPERSET_USE_GUEST_TOKEN || 'Not set'}
  `;

  return report.trim();
};

/**
 * Switch between different Superset environments (for development/testing)
 */
export const switchEnvironment = (environment: 'development' | 'staging' | 'production'): void => {
  const envConfig = SUPERSET_CONFIG.ENVIRONMENTS[environment];
  
  if (envConfig) {
    // Note: This won't persist across page reloads in production
    // In a real application, you'd want to store this in localStorage or similar
    (window as any).__SUPERSET_OVERRIDE_URL = envConfig.url;
    
    console.log(`Switched to ${environment} environment: ${envConfig.url}`);
    
    // Suggest page reload for changes to take effect
    if (window.confirm(`Environment switched to ${environment}. Reload the page to apply changes?`)) {
      window.location.reload();
    }
  } else {
    console.error(`Environment ${environment} not found in configuration`);
  }
};

/**
 * Export configuration for sharing or backup
 */
export const exportConfiguration = (): string => {
  const config = {
    environment: import.meta.env.MODE,
    superset: {
      url: getCurrentSupersetConfig().url,
      dashboards: SUPERSET_CONFIG.DASHBOARDS,
      auth: {
        useGuestToken: SUPERSET_CONFIG.AUTH_CONFIG.useGuestToken,
        // Don't export sensitive tokens
        hasStaticToken: !!SUPERSET_CONFIG.AUTH_CONFIG.staticGuestToken
      }
    },
    timestamp: new Date().toISOString()
  };

  return JSON.stringify(config, null, 2);
};

export default {
  validateSupersetConfiguration,
  getEnvironmentInfo,
  testSupersetConnectivity,
  generateConfigurationReport,
  switchEnvironment,
  exportConfiguration
};
