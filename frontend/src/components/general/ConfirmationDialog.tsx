import React, { useCallback } from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type DialogType = 'info' | 'warning' | 'error' | 'success';
export type DialogAction = 'confirm' | 'cancel' | 'secondary';

export interface DialogButton {
  label: string;
  action: DialogAction;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
}

export interface ConfirmationDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  type?: DialogType;
  buttons?: DialogButton[];
  onAction: (action: DialogAction) => void;
  onClose?: () => void;
  icon?: React.ReactNode;
  showCloseButton?: boolean;
  isDismissible?: boolean;
}

const iconMap: Record<DialogType, React.ReactNode> = {
  info: <Info className="w-6 h-6 text-blue-500" />,
  warning: <AlertTriangle className="w-6 h-6 text-orange-500" />,
  error: <AlertCircle className="w-6 h-6 text-red-500" />,
  success: <CheckCircle className="w-6 h-6 text-green-500" />
};

// const colorMap: Record<DialogType, string> = {
//   info: 'bg-blue-50 border-blue-200',
//   warning: 'bg-orange-50 border-orange-200',
//   error: 'bg-red-50 border-red-200',
//   success: 'bg-green-50 border-green-200'
// };

const defaultButtons: Record<DialogType, DialogButton[]> = {
  info: [
    { label: 'OK', action: 'confirm', variant: 'primary' }
  ],
  warning: [
    { label: 'Cancel', action: 'cancel', variant: 'secondary' },
    { label: 'Continue', action: 'confirm', variant: 'primary' }
  ],
  error: [
    { label: 'Close', action: 'cancel', variant: 'primary' }
  ],
  success: [
    { label: 'OK', action: 'confirm', variant: 'primary' }
  ]
};

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  title,
  message,
  type = 'info',
  buttons = defaultButtons[type],
  onAction,
  onClose,
  icon,
  showCloseButton = true,
  isDismissible = true
}) => {
  const handleBackdropClick = useCallback(() => {
    if (isDismissible) {
      onClose?.();
    }
  }, [isDismissible, onClose]);

  const handleAction = useCallback((action: DialogAction) => {
    onAction(action);
  }, [onAction]);

  const getButtonClasses = (variant?: string) => {
    const baseClasses = 'px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
    
    switch (variant) {
      case 'primary':
        return `${baseClasses} bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500`;
      case 'danger':
        return `${baseClasses} bg-red-600 text-white hover:bg-red-700 focus:ring-red-500`;
      case 'secondary':
        return `${baseClasses} bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500`;
      default:
        return `${baseClasses} bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500`;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative bg-white rounded-xl shadow-lg border border-gray-200 max-w-md w-full mx-4 p-6 z-50 animate-in fade-in zoom-in-95 duration-200">
        {/* Close Button */}
        {showCloseButton && (
          <button
            onClick={() => onClose?.()}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="flex-shrink-0">
            {icon || iconMap[type]}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          </div>
        </div>

        {/* Message */}
        <p className="text-gray-600 mb-6 leading-relaxed">{message}</p>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          {buttons.map((button) => (
            <button
              key={button.action}
              onClick={() => handleAction(button.action)}
              disabled={button.loading}
              className={`${getButtonClasses(button.variant)} disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
            >
              {button.loading && (
                <div className="w-4 h-4 border-2 border-transparent border-t-current rounded-full animate-spin" />
              )}
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConfirmationDialog;