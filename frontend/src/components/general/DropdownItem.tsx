import React from 'react'


interface DropdownItemProps {
    icon?: React.ReactNode;
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
    variant?: 'default' | 'danger';
}

const DropdownItem: React.FC<DropdownItemProps> = ({
    icon,
    children,
    onClick,
    className='',
    variant='default'
}) => {
    const baseClasses = "flex items-center px-4 py-3 text-sm cursor-pointer transition-colors";
    const variantClasses = {
        default: "text-gray-700 hover:bg-gray-50",
        danger: "text-red-600 hover:bg-red-50"
    };
  return (
    <div className={`${baseClasses} ${variantClasses[variant]} ${className}`} onClick={onClick}>
      {icon && (
        <div className="mr-3 flex-shrink-0">
            {icon}
        </div>
      )}
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}

export default DropdownItem
