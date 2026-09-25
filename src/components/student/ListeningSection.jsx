import React, { useState, useRef, useEffect } from 'react';
import { 
  Headphones, 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Lock, 
  CheckCircle, 
  Flag, 
  AlertCircle,
  Clock,
  Radio,
  Check,
  FileText,
  BookOpen,
  Type,
  ListChecks,
  Layers,
  MapPin
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { IeltsBookletRenderer, FlowChartGapItem, MarkdownTable } from './IeltsBookletRenderer';
import { 
  groupQuestionsIntoSets, 
  normalizeTemplateGaps,
  cleanGapArtifacts,
  splitSentenceAtGap,
} from '../../lib/questionUtils';

/**
 * Deduplicates options in a reference box so each letter key appears strictly once.
 */
function deduplicateRefBox(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.filter(item => {
    if (!item) return false;
    const key = String(item.key || '').trim().toUpperCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Finds description hint for a chosen option in reference box.
 */
function getRefHint(val, refBox) {
  if (!val || !Array.isArray(refBox)) return null;
  const match = refBox.find(r => String(r.key).toUpperCase() === String(val).trim().toUpperCase());
  return match?.label || null;
}

/**
 * Renders a cohesive notes/summary template with inline {{N}} question input slots.
 */
function renderNotesTemplate(template, { answers, flagged, onAnswerChange, onToggleFlag, questionRefs, questions = [] }) {
  if (!template || typeof template !== 'string') return null;

  const cleanTemplate = normalizeTemplateGaps(template, questions);

  const lines = cleanTemplate.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  return (
    <div className="space-y-3 font-sans">
      {(() => {
        const blocks = [];
        let currentTableLines = [];

        for (const line of lines) {
          if (line.includes('|')) {
            currentTableLines.push(line);
          } else {
            if (currentTableLines.length > 0) {
              blocks.push({ type: 'table', content: currentTableLines.join('\n') });
              currentTableLines = [];
            }
            blocks.push({ type: 'line', content: line });
          }
        }
        if (currentTableLines.length > 0) {
          blocks.push({ type: 'table', content: currentTableLines.join('\n') });
        }

        return blocks.map((block, bIdx) => {
          if (block.type === 'table') {
            return (
              <MarkdownTable
                key={`tbl-${bIdx}`}
                tableContent={block.content}
                answers={answers}
                onAnswerChange={onAnswerChange}
                onToggleFlag={onToggleFlag}
                flagged={flagged}
                questionRefs={questionRefs}
                questions={questions}
              />
            );
          }

          const line = block.content;
          const isHeading = /^(?:#{1,4}\s+|\*\*(?:[^*]+)\*\*|[A-Z\s]{4,}:?$)/.test(line) && !line.includes('{{');
          if (isHeading) {
            const cleanHeading = line.replace(/^[#*\s]+|[#*\s]+$/g, '').replace(/:$/, '');
            return (
              <div key={bIdx} className="text-[13.5px] font-bold text-slate-900 border-b border-slate-300/70 pb-1 mt-4 mb-2">
                {cleanHeading}
              </div>
            );
          }

          const isBullet = /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line);
          const textContent = line.replace(/^[-*•]\s+/, '');
          const tokens = textContent.split(/(\{\{\d+\}\})/g);

          const content = tokens.map((token, tIdx) => {
            const m = token.match(/^\{\{(\d+)\}\}$/);
            if (m) {
              const qNum = Number(m[1]);
              const val = answers[qNum] || '';
              const isFlagged = flagged[qNum] || false;
              return (
                <span key={tIdx} className="inline-flex items-baseline mx-1">
                  <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                    {qNum}
                  </span>
                  <input
                    type="text"
                    ref={el => { if (el) questionRefs.current[qNum] = el; }}
                    value={val}
                    onChange={e => onAnswerChange(qNum, e.target.value)}
                    placeholder="..."
                    className="w-36 h-7 border-b-2 border-slate-400 bg-transparent text-center font-semibold text-sm outline-none focus:border-amber-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => onToggleFlag(qNum)}
                    className={`p-1 rounded cursor-pointer transition ml-0.5 ${
                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                    }`}
                    title={isFlagged ? 'Remove flag' : 'Flag'}
                  >
                    <Flag className="w-3 h-3" />
                  </button>
                </span>
              );
            }
            return <span key={tIdx}>{cleanGapArtifacts(token)}</span>;
          });

          if (isBullet) {
            return (
              <li key={bIdx} className="text-[13.5px] text-slate-800 list-disc ml-4 leading-loose">
                {content}
              </li>
            );
          }

          return (
            <p key={bIdx} className="text-[13.5px] text-slate-800 leading-loose mb-2">
              {content}
            </p>
          );
        });
      })()}
    </div>
  );
}

/**
 * Universally renders structured notes completion items (Part 1 and Part 4)
 * with complete support for context lines, subheadings, intermediate bullets, and gap questions.
 */
function renderStructuredNotes({
  items = [],
  answers,
  flagged,
  onAnswerChange,
  onToggleFlag,
  questionRefs,
}) {
  if (!items || items.length === 0) {
    return (
      <div className="p-4 text-center text-slate-400 text-sm italic">
        Notes for this section will appear here once loaded.
      </div>
    );
  }

  const hasSubheadings = items.some(it => Boolean(it.subheading && String(it.subheading).trim()));
  const secMap = [];

  if (hasSubheadings) {
    items.forEach(it => {
      const sub = (it.subheading && String(it.subheading).trim()) || 'Notes';
      let s = secMap.find(sec => sec.subheading.toLowerCase() === sub.toLowerCase());
      if (!s) {
        s = { subheading: sub, items: [] };
        secMap.push(s);
      }
      s.items.push(it);
    });
  } else {
    secMap.push({ subheading: '', items: items });
  }

  return (
    <div className="space-y-5">
      {secMap.map((sec, sIdx) => (
        <div key={sIdx} className="space-y-2">
          {sec.subheading && (
            <div className="text-[13.5px] font-extrabold uppercase tracking-wide text-slate-900 border-b border-slate-300 pb-1">
              {sec.subheading}
            </div>
          )}
          <ul className="space-y-2 pl-2">
            {sec.items.map((q, qIdx) => {
              const qNum = q.questionNumber || q.q_num;
              const isQuestion = Boolean(
                qNum &&
                (typeof qNum === 'number' || !isNaN(Number(qNum))) &&
                String(q.type || '').toLowerCase() !== 'context'
              );
              const val = isQuestion ? (answers[qNum] || '') : '';
              const isFlagged = isQuestion ? (flagged[qNum] || false) : false;
              const cBullets = q.context_bullets || q.bullets || [];

              return (
                <React.Fragment key={q.id || qNum || qIdx}>
                  {Array.isArray(cBullets) && cBullets.map((cb, cbIdx) => {
                    const bulletText = typeof cb === 'object' ? (cb.text || cb.prompt || '') : cb;
                    return (
                      <li key={cbIdx} className="text-[13px] text-slate-600 list-disc ml-4 leading-relaxed">
                        {cleanGapArtifacts(bulletText)}
                      </li>
                    );
                  })}

                  {!isQuestion ? (
                    <li className="text-[13px] text-slate-700 list-disc ml-4 leading-relaxed">
                      {cleanGapArtifacts(q.text || q.prompt || '')}
                    </li>
                  ) : (
                    <li
                      ref={el => (questionRefs.current[qNum] = el)}
                      className="text-[13.5px] text-slate-800 list-disc ml-4 leading-loose"
                    >
                      {(() => {
                        const rawItemText = q.text || q.prompt || '';
                        if (rawItemText.includes('{{') || (/\[(?:\#|\@)?(?:q_num|blank|\d+)\]|\@\[q_num\]|\[\s*\]/i.test(rawItemText))) {
                          const normLine = normalizeTemplateGaps(rawItemText, [q]);
                          const tokens = normLine.split(/(\{\{\d+\}\})/g);
                          return (
                            <span className="inline-flex items-baseline gap-1.5 flex-wrap leading-relaxed">
                              {tokens.map((tok, tIdx) => {
                                const m = tok.match(/^\{\{(\d+)\}\}$/);
                                if (m) {
                                  const targetQNum = Number(m[1]) || qNum;
                                  const slotVal = answers[targetQNum] || '';
                                  return (
                                    <span key={tIdx} className="inline-flex items-baseline mx-1">
                                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                                        {targetQNum}
                                      </span>
                                      <input
                                        type="text"
                                        ref={el => { if (el) questionRefs.current[targetQNum] = el; }}
                                        value={slotVal}
                                        onChange={e => onAnswerChange(targetQNum, e.target.value)}
                                        placeholder="..."
                                        className="w-36 h-7 border-b-2 border-slate-400 bg-transparent text-center font-semibold text-sm outline-none focus:border-amber-500 transition-colors"
                                      />
                                    </span>
                                  );
                                }
                                return <span key={tIdx}>{cleanGapArtifacts(tok)}</span>;
                              })}
                              <button
                                type="button"
                                onClick={() => onToggleFlag(qNum)}
                                className={`p-1 rounded cursor-pointer transition ml-1 ${
                                  isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                }`}
                                title={isFlagged ? 'Remove flag' : 'Flag'}
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            </span>
                          );
                        }

                        const { before, after } = splitSentenceAtGap(rawItemText);
                        return (
                          <span className="inline-flex items-baseline gap-1.5 flex-wrap leading-relaxed">
                            {before && <span>{before}</span>}
                            <span className="inline-flex items-baseline mx-1">
                              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center mr-1 select-none font-mono">
                                {qNum}
                              </span>
                              <input
                                type="text"
                                ref={el => { if (el) questionRefs.current[qNum] = el; }}
                                value={val}
                                onChange={e => onAnswerChange(qNum, e.target.value)}
                                placeholder="..."
                                className="w-36 h-7 border-b-2 border-slate-400 bg-transparent text-center font-semibold text-sm outline-none focus:border-amber-500 transition-colors"
                              />
                            </span>
                            {after && <span>{after}</span>}
                            <button
                              type="button"
                              onClick={() => onToggleFlag(qNum)}
                              className={`p-1 rounded cursor-pointer transition ml-1 ${
                                isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                              }`}
                              title={isFlagged ? 'Remove flag' : 'Flag'}
                            >
                              <Flag className="w-3 h-3" />
                            </button>
                          </span>
                        );
                      })()}
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Official Cambridge IELTS Listening Numbering Partition Logic (40 Qs across 4 Parts)
 */
export const resolveListeningPart = (q) => {
  if (!q) return 1;
  const p = q.partId ?? q.part ?? q.part_id ?? q.sectionId ?? q.section;
  if (p !== undefined && p !== null && !isNaN(Number(p)) && Number(p) > 0) {
    return Number(p);
  }
  const qNum = Number(q.questionNumber || q.q_num || 0);
  if (qNum > 0) {
    return Math.min(4, Math.max(1, Math.ceil(qNum / 10)));
  }
  return 1;
};

export function ListeningSection({
  exam,
  listeningData,
  student,
  answers = {},
  flagged = {},
  onAnswerChange,
  onToggleFlag,
}) {
  const currentExam = exam || {};
  const currentListening = exam?.listening || listeningData || {};
  const [viewMode, setViewMode] = useState('cards'); // 'cards' (native CD IELTS interactive view)
  
  const rawParts = currentListening.parts || [
    { partId: 1, title: 'Part 1: Social Dialogue', duration: '06:45' },
    { partId: 2, title: 'Part 2: Community Guide', duration: '07:15' },
    { partId: 3, title: 'Part 3: Academic Tutorial', duration: '07:50' },
    { partId: 4, title: 'Part 4: University Lecture', duration: '08:30' },
  ];

  // Audio parts mapping
  const audioUrls = currentExam.listening_audio_parts || {
    part1: rawParts[0]?.audio_url || 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
    part2: rawParts[1]?.audio_url || 'https://actions.google.com/sounds/v1/ambiences/park_ambience.ogg',
    part3: rawParts[2]?.audio_url || 'https://actions.google.com/sounds/v1/science/sonar_ping.ogg',
    part4: rawParts[3]?.audio_url || 'https://actions.google.com/sounds/v1/weather/wind_heavy.ogg',
  };

  const parts = rawParts.map((p, idx) => {
    const slotKey = `part${idx + 1}`;
    return {
      ...p,
      audio_url: audioUrls[slotKey] || p.audio_url
    };
  });

  const questions = (currentListening.questions && currentListening.questions.length > 0)
    ? currentListening.questions
    : (currentExam.listening_questions && currentExam.listening_questions.length > 0)
      ? currentExam.listening_questions
      : (currentExam.questions && currentExam.questions.length > 0)
        ? currentExam.questions
        : [];

  const audioSettings = currentListening.audio_settings || {
    lock_scrubbing: true,
    lock_rewind: true,
    single_play_enforcement: true,
  };
  const [activePartId, setActivePartId] = useState(1);
  const [playingPartId, setPlayingPartId] = useState(null);
  const [playedParts, setPlayedParts] = useState({});
  const [audioProgress, setAudioProgress] = useState({});

  const audioRefs = useRef({});
  const questionRefs = useRef({});

  const currentPart = parts.find(p => p.partId === activePartId) || parts[0];

  let partQuestions = questions.filter(q => resolveListeningPart(q) === Number(activePartId));

  // Deduplicate questions by questionNumber so each question number appears at most once
  const seenPartQNums = new Set();
  partQuestions = partQuestions.filter(q => {
    const num = Number(q.questionNumber || q.q_num);
    if (!num) return true;
    if (seenPartQNums.has(num)) return false;
    seenPartQNums.add(num);
    return true;
  });

  // Fallback questions so student never sees an empty screen
  if (partQuestions.length === 0) {
    const startQ = (Number(activePartId) - 1) * 10 + 1;
    partQuestions = Array.from({ length: 10 }, (_, i) => ({
      id: `q-${startQ + i}`,
      questionNumber: startQ + i,
      partId: Number(activePartId),
      type: 'FILL_BLANK',
      instruction: 'Listen to the audio recording and write your answer into the box below.',
      text: `Question ${startQ + i}: Complete the answer from the audio`,
      placeholder: `Type answer for Question ${startQ + i}...`
    }));
  }

  // Play / Pause handler with Single-Play and Scrub Enforcement
  const togglePlayAudio = (partId) => {
    const audio = audioRefs.current[partId];
    if (!audio) return;

    if (playingPartId === partId) {
      audio.pause();
      setPlayingPartId(null);
    } else {
      if (audioSettings.single_play_enforcement && playedParts[partId]) {
        alert("In accordance with IELTS Listening examination rules, audio tracks may only be played once.");
        return;
      }

      // Pause any other playing part
      if (playingPartId && audioRefs.current[playingPartId]) {
        audioRefs.current[playingPartId].pause();
      }

      audio.play().then(() => {
        setPlayingPartId(partId);
      }).catch(err => {
        console.warn("Audio play blocked:", err);
      });
    }
  };

  const handleTimeUpdate = (partId) => {
    const audio = audioRefs.current[partId];
    if (!audio) return;

    const current = audio.currentTime;
    const duration = audio.duration || 1;
    const pct = Math.round((current / duration) * 100);

    setAudioProgress(prev => ({
      ...prev,
      [partId]: { current, duration, pct }
    }));
  };

  const handleAudioEnded = (partId) => {
    setPlayingPartId(null);
    setPlayedParts(prev => ({ ...prev, [partId]: true }));
  };

  const formatAudioTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleLoadedMetadata = (partId, duration) => {
    if (duration && !isNaN(duration) && duration > 0) {
      setAudioProgress(prev => ({
        ...prev,
        [partId]: {
          ...(prev[partId] || { current: 0 }),
          duration: duration
        }
      }));
    }
  };

  const answeredInPart = partQuestions.filter(q => Boolean(answers[q.questionNumber]?.trim())).length;
  const totalAnsweredAll = questions.filter(q => Boolean(answers[q.questionNumber]?.trim())).length;

  const targetAudioPartId = playingPartId || activePartId;
  const targetPart = parts.find(p => p.partId === targetAudioPartId) || currentPart;

  return (
    <div className="h-full flex flex-col bg-white">
      
      {/* Persistent Audio Elements for all 4 parts (never unmounted on tab switch) */}
      <div className="hidden">
        {[1, 2, 3, 4].map(partNum => {
          const p = parts.find(item => item.partId === partNum);
          if (!p?.audio_url) return null;
          return (
            <audio
              key={partNum}
              ref={el => {
                if (el) audioRefs.current[partNum] = el;
              }}
              src={p.audio_url}
              onLoadedMetadata={(e) => handleLoadedMetadata(partNum, e.target.duration)}
              onTimeUpdate={() => handleTimeUpdate(partNum)}
              onEnded={() => handleAudioEnded(partNum)}
              preload="auto"
            />
          );
        })}
      </div>

      {/* Top Single Sleek Audio Controller Bar (Height: 48px max) */}
      <div className="h-12 px-3 sm:px-4 bg-white text-slate-900 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 z-10 shadow-xs">
        
        {/* Left: Part Tabs 1–4 */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          {[1, 2, 3, 4].map(partNum => {
            const isSelected = partNum === activePartId;
            const isDone = playedParts[partNum];
            const isPlaying = playingPartId === partNum;
            const partQs = questions.filter(q => resolveListeningPart(q) === partNum);
            const partQNums = partQs.map(q => Number(q.questionNumber || q.q_num)).filter(n => !isNaN(n) && n > 0);
            const qRange = partQNums.length > 0 ? `${Math.min(...partQNums)}–${Math.max(...partQNums)}` : '';

            return (
              <button
                key={partNum}
                type="button"
                onClick={() => setActivePartId(partNum)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  isSelected
                    ? 'bg-brand-500 text-white shadow-xs'
                    : isPlaying
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                }`}
              >
                <span>Part {partNum}</span>
                {qRange && <span className="text-[10px] opacity-75 font-normal">({qRange})</span>}
                {isPlaying && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                )}
                {isDone && !isPlaying && <Check className="w-3 h-3 text-emerald-600" />}
              </button>
            );
          })}
        </div>

        {/* Center/Right: Audio Play Action & Duration Tracker */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => togglePlayAudio(playingPartId ? playingPartId : activePartId)}
            className={`h-8 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
              playingPartId
                ? 'bg-amber-500 text-white shadow-xs hover:bg-amber-600'
                : playedParts[activePartId] && audioSettings.single_play_enforcement
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : 'bg-brand-500 hover:bg-brand-600 text-white shadow-xs'
            }`}
          >
            {playingPartId ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                <span>Pause (Part {playingPartId})</span>
              </>
            ) : playedParts[activePartId] && audioSettings.single_play_enforcement ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Part {activePartId} Locked</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Play Part {activePartId}</span>
              </>
            )}
          </button>

          {/* Time tracker */}
          <div className="text-[11px] font-mono font-bold text-slate-600 min-w-[75px] text-right">
            {formatAudioTime(audioProgress[targetAudioPartId]?.current || 0)} / {audioProgress[targetAudioPartId]?.duration ? formatAudioTime(audioProgress[targetAudioPartId]?.duration) : (targetPart.duration || "07:00")}
          </div>

          {/* Answered badge */}
          <div className="text-[11px] font-mono font-bold text-brand-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md hidden sm:block">
            {answeredInPart}/{partQuestions.length}
          </div>
        </div>

      </div>

      {/* Main Single Centered Exam Sheet (Independent Vertical Scroll) */}
      <div className="flex-1 overflow-y-auto bg-slate-100/70 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto bg-white p-8 sm:p-10 border border-slate-300 shadow-sm min-h-screen text-slate-900 my-4 space-y-8">
          
          {(() => {
            const partSec = Array.isArray(currentListening.sections)
              ? currentListening.sections.find((s) => s.part === activePartId)
              : null;
            const currentPartHtml = partSec?.page_content_html || currentPart?.page_content_html || '';

            // Extract reference box from part, section, or questions
            const rawRefBox = currentPart?.reference_box || 
                              currentPart?.referenceBox || 
                              partSec?.reference_box || 
                              partSec?.referenceBox ||
                              partQuestions.find(q => q.reference_box || q.referenceBox)?.reference_box ||
                              partQuestions.find(q => q.reference_box || q.referenceBox)?.referenceBox ||
                              null;

            const normalizedRefBox = (() => {
              if (!rawRefBox || !Array.isArray(rawRefBox)) return [];
              const rawList = rawRefBox.map((item, idx) => {
                if (typeof item === 'object' && item !== null) {
                  return {
                    key: String(item.key || String.fromCharCode(65 + idx)).trim().toUpperCase(),
                    label: String(item.label || item.text || item.value || '').trim(),
                  };
                }
                if (typeof item === 'string') {
                  const m = item.match(/^\[?([A-Z0-9ivxlcdm]+)\]?[\.\:\s\-]\s*(.*)$/i);
                  if (m) {
                    return { key: m[1].trim().toUpperCase(), label: m[2].trim() };
                  }
                  return { key: String.fromCharCode(65 + idx), label: item.trim() };
                }
                return { key: String.fromCharCode(65 + idx), label: String(item) };
              });
              return deduplicateRefBox(rawList);
            })();

            // Helper to get hint for a typed letter
            const getRefHint = (val, refBoxList) => {
              if (!val) return '';
              const rList = refBoxList && refBoxList.length > 0 ? refBoxList : normalizedRefBox;
              const found = rList.find(r => r.key.toUpperCase() === val.toUpperCase());
              return found ? found.label : '';
            };

            return (
              <>
                {/* Exam Sheet Header */}
                <div className="border-b-2 border-slate-300 pb-4">
                  <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                    <span className="font-extrabold uppercase tracking-widest text-amber-700 font-mono">
                      IELTS Listening Examination
                    </span>
                    <div className="flex items-center gap-2 font-mono">
                      {currentPartHtml && (
                        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-bold mr-2">
                          <button
                            type="button"
                            onClick={() => setViewMode('cards')}
                            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                              viewMode === 'cards' ? 'bg-brand-500 text-white shadow-xs' : 'text-slate-600 hover:text-brand-600'
                            }`}
                          >
                            Standard Sheet
                          </button>
                          <button
                            type="button"
                            onClick={() => setViewMode('booklet')}
                            className={`px-2 py-0.5 rounded transition-all cursor-pointer ${
                              viewMode === 'booklet' ? 'bg-brand-500 text-white shadow-xs' : 'text-slate-600 hover:text-brand-600'
                            }`}
                          >
                            Exact Booklet
                          </button>
                        </div>
                      )}
                      <span className="bg-slate-100 px-2.5 py-1 rounded text-slate-700 font-bold">
                        Part {activePartId} of 4 ({answeredInPart}/{partQuestions.length} Answered)
                      </span>
                    </div>
                  </div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight">
                    {currentPart?.title || `Listening Part ${activePartId}`}
                  </h2>
                </div>

                {/* Exact Cambridge Booklet View if requested */}
                {currentPartHtml && viewMode === 'booklet' ? (
                  <div className="border border-slate-200 rounded-lg p-5 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b pb-2 border-slate-200 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                      <span>Cambridge English • Listening Part {activePartId}</span>
                      <span className="font-mono text-brand-600">Questions {partQuestions[0]?.questionNumber || ((activePartId - 1) * 10 + 1)}–{partQuestions[partQuestions.length - 1]?.questionNumber || (activePartId * 10)}</span>
                    </div>
                    <IeltsBookletRenderer
                      htmlContent={currentPartHtml}
                      answers={answers}
                      onAnswerChange={onAnswerChange}
                      flagged={flagged}
                      questions={partQuestions}
                    />
                  </div>
                ) : (
                  /* =========================================================================
                     DYNAMIC CAMBRIDGE EXAMINATION BOOKLET RENDERER
                     ========================================================================= */
                  <div className="space-y-8 font-sans">
                    {(() => {
                      if (partQuestions.length === 0) {
                        return (
                          <div className="p-8 text-center text-slate-400 text-sm italic">
                            Questions for Part {activePartId} will appear here once the exam is loaded.
                          </div>
                        );
                      }

                      const questionGroups = groupQuestionsIntoSets(partQuestions, currentPart?.reference_box);
                      const renderedTemplateSignatures = new Set();

                      return questionGroups.map((group, gIdx) => {
                        const category = group.category;
                        const gqs = group.questions;
                        const firstQ = gqs[0];
                        const lastQ = gqs[gqs.length - 1];
                        const rangeStr = group.qRange || (firstQ?.questionNumber ? `Questions ${firstQ.questionNumber}–${lastQ?.questionNumber || firstQ.questionNumber}` : '');
                        const instructionStr = group.instruction || currentPart?.instruction || 'Answer the questions below.';
                        const groupTitle = group.title || (gIdx === 0 ? currentPart?.title : '') || '';

                        return (
                          <div key={group.id || gIdx} className="space-y-4">
                            {/* Task Range & Instruction Header */}
                            <div className="border-b border-slate-200 pb-2">
                              {rangeStr && (
                                <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 font-mono">
                                  {rangeStr}
                                </span>
                              )}
                              <p className="text-[13px] font-semibold text-slate-800 leading-snug mt-1 whitespace-pre-line">
                                {instructionStr}
                              </p>
                            </div>

                            {/* 1. NOTES / SUMMARY / FILL_BLANK */}
                            {(category === 'NOTES' || category === 'FILL_BLANK' || category === 'SUMMARY_COMPLETION') && (() => {
                              const tplKey = (
                                group.summaryTemplate || 
                                group.notes_template ||
                                gqs.find(q => q.notes_template || q.summary_template)?.notes_template ||
                                gqs.find(q => q.summary_template)?.summary_template ||
                                currentPart?.notes_template ||
                                currentPart?.notesTemplate ||
                                ''
                              ).trim();

                              const isFirstTime = Boolean(tplKey && !renderedTemplateSignatures.has(tplKey));
                              if (isFirstTime) {
                                renderedTemplateSignatures.add(tplKey);
                              }

                              // Считаем количество пропусков, реально упомянутых в шаблоне
                              const coveredGapsCount = (tplKey.match(/(?:\{\{|\@?\[|\()(?:\#|\@)?(?:q_num|blank|\d+)(?:\}\}|\]|\))|\[\s*\]|\(\s*\)|_{2,}|\.{3,}/gi) || []).length;
                              const hasSufficientCoverage = coveredGapsCount >= Math.ceil(gqs.length / 2);
                              const shouldUseTemplate = isFirstTime && Boolean(tplKey) && hasSufficientCoverage;

                              return (
                                <div className="bg-slate-50/70 border border-slate-200 p-6 sm:p-8">
                                  {groupTitle && (
                                    <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-5">
                                      {groupTitle}
                                    </div>
                                  )}
                                  {shouldUseTemplate ? (
                                    renderNotesTemplate(tplKey, {
                                      answers,
                                      flagged,
                                      onAnswerChange,
                                      onToggleFlag,
                                      questionRefs,
                                      questions: gqs,
                                    })
                                  ) : (
                                    renderStructuredNotes({
                                      items: gqs,
                                      answers,
                                      flagged,
                                      onAnswerChange,
                                      onToggleFlag,
                                      questionRefs,
                                    })
                                  )}
                                </div>
                              );
                            })()}

                            {/* 2. TABLE COMPLETION */}
                            {category === 'TABLE_COMPLETION' && (() => {
                              const tplKey = (
                                group.table_template ||
                                group.tableTemplate ||
                                group.summaryTemplate ||
                                group.notes_template ||
                                gqs.find(q => q.table_template || q.tableTemplate || q.notes_template || q.summary_template)?.table_template ||
                                gqs.find(q => q.tableTemplate)?.tableTemplate ||
                                gqs.find(q => q.notes_template)?.notes_template ||
                                gqs.find(q => q.summary_template)?.summary_template ||
                                currentPart?.table_template ||
                                currentPart?.notes_template ||
                                ''
                              ).trim();

                              const hasTableMarkdown = tplKey && tplKey.includes('|');
                              const isFirstTime = Boolean(tplKey && !renderedTemplateSignatures.has(tplKey));
                              if (isFirstTime) {
                                renderedTemplateSignatures.add(tplKey);
                              }

                              return (
                                <div className="bg-white border-2 border-slate-300 rounded-lg p-5 sm:p-6 shadow-2xs space-y-4">
                                  {groupTitle && (
                                    <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-2">
                                      {groupTitle}
                                    </div>
                                  )}

                                  {hasTableMarkdown ? (
                                    isFirstTime ? (
                                      <div className="overflow-x-auto">
                                        <MarkdownTable
                                          tableContent={normalizeTemplateGaps(tplKey, gqs)}
                                          answers={answers}
                                          onAnswerChange={onAnswerChange}
                                          onToggleFlag={onToggleFlag}
                                          flagged={flagged}
                                          questionRefs={questionRefs}
                                          questions={gqs}
                                        />
                                      </div>
                                    ) : null
                                  ) : (
                                    /* Alternating-row table grid when markdown table | is absent */
                                    <div className="border border-slate-300 rounded-md overflow-hidden bg-white">
                                      <table className="w-full border-collapse text-left text-sm">
                                        <thead>
                                          <tr className="bg-slate-100 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                            <th className="py-2.5 px-4 w-16 text-center font-mono">#</th>
                                            <th className="py-2.5 px-4">{group.subheading || 'Information / Context'}</th>
                                            <th className="py-2.5 px-4 w-44 sm:w-56 text-center">Answer</th>
                                            <th className="w-10"></th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {gqs.map((q, qIdx) => {
                                            const qNum = q.questionNumber || q.q_num;
                                            const val = answers[qNum] || '';
                                            const isFlagged = flagged[qNum] || false;
                                            const rawText = (q.cleanPrompt || q.text || q.prompt || '').trim();
                                            const { before: splitBefore, after: splitAfter } = splitSentenceAtGap(rawText);
                                            const before = q.before || splitBefore || '';
                                            const after = q.after || splitAfter || '';

                                            const isGeneric = (str) => !str || !str.trim() || /^(?:(?:questions?|q)[\s#.:-]*\d*[\s.:-]*|\d+[\s.:-]*)$/i.test(str.trim());
                                            const cleanedRaw = cleanGapArtifacts(rawText);
                                            const contextBulletsText = (Array.isArray(q.context_bullets) ? q.context_bullets : Array.isArray(q.bullets) ? q.bullets : [])
                                              .map(b => (typeof b === 'object' && b !== null ? (b.text || b.prompt || '') : String(b || '')))
                                              .map(s => cleanGapArtifacts(s).trim())
                                              .filter(s => !isGeneric(s))
                                              .join(' • ');
                                            const rowDesc = q.description || q.row_context || q.rowContext || q.context || q.parent_context || '';
                                            const validRowDesc = !isGeneric(rowDesc) ? cleanGapArtifacts(rowDesc).trim() : '';

                                            let labelCandidate = '';
                                            if (!isGeneric(before)) {
                                              labelCandidate = before;
                                            } else if (!isGeneric(cleanedRaw)) {
                                              labelCandidate = cleanedRaw;
                                            } else {
                                              labelCandidate = 
                                                (!isGeneric(q.subheading) ? q.subheading.trim() : '') ||
                                                (!isGeneric(q.title) ? q.title.trim() : '') ||
                                                contextBulletsText ||
                                                validRowDesc ||
                                                (group.subheading && !isGeneric(group.subheading) ? `${group.subheading} (${qNum})` : '') ||
                                                (group.title && !isGeneric(group.title) ? `${group.title} (${qNum})` : '');
                                            }
                                            const labelText = labelCandidate || `Question ${qNum}`;

                                            return (
                                              <tr
                                                key={qNum || qIdx}
                                                ref={el => { if (qNum) questionRefs.current[qNum] = el; }}
                                                className={`border-b border-slate-200 last:border-0 transition-colors ${
                                                  isFlagged ? 'bg-amber-50/50' : qIdx % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                                                }`}
                                              >
                                                <td className="py-3 px-4 text-center font-mono font-bold text-amber-600 text-xs">
                                                  {qNum}
                                                </td>
                                                <td className="py-3 px-4 text-[13.5px] text-slate-800 leading-snug">
                                                  {labelText}
                                                  {after && <span className="ml-1 text-slate-600">{cleanGapArtifacts(after)}</span>}
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                  <div className="flex items-center justify-center gap-1.5">
                                                    <input
                                                      type="text"
                                                      value={val}
                                                      onChange={e => onAnswerChange(qNum, e.target.value)}
                                                      placeholder="..."
                                                      className={`w-full max-w-[180px] h-9 px-2.5 border-2 text-center font-medium text-sm rounded outline-none transition-colors ${
                                                        val
                                                          ? 'border-brand-500 bg-orange-50/30 text-slate-900'
                                                          : isFlagged
                                                          ? 'border-amber-400 bg-amber-50'
                                                          : 'border-slate-300 focus:border-brand-500'
                                                      }`}
                                                    />
                                                  </div>
                                                </td>
                                                <td className="pr-3 text-center">
                                                  <button
                                                    type="button"
                                                    onClick={() => onToggleFlag(qNum)}
                                                    className={`p-1 rounded cursor-pointer transition ${
                                                      isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                                    }`}
                                                    title={isFlagged ? 'Remove flag' : 'Flag'}
                                                  >
                                                    <Flag className="w-3.5 h-3.5" />
                                                  </button>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 3. FORM COMPLETION */}
                            {category === 'FORM_COMPLETION' && (() => {
                              const tplKey = (
                                group.form_template ||
                                group.formTemplate ||
                                group.summaryTemplate ||
                                group.notes_template ||
                                gqs.find(q => q.form_template || q.formTemplate || q.notes_template || q.summary_template)?.form_template ||
                                gqs.find(q => q.formTemplate)?.formTemplate ||
                                gqs.find(q => q.notes_template)?.notes_template ||
                                gqs.find(q => q.summary_template)?.summary_template ||
                                currentPart?.form_template ||
                                currentPart?.notes_template ||
                                ''
                              ).trim();

                              const isFirstTime = Boolean(tplKey && !renderedTemplateSignatures.has(tplKey));
                              if (isFirstTime) {
                                renderedTemplateSignatures.add(tplKey);
                              }

                              return (
                                <div className="bg-white border-2 border-slate-300 rounded-xl p-6 sm:p-8 shadow-xs space-y-5">
                                  {groupTitle && (
                                    <div className="text-center font-black text-sm sm:text-base text-slate-900 uppercase tracking-widest border-b-2 border-slate-800 pb-3 mb-4">
                                      {groupTitle}
                                    </div>
                                  )}

                                  {tplKey && isFirstTime ? (
                                    renderNotesTemplate(tplKey, {
                                      answers,
                                      flagged,
                                      onAnswerChange,
                                      onToggleFlag,
                                      questionRefs,
                                      questions: gqs,
                                    })
                                  ) : (
                                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg overflow-hidden">
                                      {gqs.map((q, qIdx) => {
                                        const qNum = q.questionNumber || q.q_num;
                                        const val = answers[qNum] || '';
                                        const isFlagged = flagged[qNum] || false;
                                        const rawText = q.cleanPrompt || q.prompt || q.text || '';
                                        const { before, after } = splitSentenceAtGap(rawText);
                                        const labelText = before || cleanGapArtifacts(rawText) || `Field ${qNum}`;

                                        return (
                                          <div
                                            key={qNum || qIdx}
                                            ref={el => { if (qNum) questionRefs.current[qNum] = el; }}
                                            className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 transition-colors ${
                                              isFlagged ? 'bg-amber-50/50' : qIdx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                                            }`}
                                          >
                                            <div className="sm:w-1/2 text-sm font-semibold text-slate-800">
                                              {labelText}
                                            </div>
                                            <div className="sm:w-1/2 flex items-center gap-2">
                                              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 font-mono select-none">
                                                {qNum}
                                              </span>
                                              <input
                                                type="text"
                                                value={val}
                                                onChange={e => onAnswerChange(qNum, e.target.value)}
                                                placeholder="Type answer..."
                                                className={`flex-1 h-9 px-3 border-2 text-sm font-medium rounded outline-none transition-colors ${
                                                  val
                                                    ? 'border-brand-500 bg-orange-50/30 text-slate-900'
                                                    : isFlagged
                                                    ? 'border-amber-400 bg-amber-50'
                                                    : 'border-slate-300 focus:border-brand-500'
                                                }`}
                                              />
                                              {after && <span className="text-xs text-slate-600 font-medium">{cleanGapArtifacts(after)}</span>}
                                              <button
                                                type="button"
                                                onClick={() => onToggleFlag(qNum)}
                                                className={`p-1 rounded cursor-pointer transition shrink-0 ${
                                                  isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                                }`}
                                                title={isFlagged ? 'Remove flag' : 'Flag'}
                                              >
                                                <Flag className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 2. MULTIPLE CHOICE */}
                            {(category === 'MULTIPLE_CHOICE' || category === 'MULTIPLE_CHOICE_MULTI') && (() => {
                              // Generic dual-select detection:
                              const isDualQuestion = (q, idx, arr) => {
                                const opts = Array.isArray(q?.options) ? q.options : [];

                                // 1. IELTS Standard Guard: Dual-select questions in Cambridge IELTS
                                // ALWAYS provide at least 5 options (A, B, C, D, E).
                                // If a question has fewer than 4 options (e.g. standard 3 options A, B, C),
                                // it CANNOT under any circumstances be a dual selection.
                                if (opts.length > 0 && opts.length < 4) {
                                  return false;
                                }

                                // 2. Check for explicit two-choice phrases with strict word boundaries
                                // Excludes ordinals and numbers like 20th, 21st, 2nd, 20, 200
                                const dualRegexes = [
                                  /\b(?:choose|select)\s+(?:any\s+)?(?:two|2)\b/i,
                                  /\bwhich\s+(?:two|2)\b/i,
                                  /\b(?:two|2)\s+(?:options|letters|reasons|statements|answers)\b/i,
                                ];

                                const text = `${q.instruction || ''} ${q.cleanPrompt || ''} ${q.prompt || ''} ${q.text || ''} ${instructionStr || ''}`.toLowerCase();
                                const hasDualPhrase = dualRegexes.some(rx => rx.test(text));

                                if (hasDualPhrase && (opts.length >= 4 || opts.length === 0)) {
                                  return true;
                                }

                                // 3. Neighbor pairing logic: check for identical prompt on adjacent questions with 5 options
                                const prev = arr[idx - 1];
                                const next = arr[idx + 1];
                                const sameAsPrev = prev && (prev.prompt === q.prompt || prev.text === q.text) && (Array.isArray(q.options) && q.options.length === 5);
                                const sameAsNext = next && (next.prompt === q.prompt || next.text === q.text) && (Array.isArray(q.options) && q.options.length === 5);
                                return Boolean(sameAsPrev || sameAsNext);
                              };

                              // Deduplicate by questionNumber to ensure each question appears strictly once
                              const seenInGroup = new Set();
                              const uniqueGqs = gqs.filter(q => {
                                const num = Number(q.questionNumber);
                                if (!num || seenInGroup.has(num)) return false;
                                seenInGroup.add(num);
                                return true;
                              });

                              const dualQuestions = [];
                              const singleQuestions = [];

                              uniqueGqs.forEach((q, idx) => {
                                if (isDualQuestion(q, idx, uniqueGqs)) {
                                  dualQuestions.push(q);
                                } else {
                                  singleQuestions.push(q);
                                }
                              });

                              // Group dual-select questions into pairs of 2 dynamically without hardcoded indices
                              const dualPairs = [];
                              const sortedDual = [...dualQuestions].sort(
                                (a, b) => Number(a.questionNumber || a.q_num || 0) - Number(b.questionNumber || b.q_num || 0)
                              );
                              for (let i = 0; i < sortedDual.length; i += 2) {
                                dualPairs.push([sortedDual[i], sortedDual[i + 1] || null]);
                              }

                              // Strictly eliminate any duplicate single-choice MCQ renderings beneath them
                              const dualNumSet = new Set();
                              dualPairs.forEach(([qA, qB]) => {
                                if (qA?.questionNumber) dualNumSet.add(Number(qA.questionNumber));
                                if (qB?.questionNumber) dualNumSet.add(Number(qB.questionNumber));
                              });
                              const filteredSingleQuestions = singleQuestions.filter(
                                q => !dualNumSet.has(Number(q.questionNumber || q.q_num))
                              );

                              return (
                                <div className="space-y-6">
                                  {/* Render Dual-Select Pairs (e.g. Questions 11-12 and 13-14) */}
                                  {dualPairs.map(([qA, qB], pIdx) => {
                                    if (!qA) return null;
                                    const qNumA = qA.questionNumber;
                                    const qNumB = qB ? qB.questionNumber : qNumA + 1;
                                    const pairRange = qB ? `Questions ${qNumA} and ${qNumB}` : `Question ${qNumA}`;
                                    const rawPrompt = qA.cleanPrompt || qA.prompt || qA.text || qB?.cleanPrompt || '';
                                    const cleanPrompt = rawPrompt.replace(/^(?:Questions?\s*)?(?:\d+\s*[-–&and\s]*\d+|\d+)[\.\:\s\-]+/i, '').trim();
                                    const rawOptions = (qA.options && qA.options.length >= 2) 
                                      ? qA.options 
                                      : (qB?.options && qB.options.length >= 2) 
                                        ? qB.options 
                                        : ['A', 'B', 'C', 'D', 'E'];
                                    
                                    const handleDualSelect = (letter) => {
                                      const valA = (answers[qNumA] || '').toUpperCase();
                                      const valB = (answers[qNumB] || '').toUpperCase();
                                      const L = letter.toUpperCase();

                                      if (valA === L) {
                                        onAnswerChange(qNumA, '');
                                      } else if (valB === L) {
                                        onAnswerChange(qNumB, '');
                                      } else if (!valA) {
                                        onAnswerChange(qNumA, L);
                                      } else if (!valB) {
                                        onAnswerChange(qNumB, L);
                                      } else {
                                        onAnswerChange(qNumB, L);
                                      }
                                    };

                                    const valA = (answers[qNumA] || '').toUpperCase();
                                    const valB = (answers[qNumB] || '').toUpperCase();

                                    return (
                                      <div key={`dual-${pIdx}-${qNumA}`} className="bg-white border border-slate-200 rounded-lg p-5 sm:p-6 space-y-4 shadow-2xs">
                                        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                                          <span className="text-xs font-black uppercase tracking-wider text-amber-700 font-mono">
                                            {pairRange}
                                          </span>
                                          <span className="text-[11px] font-semibold text-slate-500">
                                            Select TWO options
                                          </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-800 leading-snug">
                                          {cleanPrompt}
                                        </p>
                                        <div className="grid grid-cols-1 gap-2 pt-1">
                                          {rawOptions.map((opt, oIdx) => {
                                            const match = String(opt).match(/^\[?([A-Z])\]?[\.\:\)\s\-]+(.*)$/i);
                                            const letter = (match ? match[1] : String.fromCharCode(65 + oIdx)).toUpperCase();
                                            const optText = match ? match[2].trim() : String(opt).trim();
                                            const isSelected = valA === letter || valB === letter;

                                            return (
                                              <button
                                                key={letter}
                                                type="button"
                                                onClick={() => handleDualSelect(letter)}
                                                className={`flex items-center gap-3 p-2.5 rounded text-left text-sm transition-colors border cursor-pointer ${
                                                  isSelected
                                                    ? 'border-amber-500 bg-amber-50/70 text-slate-900 font-semibold shadow-xs'
                                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                                                }`}
                                              >
                                                <span className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0 font-mono transition-colors ${
                                                  isSelected
                                                    ? 'bg-amber-500 text-white shadow-xs'
                                                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                                                }`}>
                                                  {letter}
                                                </span>
                                                <span className="flex-1 leading-snug">{optText}</span>
                                              </button>
                                            );
                                          })}
                                        </div>

                                        {/* Dual Answer Slots */}
                                        <div className="flex items-center gap-4 pt-3 border-t border-slate-200 text-xs">
                                          <span className="font-bold text-slate-600 uppercase tracking-wider font-mono">
                                            Your Answers:
                                          </span>
                                          <div ref={el => (questionRefs.current[qNumA] = el)} className="flex items-center gap-2">
                                            <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center font-mono select-none">
                                              {qNumA}
                                            </span>
                                            <input
                                              type="text"
                                              maxLength={1}
                                              value={valA}
                                              onChange={e => onAnswerChange(qNumA, e.target.value.toUpperCase())}
                                              placeholder="Letter"
                                              className={`w-24 sm:w-28 h-9 px-3 border-2 text-center font-bold uppercase text-sm rounded outline-none transition-colors ${
                                                valA ? 'border-amber-500 bg-amber-50/50 text-slate-900' : flagged[qNumA] ? 'border-amber-400 bg-amber-50' : 'border-slate-300 focus:border-amber-500'
                                              }`}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => onToggleFlag(qNumA)}
                                              className={`p-1 rounded cursor-pointer transition ${flagged[qNumA] ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                                              title={flagged[qNumA] ? `Remove flag ${qNumA}` : `Flag ${qNumA}`}
                                            >
                                              <Flag className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                          {qB && (
                                            <div ref={el => (questionRefs.current[qNumB] = el)} className="flex items-center gap-2">
                                              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center font-mono select-none">
                                                {qNumB}
                                              </span>
                                              <input
                                                type="text"
                                                maxLength={1}
                                                value={valB}
                                                onChange={e => onAnswerChange(qNumB, e.target.value.toUpperCase())}
                                                placeholder="Letter"
                                                className={`w-24 sm:w-28 h-9 px-3 border-2 text-center font-bold uppercase text-sm rounded outline-none transition-colors ${
                                                  valB ? 'border-amber-500 bg-amber-50/50 text-slate-900' : flagged[qNumB] ? 'border-amber-400 bg-amber-50' : 'border-slate-300 focus:border-amber-500'
                                                }`}
                                              />
                                              <button
                                                type="button"
                                                onClick={() => onToggleFlag(qNumB)}
                                                className={`p-1 rounded cursor-pointer transition ${flagged[qNumB] ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                                                title={flagged[qNumB] ? `Remove flag ${qNumB}` : `Flag ${qNumB}`}
                                              >
                                                <Flag className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}

                                  {/* Render Standard Single-Choice MC */}
                                  {filteredSingleQuestions.map(q => {
                                    const qNum = q.questionNumber;
                                    const val = (answers[qNum] || '').toUpperCase();
                                    const isFlagged = flagged[qNum] || false;
                                    const promptText = q.cleanPrompt || q.prompt || q.text || group.instruction || instructionStr || `Question ${qNum}`;
                                    const rawOptions = (q.options && q.options.length > 0) ? q.options : ['A', 'B', 'C', 'D', 'E'];

                                    return (
                                      <div
                                        key={qNum}
                                        ref={el => (questionRefs.current[qNum] = el)}
                                        className={`bg-white border rounded-lg p-5 space-y-3 shadow-2xs transition-colors ${
                                          isFlagged ? 'border-amber-400 bg-amber-50/20' : 'border-slate-200'
                                        }`}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex items-start gap-2.5 flex-1">
                                            <span className="w-6 h-6 rounded-full bg-amber-500 text-white text-xs font-bold flex items-center justify-center font-mono shrink-0 mt-0.5 select-none">
                                              {qNum}
                                            </span>
                                            <span className="text-sm font-bold text-slate-800 leading-snug">
                                              {promptText}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => onToggleFlag(qNum)}
                                            className={`p-1 rounded cursor-pointer transition shrink-0 ${
                                              isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                            }`}
                                            title={isFlagged ? 'Remove flag' : 'Flag'}
                                          >
                                            <Flag className="w-3.5 h-3.5" />
                                          </button>
                                        </div>

                                        <div className="grid grid-cols-1 gap-2 pt-1 pl-8">
                                          {rawOptions.map((opt, oIdx) => {
                                            const match = String(opt).match(/^\[?([A-Z])\]?[\.\:\)\s\-]+(.*)$/i);
                                            const letter = (match ? match[1] : String.fromCharCode(65 + oIdx)).toUpperCase();
                                            const optText = match ? match[2].trim() : String(opt).trim();
                                            const isSelected = val === letter;

                                            return (
                                              <button
                                                key={letter}
                                                type="button"
                                                onClick={() => onAnswerChange(qNum, letter)}
                                                className={`flex items-center gap-3 p-2.5 rounded text-left text-sm transition-colors border cursor-pointer ${
                                                  isSelected
                                                    ? 'border-amber-500 bg-amber-50/70 text-slate-900 font-semibold shadow-xs'
                                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700'
                                                }`}
                                              >
                                                <span className={`w-7 h-7 rounded flex items-center justify-center font-bold text-xs shrink-0 font-mono transition-colors ${
                                                  isSelected
                                                    ? 'bg-amber-500 text-white shadow-xs'
                                                    : 'bg-slate-100 text-slate-600 border border-slate-300'
                                                }`}>
                                                  {letter}
                                                </span>
                                                <span className="flex-1 leading-snug">{optText}</span>
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            {/* 3. MATCHING & MAP / DIAGRAM LABELING TABLE */}
                            {(category === 'MATCHING' || category === 'MATCHING_FEATURES' || category === 'MAP_DIAGRAM_LABELING' || category === 'MAP_LABELLING' || category === 'MAP_LABELING' || category === 'DIAGRAM_LABEL') && (() => {
                              const isMapQuestion =
                                category === 'MAP_DIAGRAM_LABELING' ||
                                category === 'MAP_LABELLING' ||
                                category === 'MAP_LABELING' ||
                                category === 'DIAGRAM_LABEL' ||
                                /\b(?:label\s+the\s+map|diagram|map)\b/i.test(`${group.instruction || ''} ${instructionStr || ''} ${group.subheading || ''}`);

                              const mapImageUrl = currentExam.listening_map_image_url || currentListening.map_image_url || currentExam.listening?.map_image_url || '';

                              // Resolve refBox: group.referenceBox first, then fallback to question options
                              const rawGroupRefBox = group.referenceBox && group.referenceBox.length > 0
                                ? group.referenceBox
                                : (() => {
                                    const qWithOpts = gqs.find(q => Array.isArray(q.options) && q.options.length > 0);
                                    if (!qWithOpts) return [];
                                    return qWithOpts.options.map((opt, idx) => {
                                      if (typeof opt === 'object' && opt !== null) {
                                        return {
                                          key: String(opt.key || opt.letter || String.fromCharCode(65 + idx)).trim().toUpperCase(),
                                          label: String(opt.label || opt.text || opt.value || '').trim(),
                                        };
                                      }
                                      if (typeof opt === 'string') {
                                        const m = opt.match(/^\[?([A-Z0-9ivxlcdm]+)\]?[\.\:\s\-]\s*(.*)$/i);
                                        if (m) return { key: m[1].toUpperCase(), label: m[2].trim() };
                                        return { key: String.fromCharCode(65 + idx), label: opt.trim() };
                                      }
                                      return { key: String.fromCharCode(65 + idx), label: String(opt) };
                                    });
                                  })();

                              // Fallback: derive letter options from instruction if still empty (e.g. A-K, A-H, A to F)
                              let effectiveRefList = rawGroupRefBox;
                              if (!effectiveRefList || effectiveRefList.length === 0) {
                                const combinedInst = `${group.instruction || ''} ${instructionStr || ''} ${gqs.map(q => q.prompt || q.text || '').join(' ')}`;
                                const rangeMatch = combinedInst.match(/\b([A-Z])\s*(?:[-–—]|to)\s*([A-Z])\b/i);
                                if (rangeMatch) {
                                  const startCode = rangeMatch[1].toUpperCase().charCodeAt(0);
                                  const endCode = rangeMatch[2].toUpperCase().charCodeAt(0);
                                  if (endCode >= startCode && endCode - startCode <= 20) {
                                    effectiveRefList = [];
                                    for (let code = startCode; code <= endCode; code++) {
                                      effectiveRefList.push({ key: String.fromCharCode(code), label: '' });
                                    }
                                  }
                                }
                              }

                              const refBox = deduplicateRefBox(effectiveRefList);
                              const placeholderRange = refBox.length > 0
                                ? `${refBox[0]?.key}–${refBox[refBox.length - 1]?.key}`
                                : 'Letter';

                              return (
                                <div className="space-y-4">
                                  {/* Map / Diagram Image (Rendered strictly centered above questions) */}
                                  {isMapQuestion && (
                                    mapImageUrl ? (
                                      <div className="max-w-2xl mx-auto rounded-2xl border border-slate-300 shadow-sm overflow-hidden bg-white my-4 p-2">
                                        <img
                                          src={mapImageUrl}
                                          alt="Map or diagram for this section"
                                          className="w-full h-auto object-contain"
                                        />
                                      </div>
                                    ) : (
                                      <div className="max-w-2xl mx-auto rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4 my-4 flex items-center justify-center gap-2 text-slate-500 text-xs font-medium">
                                        <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                                        <span>Map diagram for this section. Refer to your booklet.</span>
                                      </div>
                                    )
                                  )}

                                  {/* Options Reference Box / Badges (Placed underneath the map image) */}
                                  {refBox.length > 0 && (
                                    <div className="border border-slate-300 p-4 bg-slate-50/60 rounded-xl">
                                      <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 mb-2.5 flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                                        <span>{group.subheading || (isMapQuestion ? 'Available Map Labels' : 'List of Options')}</span>
                                      </div>
                                      {refBox.some(r => r.label && r.label.trim()) ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-1.5">
                                          {refBox.map(item => (
                                            <div key={item.key} className="flex items-baseline gap-2 text-[13px]">
                                              <span className="font-mono font-bold text-slate-800 shrink-0">[{item.key}]</span>
                                              <span className="text-slate-700 font-medium">{item.label}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="flex flex-wrap items-center gap-2">
                                          {refBox.map(item => (
                                            <span
                                              key={item.key}
                                              className="inline-flex items-center justify-center px-3 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-800 shadow-2xs"
                                            >
                                              [{item.key}]
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  <div className="border border-slate-300 overflow-hidden rounded-xl bg-white shadow-2xs">
                                    <table className="w-full border-collapse text-left text-sm">
                                      <thead>
                                        <tr className="bg-slate-100 border-b border-slate-300 text-xs font-bold text-slate-700 uppercase tracking-wider">
                                          <th className="py-2.5 px-4">{group.subheading || (isMapQuestion ? 'Location / Feature' : 'Item / Statement')}</th>
                                          <th className="py-2.5 px-4 w-36 text-center">Answer</th>
                                          <th className="w-10"></th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {gqs.map((item, idx) => {
                                          const qNum = item.questionNumber;
                                          const rawName = item.cleanPrompt || item.text || item.prompt || `Question ${qNum}`;
                                          const cleanName = cleanGapArtifacts(rawName.replace(/^\d+[\.\:\s\-]+/, ''));
                                          const val = answers[qNum] || '';
                                          const isFlagged = flagged[qNum] || false;
                                          const hint = getRefHint(val, refBox);

                                          return (
                                            <tr
                                              key={qNum}
                                              ref={el => (questionRefs.current[qNum] = el)}
                                              className={`border-b border-slate-200 last:border-0 transition-colors ${
                                                isFlagged ? 'bg-amber-50/50' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                                              }`}
                                            >
                                              <td className="py-2.5 px-4 text-[13.5px] font-medium text-slate-800">
                                                <span className="font-bold text-slate-900 mr-2 font-mono">{qNum}.</span>
                                                {cleanName}
                                              </td>
                                              <td className="py-2.5 px-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                  <input
                                                    type="text"
                                                    maxLength={2}
                                                    value={val}
                                                    onChange={e => onAnswerChange(qNum, e.target.value.toUpperCase())}
                                                    placeholder={placeholderRange}
                                                    className={`w-12 h-10 text-center font-mono font-bold text-sm uppercase rounded-xl border-2 outline-none transition-colors shrink-0 ${
                                                      val
                                                        ? 'border-amber-500 bg-amber-50/50 text-slate-900'
                                                        : isFlagged
                                                        ? 'border-amber-400 bg-amber-50'
                                                        : 'border-slate-300 focus:border-amber-500 bg-white'
                                                    }`}
                                                  />
                                                  {hint && (
                                                    <span className="text-[11px] text-amber-700 italic hidden sm:inline-block truncate max-w-[120px]">
                                                      {hint}
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="pr-3 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => onToggleFlag(qNum)}
                                                  className={`p-1 rounded cursor-pointer transition ${
                                                    isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                                  }`}
                                                  title={isFlagged ? 'Remove flag' : 'Flag'}
                                                >
                                                  <Flag className="w-3 h-3" />
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 4. FLOW CHART */}
                            {category === 'FLOW_CHART' && (() => {
                              const rawFlowRefBox = group.referenceBox && group.referenceBox.length > 0
                                ? group.referenceBox
                                : (() => {
                                    const qWithOpts = gqs.find(q => Array.isArray(q.options) && q.options.length > 0);
                                    if (!qWithOpts) return [];
                                    return qWithOpts.options.map((opt, idx) => {
                                      if (typeof opt === 'object' && opt !== null) {
                                        return {
                                          key: String(opt.key || opt.letter || String.fromCharCode(65 + idx)).trim().toUpperCase(),
                                          label: String(opt.label || opt.text || opt.value || '').trim(),
                                        };
                                      }
                                      if (typeof opt === 'string') {
                                        const m = opt.match(/^\[?([A-Z0-9ivxlcdm]+)\]?[\.\:\s\-]\s*(.*)$/i);
                                        if (m) return { key: m[1].toUpperCase(), label: m[2].trim() };
                                        return { key: String.fromCharCode(65 + idx), label: opt.trim() };
                                      }
                                      return { key: String.fromCharCode(65 + idx), label: String(opt) };
                                    });
                                  })();
                              const refBox = deduplicateRefBox(rawFlowRefBox);

                              return (
                                <div className="space-y-5">
                                  {refBox.length > 0 && (
                                    <div className="border border-slate-300 p-4 bg-slate-50/60">
                                      <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 mb-2.5 flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Options Box</span>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1.5">
                                        {refBox.map(item => (
                                          <div key={item.key} className="flex items-baseline gap-2 text-[13px]">
                                            <span className="font-mono font-bold text-slate-800 shrink-0">[{item.key}]</span>
                                            <span className="text-slate-700 font-medium">{item.label}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  <div className="bg-slate-50/80 border border-slate-300 p-6 sm:p-8">
                                    {groupTitle && (
                                      <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-6">
                                        {groupTitle}
                                      </div>
                                    )}
                                    <div className="flex flex-col items-center space-y-2 max-w-xl mx-auto">
                                      {gqs.map((step, idx) => {
                                        const isLast = idx === gqs.length - 1;
                                        const qNum = step.questionNumber;
                                        const val = answers[qNum] || '';
                                        const isFlagged = flagged[qNum] || false;
                                        const currentAnswer = answers[qNum] || '';
                                        const rawText = step.prompt || step.text || step.cleanPrompt || '';
                                        const { before, after, hasGap } = splitSentenceAtGap(rawText);
                                        const hint = getRefHint(currentAnswer, refBox);

                                        return (
                                          <React.Fragment key={qNum || idx}>
                                            <div
                                              ref={el => { if (qNum) questionRefs.current[qNum] = el; }}
                                              className={`w-full bg-white border-2 p-3 text-[13px] font-semibold text-slate-900 shadow-2xs transition-colors rounded-xl ${
                                                currentAnswer ? 'border-brand-400 bg-orange-50/20' : 'border-slate-300'
                                              }`}
                                            >
                                              <div className="flex items-start gap-2">
                                                <div className="flex-1 text-xs leading-loose">
                                                  <FlowChartGapItem
                                                    q={step}
                                                    currentAnswer={currentAnswer}
                                                    onAnswerChange={onAnswerChange}
                                                  />
                                                  {hint && (
                                                    <span className="text-[11px] text-amber-700 italic font-normal ml-1">
                                                      ({hint})
                                                    </span>
                                                  )}
                                                </div>
                                                <button
                                                  type="button"
                                                  onClick={() => onToggleFlag(qNum)}
                                                  className={`p-1 rounded cursor-pointer transition shrink-0 ${
                                                    isFlagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                                  }`}
                                                  title={isFlagged ? 'Remove flag' : 'Flag'}
                                                >
                                                  <Flag className="w-3.5 h-3.5" />
                                                </button>
                                              </div>
                                            </div>
                                            {!isLast && (
                                              <div className="text-slate-400 font-bold text-lg select-none py-0.5">
                                                ↓
                                              </div>
                                            )}
                                          </React.Fragment>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* 5. SUMMARY MATCHING */}
                            {category === 'SUMMARY_MATCHING' && (() => {
                              const refBox = group.referenceBox || [];
                              return (
                                <div className="space-y-4">
                                  {refBox.length > 0 && (
                                    <div className="border border-slate-300 p-4 bg-slate-50/60">
                                      <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-600 mb-2.5 flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Options Box</span>
                                      </div>
                                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                        {refBox.map(item => (
                                          <div key={item.key} className="flex items-baseline gap-2 text-xs">
                                            <span className="font-mono font-bold text-slate-800">[{item.key}]</span>
                                            <span className="text-slate-700">{item.label}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  <div className="bg-slate-50/70 border border-slate-200 p-6 sm:p-8">
                                    {groupTitle && (
                                      <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-5">
                                        {groupTitle}
                                      </div>
                                    )}
                                    {renderStructuredNotes({
                                      items: gqs,
                                      answers,
                                      flagged,
                                      onAnswerChange,
                                      onToggleFlag,
                                      questionRefs,
                                    })}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* FALLBACK FOR UNHANDLED CATEGORIES */}
                            {![
                              'NOTES', 'FILL_BLANK', 'SUMMARY_COMPLETION',
                              'TABLE_COMPLETION', 'FORM_COMPLETION',
                              'MULTIPLE_CHOICE', 'MULTIPLE_CHOICE_MULTI', 'MATCHING', 'MATCHING_FEATURES', 'MATCHING_HEADINGS', 'FLOW_CHART', 'SUMMARY_MATCHING', 'MAP_DIAGRAM_LABELING'
                            ].includes(category) && (
                              <div className="bg-slate-50/70 border border-slate-200 p-6 sm:p-8">
                                {groupTitle && (
                                  <div className="text-center font-extrabold text-sm sm:text-base text-slate-900 uppercase tracking-wide border-b border-slate-200 pb-3 mb-5">
                                    {groupTitle}
                                  </div>
                                )}
                                {renderStructuredNotes({
                                  items: gqs,
                                  answers,
                                  flagged,
                                  onAnswerChange,
                                  onToggleFlag,
                                  questionRefs,
                                })}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
              </>
            );
          })()}

        </div>
      </div>

      {/* Docked Scoped Question Palette for Current Part (Strictly Centered Horizontally) */}
      <div className="w-full flex items-center justify-center py-2.5 bg-white border-t border-slate-200 shrink-0 select-none">
        <div className="flex flex-wrap items-center justify-center gap-1.5 px-3">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mr-1 shrink-0">
            Part {activePartId}:
          </span>
          {partQuestions.map((q) => {
            const qNum = q.questionNumber;
            const isAns = Boolean(answers[qNum] && answers[qNum].trim());
            const isFlg = flagged[qNum];

            return (
              <button
                key={qNum}
                type="button"
                onClick={() => {
                  const el = questionRefs.current[qNum];
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className={`w-7 h-7 rounded text-xs font-semibold transition flex items-center justify-center shrink-0 cursor-pointer ${
                  isFlg 
                    ? 'bg-amber-400 text-slate-900 ring-1 ring-amber-300 font-bold' 
                    : isAns 
                      ? 'bg-brand-500 text-white shadow-xs font-bold' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title={`Question ${qNum}`}
              >
                {qNum}
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}

