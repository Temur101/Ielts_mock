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
 * Deletes a specific key from IndexedDB
 */
export async function deleteIndexedDBItem(key) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn(`IndexedDB deleteItem error for key "${key}":`, err);
    return false;
  }
}

export const deleteFromIndexedDB = deleteIndexedDBItem;

/**
 * Clears the entire IndexedDB object store
 */
export async function clearIndexedDB() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn("IndexedDB clear error:", err);
    return false;
  }
}

export const clearIndexedDBStore = clearIndexedDB;

/**
 * Completely purges all exam data across IndexedDB and LocalStorage
 */
export async function purgeAllExamData() {
  await clearIndexedDB();
  try {
    localStorage.removeItem('ielts_current_exam');
    localStorage.removeItem('ielts_exam_meta');
    localStorage.removeItem('ielts_current_answers');
    localStorage.removeItem('ielts_candidate_answers');
    localStorage.removeItem('ielts_listening_pdf');
    localStorage.removeItem('ielts_reading_pdf');
    localStorage.removeItem('ielts_writing_pdf');
  } catch (e) {
    console.warn("LocalStorage purge error:", e);
  }
}

/**
 * Saves full exam configuration to IndexedDB (preventing LocalStorage QuotaExceededError)
 * and saves only lightweight primitives to localStorage.
 */
export async function savePersistentExam(exam) {
  if (!exam) return;
  
  // 1. Heavy JSON storage (passages, questions, audio metadata) strictly in IndexedDB
  await setIndexedDBItem('master_exam_data', exam);

  // 2. Clean up legacy heavy exam object from localStorage to free storage quota
  try {
    localStorage.removeItem('ielts_current_exam');
    
    // Store ONLY lightweight primitives in localStorage
    const meta = {
      id: exam.id,
      title: exam.title,
      pin_code: exam.pin_code,
      duration_mins: exam.duration_mins,
      current_stage: exam.current_stage,
      status: exam.status,
    };
    localStorage.setItem('ielts_exam_meta', JSON.stringify(meta));
  } catch (err) {
    console.warn("Error updating localStorage exam metadata:", err);
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
  // Purge any old heavy legacy localStorage entry
  try {
    localStorage.removeItem('ielts_current_exam');
  } catch (e) {}

  try {
    const dbData = await getIndexedDBItem('master_exam_data');
    if (dbData) {
      if (isCorruptedExam(dbData)) {
        console.warn("Detected corrupted raw binary PDF data in persistent storage. Purging to prevent corrupt display.");
        await setIndexedDBItem('master_exam_data', null);
        return null;
      }
      return dbData;
    }
  } catch (err) {
    console.warn("Error loading from IndexedDB:", err);
  }

  return null;
}
