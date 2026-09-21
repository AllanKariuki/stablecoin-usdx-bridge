import React from 'react'
import type { MenuItem, SidebarProps } from "../../types/navigation/sidebar";
import SidebarItem from "./SidebarItem";
import { ChevronLeft } from 'lucide-react';
import '../../styles/sidebar.css'

const Sidebar:React.FC<SidebarProps> = ({
    menuItems,
    onMenuItemClick,
    activeItemId,
    isCollapsed = false,
    onToggleCollapse,
}) => {
    const handleItemClick = (item: MenuItem) => {
        if (item.onClick) {
            item.onClick();
        }

        if (onMenuItemClick) {
            onMenuItemClick(item);
        }
    }

  return (
    <div className={`
        bg-white border-r border-gray-200 h-full flex flex-col transition-all duration-300
        ${isCollapsed ? 'w-20' : 'w-64'}
    `}>
      {/* Logo/Brand Header */}
        <div className={`flex items-center p-6 ${isCollapsed ? 'justify-center' : 'gap-2'}`}>
            {!isCollapsed ? (
                <div className='flex justify-between items-center w-full'>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-bold text-lg">KC</span>
                        </div>
                        <span className="text-xl font-bold text-gray-800">DAMP</span>
                    </div>
                    
                    {/* Toggle button */}
                    {onToggleCollapse && (
                        <button 
                            onClick={onToggleCollapse} 
                            className="p-2 rounded-full hover:bg-gray-100 transition-colors hidden md:flex items-center justify-center cursor-pointer ml-auto"
                        >
                            <ChevronLeft size={20} className='text-gray-600' />
                        </button>
                    )}
                </div>
            ) : (
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center cursor-pointer" onClick={onToggleCollapse} >
                    <span className="text-white font-bold text-lg">KC</span>
                </div>
            )}
        </div>

        {/* User Profile Card */}
        {!isCollapsed && (
            <div className="px-4 mb-6">
                <div className="bg-white rounded-lg p-4 text-center">
                    <img 
                        src="https://api.dicebear.com/7.x/avataaars/svg?seed=William" 
                        alt="User" 
                        className="w-16 h-16 rounded-full mx-auto mb-2" 
                    />
                    <h3 className="font-semibold text-gray-800 text-sm">Hello, Maria</h3>
                    <p className="text-xs text-gray-500">maria@example.com</p>
                </div>
            </div>
        )}

        {/* Menu items */}
        <div className={`flex-1 overflow-y-auto p-3 sidebar-scroll overflow-visible ${isCollapsed ? 'collapsed' : ''}`}>
            <nav className="space-y-1">
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.id}
                        item={item}
                        level={0}
                        isCollapsed={isCollapsed}
                        activeItemId={activeItemId}
                        onItemClick={handleItemClick}
                        onToggleCollapse={onToggleCollapse}
                    />
                ))}
            </nav>
        </div>

        {/* Footer */}
        {!isCollapsed && (
            <div className="p-4 text-center text-xs text-gray-400 border-t border-gray-100">
                <p>©2025. All rights reserved</p>
            </div>
        )}

    </div>
  )
}

export default Sidebar
