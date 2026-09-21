// import React from 'react';
// import { useLocation } from 'react-router-dom';
// import LayoutWrapper from './LayoutWrapper';
// import ProtectedRoute from './ProtectedRoute';
// import { useSelector } from 'react-redux';
// import { selectMenuItems } from '../../redux/slices/navigation/sidebarSlice';
// import { defaultRouteConfig, getRouteConfig } from '../../config/routes';

// interface RouteLayoutProps {
//     children: React.ReactNode;
// }

// // Helper function to match route patterns with parameters
// const matchRoutePattern = (pathname: string, pattern: string): boolean => {
//     const patternParts = pattern.split('/');
//     const pathParts = pathname.split('/');
    
//     if (patternParts.length !== pathParts.length) {
//         return false;
//     }
    
//     return patternParts.every((part, index) => {
//         return part.startsWith(':') || part === pathParts[index];
//     });
// };

// // Find matching route configuration for the current pathname
// const findMatchingRouteConfig = (pathname: string, routeConfig: Record<string, any>) => {
//     // First try exact match
//     if (routeConfig[pathname]) {
//         return routeConfig[pathname];
//     }
    
//     // Then try pattern matching for routes with parameters
//     for (const [pattern, config] of Object.entries(routeConfig)) {
//         if (pattern.includes(':') && matchRoutePattern(pathname, pattern)) {
//             return config;
//         }
//     }
    
//     return null;
// };

// const RouteLayout: React.FC<RouteLayoutProps> = ({ children }) => {
//     const location = useLocation();
//     const menuItems = useSelector(selectMenuItems);

//     const routeConfig = getRouteConfig(menuItems || []);
//     console.log('Route configuration: ', routeConfig);

//     const config = findMatchingRouteConfig(location.pathname, routeConfig) || defaultRouteConfig;

//     const content = (
//         <LayoutWrapper layout={config.layout}>
//             {children}
//         </LayoutWrapper>
//     );

//     return config.protected ? (
//         <ProtectedRoute>{content}</ProtectedRoute>
//     ) : (
//         content
//     );
// };

// export default RouteLayout;


import React from 'react';
import { useLocation } from 'react-router-dom';
import LayoutWrapper from './LayoutWrapper';
import ProtectedRoute from './ProtectedRoute';
import { useSelector } from 'react-redux';
import { selectMenuItems } from '../../redux/slices/navigation/sidebarSlice';
import { defaultRouteConfig, getRouteConfig } from '../../config/routes';

interface RouteLayoutProps {
    children: React.ReactNode;
}

// Improved helper function to match route patterns with parameters
const matchRoutePattern = (pathname: string, pattern: string): boolean => {
    const patternParts = pattern.split('/').filter(part => part !== '');
    const pathParts = pathname.split('/').filter(part => part !== '');
    
    if (patternParts.length !== pathParts.length) {
        return false;
    }
    
    return patternParts.every((part, index) => {
        // If the pattern part starts with ':', it's a parameter and matches any value
        return part.startsWith(':') || part === pathParts[index];
    });
};

// Find matching route configuration for the current pathname
const findMatchingRouteConfig = (pathname: string, routeConfig: Record<string, any>) => {

    // First try exact match
    if (routeConfig[pathname]) {
        return routeConfig[pathname];
    }
    
    // Then try pattern matching for routes with parameters
    // Sort patterns by specificity (fewer parameters first, then by length)
    const patterns = Object.keys(routeConfig).filter(pattern => pattern.includes(':'));
    const sortedPatterns = patterns.sort((a, b) => {
        const aParams = (a.match(/:/g) || []).length;
        const bParams = (b.match(/:/g) || []).length;
        
        // Fewer parameters first
        if (aParams !== bParams) {
            return aParams - bParams;
        }
        
        // Longer patterns first (more specific)
        return b.length - a.length;
    });
    
    
    for (const pattern of sortedPatterns) {
        if (matchRoutePattern(pathname, pattern)) {

            return routeConfig[pattern];
        }
    }
    
    
    return null;
};

const RouteLayout: React.FC<RouteLayoutProps> = ({ children }) => {
    const location = useLocation();
    const menuItems = useSelector(selectMenuItems);

    const routeConfig = getRouteConfig(menuItems || []);

    const config = findMatchingRouteConfig(location.pathname, routeConfig) || defaultRouteConfig;

    const content = (
        <LayoutWrapper layout={config.layout}>
            {children}
        </LayoutWrapper>
    );

    return config.protected ? (
        <ProtectedRoute>{content}</ProtectedRoute>
    ) : (
        content
    );
};

export default RouteLayout;