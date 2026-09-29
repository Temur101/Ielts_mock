import React from 'react';

export function Badge({
  children,
  variant = 'default', // 'brand' | 'success' | 'warning' | 'danger' | 'slate' | 'info'
  size = 'md',
  pulse = false,
  className = '',
}) {
  const sizeStyles = {
    sm: 'text-[10px] font-semibold px-2 py-0.5 rounded-full',
    md: 'text-xs font-semibold px-2.5 py-1 rounded-full',
    lg: 'text-sm font-semibold px-3 py-1.5 rounded-xl',
  };

  const variants = {
    brand: 'bg-slate-100 text-slate-900 border border-slate-300 font-bold',
    success: 'bg-emerald-50 text-emerald-700 border border-emerald-200/80',
    warning: 'bg-amber-50 text-amber-700 border border-amber-200/80',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    slate: 'bg-slate-100 text-slate-700 border border-slate-200',
    info: 'bg-sky-50 text-sky-700 border border-sky-200/80',
  };

  const dotColors = {
    brand: 'bg-slate-900',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    danger: 'bg-rose-500',
    slate: 'bg-slate-400',
    info: 'bg-sky-500',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${sizeStyles[size]} ${variants[variant]} ${className}`}>
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[variant]}`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${dotColors[variant]}`} />
        </span>
      )}
      {children}
    </span>
  );
}
