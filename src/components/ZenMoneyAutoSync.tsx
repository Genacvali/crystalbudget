import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

/**
 * Global component that automatically syncs ZenMoney transactions every minute
 * Works in the background regardless of which page is open
 */
export function ZenMoneyAutoSync() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const syncZenMoneyTransactions = async () => {
      try {
        // Check if ZenMoney is connected
        const { data: connection } = await supabase
          .from('zenmoney_connections')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!connection) return; // ZenMoney not connected

        // Check last sync time
        const { data: syncState } = await supabase
          .from('zenmoney_sync_state')
          .select('last_sync_at, sync_status')
          .eq('user_id', user.id)
          .maybeSingle();

        // Don't sync if:
        // 1. Already syncing
        // 2. Synced less than 1 minute ago
        if (syncState?.sync_status === 'syncing') return;
        
        if (syncState?.last_sync_at) {
          const lastSync = new Date(syncState.last_sync_at);
          const now = new Date();
          const minutesSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60);
          if (minutesSinceSync < 1) return; // Don't sync if synced less than 1 minute ago
        }

        // Perform quick sync (transactions only)
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!SUPABASE_URL || !SUPABASE_KEY) return;

        const SYNC_URL = `${SUPABASE_URL}/functions/v1/zenmoney-sync`;

        // Sync in background
        fetch(SYNC_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_KEY,
          },
          body: JSON.stringify({ syncType: 'transactions' }),
        })
        .then(async (response) => {
          if (response.ok) {
            // Dispatch event to notify components that data was synced
            window.dispatchEvent(new CustomEvent('zenmoney-synced'));
          }
        })
        .catch(() => {
          // Silently fail - will retry on next interval
        });
      } catch (error) {
        // Silently fail - will retry on next interval
        console.log('Auto-sync ZenMoney failed:', error);
      }
    };

    // Initial sync check
    syncZenMoneyTransactions();

    // Set up interval to sync every minute
    // Only sync when tab is visible (using Visibility API)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible, sync immediately
        syncZenMoneyTransactions();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = setInterval(() => {
      // Only sync if tab is visible
      if (document.visibilityState === 'visible') {
        syncZenMoneyTransactions();
      }
    }, 60 * 1000); // 1 minute

    // Cleanup interval and event listener on unmount
    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  // This component doesn't render anything
  return null;
}

