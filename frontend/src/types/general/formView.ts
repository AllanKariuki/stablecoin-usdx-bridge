export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'radio' | 'file';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  className?: string;
  description?: string;
}

export interface FormSection {
  title: string;
  description?: string;
  fields: FormField[];
  // New properties for dynamic sections
  isDynamic?: boolean;
  arrayPath?: string; // e.g., "restrictions" for waypoint restrictions
  isObject?: boolean;
  objectPath?: string;
  canAddMore?: boolean;
  canRemove?: boolean;
  minItems?: number;
  maxItems?: number;
  addButtonLabel?: string;
  removeButtonLabel?: string;
}

export interface FormViewProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  breadcrumbs: Array<{
    label: string;
    path?: string;
  }>;
  sections: FormSection[];
  initialData?: Record<string, any>;
  onSubmit: (data: Record<string, any>) => void;
  onCancel?: () => void;
  loading?: boolean;
  error?: string | null;
  submitLabel?: string;
  cancelLabel?: string;
}