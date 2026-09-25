import React, { useState, useRef } from 'react';
import { 
  Highlighter, 
  Trash2, 
  Type, 
  BookOpen, 
  Clock, 
  Check, 
  Sparkles 
} from 'lucide-react';

/**
 * Universal IELTS Passage Paragraph Parser:
 * Splits passage content into distinct paragraphs (A, B, C, D, E, F, G, H...)
 * even if the content is concatenated into a single unbroken wall of text without newlines,
 * or standard double newlines. Unlettered articles are preserved cleanly with label: null.
 */
function parsePassageIntoParagraphs(content) {
  if (!content || typeof content !== 'string') return [];
  const text = content.trim();
  if (!text) return [];

  // 1. Detect sequential lettered paragraph markers A, B, C, D, E, F, G, H...
  const candidateLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];
  const markers = [];
  let lastSearchPos = 0;

  for (let i = 0; i < candidateLetters.length; i++) {
    const letter = candidateLetters[i];
    const sub = text.slice(lastSearchPos);

    // Matches e.g.:
    // "A. In the...", "A  In the...", "Paragraph A: ...", "[A] In the...", "**A** ..."
    const p1 = (i === 0)
      ? new RegExp(`(?:^|[\\.\\!\\?]\\s+|[\\n\\r]+\\s*|\\b(?:Paragraph|Section)\\s+|\\[|\\s{2,})(?:\\*\\*)?(?:Paragraph\\s+|Section\\s+)?(?:[\\[\\(])?${letter}(?:[\\]\\)])?(?:\\*\\*)?[\\.\\:\\s\\-]+(?=[A-Z0-9"'\\u2018\\u201c])`, 'i')
      : new RegExp(`(?:[\\.\\!\\?]\\s+|[\\n\\r]+\\s*|\\b(?:Paragraph|Section)\\s+|\\[|\\s{2,})(?:\\*\\*)?(?:Paragraph\\s+|Section\\s+)?(?:[\\[\\(])?${letter}(?:[\\]\\)])?(?:\\*\\*)?[\\.\\:\\s\\-]+(?=[A-Z0-9"'\\u2018\\u201c])`, 'i');

    let m = sub.match(p1);

    // Fallback: standalone \b${letter}\b
    if (!m) {
      const p2 = (i === 0)
        ? new RegExp(`(?:^|[\\n\\r]+\\s*|\\b(?:Paragraph|Section)\\s+)\\b${letter}\\b[\\.\\:\\s\\-]+(?=[A-Z0-9"'\\u2018\\u201c])`, 'i')
        : new RegExp(`(?:[\\.\\!\\?]\\s+|[\\n\\r]+\\s*|\\b(?:Paragraph|Section)\\s+)\\b${letter}\\b[\\.\\:\\s\\-]+(?=[A-Z0-9"'\\u2018\\u201c])`, 'i');
      m = sub.match(p2);
    }

    if (!m) {
      const p3 = new RegExp(`(?:^|[\\n\\r]+\\s*|\\.\\s+)\\s*${letter}\\s+(?=[A-Z][a-z])`);
      m = sub.match(p3);
    }

    if (m && m.index !== undefined) {
      const letterMatch = m[0].match(new RegExp(`(?:Paragraph\\s+|Section\\s+)?(?:[\\[\\(])?${letter}(?:[\\]\\)])?`, 'i'));
      const letterOffset = letterMatch ? m[0].indexOf(letterMatch[0]) : 0;
      const markerStart = lastSearchPos + m.index + letterOffset;
      const markerEnd = lastSearchPos + m.index + m[0].length;

      markers.push({
        label: letter,
        start: markerStart,
        contentStart: markerEnd,
      });

      lastSearchPos = markerEnd + 15; // Minimum paragraph length
    } else {
      if (markers.length >= 3) {
        break;
      }
    }
  }

  // If we found at least 3 sequential lettered markers starting with A:
  if (markers.length >= 3 && markers[0].label === 'A') {
    const paragraphs = [];

    // Check if there was preamble text before paragraph A
    if (markers[0].start > 0) {
      const preamble = text.slice(0, markers[0].start).trim();
      if (preamble && preamble.length > 20 && !preamble.toLowerCase().startsWith('reading passage')) {
        paragraphs.push({
          label: null,
          content: preamble,
        });
      }
    }

    for (let i = 0; i < markers.length; i++) {
      const curr = markers[i];
      const next = markers[i + 1];
      const contentEnd = next ? next.start : text.length;
      const paraText = text.slice(curr.contentStart, contentEnd).trim();

      paragraphs.push({
        label: curr.label,
        content: paraText,
      });
    }
    return paragraphs;
  }

  // 2. Standard block splitting (double newlines or single newlines)
  const rawBlocks = text.includes('\n\n')
    ? text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean)
    : text.includes('\n')
    ? text.split(/\n/).map(s => s.trim()).filter(Boolean)
    : [text];

  return rawBlocks.map((block) => {
    // Only assign label if explicitly present at start of paragraph e.g. "A. Content" or "[A] Content"
    const prefixMatch = block.match(/^(?:\*\*)?(?:Paragraph\s+|Section\s+)?(?:[\[\(])?([A-Z])(?:[\]\)])?(?:\*\*)?[\.\:\s\-]+([\s\S]*)$/i);
    return {
      label: prefixMatch ? prefixMatch[1].toUpperCase() : null,
      content: prefixMatch ? prefixMatch[2].trim() : block,
    };
  });
}

export function PassageViewer({ 
  passages = [], 
  activePassageId, 
  onSelectPassage,
}) {
  const [fontSize, setFontSize] = useState('text-[15px]'); // 'text-[13px]' | 'text-[14px]' | 'text-[15px]' | 'text-[16.5px]'
  const [highlightCount, setHighlightCount] = useState(0);
  const passageContainerRef = useRef(null);

  const safePassages = passages && passages.length ? passages : [
    { id: 1, title: 'Passage 1', content: 'Reading text is loading...' },
    { id: 2, title: 'Passage 2', content: 'Reading text is loading...' },
    { id: 3, title: 'Passage 3', content: 'Reading text is loading...' },
  ];

  const currentPassage = safePassages.find(p => p.id === activePassageId) || safePassages[0] || {
    id: activePassageId,
    title: `Passage ${activePassageId}`,
    content: ''
  };

  // Text selection highlighter handler
  const handleHighlightSelection = (color) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    
    // Check if selection is within passage container
    if (passageContainerRef.current && passageContainerRef.current.contains(range.commonAncestorContainer)) {
      const span = document.createElement('span');
      span.className = `highlight-${color}`;
      
      try {
        range.surroundContents(span);
        selection.removeAllRanges();
        setHighlightCount(prev => prev + 1);
      } catch (err) {
        // Selection crosses node boundaries, wrap extracted contents
        const extracted = range.extractContents();
        span.appendChild(extracted);
        range.insertNode(span);
        selection.removeAllRanges();
        setHighlightCount(prev => prev + 1);
      }
    }
  };

  const handleClearHighlights = () => {
    if (!passageContainerRef.current) return;
    const highlightedSpans = passageContainerRef.current.querySelectorAll('.highlight-yellow, .highlight-green, .highlight-pink');
    highlightedSpans.forEach(span => {
      const parent = span.parentNode;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    });
    setHighlightCount(0);
  };

  const passageContent = 
    currentPassage.content || 
    currentPassage.passage_text || 
    currentPassage.passageText || 
    currentPassage.text || 
    '';
  
  // Universal paragraph resolution for ANY passage:
  let parsedParagraphs = [];

  // 1. If structured paragraphs array is provided with multiple items, use directly
  if (Array.isArray(currentPassage.paragraphs) && currentPassage.paragraphs.length > 1) {
    parsedParagraphs = currentPassage.paragraphs
      .map(p => ({
        label: p.label && String(p.label).trim() ? String(p.label).trim().toUpperCase() : null,
        content: (p.text || p.content || '').trim(),
      }))
      .filter(p => p.content);
  }

  // 2. If no valid array or single concatenated item, run universal parser on full text
  if (parsedParagraphs.length === 0) {
    let rawText = passageContent;
    if ((!rawText || rawText.length < 50) && Array.isArray(currentPassage.paragraphs) && currentPassage.paragraphs.length > 0) {
      rawText = currentPassage.paragraphs
        .map(p => (p.label ? `${p.label}. ` : '') + (p.text || p.content || ''))
        .join('\n\n');
    }
    parsedParagraphs = parsePassageIntoParagraphs(rawText);
  }

  return (
    <div className="h-full flex flex-col bg-white">
      
      {/* Ultra-Compact Passage Tab Bar & Tools Header (max-height: 42px) */}
      <div className="h-11 px-3 border-b border-slate-200 bg-slate-50/90 flex items-center justify-between gap-2 shrink-0">
        
        {/* Left: Compact Passage Switcher */}
        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-xs">
          {safePassages.map((p) => {
            const isActive = p.id === activePassageId;
            const rawRange = p.question_range || p.range || (p.startQ && p.endQ ? `${p.startQ}–${p.endQ}` : '');
            const qRange = rawRange ? String(rawRange).replace(/^Questions?\s*/i, '').trim() : '';
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPassage(p.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Passage {p.id} {qRange && <span className="opacity-75 font-normal text-[11px]">({qRange})</span>}
              </button>
            );
          })}
        </div>

        {/* Right: Highlighting Toolbar & Font Sizer */}
        <div className="flex items-center gap-1.5">
          
          {/* Highlighter Color Buttons */}
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => handleHighlightSelection('yellow')}
              className="w-5 h-5 rounded bg-yellow-200 hover:bg-yellow-300 border border-yellow-400/50 flex items-center justify-center transition cursor-pointer"
              title="Highlight Yellow"
            >
              <Highlighter className="w-3 h-3 text-yellow-800" />
            </button>
            <button
              type="button"
              onClick={() => handleHighlightSelection('green')}
              className="w-5 h-5 rounded bg-green-200 hover:bg-green-300 border border-green-400/50 flex items-center justify-center transition cursor-pointer"
              title="Highlight Mint Green"
            >
              <Highlighter className="w-3 h-3 text-green-800" />
            </button>
            <button
              type="button"
              onClick={() => handleHighlightSelection('pink')}
              className="w-5 h-5 rounded bg-pink-200 hover:bg-pink-300 border border-pink-400/50 flex items-center justify-center transition cursor-pointer"
              title="Highlight Pink"
            >
              <Highlighter className="w-3 h-3 text-pink-800" />
            </button>
            {highlightCount > 0 && (
              <button
                type="button"
                onClick={handleClearHighlights}
                className="p-0.5 text-slate-400 hover:text-rose-500 rounded transition cursor-pointer"
                title="Clear All Highlights"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Font Size Adjuster */}
          <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-200 text-slate-600 font-mono text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setFontSize('text-[13px]')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${fontSize === 'text-[13px]' ? 'bg-slate-100 text-brand-600 font-extrabold' : 'hover:text-slate-900'}`}
              title="Small Text"
            >
              A-
            </button>
            <button
              type="button"
              onClick={() => setFontSize('text-[14px]')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${fontSize === 'text-[14px]' ? 'bg-slate-100 text-brand-600 font-extrabold' : 'hover:text-slate-900'}`}
              title="Standard Text"
            >
              A
            </button>
            <button
              type="button"
              onClick={() => setFontSize('text-[15.5px]')}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${fontSize === 'text-[15.5px]' ? 'bg-slate-100 text-brand-600 font-extrabold' : 'hover:text-slate-900'}`}
              title="Large Text"
            >
              A+
            </button>
          </div>

        </div>

      </div>

      {/* Main Extracted Formatted Passage Body (Independent Vertical Scroll) */}
      <div 
        ref={passageContainerRef}
        className="flex-1 p-5 sm:p-6 overflow-y-auto select-text font-serif text-slate-900"
      >
        {/* Compact Title & Header */}
        <div className="border-b border-slate-200 pb-3 mb-4 font-sans">
          <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
            <span className="font-bold text-brand-600 uppercase tracking-wider">
              Reading Passage {activePassageId}
            </span>
            <span className="flex items-center gap-1 font-mono text-slate-400 text-[11px]">
              <Clock className="w-3 h-3" />
              {currentPassage.reading_time || '20 mins'}
            </span>
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
            {currentPassage.title}
          </h2>
          {currentPassage.subtitle && (
            <p className="text-xs text-slate-500 italic mt-0.5">
              {currentPassage.subtitle}
            </p>
          )}
        </div>

        {/* Distinct Paragraphs with Bold Indicators and Clear Vertical Separation */}
        {parsedParagraphs.length > 0 ? (
          <div>
            {parsedParagraphs.map((para, pIdx) => (
              <p
                key={para.label || pIdx}
                className={`mb-5 leading-relaxed text-slate-800 text-justify ${fontSize || 'text-[15px]'}`}
              >
                {para.label && (
                  <strong className="font-extrabold text-slate-900 text-base mr-2 select-none">
                    {para.label}
                  </strong>
                )}
                {para.content}
              </p>
            ))}
          </div>
        ) : (
          <div className={`leading-relaxed text-slate-800 whitespace-pre-line text-justify ${fontSize || 'text-[15px]'}`}>
            {passageContent || (
              <p className="text-slate-400 italic text-center py-8">
                Reading passage content will appear here once the exam is loaded.
              </p>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
