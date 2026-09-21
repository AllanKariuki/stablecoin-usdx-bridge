import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit2, Trash2, Copy } from 'lucide-react';

export interface DetailSection {
  title: string;
  fields: Array<{
    label: string;
    value: any;
    type?: 'text' | 'email' | 'date' | 'badge' | 'list' | 'link' | 'custom';
    render?: (value: any) => React.ReactNode;
    className?: string;
  }>;
}

export interface DetailViewProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  breadcrumbs: Array<{
    label: string;
    path?: string;
  }>;
  sections: DetailSection[];
  actions?: Array<{
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'danger';
    disabled?: boolean;
  }>;
  onEdit?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  loading?: boolean;
  error?: string | null;
}

const DetailView: React.FC<DetailViewProps> = ({
  title,
  subtitle,
  icon,
  breadcrumbs,
  sections,
  actions = [],
  onEdit,
  onDelete,
  onDuplicate,
  loading = false,
  error = null
}) => {
  const navigate = useNavigate();

  const renderFieldValue = (field: DetailSection['fields'][0]) => {
    if (field.render) {
      return field.render(field.value);
    }

    switch (field.type) {
      case 'email':
        return (
          <a 
            href={`mailto:${field.value}`} 
            className="text-blue-600 hover:text-blue-800"
          >
            {field.value}
          </a>
        );
      
      case 'date':
        return field.value ? new Date(field.value).toLocaleDateString() : 'N/A';
      
      case 'badge':
        return (
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${field.className || 'bg-gray-100 text-gray-800'}`}>
            {field.value}
          </span>
        );
      
      case 'list':
        return Array.isArray(field.value) ? (
          <div className="space-y-1">
            {field.value.map((item, index) => (
              <div key={index} className="text-sm">
                {typeof item === 'object' ? JSON.stringify(item) : item}
              </div>
            ))}
          </div>
        ) : field.value;
      
      case 'link':
        return (
          <a 
            href={field.value} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-600 hover:text-blue-800"
          >
            {field.value}
          </a>
        );
      
      default:
        return field.value || 'N/A';
    }
  };

  const getActionVariantClasses = (variant: string = 'secondary') => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-600 text-white hover:bg-blue-700';
      case 'danger':
        return 'bg-red-600 text-white hover:bg-red-700';
      default:
        return 'bg-gray-200 text-gray-800 hover:bg-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="px-6 mt-5">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-lg border">
                <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="h-4 bg-gray-200 rounded"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 mt-5">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 mt-5">
      {/* Breadcrumbs */}
      <div className="mb-5 flex gap-2 overflow-x-hidden">
        {breadcrumbs.map((breadcrumb, index) => (
          <React.Fragment key={index}>
            {breadcrumb.path ? (
              <button
                className="text-gray-500 hover:cursor-pointer hover:text-gray-800"
                onClick={() => navigate(breadcrumb.path!)}
              >
                {breadcrumb.label}
              </button>
            ) : (
              <span className="text-gray-700 font-semibold">{breadcrumb.label}</span>
            )}
            {index < breadcrumbs.length - 1 && <span className="text-gray-500">/</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              {icon}
              <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
            </div>
            {subtitle && (
              <p className="text-gray-600 text-lg">{subtitle}</p>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {onEdit && (
              <button
                onClick={onEdit}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <Edit2 className="w-4 h-4" />
                Edit
              </button>
            )}
            
            {onDuplicate && (
              <button
                onClick={onDuplicate}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition"
              >
                <Copy className="w-4 h-4" />
                Duplicate
              </button>
            )}
            
            {onDelete && (
              <button
                onClick={onDelete}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}

            {/* Custom Actions */}
            {actions.map((action, index) => (
              <button
                key={index}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed ${getActionVariantClasses(action.variant)}`}
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Sections */}
      <div className="space-y-6">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
            </div>
            <div className="px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {section.fields.map((field, fieldIndex) => (
                  <div key={fieldIndex} className="space-y-1">
                    <label className="text-sm font-medium text-gray-500">
                      {field.label}
                    </label>
                    <div className="text-sm text-gray-900">
                      {renderFieldValue(field)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DetailView;
