import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSessionMonitor } from '../../hooks/useSessionMonitor';
import { authInitialized, restoreSession } from '../../redux/slices/oauth-web-sockets/authSlice';
import type { AppDispatch, RootState } from '../../redux/store';

interface AppProviderProps {
    children: React.ReactNode;
}

const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
    const dispatch = useDispatch<AppDispatch>();
    const { isLoading } = useSelector((state: RootState) => state.auth);
    
    // Global session monitoring
    useSessionMonitor();

    // Add this logic to your AppProvider to check for existing tokens/sessions
    useEffect(() => {
        const initializeAuth = async () => {
            dispatch(authInitialized()); // or whatever action sets loading to false
        };
        
        initializeAuth();
    }, [dispatch]);


    useEffect(() => {
        // Try to restore session on app start
        dispatch(restoreSession());
    }, [dispatch]);

    // Show loading spinner while checking authentication
    if (isLoading) {
        return (
            <div className="flex items-center absolute inset-0 z-10 backdrop-blur justify-center min-h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return <>{children}</>;
};

export default AppProvider;
