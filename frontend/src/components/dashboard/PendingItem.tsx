import React from 'react';
import { AlertCircle, Bell, XCircle } from 'lucide-react';

interface PendingItemProps {
  type: 'warning' | 'info' | 'error';
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

const PendingItem: React.FC<PendingItemProps> = ({ 
  type, 
  title, 
  description, 
  action 
}) => {
  const config = {
    warning: { icon: AlertCircle, bg: 'bg-yellow-100', color: 'text-yellow-600' },
    info: { icon: Bell, bg: 'bg-blue-100', color: 'text-blue-600' },
    error: { icon: XCircle, bg: 'bg-red-100', color: 'text-red-600' }
  };

  const Icon = config[type].icon;

  return (
    <div className={`p-4 rounded-lg hover:shadow-md ${config[type]} shadow-sm`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${config[type].color} flex-shrink-0 mt-0.5`} />
        <div className="flex-1">
          <div className="font-semibold text-gray-900 mb-1">{title}</div>
          <div className="text-sm text-gray-600 mb-2">{description}</div>
          {action && (
            <button
              onClick={action.onClick}
              className={`text-sm font-semibold cursor-pointer ${config[type].color} hover:underline`}
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PendingItem;
