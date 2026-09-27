import React, { useState, useRef } from 'react';
import { 
  BookOpen, 
  PenTool, 
  Headphones, 
  UploadCloud, 
  FileText, 
  CheckCircle2, 
  RefreshCw, 
  Save, 
  Music, 
  Trash2, 
  Check, 
  ExternalLink,
  Layers,
  Clock,
  ShieldAlert,
  Key,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Bot,
  Zap,
  Loader2,
  CheckCircle,
  XCircle,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '../common/Button';
import { getSupabaseClient, updateExamAssets, persistExamAndSections, isValidUUID, generateUUID, generateCryptoPin } from '../../lib/supabase';
import { 
  savePersistentExam, 
  setIndexedDBItem, 
  deleteFromIndexedDB, 
  purgeAllExamData 
} from '../../lib/persistentStorage';
import { apiParseExamPdf, apiParseExamSection } from '../../lib/ai/gemini-client';

export const createEmptyExam = (examId, pinCode = '') => ({
  id: examId,
  title: 'IELTS Academic Master Assessment',
  pin_code: pinCode,
  duration_mins: 60,
  anti_cheat_strictness: 'strict',
  task_1_prompt: '',
  task_2_prompt: '',
  reading_parts: {},
  reading_passages: [],
  reading_questions: [],
  reading_pdf_url: '',
  reading_pdf_name: '',
  reading: { passages: [], sections: [], questions: [], pdf_url: '', pdf_name: '' },
  writing_tasks: {},
  writing: { sections: [] },
  writing_pdf_url: '',
  writing_pdf_name: '',
  listening_audio_parts: { part1: '', part2: '', part3: '', part4: '' },
  listening_audio_names: { part1: '', part2: '', part3: '', part4: '' },
  listening_audio_durations: { part1: '06:45', part2: '07:15', part3: '07:50', part4: '08:30' },
  listening_pdf_url: '',
  listening_pdf_name: '',
  listening_map_image_url: '',
  listening_map_image_name: '',
  listening_parts: [],
  listening_questions: [],
  listening: { parts: [], sections: [], questions: [], pdf_url: '', pdf_name: '', map_image_url: '', map_image_name: '' },
});

const is503Error = (err) => {
  if (!err) return false;
  const status = err.status || err.statusCode || err.response?.status;
  const msg = String(err.message || err.error || '').toLowerCase();
  return (
    status === 503 ||
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
};

const isRateLimitError = (err) => {
  if (!err) return false;
  const status = err.status || err.statusCode || err.response?.status;
  const msg = String(err.message || err.error || '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('quota') ||
    msg.includes('resource_exhausted') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
};

export function TestCreator({ exam, onUpdateExam }) {
  // Global Exam Settings
  const [title, setTitle] = useState(exam.title || 'IELTS Academic Master Assessment 2026');
  const [pinCode, setPinCode] = useState(exam.pin_code || '');
  const [duration, setDuration] = useState(exam.duration_mins || 60);
  const [strictness, setStrictness] = useState(exam.anti_cheat_strictness || 'strict');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // =========================================================================
  // AI PARSING SKELETON STATE
  // =========================================================================
  const [aiParsingState, setAiParsingState] = useState({
    isOpen: false,
    step: '', // 'reading' | 'reading_delay' | 'listening' | 'listening_delay' | 'writing' | 'syncing' | 'completed'
    readingDone: false,
    readingFailed: false,
    listeningDone: false,
    listeningFailed: false,
    writingDone: false,
    writingFailed: false,
    syncDone: false,
    syncFailed: false,
    cooldownNotice: null,
    delaySecondsRemaining: 0,
    error: null,
  });

  // =========================================================================
  // 1. LISTENING SECTION (4 AUDIO SLOTS + 1 PDF BOOKLET)
  // =========================================================================
  const [listeningAudios, setListeningAudios] = useState({
    part1: {
      partId: 1,
      title: 'Part 1: Social Dialogue',
      name: exam.listening_audio_names?.part1 || exam.listening?.parts?.[0]?.audio_name || '',
      url: exam.listening_audio_parts?.part1 || exam.listening?.parts?.[0]?.audio_url || '',
      duration: exam.listening_audio_durations?.part1 || exam.listening?.parts?.[0]?.duration || '06:45',
    },
    part2: {
      partId: 2,
      title: 'Part 2: Community Recreation Guide',
      name: exam.listening_audio_names?.part2 || exam.listening?.parts?.[1]?.audio_name || '',
      url: exam.listening_audio_parts?.part2 || exam.listening?.parts?.[1]?.audio_url || '',
      duration: exam.listening_audio_durations?.part2 || exam.listening?.parts?.[1]?.duration || '07:15',
    },
    part3: {
      partId: 3,
      title: 'Part 3: Academic Tutorial',
      name: exam.listening_audio_names?.part3 || exam.listening?.parts?.[2]?.audio_name || '',
      url: exam.listening_audio_parts?.part3 || exam.listening?.parts?.[2]?.audio_url || '',
      duration: exam.listening_audio_durations?.part3 || exam.listening?.parts?.[2]?.duration || '07:50',
    },
    part4: {
      partId: 4,
      title: 'Part 4: University Lecture',
      name: exam.listening_audio_names?.part4 || exam.listening?.parts?.[3]?.audio_name || '',
      url: exam.listening_audio_parts?.part4 || exam.listening?.parts?.[3]?.audio_url || '',
      duration: exam.listening_audio_durations?.part4 || exam.listening?.parts?.[3]?.duration || '08:30',
    },
  });

  const hasListeningPdf = Boolean(exam.listening_pdf_url || exam.listening?.pdf_url);
  const [listeningPdfs, setListeningPdfs] = useState(
    hasListeningPdf
      ? [{
          name: exam.listening_pdf_name || exam.listening?.pdf_name || '',
          url: exam.listening_pdf_url || exam.listening?.pdf_url || '',
          file: null,
        }]
      : []
  );

  const listeningAudioFileRefs = {
    part1: useRef(null),
    part2: useRef(null),
    part3: useRef(null),
    part4: useRef(null),
  };
  const listeningPdfRef = useRef(null);

  const [listeningMapImage, setListeningMapImage] = useState({
    name: exam.listening_map_image_name || exam.listening?.map_image_name || '',
    url: exam.listening_map_image_url || exam.listening?.map_image_url || '',
    file: null,
  });
  const listeningMapImageRef = useRef(null);

  const allListeningQuestions = [
    ...(exam.listening_questions || []),
    ...(exam.listening?.questions || []),
    ...(exam.listening_parts?.flatMap(p => p.questions || []) || []),
  ];
  const hasMapQuestion = allListeningQuestions.some(q => {
    if (!q) return false;
    const type = String(q.type || '').toUpperCase();
    if (
      type === 'MAP_DIAGRAM_LABELING' ||
      type === 'MAP_LABELLING' ||
      type === 'MAP_LABELING' ||
      type === 'DIAGRAM_LABEL' ||
      type === 'DIAGRAM_LABELING'
    ) {
      return true;
    }
    const combined = `${q.instruction || ''} ${q.prompt || ''} ${q.text || ''}`;
    return /\b(?:label\s+the\s+map|diagram|map)\b/i.test(combined);
  });

  // =========================================================================
  // 2. READING SECTION (1 CONSOLIDATED PDF DROPZONE)
  // =========================================================================
  const hasReadingPdf = Boolean(exam.reading_pdf_url || exam.reading?.pdf_url || exam.reading_parts?.part1?.passage_pdf_url);
  const [readingPdfs, setReadingPdfs] = useState(
    hasReadingPdf
      ? [{
          name: exam.reading_pdf_name || exam.reading?.pdf_name || exam.reading_parts?.part1?.passage_pdf_name || '',
          url: exam.reading_pdf_url || exam.reading?.pdf_url || exam.reading_parts?.part1?.passage_pdf_url || '',
          file: null,
        }]
      : []
  );
  const readingPdfRef = useRef(null);

  // =========================================================================
  // 3. WRITING SECTION (1 CONSOLIDATED PDF DROPZONE)
  // =========================================================================
  const hasWritingPdf = Boolean(exam.writing_pdf_url || exam.writing?.pdf_url || exam.writing_tasks?.task1?.pdf_url);
  const [writingPdf, setWritingPdf] = useState({
    name: hasWritingPdf ? (exam.writing_pdf_name || exam.writing?.pdf_name || exam.writing_tasks?.task1?.pdf_name || '') : '',
    url: exam.writing_pdf_url || exam.writing?.pdf_url || exam.writing_tasks?.task1?.pdf_url || '',
    file: null,
  });
  const writingPdfRef = useRef(null);

  // =========================================================================
  // STORAGE & UPLOAD UTILS
  // =========================================================================
  const readFileAsDataUrl = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getAudioDurationString = (fileOrUrl) => {
    return new Promise((resolve) => {
      const tempAudio = new Audio();
      tempAudio.onloadedmetadata = () => {
        const mins = Math.floor(tempAudio.duration / 60);
        const secs = Math.floor(tempAudio.duration % 60);
        resolve(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
      };
      tempAudio.onerror = () => resolve('07:00');
      if (typeof fileOrUrl === 'string') {
        tempAudio.src = fileOrUrl;
      } else {
        try {
          tempAudio.src = URL.createObjectURL(fileOrUrl);
        } catch {
          resolve('07:00');
        }
      }
    });
  };

  const uploadAssetToStorage = async (file, bucketName = 'exam-assets') => {
    if (!file) return '';
    if (typeof file === 'string') return file;

    const supabase = getSupabaseClient();
    // Only attempt Supabase storage upload if bucket hasn't previously been detected as missing
    if (supabase && (typeof window === 'undefined' || window.__supabase_bucket_available !== false)) {
      try {
        const fileExt = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const { data, error } = await supabase.storage.from(bucketName).upload(fileName, file);

        if (error) {
          const errMsg = error.message || '';
          if (errMsg.includes('Bucket not found') || error.statusCode === '404' || error.status === 400 || error.error === 'Bucket not found') {
            if (typeof window !== 'undefined') window.__supabase_bucket_available = false;
            console.info(`[Storage] Supabase bucket '${bucketName}' not found. Falling back gracefully to persistent DataURL.`);
          }
        } else if (data?.path) {
          const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(data.path);
          if (publicUrlData?.publicUrl) {
            return publicUrlData.publicUrl;
          }
        }
      } catch (err) {
        if (typeof window !== 'undefined') window.__supabase_bucket_available = false;
        console.warn("Supabase storage upload fallback to persistent DataURL:", err);
      }
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      return dataUrl;
    } catch {
      return URL.createObjectURL(file);
    }
  };

  // =========================================================================
  // FILE HANDLERS
  // =========================================================================

  // Listening Audio Upload
  const handleListeningAudioUpload = async (partKey, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const durationStr = await getAudioDurationString(file);
      const url = await uploadAssetToStorage(file);
      setListeningAudios(prev => ({
        ...prev,
        [partKey]: {
          ...prev[partKey],
          name: file.name,
          url,
          duration: durationStr,
        }
      }));
    } catch (err) {
      console.error(`Listening audio ${partKey} upload failed:`, err);
      alert('Failed to upload Audio: ' + err.message);
    }
  };

  const handleRemoveListeningAudio = async (partKey) => {
    setListeningAudios(prev => ({
      ...prev,
      [partKey]: {
        ...prev[partKey],
        name: '',
        url: '',
        duration: '07:00',
      }
    }));
    if (listeningAudioFileRefs[partKey]?.current) {
      listeningAudioFileRefs[partKey].current.value = '';
    }

    try {
      await deleteFromIndexedDB(`listening_audio_${partKey}`);
      try { localStorage.removeItem(`ielts_listening_audio_${partKey}`); } catch (e) {}

      const updatedListeningParts = exam.listening?.parts?.map(p => {
        const pKey = `part${p.partId}`;
        if (pKey === partKey) {
          return { ...p, audio_url: '', audio_name: '' };
        }
        return p;
      }) || [];

      const updatedExam = {
        ...exam,
        listening_audio_parts: {
          ...(exam.listening_audio_parts || {}),
          [partKey]: '',
        },
        listening_audio_names: {
          ...(exam.listening_audio_names || {}),
          [partKey]: '',
        },
        listening: {
          ...(exam.listening || {}),
          parts: updatedListeningParts,
        },
      };

      await savePersistentExam(updatedExam);
      if (onUpdateExam) onUpdateExam(updatedExam);
    } catch (err) {
      console.warn("Failed to update persistent storage on audio remove:", err);
    }
  };

  // Listening PDF Booklet Upload (Multi or Single File)
  const handleListeningPdfUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const invalid = files.find(f => !f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf');
    if (invalid) {
      alert('Please upload ONLY PDF files (.pdf) for the Listening booklets.');
      return;
    }
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadAssetToStorage(file);
        return { name: file.name, url, file };
      }));
      setListeningPdfs(prev => [...prev, ...uploaded]);
    } catch (err) {
      console.error('Listening booklet upload failed:', err);
      alert('Failed to upload PDF: ' + err.message);
    }
  };

  const handleRemoveListeningPdf = (index) => {
    setListeningPdfs(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAllListeningPdfs = async () => {
    setListeningPdfs([]);
    if (listeningPdfRef.current) listeningPdfRef.current.value = '';
    try {
      await deleteFromIndexedDB('listening_pdf');
      try { localStorage.removeItem('ielts_listening_pdf'); } catch (e) {}
      const updatedExam = {
        ...exam,
        listening_pdf_url: '',
        listening_pdf_name: '',
        listening: { ...(exam.listening || {}), pdf_url: '', pdf_name: '' },
      };
      await savePersistentExam(updatedExam);
      if (onUpdateExam) onUpdateExam(updatedExam);
    } catch (err) {
      console.warn("Failed to update persistent storage on listening PDFs remove:", err);
    }
  };

  // Listening Map / Diagram Image Upload
  const handleListeningMapImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    const validExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const hasValidExt = validExts.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!validTypes.includes(file.type) && !hasValidExt) {
      alert('Please upload ONLY PNG, JPG, or WEBP images for the Listening map/diagram.');
      return;
    }
    try {
      const url = await uploadAssetToStorage(file);
      setListeningMapImage({
        name: file.name,
        url,
        file,
      });
    } catch (err) {
      console.error('Listening map image upload failed:', err);
      alert('Failed to upload image: ' + err.message);
    }
  };

  const handleRemoveListeningMapImage = async () => {
    setListeningMapImage({ name: '', url: '', file: null });
    if (listeningMapImageRef.current) listeningMapImageRef.current.value = '';
    try {
      await deleteFromIndexedDB('listening_map_image');
      try { localStorage.removeItem('ielts_listening_map_image'); } catch (e) {}
      const updatedExam = {
        ...exam,
        listening_map_image_url: '',
        listening_map_image_name: '',
        listening: {
          ...(exam.listening || {}),
          map_image_url: '',
          map_image_name: '',
        },
      };
      await savePersistentExam(updatedExam);
      if (onUpdateExam) onUpdateExam(updatedExam);
    } catch (err) {
      console.warn("Failed to update persistent storage on listening map image remove:", err);
    }
  };

  // Reading PDF Upload (Multi or Single File)
  const handleReadingPdfUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const invalid = files.find(f => !f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf');
    if (invalid) {
      alert('Please upload ONLY PDF files (.pdf) for the Reading booklets.');
      return;
    }
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const url = await uploadAssetToStorage(file);
        return { name: file.name, url, file };
      }));
      setReadingPdfs(prev => [...prev, ...uploaded]);
    } catch (err) {
      console.error('Reading booklet upload failed:', err);
      alert('Failed to upload Reading PDF: ' + err.message);
    }
  };

  const handleRemoveReadingPdf = (index) => {
    setReadingPdfs(prev => prev.filter((_, i) => i !== index));
  };

  const handleRemoveAllReadingPdfs = async () => {
    setReadingPdfs([]);
    if (readingPdfRef.current) readingPdfRef.current.value = '';
    try {
      await deleteFromIndexedDB('reading_pdf');
      try { localStorage.removeItem('ielts_reading_pdf'); } catch (e) {}
      const updatedExam = {
        ...exam,
        reading_pdf_url: '',
        reading_pdf_name: '',
        reading: { ...(exam.reading || {}), pdf_url: '', pdf_name: '' },
        reading_parts: {
          ...(exam.reading_parts || {}),
          part1: { ...(exam.reading_parts?.part1 || {}), passage_pdf_url: '', passage_pdf_name: '', pdf_url: '', pdf_name: '' },
          part2: { ...(exam.reading_parts?.part2 || {}), passage_pdf_url: '', passage_pdf_name: '', pdf_url: '', pdf_name: '' },
          part3: { ...(exam.reading_parts?.part3 || {}), passage_pdf_url: '', passage_pdf_name: '', pdf_url: '', pdf_name: '' },
        },
      };
      await savePersistentExam(updatedExam);
      if (onUpdateExam) onUpdateExam(updatedExam);
    } catch (err) {
      console.warn('Failed to update persistent storage on reading PDFs remove:', err);
    }
  };

  // Writing PDF Upload (Single Consolidated File)
  const handleWritingPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please upload ONLY PDF files (.pdf) for Writing.');
      return;
    }

    try {
      const url = await uploadAssetToStorage(file);
      setWritingPdf({
        name: file.name,
        url,
        file,
      });
    } catch (err) {
      console.error('Writing booklet upload failed:', err);
      alert('Failed to upload Writing PDF: ' + err.message);
    }
  };

  const handleRemoveWritingPdf = async () => {
    setWritingPdf({
      name: '',
      url: '',
      file: null,
    });
    if (writingPdfRef.current) {
      writingPdfRef.current.value = '';
    }

    try {
      await deleteFromIndexedDB('writing_pdf');
      try { localStorage.removeItem('ielts_writing_pdf'); } catch (e) {}

      const updatedExam = {
        ...exam,
        writing_pdf_url: '',
        writing_pdf_name: '',
        writing: {
          ...(exam.writing || {}),
          pdf_url: '',
          pdf_name: '',
        },
        writing_tasks: {
          ...(exam.writing_tasks || {}),
          task1: { ...(exam.writing_tasks?.task1 || {}), pdf_url: '', pdf_name: '' },
          task2: { ...(exam.writing_tasks?.task2 || {}), pdf_url: '', pdf_name: '' },
        },
      };

      await savePersistentExam(updatedExam);
      if (onUpdateExam) onUpdateExam(updatedExam);
    } catch (err) {
      console.warn("Failed to update persistent storage on writing PDF remove:", err);
    }
  };

  // Generate PIN
  const generateNewPin = () => {
    setPinCode(generateCryptoPin());
  };

  // =========================================================================
  // SAVE & APPLY EXAM CONFIGURATION (WITH AI PARSING SKELETON)
  // =========================================================================
  const handleSaveExam = async () => {
    setIsSaving(true);
    setAiParsingState({
      isOpen: true,
      step: '',
      readingDone: false,
      readingFailed: false,
      listeningDone: false,
      listeningFailed: false,
      writingDone: false,
      writingFailed: false,
      syncDone: false,
      syncFailed: false,
      cooldownNotice: null,
      delaySecondsRemaining: 0,
      error: null,
    });

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const executeSectionWithRetry = async (sectionType, fileObj) => {
      let attempt = 0;
      while (true) {
        try {
          const filesToParse =
            sectionType === 'reading'
              ? (readingPdfs && readingPdfs.some((p) => p.file) ? readingPdfs.filter((p) => p.file) : [fileObj])
              : sectionType === 'listening'
              ? (listeningPdfs && listeningPdfs.some((p) => p.file) ? listeningPdfs.filter((p) => p.file) : [fileObj])
              : [fileObj];

          return await apiParseExamSection({
            sectionType,
            file: fileObj.file,
            files: filesToParse,
            fileName: fileObj.name,
          });
        } catch (err) {
          const is503 = is503Error(err);
          const isRateLimit = isRateLimitError(err);

          if (is503 && attempt < 3) {
            attempt++;
            for (let s = 4; s > 0; s--) {
              setAiParsingState((prev) => ({
                ...prev,
                cooldownNotice: `Google model busy. Retrying in ${s}s (attempt ${attempt}/3)...`,
              }));
              await sleep(1000);
            }
            setAiParsingState((prev) => ({ ...prev, cooldownNotice: null }));
            continue;
          }

          if (isRateLimit && attempt < 3) {
            attempt++;
            for (let s = 60; s > 0; s--) {
              setAiParsingState((prev) => ({
                ...prev,
                cooldownNotice: `Gemini free-tier quota reached. Cooldown active: waiting ${s}s (attempt ${attempt}/3)...`,
              }));
              await sleep(1000);
            }
            setAiParsingState((prev) => ({ ...prev, cooldownNotice: null }));
            continue;
          }
          throw err;
        }
      }
    };

    try {
      let readingParsed = null;
      let listeningParsed = null;
      let writingParsed = null;
      let extractedTask1Prompt = exam.task_1_prompt || exam.writing_tasks?.task1?.prompt || '';
      let extractedTask2Prompt = exam.task_2_prompt || exam.writing_tasks?.task2?.prompt || '';

      const readingPdf = readingPdfs.find((p) => p.file) || readingPdfs[0] || { name: '', url: '', file: null };
      const listeningPdf = listeningPdfs.find((p) => p.file) || listeningPdfs[0] || { name: '', url: '', file: null };

      // 1. Sequential Step: Reading PDF
      if (readingPdf.file) {
        setAiParsingState((prev) => ({ ...prev, step: 'reading', readingFailed: false }));
        try {
          readingParsed = await executeSectionWithRetry('reading', readingPdf);
          setAiParsingState((prev) => ({ ...prev, readingDone: true }));
        } catch (err) {
          setAiParsingState((prev) => ({ ...prev, readingFailed: true }));
          throw new Error(`Reading parsing failed: ${err.message}`);
        }

        // 4-second delay if other sections follow
        if (listeningPdf.file || writingPdf.file) {
          setAiParsingState((prev) => ({ ...prev, step: 'reading_delay' }));
          for (let d = 4; d > 0; d--) {
            setAiParsingState((prev) => ({ ...prev, delaySecondsRemaining: d }));
            await sleep(1000);
          }
          setAiParsingState((prev) => ({ ...prev, delaySecondsRemaining: 0 }));
        }
      } else {
        setAiParsingState((prev) => ({ ...prev, readingDone: true }));
      }

      // 2. Sequential Step: Listening PDF
      if (listeningPdf.file) {
        setAiParsingState((prev) => ({ ...prev, step: 'listening', listeningFailed: false }));
        try {
          listeningParsed = await executeSectionWithRetry('listening', listeningPdf);
          setAiParsingState((prev) => ({ ...prev, listeningDone: true }));
        } catch (err) {
          setAiParsingState((prev) => ({ ...prev, listeningFailed: true }));
          throw new Error(`Listening parsing failed: ${err.message}`);
        }

        // 4-second delay if Writing follows
        if (writingPdf.file) {
          setAiParsingState((prev) => ({ ...prev, step: 'listening_delay' }));
          for (let d = 4; d > 0; d--) {
            setAiParsingState((prev) => ({ ...prev, delaySecondsRemaining: d }));
            await sleep(1000);
          }
          setAiParsingState((prev) => ({ ...prev, delaySecondsRemaining: 0 }));
        }
      } else {
        setAiParsingState((prev) => ({ ...prev, listeningDone: true }));
      }

      // 3. Sequential Step: Writing PDF
      if (writingPdf.file) {
        setAiParsingState((prev) => ({ ...prev, step: 'writing', writingFailed: false }));
        try {
          writingParsed = await executeSectionWithRetry('writing', writingPdf);
          setAiParsingState((prev) => ({ ...prev, writingDone: true }));
        } catch (err) {
          setAiParsingState((prev) => ({ ...prev, writingFailed: true }));
          throw new Error(`Writing parsing failed: ${err.message}`);
        }
      } else {
        setAiParsingState((prev) => ({ ...prev, writingDone: true }));
      }

      if (writingParsed?.task_1_prompt) extractedTask1Prompt = writingParsed.task_1_prompt;
      if (writingParsed?.task_2_prompt) extractedTask2Prompt = writingParsed.task_2_prompt;

      setAiParsingState((prev) => ({
        ...prev,
        readingDone: true,
        listeningDone: true,
        writingDone: true,
        step: 'syncing',
      }));

      const resolvePassageField = (idx, partKey, field) => {
        const fromPassage = readingParsed?.passages?.[idx];
        const fromSection = readingParsed?.sections?.[idx];
        const fromPart = readingParsed?.parts?.[partKey];
        const fromExam = (exam.reading_passages || exam.reading?.passages || [])[idx] || exam.reading_parts?.[partKey];

        if (field === 'title') {
          return fromPassage?.title || fromSection?.title || fromPart?.title || fromExam?.title || `Passage ${idx + 1}`;
        }
        if (field === 'content') {
          return (
            fromPassage?.content ||
            fromPassage?.passage_text ||
            fromPassage?.passageText ||
            fromPassage?.text ||
            fromSection?.content ||
            fromSection?.passage_text ||
            fromSection?.passageText ||
            fromSection?.text ||
            fromPart?.content ||
            fromPart?.passage_text ||
            fromPart?.passageText ||
            fromPart?.text ||
            fromExam?.content ||
            fromExam?.passage_text ||
            fromExam?.passageText ||
            fromExam?.text ||
            ''
          );
        }
        if (field === 'page_content_html') {
          return (
            fromPassage?.page_content_html ||
            fromPassage?.pageContentHtml ||
            fromSection?.page_content_html ||
            fromSection?.pageContentHtml ||
            fromPart?.page_content_html ||
            fromExam?.page_content_html ||
            ''
          );
        }
        if (field === 'paragraphs') {
          return fromPassage?.paragraphs || fromSection?.paragraphs || fromPart?.paragraphs || fromExam?.paragraphs || [];
        }
        if (field === 'reference_box') {
          return (
            fromPassage?.reference_box ||
            fromPassage?.referenceBox ||
            fromSection?.reference_box ||
            fromSection?.referenceBox ||
            fromPart?.reference_box ||
            fromPart?.referenceBox ||
            fromExam?.reference_box ||
            fromExam?.referenceBox ||
            readingParsed?.reference_box ||
            readingParsed?.referenceBox ||
            null
          );
        }
        return '';
      };

      // Dynamic boundary resolver for reading passages
      const getPassageQuestionBounds = (idx, pId) => {
        const partKey = `part${pId}`;
        const passageQuestions = readingParsed?.passages?.[idx]?.questions;
        const pQuestions = (Array.isArray(passageQuestions) && passageQuestions.length > 0)
          ? passageQuestions
          : (readingParsed?.questions || []).filter(q => Number(q.passageId || q.passage_id || q.partId) === pId);

        const pQNums = pQuestions
          .map(q => Number(q.q_num || q.questionNumber))
          .filter(n => !isNaN(n) && n > 0);

        const startQ = pQNums.length > 0 ? Math.min(...pQNums) : null;
        const endQ = pQNums.length > 0 ? Math.max(...pQNums) : null;
        const questions_count = pQNums.length;
        const fallbackRange = readingParsed?.parts?.[partKey]?.questionRange || readingParsed?.parts?.[partKey]?.range || '';
        const range = (startQ !== null && endQ !== null)
          ? `Questions ${startQ}–${endQ}`
          : fallbackRange;

        return { startQ, endQ, questions_count, range };
      };

      // Build structured Reading parts and passages (preserve existing if no new reading file parsed)
      const p1Bounds = getPassageQuestionBounds(0, 1);
      const p2Bounds = getPassageQuestionBounds(1, 2);
      const p3Bounds = getPassageQuestionBounds(2, 3);

      const readingParts = readingParsed ? {
        part1: {
          partId: 1,
          title: resolvePassageField(0, 'part1', 'title'),
          range: p1Bounds.range,
          startQ: p1Bounds.startQ,
          endQ: p1Bounds.endQ,
          passage_pdf_name: readingPdf.name,
          passage_pdf_url: readingPdf.url,
          passage_text: resolvePassageField(0, 'part1', 'content'),
          content: resolvePassageField(0, 'part1', 'content'),
          paragraphs: resolvePassageField(0, 'part1', 'paragraphs'),
          page_content_html: resolvePassageField(0, 'part1', 'page_content_html'),
          reference_box: resolvePassageField(0, 'part1', 'reference_box'),
          referenceBox: resolvePassageField(0, 'part1', 'reference_box'),
          questions_count: p1Bounds.questions_count,
          answer_keys: readingParsed.answerKeys || {},
        },
        part2: {
          partId: 2,
          title: resolvePassageField(1, 'part2', 'title'),
          range: p2Bounds.range,
          startQ: p2Bounds.startQ,
          endQ: p2Bounds.endQ,
          passage_pdf_name: readingPdf.name,
          passage_pdf_url: readingPdf.url,
          passage_text: resolvePassageField(1, 'part2', 'content'),
          content: resolvePassageField(1, 'part2', 'content'),
          paragraphs: resolvePassageField(1, 'part2', 'paragraphs'),
          page_content_html: resolvePassageField(1, 'part2', 'page_content_html'),
          reference_box: resolvePassageField(1, 'part2', 'reference_box'),
          referenceBox: resolvePassageField(1, 'part2', 'reference_box'),
          questions_count: p2Bounds.questions_count,
          answer_keys: readingParsed.answerKeys || {},
        },
        part3: {
          partId: 3,
          title: resolvePassageField(2, 'part3', 'title'),
          range: p3Bounds.range,
          startQ: p3Bounds.startQ,
          endQ: p3Bounds.endQ,
          passage_pdf_name: readingPdf.name,
          passage_pdf_url: readingPdf.url,
          passage_text: resolvePassageField(2, 'part3', 'content'),
          content: resolvePassageField(2, 'part3', 'content'),
          paragraphs: resolvePassageField(2, 'part3', 'paragraphs'),
          page_content_html: resolvePassageField(2, 'part3', 'page_content_html'),
          reference_box: resolvePassageField(2, 'part3', 'reference_box'),
          referenceBox: resolvePassageField(2, 'part3', 'reference_box'),
          questions_count: p3Bounds.questions_count,
          answer_keys: readingParsed.answerKeys || {},
        },
      } : (exam.reading_parts || {});

      const readingPassagesPayload = [1, 2, 3].map(pId => {
        const idx = pId - 1;
        const partKey = `part${pId}`;
        const p = readingParsed?.passages?.[idx] || readingParsed?.sections?.[idx];
        const passageRefBox = p?.reference_box || p?.referenceBox || readingParsed?.reference_box || resolvePassageField(idx, partKey, 'reference_box') || null;
        const content = resolvePassageField(idx, partKey, 'content');
        const bounds = getPassageQuestionBounds(idx, pId);
        return {
          id: pId,
          title: resolvePassageField(idx, partKey, 'title'),
          content: content,
          passage_text: content,
          passageText: content,
          text: content,
          page_content_html: resolvePassageField(idx, partKey, 'page_content_html'),
          paragraphs: resolvePassageField(idx, partKey, 'paragraphs'),
          question_range: bounds.range,
          reference_box: passageRefBox,
          referenceBox: passageRefBox,
          pdf_name: readingPdf.name || exam.reading_pdf_name || '',
          pdf_url: readingPdf.url || exam.reading_pdf_url || '',
        };
      });

      const readingQuestions = readingParsed?.questions || exam.reading_questions || exam.reading?.questions || [];

      // Build structured Writing tasks (preserve existing if no new writing file parsed)
      const writingPayload = writingParsed ? {
        task1: {
          title: writingParsed.tasks?.task1?.title || 'Task 1: Academic Report',
          recommended_mins: writingParsed.tasks?.task1?.recommended_mins || 20,
          min_words: writingParsed.tasks?.task1?.min_words || 150,
          prompt: extractedTask1Prompt || writingParsed.tasks?.task1?.prompt || 'Please refer to the attached Task 1 PDF booklet for the prompt instructions and data visualization.',
          page_content_html: writingParsed.sections?.[0]?.page_content_html || writingParsed.tasks?.task1?.page_content_html || '',
          visual_description: writingParsed.tasks?.task1?.visual_description || '',
          page_index: typeof writingParsed.tasks?.task1?.page_index === 'number' 
            ? writingParsed.tasks.task1.page_index 
            : (typeof writingParsed.sections?.[0]?.page_index === 'number' ? writingParsed.sections[0].page_index : 0),
          pdf_name: writingPdf.name,
          pdf_url: writingPdf.url,
        },
        task2: {
          title: writingParsed.tasks?.task2?.title || 'Task 2: Discursive Essay',
          recommended_mins: writingParsed.tasks?.task2?.recommended_mins || 40,
          min_words: writingParsed.tasks?.task2?.min_words || 250,
          prompt: extractedTask2Prompt || writingParsed.tasks?.task2?.prompt || 'Please refer to the attached Task 2 PDF booklet for the prompt instructions and essay topic.',
          page_content_html: writingParsed.sections?.[1]?.page_content_html || writingParsed.tasks?.task2?.page_content_html || '',
          page_index: typeof writingParsed.tasks?.task2?.page_index === 'number' 
            ? writingParsed.tasks.task2.page_index 
            : (typeof writingParsed.sections?.[1]?.page_index === 'number' ? writingParsed.sections[1].page_index : 1),
          pdf_name: writingPdf.name,
          pdf_url: writingPdf.url,
        },
      } : (exam.writing_tasks || exam.writing || {});

      // Build structured Listening parts with full template, instruction, and reference box propagation
      const resolveListeningPartSource = (idx) => {
        return listeningParsed?.parts?.[idx] || listeningParsed?.sections?.[idx] || {};
      };

      const listeningPartsPayload = [1, 2, 3, 4].map((partNum) => {
        const idx = partNum - 1;
        const partSrc = resolveListeningPartSource(idx);
        const audioKey = `part${partNum}`;
        const audioObj = listeningAudios[audioKey] || {};

        return {
          partId: partNum,
          part: partNum,
          title: partSrc.title || `Part ${partNum}`,
          audio_name: audioObj.name || '',
          audio_url: audioObj.url || '',
          duration: audioObj.duration || '',
          instruction: partSrc.instruction || '',
          notes_template: partSrc.notes_template || partSrc.notesTemplate || '',
          table_template: partSrc.table_template || partSrc.tableTemplate || '',
          reference_box: partSrc.reference_box || partSrc.referenceBox || null,
          referenceBox: partSrc.reference_box || partSrc.referenceBox || null,
          page_content_html: partSrc.page_content_html || '',
        };
      });

      const listeningAudioParts = {
        part1: listeningAudios.part1.url,
        part2: listeningAudios.part2.url,
        part3: listeningAudios.part3.url,
        part4: listeningAudios.part4.url,
      };

      const listeningAudioNames = {
        part1: listeningAudios.part1.name,
        part2: listeningAudios.part2.name,
        part3: listeningAudios.part3.name,
        part4: listeningAudios.part4.name,
      };

      const listeningAudioDurations = {
        part1: listeningAudios.part1.duration,
        part2: listeningAudios.part2.duration,
        part3: listeningAudios.part3.duration,
        part4: listeningAudios.part4.duration,
      };

      const rawListeningQuestions = listeningParsed?.questions || exam.listening_questions || exam.listening?.questions || [];
      const listeningQuestions = rawListeningQuestions.map((q) => {
        const pId = Number(q.partId || q.part || 1);
        const parentPart = listeningPartsPayload.find((p) => p.partId === pId) || resolveListeningPartSource(pId - 1);
        const inheritedNotesTemplate = q.notes_template || q.summary_template || parentPart.notes_template || '';
        const inheritedTableTemplate = q.table_template || parentPart.table_template || '';
        const inheritedInstruction = q.instruction || parentPart.instruction || '';
        const inheritedRefBox = q.reference_box || q.referenceBox || parentPart.reference_box || null;

        return {
          ...q,
          instruction: inheritedInstruction,
          notes_template: inheritedNotesTemplate,
          summary_template: inheritedNotesTemplate,
          table_template: inheritedTableTemplate,
          reference_box: inheritedRefBox,
          referenceBox: inheritedRefBox,
        };
      });

      const targetExamId = (exam?.id && isValidUUID(exam.id))
        ? exam.id
        : (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : generateUUID());

      // Consolidated Exam object with dynamic task prompts and visual sections
      const updatedExam = {
        ...exam,
        id: targetExamId,
        title,
        pin_code: pinCode || exam.pin_code || generateCryptoPin(),
        duration_mins: Number(duration),
        anti_cheat_strictness: strictness,
        task_1_prompt: extractedTask1Prompt,
        task_2_prompt: extractedTask2Prompt,
        // Reading
        reading_parts: readingParts,
        reading_passages: readingPassagesPayload,
        reading_pdf_url: readingPdf.url,
        reading_pdf_name: readingPdf.name,
        reading_questions: readingQuestions,
        reading: {
          ...exam.reading,
          passages: readingPassagesPayload,
          sections: readingParsed?.sections || exam.reading?.sections || [],
          questions: readingQuestions,
          pdf_url: readingPdf.url,
          pdf_name: readingPdf.name,
        },
        // Writing
        writing_tasks: writingPayload,
        writing: {
          ...writingPayload,
          sections: writingParsed?.sections || exam.writing?.sections || [],
        },
        writing_pdf_url: writingPdf.url,
        writing_pdf_name: writingPdf.name,
        // Listening
        listening_audio_parts: listeningAudioParts,
        listening_audio_names: listeningAudioNames,
        listening_audio_durations: listeningAudioDurations,
        listening_pdf_url: listeningPdf.url,
        listening_pdf_name: listeningPdf.name,
        listening_map_image_url: listeningMapImage.url,
        listening_map_image_name: listeningMapImage.name,
        listening_parts: listeningPartsPayload,
        listening_questions: listeningQuestions,
        listening: {
          ...exam.listening,
          parts: listeningPartsPayload,
          sections: listeningParsed?.sections || exam.listening?.sections || [],
          questions: listeningQuestions,
          pdf_url: listeningPdf.url,
          pdf_name: listeningPdf.name,
          map_image_url: listeningMapImage.url,
          map_image_name: listeningMapImage.name,
        },
      };

      // 1. Persistent local storage
      await savePersistentExam(updatedExam);

      // 2. Broadcast and update App state
      onUpdateExam(updatedExam);

      // 3. Persist to Supabase exams and exam_sections tables
      try {
        await persistExamAndSections(targetExamId, {
          title,
          pin_code: pinCode,
          duration_mins: Number(duration),
          task_1_prompt: extractedTask1Prompt,
          task_2_prompt: extractedTask2Prompt,
          reading: {
            passages: readingPassagesPayload,
            sections: readingParsed?.sections || [],
            questions: readingQuestions,
            parts: readingParts,
            pdf_url: readingPdf.url,
            pdf_name: readingPdf.name,
            answerKeys: readingParsed?.answerKeys || {},
          },
          listening: {
            parts: listeningPartsPayload,
            sections: listeningParsed?.sections || [],
            questions: listeningQuestions,
            audio_parts: listeningAudioParts,
            pdf_url: listeningPdf.url,
            pdf_name: listeningPdf.name,
            map_image_url: listeningMapImage.url,
            map_image_name: listeningMapImage.name,
            answerKeys: listeningParsed?.answerKeys || {},
          },
          writing: {
            tasks: writingPayload,
            sections: writingParsed?.sections || [],
            task_1_prompt: extractedTask1Prompt,
            task_2_prompt: extractedTask2Prompt,
            pdf_url: writingPdf.url,
            pdf_name: writingPdf.name,
          },
        });

        await updateExamAssets(targetExamId, {
          title,
          pin_code: pinCode,
          duration_mins: Number(duration),
          anti_cheat_strictness: strictness,
          task_1_prompt: extractedTask1Prompt,
          task_2_prompt: extractedTask2Prompt,
          reading_parts: readingParts,
          reading_passages: readingPassagesPayload,
          reading_questions: readingQuestions,
          reading_pdf_url: readingPdf.url,
          reading_pdf_name: readingPdf.name,
          writing_tasks: writingPayload,
          writing_pdf_url: writingPdf.url,
          writing_pdf_name: writingPdf.name,
          listening_audio_parts: listeningAudioParts,
          listening_audio_names: listeningAudioNames,
          listening_audio_durations: listeningAudioDurations,
          listening_pdf_url: listeningPdf.url,
          listening_pdf_name: listeningPdf.name,
          listening_map_image_url: listeningMapImage.url,
          listening_map_image_name: listeningMapImage.name,
          listening_parts: listeningPartsPayload,
          listening_questions: listeningQuestions,
        });
      } catch (sbErr) {
        console.warn("Supabase asset sync skipped/failed:", sbErr);
      }

      setAiParsingState(prev => ({ ...prev, syncDone: true, step: 'completed' }));
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setAiParsingState(prev => ({ ...prev, isOpen: false }));
      }, 1500);

    } catch (err) {
      console.error("Save & AI parse exam error:", err);
      setAiParsingState(prev => ({ ...prev, error: err.message || "Failed to process exam assets." }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!window.confirm("Вы уверены, что хотите очистить черновик формы создания теста? Несохраненные загруженные файлы и параметры формы будут сброшены.")) {
      return;
    }

    // Reset local drafts in TestCreator without purging active database rooms or wiping exam state
    setListeningPdfs([]);
    setListeningMapImage({ name: '', url: '', file: null });
    setReadingPdfs([]);
    setWritingPdf({ name: '', url: '', file: null });
    setListeningAudios({
      part1: { partId: 1, title: 'Part 1: Social Dialogue', name: '', url: '', duration: '06:45' },
      part2: { partId: 2, title: 'Part 2: Community Recreation Guide', name: '', url: '', duration: '07:15' },
      part3: { partId: 3, title: 'Part 3: Academic Tutorial', name: '', url: '', duration: '07:50' },
      part4: { partId: 4, title: 'Part 4: University Lecture', name: '', url: '', duration: '08:30' },
    });

    if (listeningPdfRef.current) listeningPdfRef.current.value = '';
    if (readingPdfRef.current) readingPdfRef.current.value = '';
    if (writingPdfRef.current) writingPdfRef.current.value = '';
    if (listeningMapImageRef.current) listeningMapImageRef.current.value = '';
    Object.values(listeningAudioFileRefs).forEach(ref => {
      if (ref?.current) ref.current.value = '';
    });

    try { localStorage.removeItem('ielts_listening_pdf'); } catch (e) {}
    try { localStorage.removeItem('ielts_listening_map_image'); } catch (e) {}
    try { localStorage.removeItem('ielts_reading_pdf'); } catch (e) {}
    try { localStorage.removeItem('ielts_writing_pdf'); } catch (e) {}

    setTitle(exam.title || 'IELTS Academic Master Assessment 2026');
    setDuration(exam.duration_mins || 60);
    setStrictness(exam.anti_cheat_strictness || 'strict');
    setPinCode(exam.pin_code || '');
  };

  return (
    <div className="space-y-8 pb-12 max-w-7xl mx-auto">
      
      {/* ========================================================================= */}
      {/* TOP GLOBAL CONTROL CARD */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-600">
                Test Creator & Asset Pipeline
              </span>
              <span className="px-2.5 py-0.5 rounded-md bg-orange-100 text-brand-700 font-mono text-[10px] font-bold border border-brand-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-brand-500" />
                Gemini AI Multi-Modal Ready
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-1">
              Consolidated 3-PDF Exam Pipeline
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload 1 PDF per section (Listening + Audios, Reading Passages & Questions, Writing Tasks). AI automatically extracts structures and answer keys upon activation.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="md"
              icon={RefreshCw}
              onClick={handleResetToDefault}
              className="py-2.5 px-4 font-bold text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200"
            >
              Сбросить
            </Button>
            <Button
              variant="primary"
              size="lg"
              icon={savedSuccess ? CheckCircle2 : Save}
              onClick={handleSaveExam}
              disabled={isSaving}
              className="flex-1 sm:flex-initial py-3 px-6 font-extrabold text-sm shadow-md bg-brand-500 hover:bg-brand-600 text-white transition-all transform active:scale-95 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  Processing Materials...
                </>
              ) : savedSuccess ? (
                '✓ Saved & Activated!'
              ) : (
                'Save & Apply Configuration'
              )}
            </Button>
          </div>
        </div>

        {savedSuccess && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-800 flex items-center gap-3 animate-fadeIn">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <div className="text-xs font-extrabold text-emerald-900">Exam Materials Successfully Saved & Activated!</div>
              <div className="text-[11px] text-emerald-700">All uploaded PDF files and audio tracks are parsed and live for candidate workstations.</div>
            </div>
          </div>
        )}

        {/* Global Settings Inputs Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Exam Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 font-semibold text-slate-900 bg-white"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Session PIN
            </label>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={pinCode}
                onChange={(e) => setPinCode(e.target.value.toUpperCase())}
                className="w-full pl-3.5 pr-2 py-2 text-xs rounded-xl border-2 border-brand-500 bg-orange-50/40 text-brand-700 font-mono font-extrabold tracking-wider uppercase focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button"
                onClick={generateNewPin}
                className="p-2 rounded-xl bg-slate-100 hover:bg-orange-100 text-slate-600 hover:text-brand-600 border border-slate-200 transition"
                title="Generate new PIN"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Exam Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 font-semibold text-slate-900 bg-white"
            >
              <option value={30}>30 Minutes</option>
              <option value={60}>60 Minutes (Standard)</option>
              <option value={120}>120 Minutes (Full Battery)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
              Anti-Cheat Strictness
            </label>
            <select
              value={strictness}
              onChange={(e) => setStrictness(e.target.value)}
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-500 font-semibold text-slate-900 bg-white"
            >
              <option value="strict">Strict (Immediate Disqualification)</option>
              <option value="warning">1-Warning Strike Limit</option>
              <option value="lenient">Audit Logging Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. LISTENING SECTION (4 AUDIO SLOTS + 1 PDF BOOKLET) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-brand-200 flex items-center justify-center text-brand-600 shadow-sm">
              <Headphones className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">1. Listening Section</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500 text-white">
                  4 Audio Tracks + 1 Questions Booklet
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Top: 4 individual audio tracks with single-play lockdown. Bottom: Single questions booklet PDF (Questions 1 to 40).
              </p>
            </div>
          </div>
        </div>

        {/* Top Area: 4 distinct Audio Upload slots */}
        <div>
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-brand-500" />
              Audio Tracks (Parts 1 to 4)
            </span>
            <span className="text-[10px] font-mono font-semibold text-slate-500 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-brand-500" /> Single-Play Lockdown Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {['part1', 'part2', 'part3', 'part4'].map((partKey, idx) => {
              const audio = listeningAudios[partKey];
              const hasAudio = Boolean(audio.url);

              return (
                <div 
                  key={partKey}
                  className={`p-4 rounded-2xl border-2 transition-all flex flex-col justify-between ${
                    hasAudio 
                      ? 'border-brand-500/80 bg-orange-50/20 shadow-sm' 
                      : 'border-dashed border-slate-200 hover:border-brand-400 bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="w-6 h-6 rounded-md bg-brand-500 text-white font-mono font-bold text-xs flex items-center justify-center">
                        P{idx + 1}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {audio.duration}
                      </span>
                    </div>

                    <div className="text-xs font-bold text-slate-900 truncate mb-1">
                      {audio.title}
                    </div>

                    <div className="text-[9px] font-mono text-brand-700 font-semibold flex items-center gap-1 mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></span>
                      Single-Play Audio Track
                    </div>

                    {hasAudio ? (
                      <div className="my-2 space-y-2">
                        <div className="text-[11px] font-mono text-slate-600 truncate bg-white p-2 rounded-lg border border-brand-200">
                          {audio.name}
                        </div>
                        <audio src={audio.url} controls className="w-full h-8" />
                      </div>
                    ) : (
                      <div 
                        onClick={() => listeningAudioFileRefs[partKey].current?.click()}
                        className="py-6 text-center cursor-pointer rounded-xl border border-dashed border-slate-200 hover:border-brand-400 bg-white/70 hover:bg-orange-50/30 transition my-2"
                      >
                        <Music className="w-5 h-5 text-brand-500 mx-auto mb-1" />
                        <div className="text-[11px] font-bold text-slate-700">Upload Part {idx + 1} Audio</div>
                        <div className="text-[9px] text-slate-400 mt-0.5">MP3, WAV, M4A</div>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5 mt-2">
                    <input
                      ref={listeningAudioFileRefs[partKey]}
                      type="file"
                      accept="audio/*,.mp3,.wav,.m4a,.aac"
                      onChange={(e) => handleListeningAudioUpload(partKey, e)}
                      className="hidden"
                    />
                    <Button
                      variant={hasAudio ? "outline" : "primary"}
                      size="sm"
                      onClick={() => listeningAudioFileRefs[partKey].current?.click()}
                      className={`flex-1 text-[11px] font-bold py-1.5 ${
                        hasAudio 
                          ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                          : 'bg-brand-500 hover:bg-brand-600 text-white'
                      }`}
                    >
                      <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                      {hasAudio ? 'Replace Audio' : 'Upload Audio'}
                    </Button>
                    {hasAudio && (
                      <button
                        type="button"
                        onClick={() => handleRemoveListeningAudio(partKey)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                        title="Remove Audio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom Area: 1 Question Booklet PDF upload slot directly underneath */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-brand-500" />
            Listening Questions Booklet (Full 40 Questions PDF)
          </div>

          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col gap-4 ${
            listeningPdfs.length > 0 
              ? 'border-brand-500/80 bg-orange-50/20 shadow-sm' 
              : 'border-dashed border-slate-200 hover:border-brand-400 bg-slate-50/50'
          }`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {listeningPdfs.length > 1 ? `${listeningPdfs.length} files attached` : (listeningPdfs[0]?.name || "Questions Booklet PDF")}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {listeningPdfs.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                        <Check className="w-3 h-3" /> Questions Booklet Ready & Synced to Student View
                      </span>
                    ) : (
                      "Single comprehensive PDF containing question prompts and visual diagrams for all 4 listening parts."
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  ref={listeningPdfRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  multiple
                  onChange={handleListeningPdfUpload}
                  className="hidden"
                />
                <Button
                  variant={listeningPdfs.length > 0 ? "outline" : "primary"}
                  size="sm"
                  onClick={() => listeningPdfRef.current?.click()}
                  className={`flex-1 sm:flex-initial text-xs font-bold px-4 py-2 ${
                    listeningPdfs.length > 0 
                      ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                      : 'bg-brand-500 hover:bg-brand-600 text-white'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                  {listeningPdfs.length > 0 ? 'Upload / Add PDFs' : 'Upload Booklet PDF'}
                </Button>
                {listeningPdfs.length === 1 && (
                  <>
                    <a
                      href={listeningPdfs[0]?.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl text-slate-500 hover:text-brand-600 border border-slate-200 hover:bg-orange-50 transition"
                      title="Open Booklet in New Tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRemoveListeningPdf(0)}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                      title="Remove Booklet"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Attached Listening Files List */}
            {listeningPdfs.length > 0 && (
              <div className="pt-3 border-t border-slate-200/70 space-y-2">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Attached Listening PDFs ({listeningPdfs.length})
                </div>
                <div className="flex flex-col gap-2">
                  {listeningPdfs.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                        <span className="font-semibold text-slate-800 truncate" title={f.name}>
                          {f.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {f.url && (
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-orange-50 transition"
                            title="Preview PDF"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveListeningPdf(i)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {listeningPdfs.length > 1 && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={handleRemoveAllListeningPdfs}
                      className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove all
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Bottom Area 2: Listening Map / Diagram Image (Optional) */}
        <div className="pt-4 border-t border-slate-100">
          <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5 text-brand-500" />
            Listening Map / Diagram Image (Optional)
          </div>

          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col gap-4 ${
            listeningMapImage.url 
              ? 'border-brand-500/80 bg-orange-50/20 shadow-sm' 
              : 'border-dashed border-slate-200 hover:border-brand-400 bg-slate-50/50'
          }`}>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-600 flex items-center justify-center shrink-0">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {listeningMapImage.name || (listeningMapImage.url ? "Map / Diagram Image Attached" : "Map / Diagram Image")}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {listeningMapImage.url ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                        <Check className="w-3 h-3" /> Map Image Ready & Synced to Student View
                      </span>
                    ) : (
                      "Attach a map, plan or diagram image (PNG, JPG, WEBP) if Section 2 or 3 includes map labelling."
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  ref={listeningMapImageRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,.png,.jpg,.jpeg,.webp"
                  onChange={handleListeningMapImageUpload}
                  className="hidden"
                />
                <Button
                  variant={listeningMapImage.url ? "outline" : "primary"}
                  size="sm"
                  onClick={() => listeningMapImageRef.current?.click()}
                  className={`flex-1 sm:flex-initial text-xs font-bold px-4 py-2 ${
                    listeningMapImage.url 
                      ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                      : 'bg-brand-500 hover:bg-brand-600 text-white'
                  }`}
                >
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                  {listeningMapImage.url ? 'Replace Image' : 'Upload Image'}
                </Button>
                {listeningMapImage.url && (
                  <>
                    <a
                      href={listeningMapImage.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-xl text-slate-500 hover:text-brand-600 border border-slate-200 hover:bg-orange-50 transition"
                      title="Preview Image in New Tab"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={handleRemoveListeningMapImage}
                      className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                      title="Remove Image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Preview image if present */}
            {listeningMapImage.url && (
              <div className="pt-3 border-t border-slate-200/70">
                <div className="max-w-xs sm:max-w-sm rounded-xl overflow-hidden border border-slate-200 bg-white p-1">
                  <img
                    src={listeningMapImage.url}
                    alt="Listening Map / Diagram Preview"
                    className="w-full h-auto max-h-48 object-contain rounded-lg"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Smart Alert */}
          {hasMapQuestion && !listeningMapImage.url && (
            <div className="mt-3 p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex items-start gap-2.5 text-amber-900 text-xs font-medium shadow-xs">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">⚠️ В секции Listening обнаружено задание с картой/схемой!</span> Прикрепите скриншот схемы выше и сохраните тест, чтобы кандидаты видели изображение во время аудирования.
              </div>
            </div>
          )}
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 2. CONSOLIDATED READING SECTION (1 SINGLE PDF DROPZONE) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-brand-200 flex items-center justify-center text-brand-600 shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">2. Reading Section</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500 text-white shadow-sm">
                  1 Consolidated PDF Dropzone
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a single master PDF containing Passages 1–3, Questions 1–40, and Answer Keys. AI will automatically parse the layout.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              Passages 1–3 • Qs 1–40
            </span>
          </div>
        </div>

        {/* Single Consolidated Reading Dropzone Card */}
        <div className={`p-6 rounded-2xl border-2 transition-all ${
          readingPdfs.length > 0 
            ? 'border-brand-500/80 bg-orange-50/20 shadow-sm' 
            : 'border-dashed border-slate-200 hover:border-brand-400 bg-slate-50/50'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-brand-600 flex items-center justify-center shrink-0 shadow-sm">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{readingPdfs.length > 1 ? `${readingPdfs.length} files attached` : (readingPdfs[0]?.name || "Reading Master Booklet (PDF)")}</span>
                  {readingPdfs.length > 0 && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                  Contains all 3 passages and 40 questions. When applied, Gemini AI parses Passage 1 (Qs 1–13), Passage 2 (Qs 14–26), and Passage 3 (Qs 27–40) with answer keys for student exam stations.
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] font-mono text-slate-600">
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-bold text-brand-600">
                    Auto-Extraction: Passages 1 to 3
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-bold text-slate-700">
                    40 Question Items
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-bold text-emerald-700">
                    Auto Answer Keys Stripped
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <input
                ref={readingPdfRef}
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={handleReadingPdfUpload}
                className="hidden"
              />
              <Button
                variant={readingPdfs.length > 0 ? "outline" : "primary"}
                size="md"
                onClick={() => readingPdfRef.current?.click()}
                className={`text-xs font-bold px-4 py-2.5 ${
                  readingPdfs.length > 0 
                    ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                    : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm'
                }`}
              >
                <UploadCloud className="w-4 h-4 mr-1.5" />
                {readingPdfs.length > 0 ? 'Upload / Add PDFs' : 'Upload Reading PDF'}
              </Button>

              {readingPdfs.length === 1 && (
                <>
                  <a
                    href={readingPdfs[0]?.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl text-slate-500 hover:text-brand-600 border border-slate-200 hover:bg-orange-50 transition"
                    title="Preview PDF"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleRemoveReadingPdf(0)}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                    title="Remove Reading PDF"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Attached Reading Files List */}
          {readingPdfs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200/70 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Attached Reading PDFs ({readingPdfs.length})
              </div>
              <div className="flex flex-col gap-2">
                {readingPdfs.map((f, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs shadow-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-brand-500 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {f.url && (
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-orange-50 transition"
                          title="Preview PDF"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveReadingPdf(i)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                        title="Remove file"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {readingPdfs.length > 1 && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handleRemoveAllReadingPdfs}
                    className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. CONSOLIDATED WRITING SECTION (1 SINGLE PDF DROPZONE) */}
      {/* ========================================================================= */}
      <div className="bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-50 border border-brand-200 flex items-center justify-center text-brand-600 shadow-sm">
              <PenTool className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">3. Writing Section</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-brand-500 text-white shadow-sm">
                  1 Consolidated PDF Dropzone
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Upload a single PDF containing Task 1 (Academic Report / Chart) and Task 2 (Discursive Essay) prompts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              Task 1 (150w) • Task 2 (250w)
            </span>
          </div>
        </div>

        {/* Single Consolidated Writing Dropzone Card */}
        <div className={`p-6 rounded-2xl border-2 transition-all ${
          writingPdf.url 
            ? 'border-brand-500/80 bg-orange-50/20 shadow-sm' 
            : 'border-dashed border-slate-200 hover:border-brand-400 bg-slate-50/50'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-orange-100 text-brand-600 flex items-center justify-center shrink-0 shadow-sm">
                <PenTool className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>{writingPdf.name || "Writing Master Prompts (PDF)"}</span>
                  {writingPdf.url && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Ready
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                  Single comprehensive PDF containing the prompt instructions, visual charts, and essay topic for candidates. AI separates Task 1 and Task 2 automatically.
                </p>

                <div className="flex flex-wrap items-center gap-2 mt-3 text-[10px] font-mono text-slate-600">
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-bold text-brand-600">
                    Task 1 Report (Min 150w)
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-bold text-amber-700">
                    Task 2 Essay (Min 250w)
                  </span>
                  <span className="px-2 py-0.5 bg-white border border-slate-200 rounded-md font-bold text-slate-700">
                    Dual Split-Screen PDF Viewer
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
              <input
                ref={writingPdfRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleWritingPdfUpload}
                className="hidden"
              />
              <Button
                variant={writingPdf.url ? "outline" : "primary"}
                size="md"
                onClick={() => writingPdfRef.current?.click()}
                className={`text-xs font-bold px-4 py-2.5 ${
                  writingPdf.url 
                    ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                    : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm'
                }`}
              >
                <UploadCloud className="w-4 h-4 mr-1.5" />
                {writingPdf.url ? 'Replace Writing PDF' : 'Upload Writing PDF'}
              </Button>

              {writingPdf.url && (
                <>
                  <a
                    href={writingPdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl text-slate-500 hover:text-brand-600 border border-slate-200 hover:bg-orange-50 transition"
                    title="Preview PDF"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={handleRemoveWritingPdf}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                    title="Remove Writing PDF"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* AI PARSING SKELETON MODAL / OVERLAY */}
      {/* ========================================================================= */}
      {aiParsingState.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 sm:p-7 space-y-6 text-slate-900 animate-scaleUp">
            
            {/* Header */}
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-amber-500 text-white mx-auto flex items-center justify-center shadow-lg shadow-brand-500/30">
                <Bot className="w-7 h-7 animate-pulse" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900">
                AI is parsing exam structure...
              </h3>
              <p className="text-xs text-slate-500 max-w-xs mx-auto">
                Gemini AI is analyzing booklet layouts, extracting passages, questions, answer keys, and essay tasks.
              </p>
            </div>

            {/* Stepper Progress */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              
              {/* Step 1: Reading */}
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    aiParsingState.readingFailed ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-brand-600'
                  }`}>
                    <BookOpen className="w-3.5 h-3.5" />
                  </span>
                  <span>Reading Section (3 Passages + 40 Qs)</span>
                </div>
                {aiParsingState.readingFailed ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                ) : aiParsingState.readingDone ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Done
                  </span>
                ) : aiParsingState.step === 'reading' ? (
                  <span className="text-brand-600 font-bold flex items-center gap-1 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
                  </span>
                ) : aiParsingState.step === 'reading_delay' ? (
                  <span className="text-amber-600 font-bold flex items-center gap-1 text-[11px]">
                    <Clock className="w-3.5 h-3.5 animate-pulse" /> Pause {aiParsingState.delaySecondsRemaining}s
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Waiting</span>
                )}
              </div>

              {/* Step 2: Listening */}
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    aiParsingState.listeningFailed ? 'bg-rose-100 text-rose-600' : 'bg-sky-100 text-sky-600'
                  }`}>
                    <Headphones className="w-3.5 h-3.5" />
                  </span>
                  <span>Listening Section (Booklet & 4 Audios)</span>
                </div>
                {aiParsingState.listeningFailed ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                ) : aiParsingState.listeningDone ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Done
                  </span>
                ) : aiParsingState.step === 'listening' ? (
                  <span className="text-brand-600 font-bold flex items-center gap-1 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
                  </span>
                ) : aiParsingState.step === 'listening_delay' ? (
                  <span className="text-amber-600 font-bold flex items-center gap-1 text-[11px]">
                    <Clock className="w-3.5 h-3.5 animate-pulse" /> Pause {aiParsingState.delaySecondsRemaining}s
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Waiting</span>
                )}
              </div>

              {/* Step 3: Writing */}
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                    aiParsingState.writingFailed ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    <PenTool className="w-3.5 h-3.5" />
                  </span>
                  <span>Writing Section (Task 1 & Task 2)</span>
                </div>
                {aiParsingState.writingFailed ? (
                  <span className="text-rose-600 font-bold flex items-center gap-1 text-[11px]">
                    <XCircle className="w-3.5 h-3.5" /> Failed
                  </span>
                ) : aiParsingState.writingDone ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Done
                  </span>
                ) : aiParsingState.step === 'writing' ? (
                  <span className="text-brand-600 font-bold flex items-center gap-1 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Waiting</span>
                )}
              </div>

              {/* Step 4: Syncing */}
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5" />
                  </span>
                  <span>Syncing to Student Workstations</span>
                </div>
                {aiParsingState.syncDone ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Synced
                  </span>
                ) : aiParsingState.step === 'syncing' ? (
                  <span className="text-brand-600 font-bold flex items-center gap-1 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Waiting</span>
                )}
              </div>

            </div>

            {/* Quota Cooldown Notice */}
            {aiParsingState.cooldownNotice && (
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center gap-2.5 animate-pulse">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="flex-1 font-semibold">{aiParsingState.cooldownNotice}</span>
              </div>
            )}

            {/* Error Notice if any */}
            {aiParsingState.error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1 font-medium">{aiParsingState.error}</span>
                <button
                  type="button"
                  onClick={() => setAiParsingState(prev => ({ ...prev, isOpen: false, error: null }))}
                  className="font-bold underline text-[11px] hover:text-rose-900"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Live Mode Badge Footer */}
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-brand-200 text-[10px] font-mono font-bold text-brand-700">
                <Sparkles className="w-3 h-3 text-brand-500" />
                Resilient Mode: Dual-Mode Gemini 2.5 Flash / Standard Schema
              </span>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
