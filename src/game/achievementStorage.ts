import { AchievementUnlock, normalizeAchievementUnlocks } from './achievements';

const DB_NAME = 'vampire-survivors-2026';
const DB_VERSION = 1;
const STORE_NAME = 'meta';
const ACHIEVEMENTS_KEY = 'achievementsUnlocked';

interface AchievementStoragePayload {
  unlocks: AchievementUnlock[];
  updatedAt: number;
}

function isIndexedDBAvailable() {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function readPayload(db: IDBDatabase): Promise<AchievementStoragePayload | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(ACHIEVEMENTS_KEY);

    request.onsuccess = () => {
      const raw = request.result;
      if (!raw || typeof raw !== 'object') {
        resolve(null);
        return;
      }

      const rec = raw as Partial<AchievementStoragePayload>;
      resolve({
        unlocks: normalizeAchievementUnlocks(rec.unlocks),
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : 0
      });
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to read IndexedDB payload'));
  });
}

function writePayload(db: IDBDatabase, payload: AchievementStoragePayload): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(payload, ACHIEVEMENTS_KEY);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to write IndexedDB payload'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function loadAchievementUnlocksFromIndexedDB(): Promise<AchievementUnlock[] | null> {
  if (!isIndexedDBAvailable()) return null;

  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    const payload = await readPayload(db);
    return payload ? payload.unlocks : null;
  } catch {
    return null;
  } finally {
    if (db) db.close();
  }
}

export async function saveAchievementUnlocksToIndexedDB(unlocks: AchievementUnlock[]): Promise<void> {
  if (!isIndexedDBAvailable()) return;

  let db: IDBDatabase | null = null;
  try {
    db = await openDB();
    await writePayload(db, {
      unlocks,
      updatedAt: Date.now()
    });
  } catch {
    // Ignore storage errors and rely on localStorage mirror as fallback.
  } finally {
    if (db) db.close();
  }
}
