import React, { useEffect, useRef, useState } from 'react'

interface DropdownProps {
    trigger: React.ReactNode;
    children: React.ReactNode;
    align?: 'left' | 'right' | 'auto';
    className?: string;
}

const Dropdown: React.FC<DropdownProps> = ({ trigger, children, align = 'auto', className=''}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState({ horizontal: 'left', vertical: 'bottom' });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const calculatePosition = React.useCallback(() => {
        if (!dropdownRef.current || align !== 'auto') return;

        const rect = dropdownRef.current.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const dropdownWidth = 256; // w-64 = 16rem = 256px
        const dropdownHeight = 200; // Estimated height

        // Calculate horizontal position
        let horizontal = 'left';
        if (rect.right + dropdownWidth > viewportWidth) {
            horizontal = 'right';
        }

        // Calculate vertical position
        let vertical = 'bottom';
        if (rect.bottom + dropdownHeight > viewportHeight && rect.top > dropdownHeight) {
            vertical = 'top';
        }

        setPosition({ horizontal, vertical });
     }, [align]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        const handleScroll = () => {
            if (isOpen && align === 'auto') {
                calculatePosition();
            }
        };

        const handleResize = () => {
            if (isOpen && align === 'auto') {
                calculatePosition();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        
        if (align === 'auto') {
            window.addEventListener('scroll', handleScroll, true);
            window.addEventListener('resize', handleResize);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            if (align === 'auto') {
                window.removeEventListener('scroll', handleScroll, true);
                window.removeEventListener('resize', handleResize);
            }
        };
     }, [calculatePosition, isOpen, align]);

     const handleTriggerClick = () => {
        setIsOpen(!isOpen);
        if (!isOpen) {
            // Calculate position when opening
            setTimeout(calculatePosition, 0);
        }
     };

     const getPositionClasses = () => {
        if (align === 'auto') {
            return ''; // Fixed positioning uses inline styles
        }
        
        return `top-full mt-2 ${align === 'right' ? 'right-0' : 'left-0'}`;
     };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
        <div className="cursor-pointer" onClick={handleTriggerClick}>
            {trigger}
        </div>

        {isOpen && (
            <div 
                ref={contentRef}
                className={`
                    ${align === 'auto' ? 'fixed' : 'absolute'} w-64 bg-white rounded-lg shadow-xl 
                    border border-gray-200 z-[9999]
                    ${align === 'auto' ? '' : getPositionClasses()}
                `}
                style={align === 'auto' ? {
                    left: position.horizontal === 'right' 
                        ? `${
                            dropdownRef.current
                                ? dropdownRef.current.getBoundingClientRect().right - 256
                                : 0
                          }px`
                        : `${
                            dropdownRef.current
                                ? dropdownRef.current.getBoundingClientRect().left
                                : 0
                          }px`,
                    top: position.vertical === 'top'
                        ? `${
                            dropdownRef.current
                                ? dropdownRef.current.getBoundingClientRect().top - 8
                                : 0
                          }px`
                        : `${
                            dropdownRef.current
                                ? dropdownRef.current.getBoundingClientRect().bottom + 8
                                : 0
                          }px`
                } : {}}
            >
                {children}
            </div>
        )}
    </div>
  )
}

export default Dropdown
