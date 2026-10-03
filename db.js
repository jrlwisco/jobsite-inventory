/* Tiny IndexedDB wrapper. All data stays on this device. */
(function () {
  'use strict';
  const DB_NAME = 'jobsite-inventory';
  const DB_VERSION = 1;
  const STORE = 'items';
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'id' });
          s.createIndex('type', 'type', { unique: false });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Please close other tabs of this app and try again.'));
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let result;
      Promise.resolve(fn(store, r => { result = r; })).catch(reject);
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Save failed'));
    }));
  }

  const DB = {
    all() {
      return tx('readonly', (store, set) => {
        const req = store.getAll();
        req.onsuccess = () => set(req.result || []);
      });
    },
    byType(type) {
      return tx('readonly', (store, set) => {
        const req = store.index('type').getAll(type);
        req.onsuccess = () => set(req.result || []);
      });
    },
    get(id) {
      return tx('readonly', (store, set) => {
        const req = store.get(id);
        req.onsuccess = () => set(req.result || null);
      });
    },
    put(item) {
      return tx('readwrite', (store, set) => { store.put(item); set(item); });
    },
    putMany(items) {
      return tx('readwrite', (store, set) => { items.forEach(i => store.put(i)); set(items.length); });
    },
    remove(id) {
      return tx('readwrite', store => { store.delete(id); });
    },
    clear() {
      return tx('readwrite', store => { store.clear(); });
    }
  };
  window.DB = DB;
})();
