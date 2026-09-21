import React, { useEffect, useState } from 'react'
import Sidebar from '../navigation/Sidebar'
import TopBar from '../navigation/TopBar'
import { type MenuItem, menuPayload } from '../../types/navigation/sidebar'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react';

// Import UserSwitcher for testing - only in development
// const UserSwitcher = import.meta.env.DEV 
//   ? React.lazy(() => import('../testing/userSwitcher'))
//   : null;

//   ENDS

interface LayoutProps {
    children?: React.ReactNode;
}

const MainLayout: React.FC<LayoutProps> = ({ children }) => {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [activeItemId, setActiveItemId] = useState<string>('');
    const [isCollapsed, setIsCollapsed] = useState(false);
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState<boolean>(false);
    const [isMobile, setIsMobile] = useState<boolean>(false);
    const location = useLocation();
    
    useEffect(() => {
        const fetchMenuItems = async () => {
            try {
                const response = await fetch('/menu-items');
                const data = await response.json();
                setMenuItems(data);
            } catch (error: any) {
                console.log("An error occured while fetching the menu items: ", error)
                setMenuItems(menuPayload);
            }
        };
        fetchMenuItems();
    }, []);

    const handleMenuItemClick = (item: MenuItem) => {
        if (item.path) {
            navigate(item.path);
            setActiveItemId(item.id)
            if (isMobile) {
                setIsOpen(false);
            }
        }
    };

    const handleToggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    }

    useEffect(() => {
        const findActiveItem = (items: MenuItem[], currentPath: string): string | null => {
            for (const item of items) {
                if (item.path === currentPath) {
                    return item.id;
                }

                if (item.children) {
                    const childMatch = findActiveItem(item.children, currentPath);
                    if (childMatch) return childMatch;
                }
            } 

            return null;
        }

        const activeId = findActiveItem(menuItems, location.pathname);
        if (activeId) {
            setActiveItemId(activeId);
        }
    }, [location.pathname, menuItems]);

    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);
            setIsOpen(!mobile);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className="flex h-screen overflow-hidden bg-gray-50">
            {/* Mobile Overlay */}
            {isMobile && isOpen && (
                <div 
                    className="fixed inset-0 backdrop-blur z-40 md:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}
            
            {/* Sidebar */}
            <div className={`
                ${isMobile 
                    ? `fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out ${
                        isOpen ? 'translate-x-0' : '-translate-x-full'
                      }`
                    : `relative ${isOpen ? 'block' : 'hidden'}`
                }
            `}>
                <Sidebar
                    menuItems={menuItems}
                    onMenuItemClick={handleMenuItemClick}
                    activeItemId={activeItemId}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={handleToggleCollapse}
                />
                
                {/* Close button for mobile */}
                {isMobile && (
                    <button
                        onClick={() => setIsOpen(false)}
                        className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 md:hidden"
                    >
                        <X className="h-6 w-6" />
                    </button>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Top Navigation Bar */}
                <TopBar />

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto p-3 md:p-6 bg-gray-50">
                    {children} 
                </main>
            </div>
        </div>
    );
}

export default MainLayout;