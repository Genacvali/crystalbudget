import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useFamily() {
  const { user } = useAuth();
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEffectiveUserId(null);
      setLoading(false);
      return;
    }

    const getEffectiveUserId = async () => {
      try {
        // Check if user is a family owner
        const { data: ownedFamily } = await supabase
          .from('families')
          .select('id, owner_id')
          .eq('owner_id', user.id)
          .maybeSingle();

        if (ownedFamily) {
          // User is family owner, use their ID
          setEffectiveUserId(user.id);
          setLoading(false);
          return;
        }

        // Check if user is a family member
        const { data: membership } = await supabase
          .from('family_members')
          .select('family_id, families!inner(owner_id)')
          .eq('user_id', user.id)
          .maybeSingle();

        if (membership && membership.families) {
          // User is a family member, use family owner's ID
          setEffectiveUserId((membership.families as any).owner_id);
        } else {
          // User is not in a family, use their own ID
          setEffectiveUserId(user.id);
        }
      } catch (error) {
        console.error('Error getting effective user ID:', error);
        setEffectiveUserId(user.id);
      } finally {
        setLoading(false);
      }
    };

    getEffectiveUserId();
  }, [user]);

  return { effectiveUserId, loading };
}
