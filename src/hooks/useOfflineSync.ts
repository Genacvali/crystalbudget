import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import {
  getPendingTransactions,
  removePendingTransaction,
  updateTransactionRetries,
  addPendingTransaction
} from '@/lib/offlineStorage';
import { logger } from '@/lib/logger';

const MAX_RETRIES = 3;

/**
 * Hook for automatic offline transaction synchronization
 * Syncs pending transactions when coming back online
 */
export function useOfflineSync() {
  const { user } = useAuth();
  const { toast } = useToast();

  const syncPendingTransactions = useCallback(async () => {
    if (!user || !navigator.onLine) return;

    try {
      const pending = await getPendingTransactions();
      
      if (pending.length === 0) return;

      logger.info(`Syncing ${pending.length} pending transactions...`);

      let successCount = 0;
      let failCount = 0;

      for (const transaction of pending) {
        try {
          // Check retry limit
          if (transaction.retries >= MAX_RETRIES) {
            logger.error('Transaction exceeded max retries:', transaction.id);
            failCount++;
            continue;
          }

          // Sync transaction
          const tableName = transaction.type === 'income' ? 'incomes' : 'expenses';
          const { error } = await supabase
            .from(tableName)
            .insert({
              ...transaction.data,
              user_id: user.id, // Ensure correct user_id
            });

          if (error) {
            logger.error('Failed to sync transaction:', transaction.id, error);
            await updateTransactionRetries(transaction.id, transaction.retries + 1);
            failCount++;
          } else {
            logger.info('Successfully synced transaction:', transaction.id);
            await removePendingTransaction(transaction.id);
            successCount++;
          }
        } catch (error) {
          logger.error('Error syncing transaction:', error);
          await updateTransactionRetries(transaction.id, transaction.retries + 1);
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: 'Синхронизация завершена',
          description: `Синхронизировано транзакций: ${successCount}`,
        });
      }

      if (failCount > 0) {
        toast({
          title: 'Ошибка синхронизации',
          description: `Не удалось синхронизировать: ${failCount} транзакций`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      logger.error('Error in syncPendingTransactions:', error);
    }
  }, [user, toast]);

  // Sync on mount if online
  useEffect(() => {
    if (navigator.onLine) {
      syncPendingTransactions();
    }
  }, [syncPendingTransactions]);

  // Listen for online event
  useEffect(() => {
    const handleOnline = () => {
      logger.info('Connection restored, syncing pending transactions...');
      syncPendingTransactions();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPendingTransactions]);

  // Periodic sync every 5 minutes (if online and have pending)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (navigator.onLine) {
        const pending = await getPendingTransactions();
        if (pending.length > 0) {
          logger.info('Periodic sync triggered...');
          syncPendingTransactions();
        }
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, [syncPendingTransactions]);

  return {
    syncNow: syncPendingTransactions,
    saveForLater: addPendingTransaction,
  };
}
