import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Highlighter, X } from 'lucide-react';
import { applyHighlightToSelection, removeHighlightFromSelection } from '../../lib/highlighterService';

/**
 * Universal CD-IELTS Floating Selection Highlighter Popover
 * Automatically appears above any selected text in Reading or Listening,
 * allowing instant 1-click highlighting with Yellow, Green, Pink or Clear.
 */
export function SelectionHighlightPopover({ containerRef, onHighlightChanged }) {
  const [position, setPosition] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
  const popoverRef = useRef(null);

  const checkSelection = useCallback(() => {
    if (typeof window === 'undefined') return;
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      setPosition(null);
      setHasSelection(false);
      return;
    }

    const text = selection.toString().trim();
    if (!text || text.length === 0) {
      setPosition(null);
      setHasSelection(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const container = containerRef?.current;

    // Check if selection is inside container
    if (container) {
      const isInside = 
        container.contains(range.commonAncestorContainer) || 
        container.contains(range.startContainer) || 
        container.contains(range.endContainer);
      if (!isInside) {
        setPosition(null);
        setHasSelection(false);
        return;
      }
    }

    const rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setPosition(null);
      setHasSelection(false);
      return;
    }

    // Position popover floating directly above the selection center
    const top = Math.max(10, rect.top - 44);
    const left = Math.max(10, Math.min(window.innerWidth - 170, rect.left + rect.width / 2 - 80));

    setPosition({ top, left });
    setHasSelection(true);
  }, [containerRef]);

  useEffect(() => {
    const handleMouseUp = (e) => {
      // Don't close if clicking inside popover itself
      if (popoverRef.current && popoverRef.current.contains(e.target)) {
        return;
      }
      setTimeout(checkSelection, 20);
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Shift' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setTimeout(checkSelection, 20);
      } else if (e.key === 'Escape') {
        setPosition(null);
        setHasSelection(false);
      }
    };

    const handleScrollOrResize = () => {
      // Reposition or hide on scroll
      checkSelection();
    };

    const targetContainer = containerRef?.current || document;
    targetContainer.addEventListener('mouseup', handleMouseUp);
    targetContainer.addEventListener('touchend', handleMouseUp);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      targetContainer.removeEventListener('mouseup', handleMouseUp);
      targetContainer.removeEventListener('touchend', handleMouseUp);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [containerRef, checkSelection]);

  const handleColorClick = (color) => {
    const container = containerRef?.current || null;
    const ok = applyHighlightToSelection(color, container);
    if (ok && onHighlightChanged) onHighlightChanged();
    setPosition(null);
    setHasSelection(false);
  };

  const handleClearClick = () => {
    const container = containerRef?.current || null;
    const ok = removeHighlightFromSelection(container);
    if (ok && onHighlightChanged) onHighlightChanged();
    setPosition(null);
    setHasSelection(false);
  };

  if (!hasSelection || !position || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 9999,
      }}
      className="flex items-center gap-1 bg-slate-900/95 backdrop-blur-md px-2 py-1.5 rounded-full shadow-2xl border border-slate-700 animate-in fade-in zoom-in-95 duration-150 select-none"
    >
      <div className="flex items-center gap-1.5 px-1 text-slate-300">
        <Highlighter className="w-3.5 h-3.5 text-slate-400" />
      </div>

      {/* Yellow Button */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          handleColorClick('yellow');
        }}
        className="w-6 h-6 rounded-full bg-yellow-200 hover:bg-yellow-300 border border-yellow-400 flex items-center justify-center transition hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
        title="Highlight Yellow"
      />

      {/* Green Button */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          handleColorClick('green');
        }}
        className="w-6 h-6 rounded-full bg-green-200 hover:bg-green-300 border border-green-400 flex items-center justify-center transition hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
        title="Highlight Mint Green"
      />

      {/* Pink Button */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          handleColorClick('pink');
        }}
        className="w-6 h-6 rounded-full bg-pink-200 hover:bg-pink-300 border border-pink-400 flex items-center justify-center transition hover:scale-110 active:scale-95 cursor-pointer shadow-xs"
        title="Highlight Pink"
      />

      <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

      {/* Remove Button */}
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          handleClearClick();
        }}
        className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition hover:scale-110 active:scale-95 cursor-pointer"
        title="Remove highlight"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>,
    document.body
  );
}
