import { Menu, X } from 'lucide-react';
import React, { useEffect, useState } from 'react'
import Sidebar from '../navigation/Sidebar';
import { type MenuItem, menuPayload } from '../../types/navigation/sidebar';
import { useNavigate } from 'react-router-dom';
import UserCircle from './UserCircle';
import GlobalSearch from '../search/GlobalSearch';
import NotificationBell from '../notifications/NotificationBell';

interface MapLayoutProps {
    children?: React.ReactNode;
}

const MapLayout: React.FC<MapLayoutProps> = ({ children }) => {
    const [isMenuOpen, setMenuOpen] = useState(false);
    const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
    const [activeItemId, setActiveItemId] = useState<string>('');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchMenuItems = async () => {
            try {
                const response = await fetch('/menu-items');
                const data = await response.json();
                setMenuItems(data);
            } catch (error: any) {
                console.error("An error occured while fetching the menu items: ", error);
                setMenuItems(menuPayload);
            }
        };
        fetchMenuItems();
    }, []);

    const handleMenuItemClick = (item: MenuItem) => {
        if (item.path) {
            navigate(item.path);
            setActiveItemId(item.id);
            // add redux dispatcher to store the active item or path in state for easy retrieval
        }
    };

    const handleMenuToggle = () => {
        setMenuOpen(!isMenuOpen);
    }


  return (
    <div className='relative h-screen cusor-pointer'>
        {/* Map Layer */}
        <div className="absolute inset-0 z-0">
            {children}
        </div>

        {/* Overlay controls */}
        <div className="absolute top-0 left-0 right-0 z-10 p-4 mx-12">
            <div className='flex items-center justify-between'>
                {/* Left side Hamburger to open the menu */}
                <div className="flex items-center space-x-4">
                    <button
                        onClick={handleMenuToggle}     
                        className="p-2 rounded-full bg-gray-50 shadow-sm cursor-pointer hover:shadow-md transition-colors"
                        aria-label='Toggle menu'
                        >
                        <Menu className='text-gray-500 hover:text-gray-900 hover:shadow-xl' size={24} />
                    </button>
                </div>
                
                {/* Right side with Search and User Controls */}
                <div className="flex items-center space-x-4">
                    {/* Global search component */}
                    <div className="w-96">
                        <GlobalSearch 
                            placeholder="Search flights, aircraft, airports..."
                            className='bg-gray-100 focus:bg-white w-full'
                            showRecentSearches={true}
                        />
                    </div>
                    
                    <NotificationBell variant="dark" />
                    <UserCircle
                        size='md'
                    />
                </div>
            </div>
        </div>
            
        {/* Sidebar menu overlay */}
        {isMenuOpen && (
            <>
                {/* Backdrop */}
                <div className="fixed inset-0 bg-black/20 z-20" onClick={handleMenuToggle} />

                {/* Sidebar container */}
                <div className="fixed left-0 top-0 h-full z-30 transform transition-transform duration-500 ease-in-out">
                    <div className="relative h-full">
                        {/* Close button */}
                        <button 
                            onClick={handleMenuToggle}
                            className="absolute top-3 right-4 z-40 p-2 bg-white rounded-full shadow-md hover:bg-gray-50 transition-colors"
                            aria-label='Close menu'
                        >
                            <X className='text-gray-700' size={20} />
                        </button>

                        {/* Sidebar Content */}
                        <Sidebar
                            menuItems={menuItems}
                            onMenuItemClick={handleMenuItemClick}
                            activeItemId={activeItemId}
                        />
                    </div>
                    
                </div>
            </>  
        )}                
    </div>
  );
};

export default MapLayout
