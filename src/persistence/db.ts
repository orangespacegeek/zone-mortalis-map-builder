const DB_NAME = 'zone-mortalis-map-builder';
const DB_VERSION = 1;

interface PhotoRow {
  id: string;
  blob: Blob;
}

interface MetaRow {
  key: string;
  value: unknown;
}

let opening: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        opening = null;
        reject(new Error('This browser cannot store the library (IndexedDB is unavailable).'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('tiles')) db.createObjectStore('tiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('layouts')) db.createObjectStore('layouts', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        opening = null;
        reject(request.error ?? new Error('Could not open browser storage.'));
      };
    });
  }
  return opening;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void): Promise<void> {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        fn(tx.objectStore(storeName));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Browser storage aborted the write.'));
      }),
  );
}

export interface DatabaseSnapshot {
  tiles: unknown[];
  photos: PhotoRow[];
  layouts: unknown[];
  working: unknown;
}

export async function loadDatabase(): Promise<DatabaseSnapshot> {
  const db = await openDatabase();
  const tx = db.transaction(['tiles', 'photos', 'layouts', 'meta'], 'readonly');
  const tiles = requestToPromise(tx.objectStore('tiles').getAll());
  const photos = requestToPromise<PhotoRow[]>(tx.objectStore('photos').getAll());
  const layouts = requestToPromise(tx.objectStore('layouts').getAll());
  const working = requestToPromise<MetaRow | undefined>(tx.objectStore('meta').get('working'));
  const [tileRows, photoRows, layoutRows, workingRow] = await Promise.all([tiles, photos, layouts, working]);
  return {
    tiles: tileRows,
    photos: photoRows,
    layouts: layoutRows,
    working: workingRow?.value ?? null,
  };
}

export function dbPutTile(tile: unknown): Promise<void> {
  return run('tiles', 'readwrite', (store) => {
    store.put(tile);
  });
}

export function dbDeleteTile(id: string): Promise<void> {
  return run('tiles', 'readwrite', (store) => {
    store.delete(id);
  });
}

export function dbPutPhoto(id: string, blob: Blob): Promise<void> {
  return run('photos', 'readwrite', (store) => {
    store.put({ id, blob } satisfies PhotoRow);
  });
}

export function dbDeletePhoto(id: string): Promise<void> {
  return run('photos', 'readwrite', (store) => {
    store.delete(id);
  });
}

export function dbPutLayout(layout: unknown): Promise<void> {
  return run('layouts', 'readwrite', (store) => {
    store.put(layout);
  });
}

export function dbDeleteLayout(id: string): Promise<void> {
  return run('layouts', 'readwrite', (store) => {
    store.delete(id);
  });
}

export function dbPutWorking(working: unknown): Promise<void> {
  return run('meta', 'readwrite', (store) => {
    store.put({ key: 'working', value: working } satisfies MetaRow);
  });
}
