import React, { Suspense } from 'react'
import { Routes, Route } from 'react-router-dom';
import { getRouteConfig } from '../config/routes';
import RouteLayout from '../components/routing/RouteLayout';
import { useSelector } from 'react-redux';
import { selectMenuItems } from '../redux/slices/navigation/sidebarSlice';
import { componentMap } from './routes';

// Default component for routes that don't have a specific component
const DefaultComponent = () => <div>Page under construction</div>;

// Helper function to get component for a route
const getComponentForRoute = (path: string) => {
    // First try exact match
    if (componentMap[path as keyof typeof componentMap]) {
        return componentMap[path as keyof typeof componentMap];
    }
    
    // For dynamic routes, try to find the closest match
    const pathSegments = path.split('/');
    
    // Try to find a pattern match by replacing segments with parameters
    for (const [route, Component] of Object.entries(componentMap)) {
        const routeSegments = route.split('/');
        
        if (routeSegments.length === pathSegments.length) {
            let matches = true;
            
            for (let i = 0; i < routeSegments.length; i++) {
                if (routeSegments[i].startsWith(':')) {
                    // This is a parameter segment, it matches any value
                    continue;
                } else if (routeSegments[i] !== pathSegments[i]) {
                    matches = false;
                    break;
                }
            }
            
            if (matches) {
                return Component;
            }
        }
    }
    
    return DefaultComponent;
}

// 404 Not Found component
const NotFoundComponent = () => {
    const Component = getComponentForRoute('/404');
    return <Component />;
};

const DynamicRoutes: React.FC = () => {
    const menuItems = useSelector(selectMenuItems);
    
    // Get all routes from the centralized config
    const allRoutes = getRouteConfig(menuItems || []);
    
    // console.log('All routes from config:', allRoutes);
    
    // Create a more sophisticated sorting function
    const sortedRoutePaths = Object.keys(allRoutes).sort((a, b) => {
        // Count dynamic segments (segments that start with ':')
        const aDynamicSegments = (a.match(/\/:[^/]*/g) || []).length;
        const bDynamicSegments = (b.match(/\/:[^/]*/g) || []).length;
        
        // Static routes (no parameters) come first
        if (aDynamicSegments === 0 && bDynamicSegments > 0) return -1;
        if (bDynamicSegments === 0 && aDynamicSegments > 0) return 1;
        
        // Among routes with parameters, those with fewer parameters come first
        if (aDynamicSegments !== bDynamicSegments) {
            return aDynamicSegments - bDynamicSegments;
        }
        
        // For routes with same number of parameters, longer paths come first
        // This ensures more specific routes are matched before general ones
        if (a.length !== b.length) {
            return b.length - a.length;
        }
        
        // Alphabetical order as final tiebreaker
        return a.localeCompare(b);
    });

    // console.log('Sorted route paths:', sortedRoutePaths);

    return (
        <Suspense fallback={<div className="flex items-center justify-center h-64">Loading...</div>}>
            <Routes>
                {/* All routes from centralized config */}
                {sortedRoutePaths.map((path) => {
                    // const routeConfig = allRoutes[path as keyof typeof allRoutes];
                    const Component = getComponentForRoute(path);
                    
                    // console.log(`Mapping route: ${path}`, { routeConfig, hasComponent: !!Component });
                    
                    // Special handling for root route (no layout)
                    if (path === '/') {
                        return (
                            <Route 
                                key={path} 
                                path={path} 
                                element={<Component />} 
                            />
                        );
                    }
                    
                    return (
                        <Route 
                            key={path} 
                            path={path} 
                            element={
                                <RouteLayout>
                                    <Component />
                                </RouteLayout>
                            } 
                        />  
                    );
                })}

                {/* Catch-all route for 404 */}
                <Route 
                    path="*" 
                    element={
                        <RouteLayout>
                            <NotFoundComponent />
                        </RouteLayout>
                    } 
                />
            </Routes>
        </Suspense>
    );
}

export default DynamicRoutes;