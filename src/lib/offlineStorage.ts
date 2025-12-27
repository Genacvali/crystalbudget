/**
 * IndexedDB utilities for offline support
 * Stores pending transactions when offline and syncs when back online
 */

import { logger } from './logger';

const DB_NAME = 'CrystalBudgetDB';
const DB_VERSION = 1;
const PENDING_TRANSACTIONS_STORE = 'pendingTransactions';

interface PendingTransaction {
  id: string;
  type: 'income' | 'expense';
  data: any;
  timestamp: number;
  retries: number;
}

/**
 * Initialize IndexedDB
 */
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      logger.error('IndexedDB failed to open:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(PENDING_TRANSACTIONS_STORE)) {
        const store = db.createObjectStore(PENDING_TRANSACTIONS_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }

      logger.info('IndexedDB schema upgraded to version', DB_VERSION);
    };
  });
};

/**
 * Add a pending transaction to IndexedDB
 */
export const addPendingTransaction = async (
  type: 'income' | 'expense',
  data: any
): Promise<void> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PENDING_TRANSACTIONS_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_TRANSACTIONS_STORE);

    const pendingTransaction: PendingTransaction = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      timestamp: Date.now(),
      retries: 0,
    };

    store.add(pendingTransaction);

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        logger.info('Pending transaction saved to IndexedDB:', pendingTransaction.id);
        resolve(undefined);
      };
      transaction.onerror = () => {
        logger.error('Failed to save pending transaction:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    logger.error('Error adding pending transaction:', error);
    throw error;
  }
};

/**
 * Get all pending transactions
 */
export const getPendingTransactions = async (): Promise<PendingTransaction[]> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PENDING_TRANSACTIONS_STORE], 'readonly');
    const store = transaction.objectStore(PENDING_TRANSACTIONS_STORE);
    const request = store.getAll();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = () => {
        logger.error('Failed to get pending transactions:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    logger.error('Error getting pending transactions:', error);
    return [];
  }
};

/**
 * Remove a pending transaction from IndexedDB
 */
export const removePendingTransaction = async (id: string): Promise<void> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PENDING_TRANSACTIONS_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_TRANSACTIONS_STORE);

    store.delete(id);

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        logger.info('Pending transaction removed from IndexedDB:', id);
        resolve(undefined);
      };
      transaction.onerror = () => {
        logger.error('Failed to remove pending transaction:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    logger.error('Error removing pending transaction:', error);
    throw error;
  }
};

/**
 * Update retry count for a pending transaction
 */
export const updateTransactionRetries = async (id: string, retries: number): Promise<void> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PENDING_TRANSACTIONS_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_TRANSACTIONS_STORE);

    const request = store.get(id);

    request.onsuccess = () => {
      const pendingTransaction = request.result;
      if (pendingTransaction) {
        pendingTransaction.retries = retries;
        store.put(pendingTransaction);
      }
    };

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve(undefined);
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    logger.error('Error updating transaction retries:', error);
  }
};

/**
 * Clear all pending transactions (use with caution)
 */
export const clearAllPendingTransactions = async (): Promise<void> => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PENDING_TRANSACTIONS_STORE], 'readwrite');
    const store = transaction.objectStore(PENDING_TRANSACTIONS_STORE);

    store.clear();

    await new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        logger.info('All pending transactions cleared from IndexedDB');
        resolve(undefined);
      };
      transaction.onerror = () => {
        logger.error('Failed to clear pending transactions:', transaction.error);
        reject(transaction.error);
      };
    });
  } catch (error) {
    logger.error('Error clearing pending transactions:', error);
    throw error;
  }
};

/**
 * Check if browser supports IndexedDB
 */
export const isIndexedDBSupported = (): boolean => {
  return typeof indexedDB !== 'undefined';
};
