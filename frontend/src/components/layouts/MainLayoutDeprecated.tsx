import React, { useEffect, useState } from 'react';
import Sidebar from '../navigation/Sidebar';
import { type MenuItem, menuPayload } from '../../types/navigation/sidebar';
import { useLocation, useNavigate } from 'react-router-dom';


interface MainLayoutProps {
    children?: React.ReactNode;
}

const MainLayoutDeprecated: React.FC<MainLayoutProps> = ({ children }) => {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [activeItemId, setActiveItemId] = useState<string>('');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    
    useEffect(() => {
        const fetchMenuItems = async () => {
            try {
                // Replace 'get' with your actual API call function, e.g. axios.get
                const response = await fetch('/menu-items');
                const data = await response.json();
                setMenuItems(data);
            } catch (error: any) {
                // Handle error if needed
                console.log("An error occured while fetching the menu items: ", error)
                // Fallback to default menu items
                setMenuItems(menuPayload);
            }
        };
        fetchMenuItems();
    }, []);

    const handleMenuItemClick = (item: MenuItem) => {
        if (item.path) {
            navigate(item.path);
            setActiveItemId(item.id)
        }
    };

    const handleToggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    }

    // Set active item based on current path
    useEffect(() => {
        const findActiveItem = (items: MenuItem[], currentPath: string): string | null => {
            for (const item of items) {
                if (item.path === currentPath) {
                    // setActiveItemId(item.id);
                    return item.id;
                }

                if (item.children) {
                    const childMatch = findActiveItem(item.children, currentPath);
                    if (childMatch) return childMatch;
                }
            } 

            return null;
        }

        // Get the current path from the window location and find the active id
        const activeId = findActiveItem(menuItems, location.pathname);
        if (activeId) {
            setActiveItemId(activeId);
        }
    }, [location.pathname, menuItems]);
    
    return (
        <div className='flex h-screen bg-gray-50'>
            {/* Sidebar */}
            <Sidebar
                menuItems={menuItems}
                onMenuItemClick={handleMenuItemClick}
                activeItemId={activeItemId}
                isCollapsed={isCollapsed}
                onToggleCollapse={handleToggleCollapse}
            />
            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="bg-white shadow-sm border-b border-gray-200 p-3">
                    <h1 className="text-md font-semibold text-gray-800">
                        Aviation Management System
                    </h1>
                </header>
                <div className='p-6'>
                   {children} 
                </div>
                
            </div>
        </div>
    );
};

export default MainLayoutDeprecated;