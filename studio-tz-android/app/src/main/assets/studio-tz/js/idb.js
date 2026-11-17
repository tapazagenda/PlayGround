/* Studio Tz — armazenamento local (IndexedDB) */
(function (global) {
  'use strict';

  const DB_NAME = 'studio-tz';
  const DB_VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          db.createObjectStore('projects', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('skins')) {
          db.createObjectStore('skins', { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(store, mode) {
    const db = await open();
    return db.transaction(store, mode).objectStore(store);
  }

  const idb = {
    async putProject(project) {
      const store = await tx('projects', 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.put(project);
        r.onsuccess = () => resolve(project);
        r.onerror = () => reject(r.error);
      });
    },
    async getProjects() {
      const store = await tx('projects', 'readonly');
      return new Promise((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      });
    },
    async deleteProject(id) {
      const store = await tx('projects', 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.delete(id);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
    },
    async putSkin(skin) {
      const store = await tx('skins', 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.put(skin);
        r.onsuccess = () => resolve(skin);
        r.onerror = () => reject(r.error);
      });
    },
    async getSkins() {
      const store = await tx('skins', 'readonly');
      return new Promise((resolve, reject) => {
        const r = store.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => reject(r.error);
      });
    },
    async deleteSkin(id) {
      const store = await tx('skins', 'readwrite');
      return new Promise((resolve, reject) => {
        const r = store.delete(id);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
      });
    }
  };

  global.StudioIDB = idb;
})(window);
