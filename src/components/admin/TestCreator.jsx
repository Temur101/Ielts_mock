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
  CheckCircle
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { getSupabaseClient, updateExamAssets, persistExamAndSections } from '../../lib/supabase';
import { savePersistentExam, setIndexedDBItem } from '../../lib/persistentStorage';
import { DEFAULT_IELTS_EXAM } from '../../lib/mockData';
import { apiParseExamPdf } from '../../lib/ai/gemini-client';

export function TestCreator({ exam, onUpdateExam }) {
  // Global Exam Settings
  const [title, setTitle] = useState(exam.title || 'IELTS Academic Master Assessment 2026');
  const [pinCode, setPinCode] = useState(exam.pin_code || 'IELTS-904');
  const [duration, setDuration] = useState(exam.duration_mins || 60);
  const [strictness, setStrictness] = useState(exam.anti_cheat_strictness || 'strict');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // =========================================================================
  // AI PARSING SKELETON STATE
  // =========================================================================
  const [aiParsingState, setAiParsingState] = useState({
    isOpen: false,
    step: '', // 'listening' | 'reading' | 'writing' | 'syncing' | 'completed'
    readingDone: false,
    listeningDone: false,
    writingDone: false,
    syncDone: false,
    error: null,
  });

  // =========================================================================
  // 1. LISTENING SECTION (4 AUDIO SLOTS + 1 PDF BOOKLET)
  // =========================================================================
  const [listeningAudios, setListeningAudios] = useState({
    part1: {
      partId: 1,
      title: 'Part 1: Social Dialogue',
      name: exam.listening_audio_names?.part1 || exam.listening?.parts?.[0]?.audio_name || 'IELTS_Listening_Part1.mp3',
      url: exam.listening_audio_parts?.part1 || exam.listening?.parts?.[0]?.audio_url || '',
      duration: exam.listening_audio_durations?.part1 || exam.listening?.parts?.[0]?.duration || '06:45',
    },
    part2: {
      partId: 2,
      title: 'Part 2: Community Recreation Guide',
      name: exam.listening_audio_names?.part2 || exam.listening?.parts?.[1]?.audio_name || 'IELTS_Listening_Part2.mp3',
      url: exam.listening_audio_parts?.part2 || exam.listening?.parts?.[1]?.audio_url || '',
      duration: exam.listening_audio_durations?.part2 || exam.listening?.parts?.[1]?.duration || '07:15',
    },
    part3: {
      partId: 3,
      title: 'Part 3: Academic Tutorial',
      name: exam.listening_audio_names?.part3 || exam.listening?.parts?.[2]?.audio_name || 'IELTS_Listening_Part3.mp3',
      url: exam.listening_audio_parts?.part3 || exam.listening?.parts?.[2]?.audio_url || '',
      duration: exam.listening_audio_durations?.part3 || exam.listening?.parts?.[2]?.duration || '07:50',
    },
    part4: {
      partId: 4,
      title: 'Part 4: University Lecture',
      name: exam.listening_audio_names?.part4 || exam.listening?.parts?.[3]?.audio_name || 'IELTS_Listening_Part4.mp3',
      url: exam.listening_audio_parts?.part4 || exam.listening?.parts?.[3]?.audio_url || '',
      duration: exam.listening_audio_durations?.part4 || exam.listening?.parts?.[3]?.duration || '08:30',
    },
  });

  const [listeningPdf, setListeningPdf] = useState({
    name: exam.listening_pdf_name || exam.listening?.pdf_name || 'IELTS_Listening_Booklet.pdf',
    url: exam.listening_pdf_url || exam.listening?.pdf_url || '',
    file: null,
  });

  const listeningAudioFileRefs = {
    part1: useRef(null),
    part2: useRef(null),
    part3: useRef(null),
    part4: useRef(null),
  };
  const listeningPdfRef = useRef(null);

  // =========================================================================
  // 2. READING SECTION (1 CONSOLIDATED PDF DROPZONE)
  // =========================================================================
  const [readingPdf, setReadingPdf] = useState({
    name: exam.reading_pdf_name || exam.reading?.pdf_name || exam.reading_parts?.part1?.passage_pdf_name || 'IELTS_Academic_Reading_Full_Booklet.pdf',
    url: exam.reading_pdf_url || exam.reading?.pdf_url || exam.reading_parts?.part1?.passage_pdf_url || '',
    file: null,
  });
  const readingPdfRef = useRef(null);

  // =========================================================================
  // 3. WRITING SECTION (1 CONSOLIDATED PDF DROPZONE)
  // =========================================================================
  const [writingPdf, setWritingPdf] = useState({
    name: exam.writing_pdf_name || exam.writing?.pdf_name || exam.writing_tasks?.task1?.pdf_name || 'IELTS_Academic_Writing_Tasks_Booklet.pdf',
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
    if (supabase) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
        const { data, error } = await supabase.storage.from(bucketName).upload(fileName, file);

        if (!error && data?.path) {
          const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(data.path);
          if (publicUrlData?.publicUrl) {
            return publicUrlData.publicUrl;
          }
        }
      } catch (err) {
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

  const handleRemoveListeningAudio = (partKey) => {
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
  };

  // Listening PDF Booklet Upload
  const handleListeningPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please upload ONLY PDF files (.pdf) for the Listening booklet.');
      return;
    }

    try {
      const url = await uploadAssetToStorage(file);
      setListeningPdf({
        name: file.name,
        url,
        file,
      });
    } catch (err) {
      console.error('Listening booklet upload failed:', err);
      alert('Failed to upload PDF: ' + err.message);
    }
  };

  const handleRemoveListeningPdf = () => {
    setListeningPdf({
      name: '',
      url: '',
      file: null,
    });
    if (listeningPdfRef.current) {
      listeningPdfRef.current.value = '';
    }
  };

  // Reading PDF Upload (Single Consolidated File)
  const handleReadingPdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      alert('Please upload ONLY PDF files (.pdf) for the Reading Booklet.');
      return;
    }

    try {
      const url = await uploadAssetToStorage(file);
      setReadingPdf({
        name: file.name,
        url,
        file,
      });
    } catch (err) {
      console.error('Reading booklet upload failed:', err);
      alert('Failed to upload Reading PDF: ' + err.message);
    }
  };

  const handleRemoveReadingPdf = () => {
    setReadingPdf({
      name: '',
      url: '',
      file: null,
    });
    if (readingPdfRef.current) {
      readingPdfRef.current.value = '';
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

  const handleRemoveWritingPdf = () => {
    setWritingPdf({
      name: '',
      url: '',
      file: null,
    });
    if (writingPdfRef.current) {
      writingPdfRef.current.value = '';
    }
  };

  // Generate PIN
  const generateNewPin = () => {
    const rand = Math.floor(100 + Math.random() * 900);
    setPinCode(`IELTS-${rand}`);
  };

  // =========================================================================
  // SAVE & APPLY EXAM CONFIGURATION (WITH AI PARSING SKELETON)
  // =========================================================================
  const handleSaveExam = async () => {
    setIsSaving(true);
    setAiParsingState({
      isOpen: true,
      step: 'reading',
      readingDone: false,
      listeningDone: false,
      writingDone: false,
      syncDone: false,
      error: null,
    });

    try {
      let readingParsed = null;
      let listeningParsed = null;
      let writingParsed = null;
      let extractedTask1Prompt = exam.task_1_prompt || exam.writing_tasks?.task1?.prompt || '';
      let extractedTask2Prompt = exam.task_2_prompt || exam.writing_tasks?.task2?.prompt || '';

      const hasPdfToParse = Boolean(readingPdf.file || listeningPdf.file || writingPdf.file);

      if (hasPdfToParse) {
        setAiParsingState(prev => ({ ...prev, step: 'reading' }));

        const parsedBundle = await apiParseExamPdf({
          readingPdf: readingPdf.file ? { file: readingPdf.file, name: readingPdf.name } : null,
          listeningPdf: listeningPdf.file ? { file: listeningPdf.file, name: listeningPdf.name } : null,
          writingPdf: writingPdf.file ? { file: writingPdf.file, name: writingPdf.name } : null,
          audioTracks: {
            part1: listeningAudios.part1.url,
            part2: listeningAudios.part2.url,
            part3: listeningAudios.part3.url,
            part4: listeningAudios.part4.url,
          },
          examId: exam.id,
          pinCode,
          title,
          durationMins: Number(duration),
        });

        if (parsedBundle?.reading) {
          readingParsed = parsedBundle.reading;
          setAiParsingState(prev => ({ ...prev, readingDone: true }));
        }
        if (parsedBundle?.listening) {
          listeningParsed = parsedBundle.listening;
          setAiParsingState(prev => ({ ...prev, listeningDone: true }));
        }
        if (parsedBundle?.writing) {
          writingParsed = parsedBundle.writing;
          setAiParsingState(prev => ({ ...prev, writingDone: true }));
        }

        if (parsedBundle?.task_1_prompt || writingParsed?.task_1_prompt) {
          extractedTask1Prompt = parsedBundle?.task_1_prompt || writingParsed?.task_1_prompt;
        }
        if (parsedBundle?.task_2_prompt || writingParsed?.task_2_prompt) {
          extractedTask2Prompt = parsedBundle?.task_2_prompt || writingParsed?.task_2_prompt;
        }
      }

      setAiParsingState(prev => ({ 
        ...prev, 
        readingDone: true, 
        listeningDone: true, 
        writingDone: true, 
        step: 'syncing' 
      }));

      // Build structured Reading parts and passages (preserve existing if no new reading file parsed)
      const readingParts = readingParsed ? {
        part1: {
          partId: 1,
          title: readingParsed.parts?.part1?.title || 'Reading Part 1',
          range: readingParsed.parts?.part1?.questionRange || 'Questions 1–13',
          startQ: 1,
          endQ: 13,
          passage_pdf_name: readingPdf.name,
          passage_pdf_url: readingPdf.url,
          passage_text: readingParsed.parts?.part1?.passageText || exam.reading_parts?.part1?.passage_text || '',
          questions_count: 13,
          answer_keys: readingParsed.answerKeys || {},
        },
        part2: {
          partId: 2,
          title: readingParsed.parts?.part2?.title || 'Reading Part 2',
          range: readingParsed.parts?.part2?.questionRange || 'Questions 14–26',
          startQ: 14,
          endQ: 26,
          passage_pdf_name: readingPdf.name,
          passage_pdf_url: readingPdf.url,
          passage_text: readingParsed.parts?.part2?.passageText || exam.reading_parts?.part2?.passage_text || '',
          questions_count: 13,
          answer_keys: readingParsed.answerKeys || {},
        },
        part3: {
          partId: 3,
          title: readingParsed.parts?.part3?.title || 'Reading Part 3',
          range: readingParsed.parts?.part3?.questionRange || 'Questions 27–40',
          startQ: 27,
          endQ: 40,
          passage_pdf_name: readingPdf.name,
          passage_pdf_url: readingPdf.url,
          passage_text: readingParsed.parts?.part3?.passageText || exam.reading_parts?.part3?.passage_text || '',
          questions_count: 14,
          answer_keys: readingParsed.answerKeys || {},
        },
      } : (exam.reading_parts || {});

      const readingPassagesPayload = readingParsed ? [
        {
          id: 1,
          title: readingParsed.sections?.[0]?.title || readingParsed.parts?.part1?.title || 'Passage 1',
          content: readingParsed.sections?.[0]?.passage_text || readingParts.part1?.passage_text || '',
          page_content_html: readingParsed.sections?.[0]?.page_content_html || readingParts.part1?.page_content_html || '',
          pdf_name: readingPdf.name,
          pdf_url: readingPdf.url,
        },
        {
          id: 2,
          title: readingParsed.sections?.[1]?.title || readingParsed.parts?.part2?.title || 'Passage 2',
          content: readingParsed.sections?.[1]?.passage_text || readingParts.part2?.passage_text || '',
          page_content_html: readingParsed.sections?.[1]?.page_content_html || readingParts.part2?.page_content_html || '',
          pdf_name: readingPdf.name,
          pdf_url: readingPdf.url,
        },
        {
          id: 3,
          title: readingParsed.sections?.[2]?.title || readingParsed.parts?.part3?.title || 'Passage 3',
          content: readingParsed.sections?.[2]?.passage_text || readingParts.part3?.passage_text || '',
          page_content_html: readingParsed.sections?.[2]?.page_content_html || readingParts.part3?.page_content_html || '',
          pdf_name: readingPdf.name,
          pdf_url: readingPdf.url,
        },
      ] : (exam.reading_passages || exam.reading?.passages || []);

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
          pdf_name: writingPdf.name,
          pdf_url: writingPdf.url,
        },
        task2: {
          title: writingParsed.tasks?.task2?.title || 'Task 2: Discursive Essay',
          recommended_mins: writingParsed.tasks?.task2?.recommended_mins || 40,
          min_words: writingParsed.tasks?.task2?.min_words || 250,
          prompt: extractedTask2Prompt || writingParsed.tasks?.task2?.prompt || 'Please refer to the attached Task 2 PDF booklet for the prompt instructions and essay topic.',
          page_content_html: writingParsed.sections?.[1]?.page_content_html || writingParsed.tasks?.task2?.page_content_html || '',
          pdf_name: writingPdf.name,
          pdf_url: writingPdf.url,
        },
      } : (exam.writing_tasks || exam.writing || {});

      // Build structured Listening parts
      const listeningPartsPayload = [
        { 
          partId: 1, 
          title: listeningParsed?.sections?.[0]?.title || 'Part 1: Social Dialogue', 
          audio_name: listeningAudios.part1.name, 
          audio_url: listeningAudios.part1.url, 
          duration: listeningAudios.part1.duration,
          page_content_html: listeningParsed?.sections?.[0]?.page_content_html || '',
        },
        { 
          partId: 2, 
          title: listeningParsed?.sections?.[1]?.title || 'Part 2: Community Guide', 
          audio_name: listeningAudios.part2.name, 
          audio_url: listeningAudios.part2.url, 
          duration: listeningAudios.part2.duration,
          page_content_html: listeningParsed?.sections?.[1]?.page_content_html || '',
        },
        { 
          partId: 3, 
          title: listeningParsed?.sections?.[2]?.title || 'Part 3: Academic Tutorial', 
          audio_name: listeningAudios.part3.name, 
          audio_url: listeningAudios.part3.url, 
          duration: listeningAudios.part3.duration,
          page_content_html: listeningParsed?.sections?.[2]?.page_content_html || '',
        },
        { 
          partId: 4, 
          title: listeningParsed?.sections?.[3]?.title || 'Part 4: University Lecture', 
          audio_name: listeningAudios.part4.name, 
          audio_url: listeningAudios.part4.url, 
          duration: listeningAudios.part4.duration,
          page_content_html: listeningParsed?.sections?.[3]?.page_content_html || '',
        },
      ];

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

      const listeningQuestions = listeningParsed?.questions || exam.listening_questions || exam.listening?.questions || [];

      // Consolidated Exam object with dynamic task prompts and visual sections
      const updatedExam = {
        ...exam,
        title,
        pin_code: pinCode,
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
        listening_parts: listeningPartsPayload,
        listening_questions: listeningQuestions,
        listening: {
          ...exam.listening,
          parts: listeningPartsPayload,
          sections: listeningParsed?.sections || exam.listening?.sections || [],
          questions: listeningQuestions,
          pdf_url: listeningPdf.url,
          pdf_name: listeningPdf.name,
        },
      };

      // 1. Persistent local storage
      await savePersistentExam(updatedExam);

      // 2. Broadcast and update App state
      onUpdateExam(updatedExam);

      // 3. Persist to Supabase exams and exam_sections tables
      try {
        await persistExamAndSections(exam.id, {
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

        await updateExamAssets(exam.id, {
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

  const handleResetToDefault = async () => {
    if (!window.confirm("Вы уверены, что хотите сбросить тест к стандартному исходному тесту? Все загруженные файлы будут сброшены.")) {
      return;
    }
    await setIndexedDBItem('master_exam_data', null);
    try { localStorage.removeItem('ielts_current_exam'); } catch (e) {}
    onUpdateExam(DEFAULT_IELTS_EXAM);
    window.location.reload();
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
              <option value={15}>15 Minutes (Demo)</option>
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

          <div className={`p-5 rounded-2xl border-2 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
            listeningPdf.url 
              ? 'border-brand-500/80 bg-orange-50/20 shadow-sm' 
              : 'border-dashed border-slate-200 hover:border-brand-400 bg-slate-50/50'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-600 flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-extrabold text-slate-900">
                  {listeningPdf.name || "Questions Booklet PDF"}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {listeningPdf.url ? (
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
                onChange={handleListeningPdfUpload}
                className="hidden"
              />
              <Button
                variant={listeningPdf.url ? "outline" : "primary"}
                size="sm"
                onClick={() => listeningPdfRef.current?.click()}
                className={`flex-1 sm:flex-initial text-xs font-bold px-4 py-2 ${
                  listeningPdf.url 
                    ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                    : 'bg-brand-500 hover:bg-brand-600 text-white'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                {listeningPdf.url ? 'Replace Booklet' : 'Upload Booklet PDF'}
              </Button>
              {listeningPdf.url && (
                <>
                  <a
                    href={listeningPdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 rounded-xl text-slate-500 hover:text-brand-600 border border-slate-200 hover:bg-orange-50 transition"
                    title="Open Booklet in New Tab"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={handleRemoveListeningPdf}
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                    title="Remove Booklet"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
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
          readingPdf.url 
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
                  <span>{readingPdf.name || "Reading Master Booklet (PDF)"}</span>
                  {readingPdf.url && (
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
                onChange={handleReadingPdfUpload}
                className="hidden"
              />
              <Button
                variant={readingPdf.url ? "outline" : "primary"}
                size="md"
                onClick={() => readingPdfRef.current?.click()}
                className={`text-xs font-bold px-4 py-2.5 ${
                  readingPdf.url 
                    ? 'border-brand-200 text-brand-700 hover:bg-orange-50' 
                    : 'bg-brand-500 hover:bg-brand-600 text-white shadow-sm'
                }`}
              >
                <UploadCloud className="w-4 h-4 mr-1.5" />
                {readingPdf.url ? 'Replace Reading PDF' : 'Upload Reading PDF'}
              </Button>

              {readingPdf.url && (
                <>
                  <a
                    href={readingPdf.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl text-slate-500 hover:text-brand-600 border border-slate-200 hover:bg-orange-50 transition"
                    title="Preview PDF"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    type="button"
                    onClick={handleRemoveReadingPdf}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition"
                    title="Remove Reading PDF"
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
                  <span className="w-6 h-6 rounded-lg bg-orange-100 text-brand-600 flex items-center justify-center">
                    <BookOpen className="w-3.5 h-3.5" />
                  </span>
                  <span>Reading Section (3 Passages + 40 Qs)</span>
                </div>
                {aiParsingState.readingDone ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Done
                  </span>
                ) : aiParsingState.step === 'reading' ? (
                  <span className="text-brand-600 font-bold flex items-center gap-1 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Waiting</span>
                )}
              </div>

              {/* Step 2: Listening */}
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center">
                    <Headphones className="w-3.5 h-3.5" />
                  </span>
                  <span>Listening Section (Booklet & 4 Audios)</span>
                </div>
                {aiParsingState.listeningDone ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle className="w-3.5 h-3.5" /> Done
                  </span>
                ) : aiParsingState.step === 'listening' ? (
                  <span className="text-brand-600 font-bold flex items-center gap-1 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Extracting...
                  </span>
                ) : (
                  <span className="text-slate-400 text-[11px]">Waiting</span>
                )}
              </div>

              {/* Step 3: Writing */}
              <div className="flex items-center justify-between text-xs font-semibold">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                    <PenTool className="w-3.5 h-3.5" />
                  </span>
                  <span>Writing Section (Task 1 & Task 2)</span>
                </div>
                {aiParsingState.writingDone ? (
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

            {/* Error Notice if any */}
            {aiParsingState.error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{aiParsingState.error}</span>
                <button
                  type="button"
                  onClick={() => setAiParsingState(prev => ({ ...prev, isOpen: false }))}
                  className="font-bold underline text-[11px]"
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
