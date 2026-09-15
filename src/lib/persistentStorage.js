// Pure Vanilla IndexedDB Storage Engine for IELTS Exam Assets & Large Audio/PDF Files

const DB_NAME = 'ielts_mock_system_db';
const DB_VERSION = 1;
const STORE_NAME = 'exam_assets_store';

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

/**
 * Saves a key-value pair in IndexedDB
 */
export async function setIndexedDBItem(key, value) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(value, key);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`IndexedDB setItem error for key "${key}":`, err);
    return false;
  }
}

/**
 * Retrieves a key-value pair from IndexedDB
 */
export async function getIndexedDBItem(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`IndexedDB getItem error for key "${key}":`, err);
    return null;
  }
}

/**
 * Saves full exam configuration to IndexedDB and safe localStorage backup
 */
export async function savePersistentExam(exam) {
  if (!exam) return;
  
  // 1. Save full object to IndexedDB (handles huge audio/pdf base64 data effortlessly)
  await setIndexedDBItem('master_exam_data', exam);

  // 2. Safe localStorage save (strip heavy base64 audio if over quota)
  try {
    localStorage.setItem('ielts_current_exam', JSON.stringify(exam));
  } catch (err) {
    console.warn("localStorage quota exceeded, saving lightweight version to localStorage:", err);
    try {
      const lightweightExam = {
        ...exam,
        listening_audio_parts: {
          part1: exam.listening_audio_parts?.part1?.startsWith('data:') ? 'PERSISTED_IN_INDEXEDDB' : exam.listening_audio_parts?.part1,
          part2: exam.listening_audio_parts?.part2?.startsWith('data:') ? 'PERSISTED_IN_INDEXEDDB' : exam.listening_audio_parts?.part2,
          part3: exam.listening_audio_parts?.part3?.startsWith('data:') ? 'PERSISTED_IN_INDEXEDDB' : exam.listening_audio_parts?.part3,
          part4: exam.listening_audio_parts?.part4?.startsWith('data:') ? 'PERSISTED_IN_INDEXEDDB' : exam.listening_audio_parts?.part4,
        }
      };
      localStorage.setItem('ielts_current_exam', JSON.stringify(lightweightExam));
    } catch (e) {
      console.warn("Could not save to localStorage, relied entirely on IndexedDB:", e);
    }
  }
}

export function isCorruptedExam(exam) {
  if (!exam) return false;
  const allPassages = [
    ...(exam.passages || []),
    ...(exam.reading_passages || []),
    ...(exam.reading?.passages || [])
  ];
  for (const p of allPassages) {
    const text = p?.content || p?.passageText || '';
    if (text.startsWith('%PDF-') || text.includes('FlateDecode') || text.includes('/StructElem') || text.includes('endobj')) {
      return true;
    }
  }
  const allQuestions = [
    ...(exam.questions || []),
    ...(exam.reading_questions || []),
    ...(exam.reading?.questions || [])
  ];
  for (const q of allQuestions) {
    const qText = q?.text || '';
    if (qText.includes('obj <<') || qText.includes('/StructElem') || qText.includes('/Layout/Placement')) {
      return true;
    }
  }
  return false;
}

/**
 * Loads full exam from IndexedDB on startup
 */
export async function loadPersistentExam() {
  try {
    const dbData = await getIndexedDBItem('master_exam_data');
    if (dbData) {
      if (isCorruptedExam(dbData)) {
        console.warn("Detected corrupted raw binary PDF data in persistent storage. Purging to prevent corrupt display.");
        await setIndexedDBItem('master_exam_data', null);
        try { localStorage.removeItem('ielts_current_exam'); } catch (e) {}
        return null;
      }
      return dbData;
    }
  } catch (err) {
    console.warn("Error loading from IndexedDB:", err);
  }

  // Fallback to localStorage
  try {
    const localData = localStorage.getItem('ielts_current_exam');
    if (localData) {
      const parsed = JSON.parse(localData);
      if (isCorruptedExam(parsed)) {
        try { localStorage.removeItem('ielts_current_exam'); } catch (e) {}
        return null;
      }
      return parsed;
    }
  } catch (err) {
    console.warn("Failed to load from localStorage fallback:", err);
  }

  return null;
}
