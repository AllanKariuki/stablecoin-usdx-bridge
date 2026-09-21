/**
 * TransactionStepper Component
 * Step indicator for conversion transaction flow
 */

import { Check } from 'lucide-react';

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

interface Step {
  id: string;
  label: string;
  description?: string;
  status: StepStatus;
}

interface TransactionStepperProps {
  /** Steps to display */
  steps: Step[];
  /** Current active step ID */
  currentStep: string;
  /** Optional CSS class */
  className?: string;
  /** Orientation of stepper */
  orientation?: 'horizontal' | 'vertical';
}

/**
 * TransactionStepper - Visual progress indicator for multi-step conversion flow
 *
 * @example
 * ```tsx
 * <TransactionStepper
 *   steps={[
 *     { id: 'quote', label: 'Get Quote', status: 'completed' },
 *     { id: 'payment', label: 'Select Payment', status: 'active' },
 *     { id: 'confirm', label: 'Confirm', status: 'pending' }
 *   ]}
 *   currentStep="payment"
 * />
 * ```
 */
export function TransactionStepper({
  steps,
  currentStep,
  className = '',
  orientation = 'horizontal',
}: TransactionStepperProps) {
  const getStepColor = (status: StepStatus) => {
    switch (status) {
      case 'completed':
        return 'bg-green-600';
      case 'active':
        return 'bg-blue-600';
      case 'error':
        return 'bg-red-600';
      default:
        return 'bg-gray-300';
    }
  };

  const getConnectorColor = (stepStatus: StepStatus) => {
    if (stepStatus === 'completed') return 'bg-green-600';
    if (stepStatus === 'active') return 'bg-blue-600';
    return 'bg-gray-300';
  };

  if (orientation === 'vertical') {
    return (
      <div className={`${className}`}>
        {steps.map((step, index) => (
          <div key={step.id} className="flex gap-4 pb-8 last:pb-0">
            {/* Timeline circle */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getStepColor(
                  step.status
                )}`}
              >
                {step.status === 'completed' ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`w-0.5 h-12 mt-2 ${getConnectorColor(steps[index + 1].status)}`} />
              )}
            </div>

            {/* Step content */}
            <div className="flex-1 pt-1">
              <h4
                className={`font-semibold ${
                  step.status === 'active' ? 'text-blue-600' : 'text-gray-900'
                }`}
              >
                {step.label}
              </h4>
              {step.description && <p className="text-sm text-gray-600 mt-1">{step.description}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Horizontal orientation
  return (
    <div className={`${className}`}>
      <div className="flex items-center">
        {steps.map((step, index) => (
          <div key={step.id} className="flex-1">
            {/* Step circle and content */}
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${getStepColor(
                  step.status
                )}`}
              >
                {step.status === 'completed' ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <p className="text-xs font-semibold text-gray-900 mt-2 text-center">{step.label}</p>
              {step.description && (
                <p className="text-xs text-gray-600 mt-1 text-center">{step.description}</p>
              )}
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-2 mt-5 ${getConnectorColor(step.status)}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
