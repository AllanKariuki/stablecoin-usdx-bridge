import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface QuickActionButtonProps {
  icon: LucideIcon;
  label: string;
  color: string;
  onClick: () => void;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({ 
  icon: Icon, 
  label, 
  color, 
  onClick 
}) => {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col space-y-1 text-sm hover:shadow-lg items-center justify-center gap-2 py-7 cursor-pointer
         px-4 rounded-full font-semibold text-white ${color} hover:opacity-90 transition-opacity shadow-sm`}
      aria-label={label}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
};

export default QuickActionButton;
