import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-2xl',
  showClose = true,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <div 
          className={`relative w-full ${maxWidth} transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-2xl border border-slate-200 transition-all`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{title}</h3>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            {showClose && onClose && (
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="mt-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
