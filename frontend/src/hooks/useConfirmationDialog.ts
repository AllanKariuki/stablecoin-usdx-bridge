import { useState, useCallback } from 'react';
import type { DialogAction } from '../components/general/ConfirmationDialog';

export type DialogType = 'info' | 'warning' | 'error' | 'success';

export interface UseConfirmationDialogOptions {
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  onSecondary?: () => void;
}

interface DialogConfig {
  title: string;
  message: string;
  type?: DialogType;
  buttons?: any;
}

interface DialogState extends DialogConfig {
  type: DialogType;
}

export const useConfirmationDialog = (options: UseConfirmationDialogOptions = {}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [dialogState, setDialogState] = useState<DialogState>({
    title: '',
    message: '',
    type: 'warning',
    buttons: undefined
  });

  const open = useCallback((config: DialogConfig) => {
    setDialogState({
      ...dialogState,
      ...config,
      type: config.type || 'warning'
    });
    setIsOpen(true);
  }, [dialogState]);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsLoading(false);
  }, []);

  const handleAction = useCallback(async (action: DialogAction) => {
    if (action === 'confirm') {
      try {
        setIsLoading(true);
        await options.onConfirm?.();
        close();
      } catch (error) {
        console.error('Confirmation action failed:', error);
        setIsLoading(false);
      }
    } else if (action === 'cancel') {
      options.onCancel?.();
      close();
    } else if (action === 'secondary') {
      options.onSecondary?.();
      close();
    }
  }, [options, close]);

  return {
    isOpen,
    open,
    close,
    handleAction,
    isLoading,
    ...dialogState
  };
};