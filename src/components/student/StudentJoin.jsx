import React, { useState } from 'react';
import { 
  GraduationCap, 
  ArrowRight, 
  ArrowLeft,
  AlertTriangle,
  User,
  Phone,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { Button } from '../common/Button';
import { fetchExamByPin, generateUUID, generateCryptoPin } from '../../lib/supabase';
import { sealAnswerKeys, sanitizeExamForCandidate } from '../../lib/answerVault';

export function StudentJoin({ onJoin, defaultPin = '', isLobbyOpen = false, examStatus = 'lobby', shortCircuitPin = '' }) {
  // Check URL query parameter ?pin=...
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialPin = (shortCircuitPin || urlParams?.get('pin') || defaultPin || '').trim().toUpperCase();

  // Multi-step Registration: 0 = Welcome, 1 = Full Name, 2 = Phone Number (& PIN if needed)
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pinCode, setPinCode] = useState(initialPin);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  React.useEffect(() => {
    const active = (shortCircuitPin || urlParams?.get('pin') || defaultPin || '').trim().toUpperCase();
    if (active && active !== pinCode) {
      setPinCode(active);
    }
  }, [defaultPin, shortCircuitPin]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Please enter your full name as shown on official ID');
      setStep(1);
      return;
    }
    if (!phone.trim()) {
      setError('Please enter your phone number');
      setStep(2);
      return;
    }
    const cleanPin = (pinCode || shortCircuitPin || urlParams?.get('pin') || defaultPin || '').trim().toUpperCase();
    if (!cleanPin) {
      setError('Active exam session not found. Please verify the exam link with your instructor.');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      const activeLocalPin = (defaultPin || shortCircuitPin || '').trim().toUpperCase();
      const { data: dbExam } = await fetchExamByPin(cleanPin);

      if (dbExam) {
        if (dbExam.status === 'finished') {
          setError('This exam session has already concluded.');
          return;
        }

        const isLobbyAccessible = dbExam.status !== 'finished';

        if (!isLobbyAccessible) {
          setError('This exam session has already concluded.');
          return;
        }

        // SEC-06: Seal raw answer keys into private in-memory vault
        sealAnswerKeys(cleanPin, dbExam);

        // SEC-06: Strip answers from exam before storing in localStorage or state
        const safeExam = sanitizeExamForCandidate(dbExam);

        const studentUUID = generateUUID();
        const finalCandidateNo = `CAND-${generateCryptoPin().slice(0, 4)}`;
        const studentData = {
          id: studentUUID,
          name: name.trim(),
          student_name: name.trim(),
          phone: phone.trim(),
          phone_number: phone.trim(),
          candidate_no: finalCandidateNo,
          candidate_number: finalCandidateNo,
          pin_code: cleanPin,
          exam_pin: cleanPin,
          dbExam: safeExam,
        };

        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('ielts_student', JSON.stringify(studentData));
            localStorage.setItem('ielts_current_student', JSON.stringify(studentData));
            localStorage.setItem('current_student', JSON.stringify(studentData));
          }
        } catch (storageErr) {
          console.warn('Failed to save student session to localStorage:', storageErr);
        }

        onJoin(studentData);
      } else {
        setError('Invalid Session PIN. Please verify the exam link with your instructor.');
      }
    } catch (err) {
      console.warn("Validation error:", err);
      setError('Connection error. Please verify your connection and PIN code.');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4 sm:px-6 py-12 relative overflow-hidden select-none">
      
      {/* Decorative Subtle Background Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-slate-200/40 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Progress Dots Indicator (Only shown on form steps) */}
      {step > 0 && (
        <div className="flex items-center gap-2 mb-8 animate-in fade-in duration-300">
          {[1, 2].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                s === step 
                  ? 'w-8 bg-slate-700' 
                  : 'w-3 bg-slate-200'
              }`}
            />
          ))}
        </div>
      )}

      {/* STEP 0: Welcome Screen (Ultra-clean, Minimalist) */}
      {step === 0 && (
        <div className="w-full max-w-3xl flex flex-col items-center text-center space-y-8 animate-in fade-in zoom-in-95 duration-300">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-700 tracking-tight leading-tight">
            Welcome to the IELTS Test
          </h1>

          <div>
            <Button
              size="lg"
              icon={ArrowRight}
              onClick={() => setStep(1)}
              className="px-10 py-3.5 text-base font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-2xl shadow-2xs hover:shadow transition-all transform hover:-translate-y-0.5 cursor-pointer"
            >
              Start
            </Button>
          </div>
        </div>
      )}

      {/* STEP 1: Full Name Input (Large, Minimalist, No Card) */}
      {step === 1 && (
        <div className="w-full max-w-xl flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
          
          <div className="space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
              Step 1 of 2
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-700 tracking-tight">
              Enter your full name
            </h2>
            <p className="text-sm sm:text-base text-slate-500 font-medium max-w-md mx-auto">
              Please enter your full legal name as it appears on your passport or national ID card.
            </p>
          </div>

          <div className="w-full space-y-3">
            <div className="relative">
              <input
                type="text"
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim()) {
                    setStep(2);
                  }
                }}
                placeholder="e.g. Timur Alimov"
                className="w-full text-xl sm:text-2xl font-bold text-center px-6 py-4 sm:py-5 bg-white border-2 border-slate-300 focus:border-slate-700 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all text-slate-700 placeholder:text-slate-300"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-600 font-semibold flex items-center justify-center gap-1 animate-in fade-in">
                <AlertTriangle className="w-3.5 h-3.5" />
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep(0);
              }}
              className="px-6 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <Button
              size="lg"
              disabled={!name.trim()}
              icon={ArrowRight}
              onClick={() => {
                if (!name.trim()) {
                  setError('Please enter your full name');
                  return;
                }
                setError('');
                setStep(2);
              }}
              className="px-8 py-3.5 text-base font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-2xl shadow-2xs cursor-pointer disabled:opacity-40"
            >
              Continue
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            Press <kbd className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono font-bold">Enter ↵</kbd> to continue
          </p>

        </div>
      )}

      {/* STEP 2: Phone Number Input (& Session PIN if missing from URL) */}
      {step === 2 && (
        <div className="w-full max-w-xl flex flex-col items-center text-center space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
          
          <div className="space-y-3">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
              Step 2 of 2
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-700 tracking-tight">
              Enter your phone number
            </h2>
            <p className="text-sm sm:text-base text-slate-500 font-medium max-w-md mx-auto">
              Your contact number is required for official score delivery and proctor communication.
            </p>
          </div>

          <div className="w-full space-y-4">
            <div className="relative">
              <input
                type="tel"
                autoFocus
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (error) setError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && phone.trim()) {
                    handleSubmit();
                  }
                }}
                placeholder="+998 90 123 45 67"
                className="w-full text-xl sm:text-2xl font-mono font-bold text-center px-6 py-4 sm:py-5 bg-white border-2 border-slate-300 focus:border-slate-700 rounded-2xl shadow-sm focus:outline-none focus:ring-4 focus:ring-slate-100 transition-all text-slate-700 placeholder:text-slate-300"
              />
            </div>

            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center justify-center gap-2 animate-in fade-in">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setError('');
                setStep(1);
              }}
              className="px-6 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>

            <Button
              size="lg"
              loading={isValidating}
              disabled={!phone.trim() || isValidating}
              icon={ArrowRight}
              onClick={handleSubmit}
              className="px-8 py-3.5 text-base font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-300 rounded-2xl shadow-2xs cursor-pointer disabled:opacity-40"
            >
              Enter Waiting Room
            </Button>
          </div>

          <p className="text-xs text-slate-400">
            Press <kbd className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono font-bold">Enter ↵</kbd> to enter exam room
          </p>

        </div>
      )}

    </div>
  );
}
