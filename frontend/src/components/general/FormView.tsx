import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, X, Plus, Trash2 } from 'lucide-react';
import type { FormViewProps, FormSection, FormField } from '../../types/general/formView';

const FormView: React.FC<FormViewProps> = ({
  title,
  subtitle,
  icon,
  breadcrumbs,
  sections,
  initialData = {},
  onSubmit,
  onCancel,
  loading = false,
  error = null,
  submitLabel = 'Save',
  cancelLabel = 'Cancel'
}) => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<Record<string, any>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  useEffect(() => {
    if (Object.keys(initialData).length > 0) {
      setFormData(initialData);
    }
    
  }, [initialData]);

  useEffect(() => {
    const newData = { ...formData };
    sections.forEach(section => {
    if (section.isObject && section.objectPath) {
      if (!getNestedValue(newData, section.objectPath)) {
        setNestedValue(newData, section.objectPath, {});
      }
    }
    if (section.isDynamic && section.arrayPath) {
      if (!getNestedValue(newData, section.arrayPath)) {
        setNestedValue(newData, section.arrayPath, []);
      }
    }
  });
  setFormData(newData);
  // eslint-disable-next-line
}, [sections]);


  const getNestedValue = (obj: any, path: string | undefined): any => {
    if (!path) return undefined;
    return path.split('.').reduce((current, key) => {
      if (current !== null && current !== undefined) {
        // Try to convert key to number for array access
        const idx = Number(key);
        if (Array.isArray(current) && !isNaN(idx)) {
          return current[idx];
        }
        if (typeof current === 'object') {
          return current[key];
        }
      }
      return undefined;
    }, obj);
  };

  // Helper function to set nested value
  const setNestedValue = (obj: any, path: string, value: any) => {
    const keys = path.split('.');
    const lastKey = keys.pop()!;
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);
    
    if (value === '' || value === null || value === undefined) {
      delete target[lastKey];
    } else {
      target[lastKey] = value;
    }
  };

  // Helper function to get array value at index
  const getArrayValue = (arrayPath: string, index: number, fieldName: string) => {
    const array = getNestedValue(formData, arrayPath) || [];
    return array[index]?.[fieldName] || '';
  };

  // Helper function to set array value at index
  const setArrayValue = (arrayPath: string, index: number, fieldName: string, value: any) => {
    const newData = { ...formData };
    const array = getNestedValue(newData, arrayPath) || [];
    
    // Ensure array has enough items
    while (array.length <= index) {
      array.push({});
    }
    
    if (value === '' || value === null || value === undefined) {
      delete array[index][fieldName];
      // Clean up empty objects
      if (Object.keys(array[index]).length === 0) {
        array.splice(index, 1);
      }
    } else {
      array[index][fieldName] = value;
    }
    
    setNestedValue(newData, arrayPath, array.length > 0 ? array : []);
    setFormData(newData);
  };

  const handleInputChange = (
    name: string, 
    value: any, 
    objectPath?: string,
    arrayPath?: string, 
    arrayIndex?: number
  ) => {
    if (arrayPath !== undefined && arrayIndex !== undefined) {
      setArrayValue(arrayPath, arrayIndex, name, value);
    } else if (objectPath) {
      const newData = { ...formData };
      setNestedValue(newData, `${objectPath}.${name}`, value);
      setFormData(newData);
    } else {
      const newData = { ...formData };
      setNestedValue(newData, name, value);
      setFormData(newData);
    }
    
    let errorKey = name;
    if (arrayPath !== undefined && arrayIndex !== undefined) {
      errorKey = `${arrayPath}.${arrayIndex}.${name}`;
    } else if (objectPath) {
      errorKey = `${objectPath}.${name}`;
    }
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  const validateField = (field: FormField, value: any): string => {
    if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      return `${field.label} is required`;
    }

    if (field.validation) {
      const { min, max, pattern, message } = field.validation;
      
      if (min !== undefined && value < min) {
        return message || `${field.label} must be at least ${min}`;
      }
      
      if (max !== undefined && value > max) {
        return message || `${field.label} must be no more than ${max}`;
      }
      
      if (pattern && typeof value === 'string' && !new RegExp(pattern).test(value)) {
        return message || `${field.label} format is invalid`;
      }
    }

    return '';
  };

  const addArrayItem = useCallback((arrayPath: string, section: FormSection) => {
    const array = getNestedValue(formData, arrayPath) || [];
    const currentCount = array.length;
    
    if (!section.maxItems || currentCount < section.maxItems) {
      const newData = { ...formData };
      const newArray = [...array, {}];
      setNestedValue(newData, arrayPath, newArray);
      setFormData(newData);
    }
  }, [formData]);

  const removeArrayItem = useCallback((arrayPath: string, index: number, section: FormSection) => {
    const array = getNestedValue(formData, arrayPath) || [];
    const currentCount = array.length;
    
    if (currentCount > (section.minItems || 0)) {
      const newData = { ...formData };
      const newArray = array.filter((_: any, i: number) => i !== index);
      setNestedValue(newData, arrayPath, newArray.length > 0 ? newArray : []);
      setFormData(newData);
      
      // Clear errors for the removed item
      const newErrors = { ...errors };
      section.fields.forEach(field => {
        delete newErrors[`${arrayPath}.${index}.${field.name}`];
      });
      setErrors(newErrors);
    }
  }, [formData, errors]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all fields
    const newErrors: Record<string, string> = {};
    
    sections.forEach(section => {
      if (section.isDynamic && section.arrayPath) {
        const array = getNestedValue(formData, section.arrayPath) || [];
        array.forEach((item: any, index: number) => {
          section.fields.forEach(field => {
            const value = item[field.name];
            const error = validateField(field, value);
            if (error) {
              newErrors[`${section.arrayPath}.${index}.${field.name}`] = error;
            }
          });
        });
      } else if (section.isObject && section.objectPath) {
        const obj = getNestedValue(formData, section.objectPath) || {};
        section.fields.forEach(field => {
          const value = obj[field.name];
          const error = validateField(field, value);
          if (error) {
            newErrors[`${section.objectPath}.${field.name}`] = error;
          }
        });
      } else {
        section.fields.forEach(field => {
          const value = getNestedValue(formData, field.name);
          const error = validateField(field, value);
          if (error) {
            newErrors[field.name] = error;
          }
        });
      }
    });

    setErrors(newErrors);

    // If no errors, submit the form
    if (Object.keys(newErrors).length === 0) {
      onSubmit(formData);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(-1);
    }
  };

  const renderField = (field: FormField, value: any, onChange: (value: any) => void, errorKey: string) => {
    const hasError = !!errors[errorKey];

    const baseInputClasses = `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
      hasError ? 'border-red-300' : 'border-gray-300'
    } ${field.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`;

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={`${baseInputClasses} resize-none h-24`}
            rows={3}
          />
        );

      case 'select':
        return (
          <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={field.disabled}
            className={baseInputClasses}
          >
            <option value="">{field.placeholder || 'Select an option'}</option>
            {field.options?.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              disabled={field.disabled}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label className="ml-2 text-sm text-gray-700">{field.label}</label>
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map(option => (
              <div key={option.value} className="flex items-center">
                <input
                  type="radio"
                  name={errorKey}
                  value={option.value}
                  checked={value === option.value}
                  onChange={(e) => onChange(e.target.value)}
                  disabled={field.disabled}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <label className="ml-2 text-sm text-gray-700">{option.label}</label>
              </div>
            ))}
          </div>
        );

      case 'file':
        return (
          <input
            type="file"
            onChange={(e) => onChange(e.target.files?.[0])}
            disabled={field.disabled}
            className={baseInputClasses}
          />
        );

      default:
        return (
          <input
            type={field.type}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={field.disabled}
            className={baseInputClasses}
          />
        );
    }
  };

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
        <div className="flex items-center gap-3 mb-2">
          {icon}
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        </div>
        {subtitle && (
          <p className="text-gray-600 text-lg">{subtitle}</p>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-8">
        {sections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
                  {section.description && (
                    <p className="text-sm text-gray-600 mt-1">{section.description}</p>
                  )}
                </div>
                {section.canAddMore && section.arrayPath && (
                  <button
                    type="button"
                    onClick={() => addArrayItem(section.arrayPath!, section)}
                    disabled={
                      typeof section.maxItems === 'number' &&
                      (getNestedValue(formData, section.arrayPath) || []).length >= section.maxItems
                    }
                    className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    {section.addButtonLabel || 'Add Item'}
                  </button>
                )}
              </div>
            </div>

            <div className="px-6 py-6">
              {section.isDynamic && section.arrayPath ? (
                // Render dynamic array items
                <>
                  {(getNestedValue(formData, section.arrayPath) || []).map((_item: any, itemIndex: number) => (
                    <div key={itemIndex} className="mb-6 last:mb-0">
                      {(getNestedValue(formData, section.arrayPath) || []).length > 1 && (
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-md font-medium text-gray-800">
                            {section.title} {itemIndex + 1}
                          </h4>
                          {section.canRemove && (getNestedValue(formData, section.arrayPath) || []).length > (section.minItems || 0) && (
                            <button
                              type="button"
                              onClick={() => removeArrayItem(section.arrayPath!, itemIndex, section)}
                              className="flex items-center gap-2 px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition"
                            >
                              <Trash2 className="w-4 h-4" />
                              {section.removeButtonLabel || 'Remove'}
                            </button>
                          )}
                        </div>
                      )}
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {section.fields.map((field, fieldIndex) => {
                          const value = getArrayValue(section.arrayPath!, itemIndex, field.name);
                          const errorKey = `${section.arrayPath}.${itemIndex}.${field.name}`;
                          
                          return (
                            <div key={fieldIndex} className={field.type === 'checkbox' || field.type === 'radio' ? 'col-span-full' : ''}>
                              {field.type !== 'checkbox' && (
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  {field.label}
                                  {field.required && <span className="text-red-500 ml-1">*</span>}
                                </label>
                              )}
                              
                              {renderField(
                                field, 
                                value,
                                (newValue) => handleInputChange(field.name, newValue, undefined, section.arrayPath, itemIndex),
                                errorKey
                              )}
                              
                              {field.description && (
                                <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                              )}
                              
                              {errors[errorKey] && (
                                <p className="text-xs text-red-600 mt-1">{errors[errorKey]}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      
                      {itemIndex < (getNestedValue(formData, section.arrayPath) || []).length - 1 && (
                        <hr className="mt-6 border-gray-200" />
                      )}
                    </div>
                  ))}
                  
                  {(getNestedValue(formData, section.arrayPath) || []).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      <p>No {section.title.toLowerCase()} added yet.</p>
                      {section.canAddMore && (
                        <p className="text-sm mt-1">Click "{section.addButtonLabel || 'Add Item'}" to get started.</p>
                      )}
                    </div>
                  )}
                </>
              ) : section.isObject && section.objectPath ? (
                // Render object fields
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {section.fields.map((field, fieldIndex) => {
                    const object = getNestedValue(formData, section.objectPath) || {};
                    const value = object[field.name];
                    const errorKey = `${section.objectPath}.${field.name}`;
                    return (
                      <div key={fieldIndex} className={field.type === 'checkbox' || field.type === 'radio' ? 'col-span-full' : ''}>
                        {field.type !== 'checkbox' && (
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                        )}
                        {renderField(
                          field, 
                          value,
                          (newValue) => handleInputChange(field.name, newValue, section.objectPath),
                          errorKey
                        )}
                        {field.description && (
                          <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                        )}
                        {errors[errorKey] && (
                          <p className="text-xs text-red-600 mt-1">{errors[errorKey]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ): (
                // Render static fields
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {section.fields.map((field, fieldIndex) => {
                    const value = getNestedValue(formData, field.name);
                    const errorKey = field.name;
                    
                    return (
                      <div key={fieldIndex} className={field.type === 'checkbox' || field.type === 'radio' ? 'col-span-full' : ''}>
                        {field.type !== 'checkbox' && (
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            {field.label}
                            {field.required && <span className="text-red-500 ml-1">*</span>}
                          </label>
                        )}
                        
                        {renderField(
                          field,
                          value,
                          (newValue) => handleInputChange(field.name, newValue),
                          errorKey
                        )}
                        
                        {field.description && (
                          <p className="text-xs text-gray-500 mt-1">{field.description}</p>
                        )}
                        
                        {errors[errorKey] && (
                          <p className="text-xs text-red-600 mt-1">{errors[errorKey]}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Form Actions */}
        <div className="flex justify-end gap-4 py-6">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            {cancelLabel}
          </button>
          
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormView;