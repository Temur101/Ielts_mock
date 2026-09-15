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

export function PassageViewer({ 
  passages = [], 
  activePassageId, 
  onSelectPassage,
  pdfUrl,
  pdfName
}) {
  const [activeHighlightColor, setActiveHighlightColor] = useState('yellow'); // 'yellow' | 'green' | 'pink'
  const [fontSize, setFontSize] = useState('text-sm'); // 'text-xs' | 'text-sm' | 'text-base'
  const [highlightCount, setHighlightCount] = useState(0);
  const [viewMode, setViewMode] = useState('text'); // default to formatted 'text'
  const passageContainerRef = useRef(null);

  // Keep viewMode as text by default, student can toggle to PDF mode if desired
  React.useEffect(() => {
    // If no text content is available at all and pdf is available, fallback to pdf
    const hasText = passages && passages.some(p => p.content && p.content.trim().length > 0);
    if (!hasText && pdfUrl) {
      setViewMode('pdf');
    }
  }, [pdfUrl, activePassageId]);

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

  const passageContent = currentPassage.content || '';
  const paragraphs = passageContent.includes('\n\n') 
    ? passageContent.split('\n\n').filter(Boolean)
    : passageContent.includes('\n')
    ? passageContent.split('\n').filter(Boolean)
    : [passageContent];

  return (
    <div className="h-full flex flex-col bg-white border-r border-slate-200">
      
      {/* Passage Tab Bar & Tools Header */}
      <div className="p-3 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-2">
        
        {/* Left: Passage Switcher */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          {safePassages.map((p) => {
            const isActive = p.id === activePassageId;
            const qRange = p.id === 1 ? '1–13' : p.id === 2 ? '14–26' : '27–40';
            return (
              <button
                key={p.id}
                onClick={() => onSelectPassage(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                Passage {p.id} <span className="opacity-80 font-normal">({qRange})</span>
              </button>
            );
          })}
        </div>

        {/* Center: Dual Text / PDF View Switcher (if PDF available) */}
        {pdfUrl && (
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
            <button
              onClick={() => setViewMode('text')}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === 'text' 
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20' 
                  : 'text-slate-600 hover:text-brand-600 hover:bg-white/60'
              }`}
            >
              Text Mode
            </button>
            <button
              onClick={() => setViewMode('pdf')}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === 'pdf' 
                  ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20' 
                  : 'text-slate-600 hover:text-brand-600 hover:bg-white/60'
              }`}
            >
              PDF Document Mode
            </button>
          </div>
        )}

        {/* Right: Highlighting Toolbar & Font Sizer */}
        <div className="flex items-center gap-2">
          
          {/* Highlighter Color Buttons */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => handleHighlightSelection('yellow')}
              className="w-6 h-6 rounded-md bg-yellow-200 hover:bg-yellow-300 border border-yellow-400/50 flex items-center justify-center transition"
              title="Highlight Yellow"
            >
              <Highlighter className="w-3.5 h-3.5 text-yellow-800" />
            </button>
            <button
              onClick={() => handleHighlightSelection('green')}
              className="w-6 h-6 rounded-md bg-green-200 hover:bg-green-300 border border-green-400/50 flex items-center justify-center transition"
              title="Highlight Mint Green"
            >
              <Highlighter className="w-3.5 h-3.5 text-green-800" />
            </button>
            <button
              onClick={() => handleHighlightSelection('pink')}
              className="w-6 h-6 rounded-md bg-pink-200 hover:bg-pink-300 border border-pink-400/50 flex items-center justify-center transition"
              title="Highlight Pink"
            >
              <Highlighter className="w-3.5 h-3.5 text-pink-800" />
            </button>
            {highlightCount > 0 && (
              <button
                onClick={handleClearHighlights}
                className="p-1 text-slate-400 hover:text-rose-500 rounded transition"
                title="Clear All Highlights"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Font Size Adjuster */}
          <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 text-slate-600">
            <button
              onClick={() => setFontSize('text-xs')}
              className={`px-2 py-0.5 text-xs font-bold rounded ${fontSize === 'text-xs' ? 'bg-slate-100 text-brand-600' : ''}`}
              title="Small Text"
            >
              A-
            </button>
            <button
              onClick={() => setFontSize('text-sm')}
              className={`px-2 py-0.5 text-xs font-bold rounded ${fontSize === 'text-sm' ? 'bg-slate-100 text-brand-600' : ''}`}
              title="Medium Text"
            >
              A
            </button>
            <button
              onClick={() => setFontSize('text-base')}
              className={`px-2 py-0.5 text-xs font-bold rounded ${fontSize === 'text-base' ? 'bg-slate-100 text-brand-600' : ''}`}
              title="Large Text"
            >
              A+
            </button>
          </div>

        </div>

      </div>

      {/* Main Area: Either Embedded PDF or Formatted Extracted Passage */}
      {viewMode === 'pdf' && pdfUrl ? (
        <div className="flex-1 w-full h-full bg-white overflow-hidden">
          <iframe
            src={pdfUrl}
            title={pdfName || "Reading PDF Booklet"}
            className="w-full h-full border-0"
          />
        </div>
      ) : (
        <div 
          ref={passageContainerRef}
          className="flex-1 p-6 sm:p-8 overflow-y-auto space-y-4 select-text leading-relaxed font-serif text-slate-800"
        >
          {/* Title & Header */}
          <div className="border-b border-slate-200 pb-4 space-y-1 font-sans">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold text-brand-600 uppercase tracking-wider">
                IELTS Academic Reading
              </span>
              <span className="flex items-center gap-1 font-mono text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                {currentPassage.reading_time || '20 mins'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight font-sans">
              {currentPassage.title}
            </h2>
            {currentPassage.subtitle && (
              <p className="text-xs text-slate-500 font-sans italic">
                {currentPassage.subtitle}
              </p>
            )}
          </div>

          {/* Paragraphs */}
          <div className={`space-y-4 ${fontSize}`}>
            {paragraphs.map((paragraph, index) => (
              <div key={index} className="flex items-start gap-3">
                <span className="font-mono text-[11px] font-bold text-slate-400 pt-0.5 select-none w-4 shrink-0">
                  P{index + 1}
                </span>
                <p className="flex-1 text-justify whitespace-pre-line">
                  {paragraph}
                </p>
              </div>
            ))}
          </div>

          {/* Bottom helper tip */}
          <div className="mt-8 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center font-sans text-xs text-slate-400">
            Tip: Select any text on this page and click a color highlighter in the toolbar above to mark important clues.
          </div>
        </div>
      )}

    </div>
  );
}
