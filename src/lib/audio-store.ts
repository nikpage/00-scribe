// IndexedDB storage for audio during recording and before upload.
// Chunks: saved every 5s during recording — survives tab crashes.
// Recordings: assembled blobs stored until uploaded to Google Drive.

const DB_NAME = "scribe-audio";
const CHUNKS_STORE = "chunks";
const RECORDINGS_STORE = "recordings";
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHUNKS_STORE)) {
        db.createObjectStore(CHUNKS_STORE, { autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
        db.createObjectStore(RECORDINGS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// --- Chunks (temporary, during recording) ---

export async function saveChunk(chunk: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, "readwrite");
    tx.objectStore(CHUNKS_STORE).add(chunk);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllChunks(): Promise<Blob[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, "readonly");
    const request = tx.objectStore(CHUNKS_STORE).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function clearChunks(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CHUNKS_STORE, "readwrite");
    tx.objectStore(CHUNKS_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// --- Recordings (persistent, until uploaded to Drive) ---

export async function saveRecordingBlob(id: string, blob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDINGS_STORE, "readwrite");
    tx.objectStore(RECORDINGS_STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getRecordingBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDINGS_STORE, "readonly");
    const request = tx.objectStore(RECORDINGS_STORE).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecordingBlob(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECORDINGS_STORE, "readwrite");
    tx.objectStore(RECORDINGS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
