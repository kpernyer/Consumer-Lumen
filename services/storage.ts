import { Article } from '../types';

const DB_NAME = 'KnowledgeLoopDB';
const STORE_NAME = 'articles';
const DB_VERSION = 1;

// Initialize the IndexedDB
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
};

// Retrieve all articles from storage
export const getAllArticles = async (): Promise<Article[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to load articles from DB:", error);
    return [];
  }
};

// Save a single article (insert or update)
export const saveArticleToDB = async (article: Article): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(article);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Save multiple articles at once (useful for initial seeding)
export const saveAllArticlesToDB = async (articles: Article[]): Promise<void> => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let processed = 0;
      if (articles.length === 0) resolve();

      articles.forEach(article => {
          const request = store.put(article);
          request.onsuccess = () => {
              processed++;
              if (processed === articles.length) resolve();
          };
          request.onerror = () => reject(request.error);
      });
    });
};