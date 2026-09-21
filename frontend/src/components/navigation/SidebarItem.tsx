import React, { useState, useEffect } from 'react';
import {
    ChevronDown, ChevronUp,
    Menu, Plane, Users, Radio, BarChart3, Monitor, Bell, FileText, Settings,
    Compass,
    CreditCard,
    MapPin,
    Cloud,
    Wallet,
    PlusCircle,
    Clock,
    ArrowLeftRight,
    Bitcoin,
    RefreshCw,
    LayoutDashboard,
    User,
    UserCheck,
    HelpCircle,
    ArrowUpFromLine,
    Logs,
    BanknoteArrowDown,
    BanknoteArrowUp,
    LineChart,
    Smartphone,
    Globe,
    Building2,
    Store,
    PieChart,
    TrendingUp,
    CircleDollarSignIcon,
    ShieldCheck
} from 'lucide-react';
import type { MenuItem } from '../../types/navigation/sidebar';

const iconMap: Record<string, React.ComponentType<any>> = {
    Plane,
    Users,
    Radio,
    BarChart3,
    Monitor,
    Bell,
    FileText,
    Settings,
    Menu,
    Compass,
    CreditCard,
    MapPin,
    Cloud,
    Wallet,
    PlusCircle,
    Clock,
    ArrowLeftRight,
    Bitcoin,
    RefreshCw,
    LayoutDashboard,
    User,
    UserCheck,
    HelpCircle,
    ArrowUpFromLine,
    Logs,
    BanknoteArrowDown,
    BanknoteArrowUp,
    LineChart,
    Smartphone,
    Globe,
    Building2,
    Store,
    PieChart,
    TrendingUp,
    CircleDollarSignIcon,
    ShieldCheck,
};

interface SidebarItemProps {
    item: MenuItem;
    level: number;
    isCollapsed: boolean;
    activeItemId?: string;
    onItemClick: (item: MenuItem) => void;
    onToggleCollapse?: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({
    item,
    level, 
    isCollapsed, 
    activeItemId, 
    onItemClick,
    onToggleCollapse
}) =>{
    const [isExpanded, setIsExpanded] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const hasChildren = item.children && item.children.length > 0;
    const IconComponent = item.icon ? iconMap[item.icon] : null;
    const isActive = activeItemId === item.id;
    const isParentActive = item.children?.some(child => child.id === activeItemId);

    useEffect(() => {
        if (isParentActive && !isCollapsed) {
            setIsExpanded(true);
        }
    }, [isParentActive, isCollapsed]);

    const handleClick = () => {
        if (hasChildren) {
            if (isCollapsed && level === 0) {
                onToggleCollapse?.();
                setIsExpanded(true);
                // Optionally redirect to the first child's url if it exists
                // if (item.children && item.children[0].path) {
                //     onItemClick(item.children[0]);
                // }
            }else {
                setIsExpanded(!isExpanded);
            }
        } else {
            onItemClick(item);
        }
    };

    const handleMouseEnter = (e: React.MouseEvent) => {
        if (isCollapsed && level === 0) {
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltipPosition({
                top: rect.top + rect.height / 2,
                left: rect.right + 8
            });
        }
    };

    const handleParentClick = () => {
        if (hasChildren && !isCollapsed) {
            setIsExpanded(!isExpanded);
        }
    };

    return (
        <div className="w-full">
            <div
                onClick={handleClick}
                onMouseEnter={handleMouseEnter}
                className={`
                    flex items-center px-3 py-4 rounded-4xl cursor-pointer transition-all duration-200 group
                    ${isCollapsed && level === 0 ? 'relative justify-center' : 'relative'}
                    ${isActive
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-50'}
                    ${level > 0 ? 'ml-4' : ''}
                `}>
                    {/* Icon */}
                    {IconComponent && (
                        <IconComponent
                            size={20}
                            className={`
                                ${isCollapsed && level === 0 ? '': 'mr-3'}
                                ${isActive ? 'text-blue-600' : 'text-gray-500'}
                                `}
                        />
                    )}

                    {/* Label */}
                    {(!isCollapsed || level > 0) && (
                        <span
                            className={`
                                flex-1 text-sm
                                ${level === 0 ? 'font-medium' : 'font-normal'}
                                `}
                        >
                            {level > 0 && <span className="text-gray-400">- </span>}
                            {item.label}
                        </span>
                    )}

                    {/* Tooltip for collapsed state - Fixed positioning with dynamic calculation */}
                    {isCollapsed && level === 0 && (
                        <div 
                            className="fixed px-3 py-2 
                                bg-gray-900 text-white text-xs rounded-md shadow-lg opacity-0 
                                invisible group-hover:opacity-100 group-hover:visible 
                                transition-all duration-200 whitespace-nowrap z-[9999] pointer-events-none
                                transform -translate-y-1/2"
                            style={{
                                top: `${tooltipPosition.top}px`,
                                left: `${tooltipPosition.left}px`
                            }}>
                            {item.label}
                            {hasChildren && (
                                <span className="text-gray-300 ml-1">
                                    ({item.children?.length} items)
                                </span>
                            )}
                            {/* Tooltip arrow */}
                            <div className="absolute top-1/2 left-0 transform -translate-y-1/2 -translate-x-full">
                                <div className="w-0 h-0 border-t-4 border-b-4 border-r-4 border-transparent border-r-gray-900"></div>
                            </div>
                        </div>
                    )}

                    {/* Expand/Collapse or Navigation Arrow */}
                    {/* {!isCollapsed && !hasChildren && level === 0 && (
                        <ChevronRight size={16} className='text-gray-400' />
                    )} */}
                    
                    {hasChildren && (!isCollapsed || level > 0) && (
                        <div onClick={(e) => {e.stopPropagation(); handleParentClick(); }}>
                            {isExpanded ? (
                                <ChevronUp size={16} className='text-gray-400' />
                            ) : (
                                <ChevronDown size={16} className='text-gray-400' />
                            )}
                        </div>
                    )}
                </div>
            
            {/* Children */}
            {hasChildren && isExpanded && (!isCollapsed || level > 0) && (
                <div className="mt-1">
                    {item.children?.map((child) => (
                        <SidebarItem
                            key={child.id}
                            item={child}
                            level={level + 1}
                            isCollapsed={isCollapsed}
                            activeItemId={activeItemId}
                            onItemClick={onItemClick}
                        />
                    ))}
                </div>
            )}

        </div>
    )

}

export default SidebarItem;