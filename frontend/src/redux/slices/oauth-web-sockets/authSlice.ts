import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { decodeTokenPayload, getToken, loginWithCridentials, refreshAuthToken, setRefreshToken } from "../../../utils/authUtils";
import type { LoginPayload, AuthState } from "../../../types/auth-and-websocket/auth";
// import { store } from ".";


const IntialState: AuthState = {
    user: null,
    accessToken: null,
    refreshToken: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
    sessionStartTime: null
};

// Async thunks
export const login = createAsyncThunk(
    'auth/login',
    async ({ username, password }: LoginPayload, { rejectWithValue }) => {
        try {
            const result = await loginWithCridentials(username, password);
            if (result.success) {
                return result.tokens;
            } else {
                return rejectWithValue(result.error);
            }
        } catch (error: any) {
            return rejectWithValue(error.message || 'Login failed');
        }
    }
);

export const refreshToken = createAsyncThunk(
    'auth/refreshToken',
    async (_, { rejectWithValue, getState }) => {
        try {
            const state = getState() as { auth: AuthState };
            const currentRefreshToken = state.auth.refreshToken || sessionStorage.getItem('refresh_token');
            
            if (!currentRefreshToken) {
                return rejectWithValue('No refresh token available');
            }

            const newTokens = await refreshAuthToken(currentRefreshToken);
            console.log('New tokens received:', newTokens);
            sessionStorage.setItem('token', newTokens.access_token);
            if (newTokens.refresh_token) {
                setRefreshToken(newTokens.refresh_token);
            }
            return newTokens;
        } catch (error: any) {
            return rejectWithValue(error.message || 'Token refresh failed');
        }
    }
);

export const restoreSession = createAsyncThunk(
    'auth/restoreSession',
    async (_, { rejectWithValue, getState }) => {
        try {
            const state = getState() as { auth: AuthState };
            const accessToken = getToken();
            // const refreshToken = state.auth.refreshToken || sessionStorage.getItem('refresh_token')?.refreshToken;
            // const sessionStartTime = sessionStorage.getItem('session_start_time');

            // if (!accessToken) {
            //     return rejectWithValue('No stored session found');
            // }

            // Fix: Properly parse the stored refresh token
            let refreshToken = state.auth.refreshToken;
            if (!refreshToken) {
                const storedRefreshToken = sessionStorage.getItem('refresh_token');
                if (storedRefreshToken) {
                    try {
                        const parsed = JSON.parse(storedRefreshToken);
                        refreshToken = parsed.refreshToken;
                    } catch (error) {
                        console.error('Error parsing stored refresh token:', error);
                    }
                }
            }
            
            const sessionStartTime = sessionStorage.getItem('session_start_time');

            if (!accessToken) {
                return rejectWithValue('No stored session found');
            }

            // Check if token is still valid (basic check)
            const tokenData = decodeTokenPayload(accessToken);
            const currentTime = Math.floor(Date.now() / 1000);

            if (tokenData.exp && tokenData.exp < currentTime) {
                // Token expired, try to refresh
                if (refreshToken) {
                    const newTokens = await refreshAuthToken(refreshToken);
                    sessionStorage.setItem('token', newTokens.access_token);

                    if (newTokens.refresh_token) {
                        sessionStorage.setItem('refresh_token', newTokens.refresh_token);
                    }
                    return {
                        access_token: newTokens.access_token,
                        refresh_token: newTokens.refresh_token || refreshToken,
                        sessionStartTime: sessionStartTime ? parseInt(sessionStartTime): Date.now()
                    }

                } else {
                    return rejectWithValue('Token expired adn no refresh token was found');
                }
            }
            return {
                access_token: accessToken,
                refresh_token: refreshToken || null,
                sessionStartTime: sessionStartTime ? parseInt(sessionStartTime) : Date.now()
            }

        } catch (error: any) {
            sessionStorage.removeItem('access_token');
            sessionStorage.removeItem('refresh_token');
            sessionStorage.removeItem('session_start_time');
            return rejectWithValue(error.message || 'Failed to restore session');
        }
    }
);

const authSlice = createSlice({
    name: 'auth',
    initialState: IntialState,
    reducers: {
        logout: (state) => {
            state.user = null;
            state.accessToken = null;
            state.refreshToken = null;
            state.isAuthenticated = false;
            state.error = null;
            state.sessionStartTime = null;
            // Clear session storage
            sessionStorage.removeItem('access_token');
            sessionStorage.removeItem('refresh_token');
            sessionStorage.removeItem('session_start_time');
        },
        clearError: (state) => {
            state.error = null;
        },
        setSessionStart: (state) => {
            state.sessionStartTime = new Date().getTime();
        },
        authInitialized: (state) => {
            state.isLoading = false;
        }
    },
    extraReducers: (builder) => {
        builder
            .addCase(login.pending, (state) => {
                state.isLoading = true;
                state.error = null;
            })
            .addCase(login.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isAuthenticated = true;
                state.accessToken = action.payload.access_token;
                state.refreshToken = action.payload.refresh_token;
                state.sessionStartTime = new Date().getTime();
                // You might want to decode the token to get user info
                state.user = decodeTokenPayload(action.payload.access_token);
            })
            .addCase(login.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload || 'Login failed';
            })
            .addCase(refreshToken.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(refreshToken.fulfilled, (state, action) => {
                state.isLoading = false;
                state.accessToken = action.payload.access_token;
                if (action.payload.refresh_token) {
                    state.refreshToken = action.payload.refresh_token;
                }

                state.user = decodeTokenPayload(action.payload.access_token);
            })
            .addCase(refreshToken.rejected, (state, action) => {
                state.isLoading = false;
                state.error = action.payload || 'Token refresh failed';
                // If refresh fails, log out user
                state.isAuthenticated = false;
                state.accessToken = null;
                state.refreshToken = null;
                state.user = null;
                state.sessionStartTime = null;
                sessionStorage.removeItem('access_token');
                sessionStorage.removeItem('refresh_token');
                sessionStorage.removeItem('session_start_time');
            })
            .addCase(restoreSession.pending, (state) => {
                state.isLoading = true;
            })
            .addCase(restoreSession.fulfilled, (state, action) => {
                state.isLoading = false;
                state.isAuthenticated = true;
                state.accessToken = action.payload.access_token;
                state.refreshToken = action.payload.refresh_token;
                state.sessionStartTime = action.payload.sessionStartTime;
                state.user = decodeTokenPayload(action.payload.access_token);
            })
            .addCase(restoreSession.rejected, (state) => {
                state.isLoading = false;
            })
    }   
});

// Selectors
export const selectAuthLoading = (state: { auth: AuthState })  =>  state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectAccessToken = (state: { auth: AuthState }) => state.auth.accessToken;
// FOR TESTS
// Airline-specific selectors
export const selectUserAirlineId = (state: { auth: AuthState }) => state.auth.user?.airline_id || null;
export const selectUserAirlineName = (state: { auth: AuthState }) => state.auth.user?.airline_name || state.auth.user?.organization_name || null;
export const selectUserOrganization = (state: { auth: AuthState }) => state.auth.user?.organization || null;
export const selectUserRoles = (state: { auth: AuthState }) => {
    const user = state.auth.user;
    if (!user) return [];
    
    const roles = new Set<string>();
    
    // Add realm roles
    if (user.realm_access?.roles) {
        user.realm_access.roles.forEach((role: string) => roles.add(role));
    }
    
    // Add resource roles
    if (user.resource_access) {
        Object.values(user.resource_access).forEach((resource: any) => {
            if (resource.roles) {
                resource.roles.forEach((role: string) => roles.add(role));
            }
        });
    }
    
    return Array.from(roles);
};

// ENDS

export const { logout, clearError, setSessionStart, authInitialized } = authSlice.actions;
export default authSlice.reducer;
