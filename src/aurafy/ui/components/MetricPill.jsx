import React from 'react';

/**
 * MetricPill - Small pill UI for displaying metrics
 * @param {Object} props
 * @param {string} props.label - Metric label
 * @param {string|number} props.value - Metric value
 * @param {string} props.variant - Visual variant ('primary', 'secondary', 'success', 'warning')
 * @param {string} props.className - Additional CSS classes
 */
const MetricPill = ({ label, value, variant = 'primary', className = '' }) => {
  const variantClasses = {
    primary: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    secondary: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    success: 'bg-green-500/20 text-green-300 border-green-500/30',
    warning: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
  };

  return (
    <div className={`inline-flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg border ${variantClasses[variant]} ${className}`}>
      <span className="text-xs font-medium text-center">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
};

export default MetricPill;
