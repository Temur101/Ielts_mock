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
  ListChecks
} from 'lucide-react';
import { Badge } from '../common/Badge';
import { IeltsBookletRenderer } from './IeltsBookletRenderer';

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
  const [viewMode, setViewMode] = useState('booklet'); // 'booklet' | 'cards'
  
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

  let partQuestions = questions.filter(q => {
    if (q.partId) return q.partId === activePartId;
    if (q.passageId) return q.passageId === activePartId;
    if (activePartId === 1) return q.questionNumber <= 10;
    if (activePartId === 2) return q.questionNumber >= 11 && q.questionNumber <= 20;
    if (activePartId === 3) return q.questionNumber >= 21 && q.questionNumber <= 30;
    if (activePartId === 4) return q.questionNumber >= 31 && q.questionNumber <= 40;
    return false;
  });

  if (partQuestions.length === 0 && activePartId === 1 && questions.length > 0) {
    partQuestions = questions;
  }

  // Fallback questions so student never sees an empty screen
  if (partQuestions.length === 0 && questions.length === 0) {
    const startQ = (activePartId - 1) * 10 + 1;
    partQuestions = Array.from({ length: 10 }, (_, i) => ({
      id: `q-${startQ + i}`,
      questionNumber: startQ + i,
      partId: activePartId,
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

      {/* Top Audio Player Controller Bar */}
      <div className="p-3.5 sm:p-4 bg-white text-slate-900 border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          {/* Active Part Selector & Audio Status */}
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
              playingPartId 
                ? 'bg-orange-100 text-brand-600 border-brand-300 animate-pulse' 
                : 'bg-orange-50 text-brand-600 border-brand-200'
            }`}>
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-600">
                  IELTS Listening Audio + Booklet
                </span>
                {playingPartId && (
                  <span className="px-2 py-0.5 rounded-full bg-orange-100 text-brand-700 border border-brand-300 text-[10px] font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-ping" />
                    Audio Playing (Part {playingPartId})
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5 truncate max-w-xs sm:max-w-sm">
                {currentPart?.title || `Part ${activePartId}`}
              </h3>
            </div>
          </div>

          {/* 4 Discrete Part Sub-Tabs */}
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[1, 2, 3, 4].map(partNum => {
              const part = parts.find(p => p.partId === partNum) || { partId: partNum };
              const isSelected = partNum === activePartId;
              const isDone = playedParts[partNum];
              const isPlaying = playingPartId === partNum;
              const qRange = partNum === 1 ? '1–10' : partNum === 2 ? '11–20' : partNum === 3 ? '21–30' : '31–40';

              return (
                <button
                  key={partNum}
                  type="button"
                  onClick={() => setActivePartId(partNum)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-brand-500 text-white shadow-sm'
                      : isPlaying
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                  }`}
                >
                  <span>Part {partNum}</span>
                  <span className="text-[10px] opacity-75 font-normal">({qRange})</span>
                  {isPlaying && (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-extrabold">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    </span>
                  )}
                  {isDone && !isPlaying && <Check className="w-3 h-3 text-emerald-600" />}
                </button>
              );
            })}
          </div>

          {/* Active Player Action Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => togglePlayAudio(playingPartId ? playingPartId : activePartId)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition cursor-pointer ${
                  playingPartId
                    ? 'bg-amber-500 text-white shadow-glow hover:bg-amber-600'
                    : playedParts[activePartId] && audioSettings.single_play_enforcement
                      ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                      : 'bg-brand-500 hover:bg-brand-600 text-white shadow-glow'
                }`}
              >
                {playingPartId ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pause Audio (Part {playingPartId})</span>
                  </>
                ) : playedParts[activePartId] && audioSettings.single_play_enforcement ? (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Part {activePartId} Played (Locked)</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Play Part {activePartId}</span>
                  </>
                )}
              </button>

              {/* Progress Time */}
              <div className="text-xs font-mono font-bold text-slate-600 min-w-[85px] text-right">
                {formatAudioTime(audioProgress[targetAudioPartId]?.current || 0)} / {audioProgress[targetAudioPartId]?.duration ? formatAudioTime(audioProgress[targetAudioPartId]?.duration) : (targetPart.duration || "07:00")}
              </div>
            </div>
          </div>

        </div>

        {/* Audio status indicator */}
        <div className="max-w-7xl mx-auto mt-3 flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-brand-400" />
            <span>
              {audioSettings.lock_scrubbing ? "Scrubbing & rewinding locked." : "Standard audio player."}
              {audioSettings.single_play_enforcement ? " Single-play rule strictly enforced." : ""}
            </span>
          </div>

          <div className="text-brand-300 font-mono">
            Part {activePartId}: {answeredInPart} of {partQuestions.length} answered ({totalAnsweredAll}/{questions.length} Total)
          </div>
        </div>
      </div>

      {/* Main Multi-Part Workspace: Full-Width Questions Only (No Text / Audio Script) */}
      {/* Main Questions / Booklet Body */}
      <div className="flex-1 overflow-y-auto bg-slate-50/60 p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {(() => {
            const partSec = Array.isArray(currentListening.sections)
              ? currentListening.sections.find((s) => s.part === activePartId)
              : null;
            const currentPartHtml = partSec?.page_content_html || currentPart?.page_content_html || '';

            return (
              <>
                {/* Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-600 flex items-center justify-center shrink-0">
                      <ListChecks className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-slate-900">
                        {currentPart?.title || `Listening Part ${activePartId}`}
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        {currentPart?.instructions || "Listen to the recording and write your answers in the fields below."}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {currentPartHtml && (
                      <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                        <button
                          type="button"
                          onClick={() => setViewMode('booklet')}
                          className={`px-3 py-1.5 rounded-lg transition-all ${
                            viewMode === 'booklet'
                              ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                              : 'text-slate-600 hover:text-brand-600'
                          }`}
                        >
                          Exact Booklet
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('cards')}
                          className={`px-3 py-1.5 rounded-lg transition-all ${
                            viewMode === 'cards'
                              ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                              : 'text-slate-600 hover:text-brand-600'
                          }`}
                        >
                          Cards
                        </button>
                      </div>
                    )}
                    <span className="text-xs font-mono font-bold text-brand-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-xl whitespace-nowrap">
                      {answeredInPart} / {partQuestions.length} Answered
                    </span>
                  </div>
                </div>

                {/* Exact Cambridge Booklet View */}
                {currentPartHtml && viewMode === 'booklet' ? (
                  <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 sm:p-8 shadow-sm space-y-4">
                    <div className="flex items-center justify-between border-b pb-3 border-slate-200 text-xs text-slate-500 font-bold uppercase tracking-wider">
                      <span>Cambridge Assessment English • Listening Part {activePartId}</span>
                      <span className="font-mono text-brand-600">Questions {partQuestions[0]?.questionNumber || ((activePartId - 1) * 10 + 1)}–{partQuestions[partQuestions.length - 1]?.questionNumber || (activePartId * 10)}</span>
                    </div>

                    <IeltsBookletRenderer
                      htmlContent={currentPartHtml}
                      answers={answers}
                      onAnswerChange={onAnswerChange}
                      flagged={flagged}
                    />
                  </div>
                ) : (
                  /* Questions Cards List */
                  <div className="space-y-4">
            {partQuestions.map((q) => {
              const qNum = q.questionNumber;
              const currentVal = answers[qNum] || '';
              const isFlagged = flagged[qNum] || false;
              const isAnswered = Boolean(currentVal && currentVal.trim());

              return (
                <div
                  key={q.id}
                  ref={el => questionRefs.current[qNum] = el}
                  className={`p-5 sm:p-6 rounded-2xl bg-white border transition-all duration-200 ${
                    isFlagged 
                      ? 'border-amber-400 ring-2 ring-amber-100 shadow-sm' 
                      : isAnswered 
                        ? 'border-brand-300 shadow-sm' 
                        : 'border-slate-200 shadow-card'
                  }`}
                >
                  {/* Question Instruction */}
                  {q.instruction && (
                    <div className="text-xs font-semibold text-brand-800 bg-brand-50/80 p-3 rounded-xl mb-3 border border-brand-100 whitespace-pre-line">
                      {q.instruction}
                    </div>
                  )}

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <span className={`w-8 h-8 rounded-xl font-mono text-xs font-bold flex items-center justify-center shrink-0 ${
                        isAnswered 
                          ? 'bg-brand-500 text-white shadow-sm' 
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {qNum}
                      </span>
                      <div className="text-sm font-semibold text-slate-900 leading-snug pt-1 flex-1">
                        {q.text}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onToggleFlag(qNum)}
                      className={`p-2 rounded-xl text-xs transition cursor-pointer ${
                        isFlagged 
                          ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' 
                          : 'text-slate-400 hover:text-amber-500 hover:bg-slate-100'
                      }`}
                      title={isFlagged ? 'Remove flag' : 'Flag for review'}
                    >
                      <Flag className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Input Type Rendering */}
                  <div className="mt-4 pl-11">
                    {q.type === 'MULTIPLE_CHOICE' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options?.map((option) => {
                          const letter = option.charAt(0);
                          const isSelected = currentVal.toUpperCase() === letter.toUpperCase();
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => onAnswerChange(qNum, letter)}
                              className={`w-full text-left p-3.5 rounded-xl text-xs font-medium border flex items-center justify-between transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-brand-50/80 border-brand-500 text-brand-900 ring-1 ring-brand-500'
                                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span>{option}</span>
                              {isSelected && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={currentVal}
                        onChange={(e) => onAnswerChange(qNum, e.target.value)}
                        placeholder={q.placeholder || `Type your answer for Question ${qNum}...`}
                        className="w-full max-w-lg px-4 py-3 text-sm rounded-xl border border-slate-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 font-medium text-slate-900 bg-white shadow-sm"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  })()}

          {/* Bottom Question Navigation Palette */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between mb-3 text-xs font-semibold text-slate-500">
              <span className="font-bold text-slate-700">Questions Palette (Part {activePartId})</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-500" /> Answered
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Flagged
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200" /> Unanswered
                </span>
              </div>
            </div>

            <div className="grid grid-cols-10 gap-1.5">
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
                    className={`h-9 rounded-xl font-mono text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                      isFlg 
                        ? 'bg-amber-400 text-slate-900 ring-2 ring-amber-200 font-extrabold' 
                        : isAns 
                          ? 'bg-brand-500 text-white shadow-sm' 
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {qNum}
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}

