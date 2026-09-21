import { type MenuItem } from "../types/navigation/sidebar";

// Special routes that aren't part of the sidebar payload
export const specialRoutes = {
    '/': { layout: 'none' as const, protected: false, component: 'LandingPage' },
    '/login': { layout: 'none' as const, protected: false, component: 'Login'},
    '/404': {layout: 'none' as const, protected: false, component: 'NotFound'},
    '/profile': { layout: 'main' as const, protected: true, component: 'Profile'},
} as const;

// default layout configuration for routes
export const defaultRouteConfig = {
    layout: 'main' as const,
    protected: true,
};

// Route extensions for CRUD operations - organized by priority (most specific first)
export const routeExtensions = [
    // Most specific patterns first - conversion routes
    '/quote/:quoteId',
    '/confirm/:txId',

    // Other specific patterns
    '/:id',
    '/edit/:id',
    '/view/:logId',
    '/view/:id',
    '/:userId/edit',
    '/:logId/view',
    '/:id/details',
    '/:id/edit',
    '/:id/map',

    // Less specific patterns
    '/create',
    '/add',
    '/add-user',
    '/add-rule',
    '/map',
    '/activity-log',
    '/programs',
    '/evaluations',
    '/analytics'
] as const;

// Function to extract routes from sidebar menu items
export const extractRoutesFromMenuItems = (menuItems: MenuItem[]): Record<string, {layout: 'main' | 'map' | 'none', protected: boolean }> => {
    const routes: Record<string, { layout: 'main' | 'map' | 'none', protected: boolean }> = {};

    const processMenuItem = (item: MenuItem) => {
        if (item.path) {
            // You can customize layout based on the menu section or path
            const layout = getLayoutForPath(item.path);
            // console.log('Layout for path ', item.path, ': ', layout);
            
            const routeConfig = {
                layout,
                protected: true // Most sidebar routes are protected
            };
            
            // Add base route
            routes[item.path] = routeConfig;
            
            // Add extended routes for CRUD operations
            // Sort extensions by specificity (most specific first)
            const sortedExtensions = [...routeExtensions].sort((a, b) => {
                const aParams = (a.match(/:/g) || []).length;
                const bParams = (b.match(/:/g) || []).length;
                
                // More parameters = more specific
                if (aParams !== bParams) {
                    return bParams - aParams;
                }
                
                // Longer = more specific
                return b.length - a.length;
            });
            
            sortedExtensions.forEach(extension => {
                const fullPath = item.path + extension;
                // Only add if not already defined (prevents overwriting specific configs)
                if (!routes[fullPath]) {
                    routes[fullPath] = {
                        ...routeConfig,
                        layout: getLayoutForPath(fullPath) // Re-evaluate layout for the full path
                    };
                }
            });
        }

        if (item.children) {
            item.children.forEach(processMenuItem);
        }
    };

    menuItems.forEach(processMenuItem);
    return routes;
};

const getLayoutForPath = (path: string): 'main' | 'map' | 'none' => {
    // Map based routes - be more specific about what constitutes a map route
    const mapRoutePatterns = [
        /\/map$/,
        /\/map\/$/,
        /\/[^/]+\/map$/,
        /\/[^/]+\/[^/]+\/map$/,
    ];

    const isMapRoute = mapRoutePatterns.some(pattern => pattern.test(path));
    
    if (isMapRoute) {
        // console.log('Identified as map route:', path);
        return 'map';
    }

    // All other routes use main layout
    return 'main';
}

export const getRouteConfig = (menuItems: MenuItem[]) => {
    const sidebarRoutes = extractRoutesFromMenuItems(menuItems);
    
    // Merge configurations with special routes taking precedence
    const mergedRoutes = {
        ...sidebarRoutes,
        ...specialRoutes
    };
    
    // console.log('Final route config:', Object.keys(mergedRoutes));
    
    return mergedRoutes;
};