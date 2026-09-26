import React, { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useSessionMonitor } from '../../hooks/useSessionMonitor';
import { authInitialized, restoreSession } from '../../redux/slices/oauth-web-sockets/authSlice';
import type { AppDispatch } from '../../redux/store';

interface AppProviderProps {
    children: React.ReactNode;
}

const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const dispatch = useDispatch<AppDispatch>();

    // Global session monitoring
    useSessionMonitor();

    // Restore an existing session (if any) once, on app boot. `state.auth.isLoading`
    // is shared with every other auth thunk (loginWithPkceCode, refreshToken, …) —
    // gating this component's own children on it used to unmount/remount the whole
    // routed app every time ANY of those thunks toggled it, which is exactly what a
    // route like Callback.tsx does on its own mount. That turned "app boot" loading
    // into a permanent unmount-remount storm the moment a login round-trip landed
    // back on a route that itself dispatches an auth thunk. Per-route loading UI
    // (see ProtectedRoute) already covers the cases that actually need one.
    useEffect(() => {
        dispatch(authInitialized());
        dispatch(restoreSession());
    }, [dispatch]);

    return <>{children}</>;
};

export default AppProvider;
