export interface LoginPayload {
    username: string;
    password: string;
}

export interface KeycloakUserInfo {
    sub?: string;
    preferred_username?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
    real_access?: {
        roles: string[];
    };
    resource_access?: {
        [clientId: string]: {
            roles: string[];
        };
    };
    exp?: number;
    iat?: number;
    [key: string]: any;
}

export interface AuthState {
    user: KeycloakUserInfo | null;
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: any;
    sessionStartTime: number | null;
}
