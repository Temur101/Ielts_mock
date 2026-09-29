/**
 * Universal CD-IELTS Text Selection Highlighter Service
 * Supports highlighting any text across Passages, Questions, Options, Notes, and Audio parts.
 */

/**
 * Applies a highlight color to the current window selection within an allowed container.
 * @param {'yellow' | 'green' | 'pink'} color 
 * @param {HTMLElement} container 
 * @returns {boolean} Whether a highlight was successfully applied
 */
export function applyHighlightToSelection(color = 'yellow', container = null) {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return false;

  const range = selection.getRangeAt(0);
  if (!range || range.collapsed) return false;

  // Check that the selection is inside the allowed container (if provided)
  if (container && !container.contains(range.commonAncestorContainer)) {
    // Check if at least start or end is inside
    if (!container.contains(range.startContainer) && !container.contains(range.endContainer)) {
      return false;
    }
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) return false;

  const span = document.createElement('span');
  span.className = `highlight-${color}`;

  try {
    range.surroundContents(span);
    selection.removeAllRanges();
    return true;
  } catch (err) {
    try {
      const extracted = range.extractContents();
      span.appendChild(extracted);
      range.insertNode(span);
      selection.removeAllRanges();
      return true;
    } catch (e) {
      console.warn("Could not wrap cross-boundary highlight selection:", e);
      return false;
    }
  }
}

/**
 * Removes highlights covering the current selection
 * @param {HTMLElement} container 
 * @returns {boolean}
 */
export function removeHighlightFromSelection(container = null) {
  if (typeof window === 'undefined') return false;
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return false;

  const range = selection.getRangeAt(0);
  let node = range.commonAncestorContainer;
  if (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  // Find closest highlight span
  const highlightSpan = node ? node.closest('.highlight-yellow, .highlight-green, .highlight-pink') : null;
  if (highlightSpan && (!container || container.contains(highlightSpan))) {
    const parent = highlightSpan.parentNode;
    while (highlightSpan.firstChild) {
      parent.insertBefore(highlightSpan.firstChild, highlightSpan);
    }
    parent.removeChild(highlightSpan);
    selection.removeAllRanges();
    return true;
  }

  // If multiple highlights intersect selection
  if (container) {
    const highlighted = container.querySelectorAll('.highlight-yellow, .highlight-green, .highlight-pink');
    let removedAny = false;
    highlighted.forEach(span => {
      if (selection.containsNode && selection.containsNode(span, true)) {
        const parent = span.parentNode;
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
        removedAny = true;
      }
    });
    if (removedAny) {
      selection.removeAllRanges();
      return true;
    }
  }

  return false;
}

/**
 * Clears all highlights inside a given container
 * @param {HTMLElement} container 
 * @returns {number} Count of removed highlights
 */
export function clearAllHighlights(container) {
  if (!container) return 0;
  const highlightedSpans = container.querySelectorAll('.highlight-yellow, .highlight-green, .highlight-pink');
  let count = 0;
  highlightedSpans.forEach(span => {
    const parent = span.parentNode;
    if (parent) {
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
      count++;
    }
  });
  return count;
}
