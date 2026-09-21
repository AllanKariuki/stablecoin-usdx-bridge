import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../redux/store';
import { selectAuthLoading } from '../../redux/slices/oauth-web-sockets/authSlice';

interface ProtectedRouteProps {
    children: React.ReactNode;
    redirectTo?: string;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
    children, 
    redirectTo = '/login' 
}) => {
    const isAuthenticated = useSelector((state: RootState) => state.auth.isAuthenticated);
    const isLoading = useSelector(selectAuthLoading);
    const navigate = useNavigate();
    const [hasInitialized, setHasInitialized] = useState(false);

    useEffect(() => {
        // Mark as initialized once we've gone through the loading phase
        if (!isLoading && !hasInitialized) {
            setHasInitialized(true);
        }
    }, [isLoading, hasInitialized]);

    useEffect(() => {
        // Only redirect after initialization and if user is not authenticated
        if (hasInitialized && !isLoading && !isAuthenticated) {
            navigate(redirectTo, { replace: true });
        }
    }, [isAuthenticated, isLoading, hasInitialized, navigate, redirectTo]);

    // Show loading spinner while authentication is being checked or not initialized
    if (isLoading || !hasInitialized) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // If initialized and not authenticated, return null (redirect will happen in useEffect)
    if (!isAuthenticated) {
        return null;
    }
    
    // Only render children if authenticated and initialized
    return <>{children}</>;
};

export default ProtectedRoute;
