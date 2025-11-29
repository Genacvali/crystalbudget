import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const requestData = await req.json();
    const userId = requestData.userId;
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Exporting data for user:', userId);

    // Find family and collect all user IDs
    let targetUserIds = [userId];
    let familyId = null;

    // Check if user is family owner
    const { data: ownedFamily } = await supabase
      .from('families')
      .select('id')
      .eq('owner_id', userId)
      .maybeSingle();

    if (ownedFamily?.id) {
      familyId = ownedFamily.id;
    } else {
      // Check if user is family member
      const { data: membership } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', userId)
        .maybeSingle();

      if (membership?.family_id) {
        familyId = membership.family_id;
      }
    }

    if (familyId) {
      console.log('Found family:', familyId);
      
      // Get family owner
      const { data: familyData } = await supabase
        .from('families')
        .select('owner_id')
        .eq('id', familyId)
        .single();

      // Get all family members
      const { data: members } = await supabase
        .from('family_members')
        .select('user_id')
        .eq('family_id', familyId);

      if (familyData?.owner_id) {
        targetUserIds = [familyData.owner_id];
        if (members && members.length > 0) {
          targetUserIds = [...new Set([familyData.owner_id, ...members.map(m => m.user_id)])];
        }
      }
    }

    console.log('Target user IDs:', targetUserIds);

    // Fetch all data using service_role (bypasses RLS)
    const incomeSourcesRes = await supabase
      .from('income_sources')
      .select('*')
      .in('user_id', targetUserIds);

    const categoriesRes = await supabase
      .from('categories')
      .select('*')
      .in('user_id', targetUserIds);

    const incomesRes = await supabase
      .from('incomes')
      .select('*')
      .in('user_id', targetUserIds);

    const expensesRes = await supabase
      .from('expenses')
      .select('*')
      .in('user_id', targetUserIds);

    const categories = categoriesRes.data || [];
    const categoryIds = categories.map(c => c.id);

    const allocationsRes = categoryIds.length > 0
      ? await supabase
          .from('category_allocations')
          .select('*')
          .in('category_id', categoryIds)
      : { data: [] };

    // Get profile and currency for the requesting user
    const profileRes = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    const currencyRes = await supabase
      .from('user_preferences')
      .select('currency')
      .eq('user_id', userId)
      .maybeSingle();

    const exportData = {
      version: "2.0",
      exportDate: new Date().toISOString(),
      userId: userId,
      exportedUserIds: targetUserIds,
      userEmail: '', // Will be filled client-side
      profile: profileRes.data || null,
      currency: currencyRes.data?.currency || null,
      incomeSources: incomeSourcesRes.data || [],
      categories: categories,
      categoryAllocations: allocationsRes.data || [],
      incomes: incomesRes.data || [],
      expenses: expensesRes.data || [],
      metadata: {
        totalIncomeSources: (incomeSourcesRes.data || []).length,
        totalCategories: categories.length,
        totalAllocations: (allocationsRes.data || []).length,
        totalIncomes: (incomesRes.data || []).length,
        totalExpenses: (expensesRes.data || []).length,
      }
    };

    console.log('Export completed:', exportData.metadata);

    return new Response(
      JSON.stringify(exportData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Export error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
