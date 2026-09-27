import React, { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';
import { 
  X, 
  Copy, 
  Check, 
  Maximize2, 
  Minimize2, 
  Sun, 
  Moon, 
  GraduationCap, 
  QrCode as QrIcon,
  ExternalLink,
  Users
} from 'lucide-react';

export function QrCodeModal({ session, onClose }) {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const modalRef = useRef(null);

  const pinCode = session?.pin_code || '';
  const joinUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/join?pin=${pinCode}`
    : `https://exam.domain.com/join?pin=${pinCode}`;

  // Generate high-resolution QR code
  useEffect(() => {
    async function generate() {
      try {
        const url = await QRCode.toDataURL(joinUrl, {
          width: 512,
          margin: 2,
          color: {
            dark: highContrast ? '#000000' : '#0f172a',
            light: '#ffffff'
          },
          errorCorrectionLevel: 'H'
        });
        setQrDataUrl(url);
      } catch (err) {
        console.error("Failed to render QR Code:", err);
      }
    }
    generate();
  }, [joinUrl, highContrast]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, onClose]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const toggleFullscreen = () => {
    if (!isFullscreen && modalRef.current) {
      if (modalRef.current.requestFullscreen) {
        modalRef.current.requestFullscreen().catch(() => {});
      }
      setIsFullscreen(true);
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div 
        ref={modalRef}
        className={`relative w-full max-w-2xl rounded-3xl transition-all duration-300 overflow-hidden shadow-2xl flex flex-col ${
          highContrast ? 'bg-black text-white border-2 border-white' : 'bg-white text-slate-900 border border-slate-200'
        } ${isFullscreen ? 'fixed inset-0 max-w-none rounded-none z-50 h-screen justify-between p-8 sm:p-12' : 'p-6 sm:p-8'}`}
      >
        {/* Header Controls */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-600 flex items-center justify-center font-bold">
              <QrIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg sm:text-xl tracking-tight">
                Classroom Projector Entry
              </h3>
              <p className={`text-xs ${highContrast ? 'text-slate-300' : 'text-slate-500'}`}>
                {session?.title || 'IELTS Mock Exam Room'} &bull; Room {session?.teacher?.room || 'Main Hall'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* High Contrast Projector Mode */}
            <button
              onClick={() => setHighContrast(prev => !prev)}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                highContrast 
                  ? 'bg-white text-black border-white hover:bg-slate-200' 
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
              title="Toggle Projector High Contrast"
            >
              {highContrast ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-slate-600" />}
              <span className="hidden sm:inline">{highContrast ? 'Standard' : 'High Contrast'}</span>
            </button>

            {/* Fullscreen Toggle for Projectors */}
            <button
              onClick={toggleFullscreen}
              className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ${
                highContrast 
                  ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700' 
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Classroom Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit Full' : 'Projector Fullscreen'}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className={`p-2 rounded-xl transition ${
                highContrast ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-100 text-slate-500'
              }`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Center: Large Projector QR Code & Session PIN */}
        <div className="flex-1 flex flex-col items-center justify-center my-6 text-center">
          {/* Big Orange PIN Badge */}
          <div className="mb-5 inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-mono font-black text-2xl sm:text-3xl tracking-wider shadow-lg shadow-orange-500/25 border-2 border-orange-300">
            <span className="text-xs uppercase tracking-widest text-orange-100 font-sans font-bold">SESSION PIN</span>
            <span>{pinCode}</span>
          </div>

          {/* QR Code Container */}
          <div className={`p-4 sm:p-6 rounded-3xl shadow-2xl transition border-4 ${
            highContrast ? 'bg-white border-white shadow-white/10' : 'bg-white border-orange-500/30 shadow-orange-500/10'
          }`}>
            {qrDataUrl ? (
              <img 
                src={qrDataUrl} 
                alt={`QR code for Session ${pinCode}`} 
                className={`${isFullscreen ? 'w-80 h-80 sm:w-96 sm:h-96' : 'w-56 h-56 sm:w-64 sm:h-64'} object-contain rounded-xl select-none`}
              />
            ) : (
              <div className="w-64 h-64 flex items-center justify-center text-slate-400">
                Generating QR...
              </div>
            )}
          </div>

          <p className={`mt-5 text-sm sm:text-base font-semibold max-w-md ${
            highContrast ? 'text-slate-300' : 'text-slate-600'
          }`}>
            Point your smartphone or tablet camera at the QR code to enter the waiting room immediately.
          </p>
        </div>

        {/* Footer: Direct URL Copy Box */}
        <div className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col sm:flex-row items-center justify-between gap-3 ${
          highContrast ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2 overflow-hidden w-full sm:w-auto">
            <GraduationCap className="w-4 h-4 text-orange-500 shrink-0" />
            <span className={`text-xs font-mono truncate select-all ${
              highContrast ? 'text-slate-300' : 'text-slate-700'
            }`}>
              {joinUrl}
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <button
              onClick={handleCopyLink}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-orange-500/20 transition"
            >
              {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Link Copied!' : 'Copy Direct Link'}
            </button>

            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`p-2 rounded-xl border transition ${
                highContrast ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-white text-slate-600'
              }`}
              title="Open test entry in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
