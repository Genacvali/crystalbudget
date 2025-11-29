import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import { LogOut, Moon, Sun, Monitor, Users, Copy, UserPlus, Trash2, DollarSign, RefreshCw, Link2, Upload, Sparkles } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCurrency } from "@/hooks/useCurrency";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { currency, updateCurrency } = useCurrency();
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [family, setFamily] = useState<any>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [familyName, setFamilyName] = useState("");
  const [activeCodes, setActiveCodes] = useState<any[]>([]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [telegramAuthCode, setTelegramAuthCode] = useState("");
  const [telegramLinked, setTelegramLinked] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [zenmoneyLinked, setZenmoneyLinked] = useState(false);
  const [zenmoneySyncing, setZenmoneySyncing] = useState(false);
  const [zenmoneyLastSync, setZenmoneyLastSync] = useState<string | null>(null);
  const [zenmoneyAccessToken, setZenmoneyAccessToken] = useState("");
  const [zenmoneyRefreshToken, setZenmoneyRefreshToken] = useState("");
  const [zenmoneyExpiresIn, setZenmoneyExpiresIn] = useState("");
  const [zenmoneyManualMode, setZenmoneyManualMode] = useState(false);
  const [zenmoneyCategories, setZenmoneyCategories] = useState<Array<{id: string, name: string, zenmoney_id: string | null}>>([]);
  const [allCategories, setAllCategories] = useState<Array<{id: string, name: string}>>([]);
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [aiMapping, setAiMapping] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfile();
      loadFamily();
      loadTelegramConnection();
      loadZenMoneyConnection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Check for ZenMoney OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const state = urlParams.get('state');
    
    if (code && state && user) {
      // OAuth callback - connection should be handled by server
      // Just reload the connection status after a short delay
      setTimeout(() => {
        loadZenMoneyConnection();
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
        toast({
          title: "ZenMoney подключен",
          description: "Интеграция успешно настроена",
        });
      }, 2000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setFullName(data.full_name || "");
    }
  };

  const loadTelegramConnection = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("telegram_users")
      .select("telegram_username, telegram_first_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setTelegramLinked(true);
      setTelegramUsername(data.telegram_username || data.telegram_first_name || "");
    }
  };

  const loadZenMoneyConnection = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("zenmoney_connections")
      .select("created_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!error && data) {
      setZenmoneyLinked(true);
      setZenmoneyLastSync(data.created_at);
      await loadCategoryMappings();
    } else {
      setZenmoneyLinked(false);
    }

    // Check last sync time
    const { data: syncState } = await supabase
      .from("zenmoney_sync_state")
      .select("last_sync_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (syncState?.last_sync_at) {
      setZenmoneyLastSync(syncState.last_sync_at);
    }
  };

  const loadCategoryMappings = async () => {
    if (!user) return;

    // Load categories with zenmoney_id (from ZenMoney)
    const { data: zmCategories } = await supabase
      .from("categories")
      .select("id, name, zenmoney_id")
      .eq("user_id", user.id)
      .not("zenmoney_id", "is", null);

    if (zmCategories) {
      setZenmoneyCategories(zmCategories);
    }

    // Load all categories for mapping
    const { data: categories } = await supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name");

    if (categories) {
      setAllCategories(categories);
      
      // Initialize mappings
      const mappings: Record<string, string> = {};
      zmCategories?.forEach(zmCat => {
        if (zmCat.zenmoney_id) {
          mappings[zmCat.zenmoney_id] = zmCat.id;
        }
      });
      setCategoryMappings(mappings);
    }
  };

  const handleAIMapCategories = async () => {
    if (!user) return;

    setAiMapping(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Необходима авторизация");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Не настроены переменные окружения Supabase");
      }

      const MAP_URL = `${SUPABASE_URL}/functions/v1/zenmoney-map-categories`;

      const response = await fetch(MAP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_KEY,
        },
      });

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (e) {
          const errorText = await response.text().catch(() => '');
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (data.totalMapped > 0) {
        toast({
          title: "Категории сопоставлены",
          description: `ИИ автоматически сопоставил ${data.totalMapped} категорий`,
        });
      } else {
        toast({
          title: "Сопоставление завершено",
          description: "Все категории уже сопоставлены или нет категорий для сопоставления",
        });
      }

      await loadCategoryMappings();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка AI-сопоставления",
        description: errorMessage,
      });
    }
    setAiMapping(false);
  };

  const handleMapCategory = async (zenmoneyId: string, categoryId: string) => {
    if (!user) return;

    setLoading(true);
    try {
      // Find the category with this zenmoney_id
      const { data: zmCategory } = await supabase
        .from("categories")
        .select("id")
        .eq("user_id", user.id)
        .eq("zenmoney_id", zenmoneyId)
        .single();

      if (zmCategory) {
        // Update the category to point to the selected category
        // We'll merge them by updating zenmoney_id of the target category
        const { data: targetCategory } = await supabase
          .from("categories")
          .select("id")
          .eq("id", categoryId)
          .single();

        if (targetCategory) {
          // Update target category with zenmoney_id
          await supabase
            .from("categories")
            .update({ zenmoney_id: zenmoneyId })
            .eq("id", categoryId);

          // Delete the duplicate category from ZenMoney
          await supabase
            .from("categories")
            .delete()
            .eq("id", zmCategory.id);

          // Update expenses to use the new category
          await supabase
            .from("expenses")
            .update({ category_id: categoryId })
            .eq("category_id", zmCategory.id);

          toast({
            title: "Категории сопоставлены",
            description: "Категория успешно сопоставлена",
          });

          await loadCategoryMappings();
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка сопоставления",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const loadFamily = async () => {
    if (!user) return;

    // Check if user owns a family
    const { data: ownedFamily } = await supabase
      .from("families")
      .select("*")
      .eq("owner_id", user.id)
      .maybeSingle();

    if (ownedFamily) {
      setFamily(ownedFamily);
      setFamilyName(ownedFamily.name || "");
      await loadFamilyMembers(ownedFamily.id);
      return;
    }

    // Check if user is a member of a family
    const { data: membershipData } = await supabase
      .from("family_members")
      .select("family_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipData) {
      const { data: familyData } = await supabase
        .from("families")
        .select("*")
        .eq("id", membershipData.family_id)
        .single();

      if (familyData) {
        setFamily(familyData);
        setFamilyName(familyData.name || "");
        await loadFamilyMembers(familyData.id);
      }
    }
  };

  const loadFamilyMembers = async (familyId: string) => {
    // Get family data to access owner_id
    const { data: familyData } = await supabase
      .from("families")
      .select("owner_id")
      .eq("id", familyId)
      .single();

    const allMembers: Array<{ id: string; email: string; full_name: string; role: string; avatar_url?: string }> = [];

    // Add owner to the list
    if (familyData?.owner_id) {
      const { data: ownerProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", familyData.owner_id)
        .maybeSingle();

      allMembers.push({
        user_id: familyData.owner_id,
        full_name: ownerProfile?.full_name || "Пользователь",
        is_owner: true,
        joined_at: null
      });
    }

    // Load regular members
    const { data: members } = await supabase
      .from("family_members")
      .select("user_id, joined_at")
      .eq("family_id", familyId);

    if (members) {
      const memberProfiles = await Promise.all(
        members.map(async (member) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", member.user_id)
            .maybeSingle();

          return {
            ...member,
            full_name: profile?.full_name || "Пользователь",
            is_owner: false
          };
        })
      );
      allMembers.push(...memberProfiles);
    }

    setFamilyMembers(allMembers);

    // Load active invite codes if user is owner
    if (family?.owner_id === user?.id) {
      const { data: codes } = await supabase
        .from("family_invite_codes")
        .select("*")
        .eq("family_id", familyId)
        .is("used_by", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });

      if (codes) {
        setActiveCodes(codes);
      }
    }
  };

  const handleCreateFamily = async () => {
    if (!user) return;

    setLoading(true);
    const { data, error } = await supabase
      .from("families")
      .insert({ owner_id: user.id })
      .select()
      .single();

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка создания семьи",
        description: error.message,
      });
    } else {
      setFamily(data);
      toast({
        title: "Семья создана",
        description: "Теперь вы можете пригласить членов семьи",
      });
      await loadFamily();
    }
    setLoading(false);
  };

  const handleGenerateCode = async () => {
    if (!user || !family) return;

    setLoading(true);

    // First, delete all existing active codes for this family
    await supabase
      .from("family_invite_codes")
      .delete()
      .eq("family_id", family.id)
      .is("used_by", null);

    // Generate new code
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();

    const { error } = await supabase
      .from("family_invite_codes")
      .insert({
        family_id: family.id,
        code: code,
        created_by: user.id
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка генерации кода",
        description: error.message,
      });
    } else {
      toast({
        title: "Код сгенерирован",
        description: "Код действителен 5 минут и скопирован в буфер обмена",
      });
      navigator.clipboard.writeText(code);
      await loadFamilyMembers(family.id);
    }
    setLoading(false);
  };

  const handleUpdateFamilyName = async () => {
    if (!user || !family || family.owner_id !== user.id) return;

    setLoading(true);
    const { error } = await supabase
      .from("families")
      .update({ name: familyName })
      .eq("id", family.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка обновления",
        description: error.message,
      });
    } else {
      setFamily({ ...family, name: familyName });
      toast({
        title: "Название обновлено",
        description: "Название семьи успешно изменено",
      });
    }
    setLoading(false);
  };

  const handleJoinFamily = async () => {
    if (!user || !joinCode) return;

    setLoading(true);

    // Call database function to join family
    const { data, error } = await supabase.rpc('join_family_with_code', {
      _invite_code: joinCode
    });

    const result = data as { success: boolean; error?: string; family_id?: string } | null;

    if (error || !result?.success) {
      toast({
        variant: "destructive",
        title: "Ошибка присоединения",
        description: result?.error || error?.message || "Не удалось присоединиться к семье",
      });
      setLoading(false);
      return;
    }

    toast({
      title: "Успешно присоединились к семье",
      description: "Теперь у вас есть доступ к данным семьи",
    });
    setJoinCode("");
    await loadFamily();
    setLoading(false);
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    setLoading(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        full_name: fullName
      }, {
        onConflict: 'user_id'
      });

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка сохранения",
        description: error.message,
      });
    } else {
      toast({
        title: "Профиль обновлен",
        description: "Изменения успешно сохранены",
      });
    }
    setLoading(false);
  };

  const handleChangePassword = async () => {
    if (!newPassword || !confirmPassword) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Заполните все поля",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Пароли не совпадают",
      });
      return;
    }

    if (newPassword.length < 6) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Пароль должен содержать минимум 6 символов",
      });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка смены пароля",
        description: error.message,
      });
    } else {
      toast({
        title: "Пароль изменен",
        description: "Ваш пароль успешно обновлен",
      });
      setNewPassword("");
      setConfirmPassword("");
    }
    setLoading(false);
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!family) return;

    setLoading(true);
    const { error } = await supabase
      .from("family_members")
      .delete()
      .eq("family_id", family.id)
      .eq("user_id", memberId);

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка удаления",
        description: error.message,
      });
    } else {
      toast({
        title: "Член семьи удален",
        description: "Пользователь больше не имеет доступа к данным семьи",
      });
      await loadFamilyMembers(family.id);
    }
    setLoading(false);
  };

  const handleLeaveFamily = async () => {
    if (!family || !user) return;

    setLoading(true);
    const { error } = await supabase
      .from("family_members")
      .delete()
      .eq("family_id", family.id)
      .eq("user_id", user.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка выхода",
        description: error.message,
      });
    } else {
      toast({
        title: "Вы покинули семью",
        description: "Доступ к данным семьи закрыт",
      });
      setFamily(null);
      setFamilyMembers([]);
    }
    setLoading(false);
  };

  const handleExportData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // 1. Identify users to export (self + family) - using same logic as Dashboard
      let targetUserIds = [user.id];
      let familyId = null;

      // Check if user is a family owner
      console.log("Checking if user is family owner...");
      const { data: ownedFamily, error: ownedFamilyError } = await supabase
        .from("families")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();
      console.log("Owned family:", ownedFamily, "Error:", ownedFamilyError);

      if (ownedFamily?.id) {
        familyId = ownedFamily.id;
      } else {
        // Check if user is a family member
        console.log("Checking if user is family member...");
        const { data: membership, error: membershipError } = await supabase
          .from("family_members")
          .select("family_id")
          .eq("user_id", user.id)
          .maybeSingle();
        console.log("Membership:", membership, "Error:", membershipError);

        if (membership?.family_id) {
          familyId = membership.family_id;
        }
      }

      if (familyId) {
        console.log("Found family ID:", familyId);
        // Get family owner
        const { data: familyData, error: familyDataError } = await supabase
          .from("families")
          .select("owner_id")
          .eq("id", familyId)
          .single();
        console.log("Family data:", familyData, "Error:", familyDataError);

        // Get all family members
        const { data: members, error: membersError } = await supabase
          .from("family_members")
          .select("user_id")
          .eq("family_id", familyId);
        console.log("Family members:", members, "Error:", membersError);

        // Include owner and all members (same logic as Dashboard)
        if (familyData?.owner_id) {
          targetUserIds = [familyData.owner_id];
          if (members && members.length > 0) {
            targetUserIds = [familyData.owner_id, ...members.map(m => m.user_id)];
          }
        }
      } else {
        console.log("No family found, using only current user ID");
      }

      console.log("Exporting data for users:", targetUserIds);
      console.log("Current user ID:", user.id);
      console.log("Family ID:", familyId);
      toast({
        title: "Экспорт данных",
        description: `Найдено пользователей для экспорта: ${targetUserIds.length}`,
      });

      // First, fetch all transactions to get all category_id and source_id references
      console.log("Fetching incomes for user_ids:", targetUserIds);
      const incomesRes = await supabase.from("incomes").select("*").in("user_id", targetUserIds).range(0, 10000);
      console.log("Incomes response:", { data: incomesRes.data?.length, error: incomesRes.error });
      
      console.log("Fetching expenses for user_ids:", targetUserIds);
      const expensesRes = await supabase.from("expenses").select("*").in("user_id", targetUserIds).range(0, 10000);
      console.log("Expenses response:", { data: expensesRes.data?.length, error: expensesRes.error });
      
      const incomes = incomesRes.data || [];
      const expenses = expensesRes.data || [];
      
      // Collect all unique source_id and category_id from transactions
      const sourceIds = new Set<string>();
      const categoryIds = new Set<string>();
      
      incomes.forEach((inc: any) => {
        if (inc.source_id) sourceIds.add(inc.source_id);
      });
      expenses.forEach((exp: any) => {
        if (exp.category_id) categoryIds.add(exp.category_id);
      });
      
      console.log("Found source_ids in transactions:", Array.from(sourceIds));
      console.log("Found category_ids in transactions:", Array.from(categoryIds));
      
      // Fetch income sources - first by user_id, then by source_id from transactions
      console.log("Fetching income sources for user_ids:", targetUserIds);
      const incomeSourcesByUserRes = await supabase.from("income_sources").select("*").in("user_id", targetUserIds).order("created_at", { ascending: false });
      console.log("Income sources by user response:", { data: incomeSourcesByUserRes.data?.length, error: incomeSourcesByUserRes.error });
      
      // Also fetch sources by ID from transactions (to get sources from other users that are referenced)
      let incomeSourcesByRefRes = { data: [] as any[], error: null };
      if (sourceIds.size > 0) {
        const sourceIdsArray = Array.from(sourceIds);
        incomeSourcesByRefRes = await supabase.from("income_sources").select("*").in("id", sourceIdsArray);
        console.log("Income sources by reference response:", { data: incomeSourcesByRefRes.data?.length, error: incomeSourcesByRefRes.error });
      }
      
      // Merge sources (avoid duplicates)
      const allSources = new Map<string, any>();
      (incomeSourcesByUserRes.data || []).forEach((src: any) => allSources.set(src.id, src));
      (incomeSourcesByRefRes.data || []).forEach((src: any) => allSources.set(src.id, src));
      const incomeSources = Array.from(allSources.values());
      
      console.log(`Total income sources after merge: ${incomeSources.length} (by user: ${incomeSourcesByUserRes.data?.length || 0}, by ref: ${incomeSourcesByRefRes.data?.length || 0})`);
      console.log("Missing source IDs:", Array.from(sourceIds).filter(id => !allSources.has(id)));
      
      // Fetch categories - first by user_id, then by category_id from transactions
      console.log("Fetching categories for user_ids:", targetUserIds);
      const categoriesByUserRes = await supabase.from("categories").select("*").in("user_id", targetUserIds).order("created_at", { ascending: false });
      console.log("Categories by user response:", { data: categoriesByUserRes.data?.length, error: categoriesByUserRes.error });
      
      // Also fetch categories by ID from transactions (to get categories from other users that are referenced)
      let categoriesByRefRes = { data: [] as any[], error: null };
      if (categoryIds.size > 0) {
        const categoryIdsArray = Array.from(categoryIds);
        console.log("Fetching categories by ID:", categoryIdsArray);
        categoriesByRefRes = await supabase.from("categories").select("*").in("id", categoryIdsArray);
        console.log("Categories by reference response:", { data: categoriesByRefRes.data?.length, error: categoriesByRefRes.error });
        if (categoriesByRefRes.error) {
          console.error("Error fetching categories by reference:", categoriesByRefRes.error);
        }
      }
      
      // Merge categories (avoid duplicates)
      const allCategories = new Map<string, any>();
      (categoriesByUserRes.data || []).forEach((cat: any) => allCategories.set(cat.id, cat));
      (categoriesByRefRes.data || []).forEach((cat: any) => allCategories.set(cat.id, cat));
      const categories = Array.from(allCategories.values());
      
      console.log(`Total categories after merge: ${categories.length} (by user: ${categoriesByUserRes.data?.length || 0}, by ref: ${categoriesByRefRes.data?.length || 0})`);
      console.log("Missing category IDs:", Array.from(categoryIds).filter(id => !allCategories.has(id)));
      
      // Get category allocations (budget settings)
      const categoryIdsForAllocations = categories.map(c => c.id);
      
      const allocationsRes = categoryIdsForAllocations.length > 0 
        ? await supabase.from("category_allocations").select("*").in("category_id", categoryIdsForAllocations)
        : { data: [] };

      // Profile and preferences (only for current user)
      const profileRes = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      const currencyRes = await supabase.from("user_preferences").select("currency").eq("user_id", user.id).maybeSingle();

      const allocations = allocationsRes.data || [];
      const profile = profileRes.data || null;
      const currency = currencyRes.data?.currency || null;

      // Log distribution by user_id for debugging
      const expensesByUser: Record<string, number> = {};
      expenses.forEach((exp: any) => {
        const uid = exp.user_id || 'unknown';
        expensesByUser[uid] = (expensesByUser[uid] || 0) + 1;
      });
      const incomesByUser: Record<string, number> = {};
      incomes.forEach((inc: any) => {
        const uid = inc.user_id || 'unknown';
        incomesByUser[uid] = (incomesByUser[uid] || 0) + 1;
      });
      const categoriesByUser: Record<string, number> = {};
      categories.forEach((cat: any) => {
        const uid = cat.user_id || 'unknown';
        categoriesByUser[uid] = (categoriesByUser[uid] || 0) + 1;
      });
      const sourcesByUser: Record<string, number> = {};
      incomeSources.forEach((src: any) => {
        const uid = src.user_id || 'unknown';
        sourcesByUser[uid] = (sourcesByUser[uid] || 0) + 1;
      });
      console.log('Export - Expenses by user:', expensesByUser);
      console.log('Export - Incomes by user:', incomesByUser);
      console.log('Export - Categories by user:', categoriesByUser);
      console.log('Export - Income sources by user:', sourcesByUser);
      console.log('Export - Target user IDs:', targetUserIds);

      const exportData = {
        version: "2.0",
        exportDate: new Date().toISOString(),
        userId: user.id,
        exportedUserIds: targetUserIds,
        userEmail: user.email,
        profile: profile,
        currency: currency,
        incomeSources: incomeSources,
        categories: categories,
        categoryAllocations: allocations,
        incomes: incomes,
        expenses: expenses,
        metadata: {
          totalIncomeSources: incomeSources.length,
          totalCategories: categories.length,
          totalAllocations: allocations.length,
          totalIncomes: incomes.length,
          totalExpenses: expenses.length,
        }
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `crystal-budget-full-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Полный экспорт завершен",
        description: `Экспортировано: ${incomeSources.length} источников, ${categories.length} категорий, ${allocations.length} настроек бюджета, ${incomes.length} доходов, ${expenses.length} расходов`,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка экспорта",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleImportData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;

    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      // Read file content
      const text = await file.text();
      const importData = JSON.parse(text);

      // Validate data structure
      if (!importData.incomeSources && !importData.categories) {
        throw new Error("Неверный формат файла. Ожидается файл экспорта CrystalBudget.");
      }

      // Confirm import
      if (!confirm("Импорт данных заменит все существующие данные. Продолжить?")) {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // 1. Import Profile & Currency
      const profileData = importData.profile || null;
      const currencyData = importData.currency || null;

      if (profileData) {
        await supabase
          .from("profiles")
          .upsert({
            user_id: user.id,
            full_name: profileData.full_name || null,
          }, {
            onConflict: 'user_id'
          });
      }

      if (currencyData) {
        await updateCurrency(currencyData);
      }

      // 2. Clear existing data
      // First delete allocations (dependent on categories)
      const { data: userCats } = await supabase.from("categories").select("id").eq("user_id", user.id);
      if (userCats && userCats.length > 0) {
        const catIds = userCats.map(c => c.id);
        await supabase.from("category_allocations").delete().in("category_id", catIds);
      }

      // Delete expenses and incomes
      await supabase.from("expenses").delete().eq("user_id", user.id);
      await supabase.from("incomes").delete().eq("user_id", user.id);

      // Delete categories and sources
      await supabase.from("categories").delete().eq("user_id", user.id);
      await supabase.from("income_sources").delete().eq("user_id", user.id);

      // Maps for linking old IDs to new IDs
      const sourceIdMap: Record<string, string> = {};
      const categoryIdMap: Record<string, string> = {};

      // 3. Import Income Sources
      if (importData.incomeSources && importData.incomeSources.length > 0) {
        const sourcesToInsert = importData.incomeSources.map((s: any) => ({
          user_id: user.id,
          name: s.name,
          color: s.color || '#10b981', // Default color if missing, table has color column
          // currency column does not exist on income_sources table
          zenmoney_id: s.zenmoney_id || null,
        }));

        const { data: insertedSources, error: sourceError } = await supabase
          .from("income_sources")
          .insert(sourcesToInsert)
          .select();
        
        if (sourceError) throw new Error(`Ошибка импорта источников: ${sourceError.message}`);

        if (insertedSources) {
          insertedSources.forEach((newSource, idx) => {
            const oldSource = importData.incomeSources[idx];
            if (oldSource && oldSource.id) {
              sourceIdMap[oldSource.id] = newSource.id;
            }
          });
        }
      }

      // 4. Import Categories (with linked sources)
      if (importData.categories && importData.categories.length > 0) {
        const categoriesToInsert = importData.categories.map((c: any) => ({
          user_id: user.id,
          name: c.name,
          icon: c.icon || '📁',
          linked_source_id: c.linked_source_id ? sourceIdMap[c.linked_source_id] : null,
          allocation_amount: c.allocation_amount,
          allocation_percent: c.allocation_percent,
          zenmoney_id: c.zenmoney_id || null,
        }));

        const { data: insertedCategories, error: catError } = await supabase
          .from("categories")
          .insert(categoriesToInsert)
          .select();

        if (catError) throw new Error(`Ошибка импорта категорий: ${catError.message}`);

        if (insertedCategories) {
          insertedCategories.forEach((newCat, idx) => {
            const oldCat = importData.categories[idx];
            if (oldCat && oldCat.id) {
              categoryIdMap[oldCat.id] = newCat.id;
            }
          });
        }
      }

      // 5. Import Category Allocations
      const categoryAllocations = importData.categoryAllocations || [];
      if (categoryAllocations.length > 0) {
        const allocationsToInsert = categoryAllocations.map((a: any) => {
          const newCatId = categoryIdMap[a.category_id];
          const newSourceId = a.income_source_id ? sourceIdMap[a.income_source_id] : null;
          
          if (!newCatId || !newSourceId) return null;
          
          return {
            category_id: newCatId,
            income_source_id: newSourceId,
            allocation_type: a.allocation_type,
            allocation_value: a.allocation_value,
            currency: a.currency || 'RUB',
          };
        }).filter((a: any) => a !== null);

        if (allocationsToInsert.length > 0) {
          const { error: allocError } = await supabase.from("category_allocations").insert(allocationsToInsert as any);
          if (allocError) console.error("Ошибка импорта настроек бюджета:", allocError);
        }
      }

      // 6. Import Incomes
      let importedIncomesCount = 0;
      if (importData.incomes && importData.incomes.length > 0) {
        console.log(`Import - Processing ${importData.incomes.length} incomes`);
        const incomesToInsert = importData.incomes.map((inc: any) => {
          const newSourceId = inc.source_id ? sourceIdMap[inc.source_id] : null;
          // Log if source mapping failed
          if (inc.source_id && !newSourceId) {
            console.warn(`Income source mapping failed for source_id: ${inc.source_id} (original user_id: ${inc.user_id})`);
          }
          return {
            user_id: user.id,
            source_id: newSourceId,
            amount: inc.amount,
            date: inc.date,
            description: inc.description || null,
            zenmoney_id: inc.zenmoney_id || null,
            currency: inc.currency || 'RUB',
          };
        });
        const { data: insertedIncomes, error: incError } = await supabase.from("incomes").insert(incomesToInsert as any).select();
        if (incError) {
          console.error('Income import error:', incError);
          throw new Error(`Ошибка импорта доходов: ${incError.message}`);
        }
        importedIncomesCount = insertedIncomes?.length || 0;
        console.log(`Import - Inserted ${importedIncomesCount} incomes out of ${importData.incomes.length}`);
        if (importedIncomesCount !== importData.incomes.length) {
          console.warn(`Import - Some incomes were not inserted! Expected: ${importData.incomes.length}, Got: ${importedIncomesCount}`);
        }
      }

      // 7. Import Expenses
      let importedExpensesCount = 0;
      if (importData.expenses && importData.expenses.length > 0) {
        console.log(`Import - Processing ${importData.expenses.length} expenses`);
        let mappingFailures = 0;
        const expensesToInsert = importData.expenses.map((exp: any) => {
          const newCategoryId = exp.category_id ? categoryIdMap[exp.category_id] : null;
          // Log if category mapping failed
          if (exp.category_id && !newCategoryId) {
            mappingFailures++;
            console.warn(`Category mapping failed for category_id: ${exp.category_id} (original user_id: ${exp.user_id})`);
          }
          return {
            user_id: user.id,
            category_id: newCategoryId,
            amount: exp.amount,
            date: exp.date,
            description: exp.description || null,
            zenmoney_id: exp.zenmoney_id || null,
            currency: exp.currency || 'RUB',
          };
        });
        console.log(`Import - Category mapping failures: ${mappingFailures} out of ${importData.expenses.length}`);
        const { data: insertedExpenses, error: expError } = await supabase.from("expenses").insert(expensesToInsert as any).select();
        if (expError) {
          console.error('Expense import error:', expError);
          throw new Error(`Ошибка импорта расходов: ${expError.message}`);
        }
        importedExpensesCount = insertedExpenses?.length || 0;
        console.log(`Import - Inserted ${importedExpensesCount} expenses out of ${importData.expenses.length}`);
        if (importedExpensesCount !== importData.expenses.length) {
          console.warn(`Import - Some expenses were not inserted! Expected: ${importData.expenses.length}, Got: ${importedExpensesCount}`);
        }
      }

      toast({
        title: "Импорт успешно завершен",
        description: `Импортировано: ${Object.keys(sourceIdMap).length} источников, ${Object.keys(categoryIdMap).length} категорий, ${importedIncomesCount} доходов, ${importedExpensesCount} расходов`,
      });

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка импорта",
        description: errorMessage,
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
    setLoading(false);
  };

  const handleClearData = async () => {
    if (!user) return;

    if (!confirm("Вы уверены? Все ваши данные будут удалены безвозвратно!")) {
      return;
    }

    if (!confirm("Это действие нельзя отменить. Продолжить?")) {
      return;
    }

    setLoading(true);
    try {
      await supabase.from("expenses").delete().eq("user_id", user.id);
      await supabase.from("incomes").delete().eq("user_id", user.id);
      await supabase.from("categories").delete().eq("user_id", user.id);
      await supabase.from("income_sources").delete().eq("user_id", user.id);

      toast({
        title: "Данные очищены",
        description: "Все ваши финансовые данные удалены",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка очистки",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleClearZenMoneyData = async () => {
    if (!user) return;

    if (!confirm("Удалить все транзакции из ZenMoney и пересинхронизировать?\n\nЭто удалит только транзакции, импортированные из ZenMoney. Ваши категории и источники дохода останутся.")) {
      return;
    }

    setLoading(true);
    try {
      // Delete all expenses and incomes with zenmoney_id
      await supabase
        .from("expenses")
        .delete()
        .eq("user_id", user.id)
        .not("zenmoney_id", "is", null);

      await supabase
        .from("incomes")
        .delete()
        .eq("user_id", user.id)
        .not("zenmoney_id", "is", null);

      // Reset sync state to force full resync
      await supabase
        .from("zenmoney_sync_state")
        .update({
          server_timestamp: 0,
          last_sync_at: null,
          sync_status: 'pending',
        })
        .eq("user_id", user.id);

      toast({
        title: "Данные ZenMoney очищены",
        description: "Теперь можно выполнить новую синхронизацию",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка очистки",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleClearCurrentMonth = async () => {
    if (!user) return;

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    if (!confirm(`Удалить все транзакции за текущий месяц (${now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })})?\n\nЭто действие нельзя отменить.`)) {
      return;
    }

    setLoading(true);
    try {
      // Delete expenses for current month
      await supabase
        .from("expenses")
        .delete()
        .eq("user_id", user.id)
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);

      // Delete incomes for current month
      await supabase
        .from("incomes")
        .delete()
        .eq("user_id", user.id)
        .gte("date", startOfMonth)
        .lte("date", endOfMonth);

      toast({
        title: "Данные за месяц удалены",
        description: "Можно начать месяц заново",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка очистки",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleLinkTelegram = async () => {
    if (!user || !telegramAuthCode) return;

    setLoading(true);

    // Find the auth code
    const { data: authData, error: authError } = await supabase
      .from("telegram_auth_codes")
      .select("*")
      .eq("auth_code", telegramAuthCode)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (authError || !authData) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Неверный или истекший код",
      });
      setLoading(false);
      return;
    }

    // Link Telegram account
    const { error: linkError } = await supabase
      .from("telegram_users")
      .insert({
        user_id: user.id,
        telegram_id: authData.telegram_id,
        telegram_username: authData.telegram_username,
        telegram_first_name: authData.telegram_first_name,
        telegram_last_name: authData.telegram_last_name,
      });

    if (linkError) {
      toast({
        variant: "destructive",
        title: "Ошибка связывания",
        description: linkError.message,
      });
      setLoading(false);
      return;
    }

    // Mark code as used
    await supabase
      .from("telegram_auth_codes")
      .update({ used: true })
      .eq("id", authData.id);

    // Send notification to Telegram
    try {
      await supabase.functions.invoke('send-telegram-notification');
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
      // Don't fail the whole operation if notification fails
    }

    toast({
      title: "Telegram связан",
      description: "Теперь вы можете управлять бюджетом через Telegram. Проверьте бота!",
    });

    setTelegramAuthCode("");
    await loadTelegramConnection();
    setLoading(false);
  };

  const handleUnlinkTelegram = async () => {
    if (!user) return;

    setLoading(true);
    const { error } = await supabase
      .from("telegram_users")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message,
      });
    } else {
      toast({
        title: "Telegram отключен",
        description: "Связь с Telegram удалена",
      });
      setTelegramLinked(false);
      setTelegramUsername("");
    }
    setLoading(false);
  };

  const handleSetWebhook = async () => {
    setSettingWebhook(true);
    try {
      const { data, error } = await supabase.functions.invoke('set-telegram-webhook');

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Webhook установлен",
          description: "Бот готов к работе",
        });
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка установки webhook",
        description: errorMessage,
      });
    }
    setSettingWebhook(false);
  };

  const handleConnectZenMoney = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('zenmoney-auth');

      if (error) throw error;

      if (data.authUrl) {
        // Open OAuth URL in new window
        window.location.href = data.authUrl;
      } else {
        throw new Error('Не удалось получить URL авторизации');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка подключения ZenMoney",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleRequestZeroAppTokens = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Запрос токенов через Zero App API
      // Замените URL на актуальный endpoint Zero App API
      const zeroAppApiUrl = import.meta.env.VITE_ZERO_APP_API_URL || 'https://api.zeroapp.ru/zenmoney/tokens';
      
      const response = await fetch(zeroAppApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Zero App API error: ${response.status}`);
      }

      const tokenData = await response.json();

      if (tokenData.access_token) {
        setZenmoneyAccessToken(tokenData.access_token);
        setZenmoneyRefreshToken(tokenData.refresh_token || '');
        setZenmoneyExpiresIn(tokenData.expires_in?.toString() || '');
        
        toast({
          title: "Токены получены",
          description: "Токены успешно получены из Zero App API",
        });
      } else {
        throw new Error('Токены не получены из Zero App API');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка запроса Zero App API",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleSaveZenMoneyTokens = async () => {
    if (!user || !zenmoneyAccessToken) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Введите Access Token",
      });
      return;
    }

    setLoading(true);
    try {
      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Необходима авторизация");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Не настроены переменные окружения Supabase");
      }

      const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/zenmoney-auth`;

      console.log('Calling ZenMoney auth function:', FUNCTION_URL);

      const response = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_KEY,
        },
        body: JSON.stringify({
          access_token: zenmoneyAccessToken,
          refresh_token: zenmoneyRefreshToken || undefined,
          expires_in: zenmoneyExpiresIn ? parseInt(zenmoneyExpiresIn) : undefined,
        }),
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          console.error('Error response:', errorData);
        } catch (e) {
          const errorText = await response.text().catch(() => '');
          errorMessage = errorText || errorMessage;
          console.error('Error text:', errorText);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Success response:', data);

      if (data.success) {
        toast({
          title: "ZenMoney подключен",
          description: "Токены успешно сохранены",
        });
        setZenmoneyAccessToken("");
        setZenmoneyRefreshToken("");
        setZenmoneyExpiresIn("");
        setZenmoneyManualMode(false);
        await loadZenMoneyConnection();
      } else {
        throw new Error(data.error || 'Не удалось сохранить токены');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка сохранения токенов",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleSyncZenMoney = async () => {
    if (!user) return;

    setZenmoneySyncing(true);
    try {
      // Get current session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Необходима авторизация");
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error("Не настроены переменные окружения Supabase");
      }

      // Step 1: Sync data from ZenMoney
      const SYNC_URL = `${SUPABASE_URL}/functions/v1/zenmoney-sync`;

      console.log('Calling ZenMoney sync function:', SYNC_URL);

      const syncResponse = await fetch(SYNC_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_KEY,
        },
      });

      console.log('Sync response status:', syncResponse.status, syncResponse.statusText);

      if (!syncResponse.ok) {
        let errorMessage = `HTTP error! status: ${syncResponse.status}`;
        try {
          const errorData = await syncResponse.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
          console.error('Error response:', errorData);
        } catch (e) {
          const errorText = await syncResponse.text().catch(() => '');
          errorMessage = errorText || errorMessage;
          console.error('Error text:', errorText);
        }
        throw new Error(errorMessage);
      }

      const syncData = await syncResponse.json();
      console.log('Sync success response:', syncData);

      // Step 2: Auto-map categories using AI
      toast({
        title: "Синхронизация завершена",
        description: `Импортировано: ${syncData.accountsCount || 0} счетов, ${syncData.transactionsCount || 0} транзакций. Сопоставляю категории...`,
      });

      const MAP_URL = `${SUPABASE_URL}/functions/v1/zenmoney-map-categories`;

      try {
        const mapResponse = await fetch(MAP_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': SUPABASE_KEY,
          },
        });

        if (mapResponse.ok) {
          const mapData = await mapResponse.json();
          console.log('AI mapping result:', mapData);

          if (mapData.totalMapped > 0) {
            toast({
              title: "Категории сопоставлены",
              description: `Автоматически сопоставлено ${mapData.totalMapped} категорий через ИИ`,
            });
          }
        } else {
          console.warn('AI mapping failed, but sync was successful');
        }
      } catch (mapError) {
        console.warn('AI mapping error (non-critical):', mapError);
        // Don't fail the whole sync if AI mapping fails
      }

      await loadZenMoneyConnection();
      await loadCategoryMappings();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка синхронизации",
        description: errorMessage,
      });
    }
    setZenmoneySyncing(false);
  };

  const handleUnlinkZenMoney = async () => {
    if (!user) return;

    if (!confirm("Вы уверены, что хотите отключить ZenMoney? Все синхронизированные данные останутся, но синхронизация прекратится.")) {
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("zenmoney_connections")
        .delete()
        .eq("user_id", user.id);

      if (error) throw error;

      await supabase
        .from("zenmoney_sync_state")
        .delete()
        .eq("user_id", user.id);

      toast({
        title: "ZenMoney отключен",
        description: "Интеграция успешно отключена",
      });

      setZenmoneyLinked(false);
      setZenmoneyLastSync(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        variant: "destructive",
        title: "Ошибка отключения",
        description: errorMessage,
      });
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      // First sign out
      const { error } = await supabase.auth.signOut();

      // Ignore "Auth session missing" error as it means user is already logged out
      if (error && !error.message.includes('Auth session missing')) {
        toast({
          variant: "destructive",
          title: "Ошибка выхода",
          description: error.message,
        });
        return;
      }

      // Wait a bit to ensure session is cleared
      await new Promise(resolve => setTimeout(resolve, 100));

      toast({
        title: "Вы вышли из системы",
        description: "До встречи!",
      });

      // Force reload to clear any cached state
      window.location.href = "/auth";
    } catch (err) {
      console.error('Logout error:', err);
      // Force redirect anyway
      window.location.href = "/auth";
    }
  };

  return (
    <Layout selectedDate={new Date()} onDateChange={() => { }} showMonthSelector={false}>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold">Настройки</h1>
          <p className="text-muted-foreground">Управление приложением и персонализация</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Профиль</CardTitle>
            <CardDescription>Персональная информация</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={user?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground font-mono">
                User ID: {user?.id}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="fullName">Имя</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Введите ваше имя"
              />
            </div>
            <Button onClick={handleSaveProfile} disabled={loading}>
              {loading ? "Сохранение..." : "Сохранить изменения"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Безопасность</CardTitle>
            <CardDescription>Смена пароля</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Новый пароль</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Введите новый пароль"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Подтвердите пароль</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Повторите новый пароль"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={loading || !newPassword || !confirmPassword}
            >
              {loading ? "Изменение..." : "Изменить пароль"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Валюта</CardTitle>
            <CardDescription>Выберите валюту по умолчанию для отображения сумм</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Валюта</Label>
              <Select
                value={currency}
                onValueChange={async (newCurrency) => {
                  await updateCurrency(newCurrency);
                  toast({
                    title: "Валюта изменена",
                    description: `Валюта по умолчанию установлена: ${newCurrency}`,
                  });
                }}
              >
                <SelectTrigger id="currency">
                  <DollarSign className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUB">₽ RUB (Российский рубль)</SelectItem>
                  <SelectItem value="USD">$ USD (Доллар США)</SelectItem>
                  <SelectItem value="EUR">€ EUR (Евро)</SelectItem>
                  <SelectItem value="GBP">£ GBP (Фунт стерлингов)</SelectItem>
                  <SelectItem value="AMD">֏ AMD (Армянский драм)</SelectItem>
                  <SelectItem value="GEL">₾ GEL (Грузинский лари)</SelectItem>
                  <SelectItem value="JPY">¥ JPY (Японская иена)</SelectItem>
                  <SelectItem value="CNY">¥ CNY (Китайский юань)</SelectItem>
                  <SelectItem value="KRW">₩ KRW (Южнокорейская вона)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Валюта будет синхронизирована между всеми устройствами и Telegram ботом
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Тема оформления</CardTitle>
            <CardDescription>Выберите тему интерфейса</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                onClick={() => setTheme("light")}
                className="flex flex-col items-center gap-2 h-auto py-3"
              >
                <Sun className="h-5 w-5" />
                <span className="text-xs">Светлая</span>
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                onClick={() => setTheme("dark")}
                className="flex flex-col items-center gap-2 h-auto py-3"
              >
                <Moon className="h-5 w-5" />
                <span className="text-xs">Темная</span>
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                onClick={() => setTheme("system")}
                className="flex flex-col items-center gap-2 h-auto py-3"
              >
                <Monitor className="h-5 w-5" />
                <span className="text-xs">Системная</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Telegram</CardTitle>
            <CardDescription>Управляйте бюджетом через Telegram бота</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {telegramLinked ? (
              <div className="space-y-4">
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-sm font-medium">✅ Telegram подключен</p>
                  <p className="text-sm text-muted-foreground">@{telegramUsername}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Теперь вы можете использовать команды бота:
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>/expense [сумма] [категория] [описание]</li>
                    <li>/income [сумма] [источник] [описание]</li>
                    <li>/help - помощь</li>
                  </ul>
                </div>
                <Button
                  onClick={handleUnlinkTelegram}
                  disabled={loading}
                  variant="destructive"
                  className="w-full"
                >
                  Отключить Telegram
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <p className="text-sm font-medium">Шаг 1: Настройка бота</p>
                  <Button
                    onClick={handleSetWebhook}
                    disabled={settingWebhook}
                    variant="outline"
                    className="w-full"
                  >
                    {settingWebhook ? "Настройка..." : "Установить webhook"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Нажмите эту кнопку один раз для настройки бота
                  </p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Шаг 2: Связывание аккаунта</p>
                  <p className="text-sm text-muted-foreground">
                    1. Откройте бота <a href="https://t.me/crystalbudget_bot" target="_blank" rel="noopener noreferrer" className="text-primary underline">@crystalbudget_bot</a> в Telegram
                  </p>
                  <p className="text-sm text-muted-foreground">
                    2. Отправьте команду /start
                  </p>
                  <p className="text-sm text-muted-foreground">
                    3. Введите полученный код ниже
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telegramCode">Код авторизации</Label>
                  <Input
                    id="telegramCode"
                    value={telegramAuthCode}
                    onChange={(e) => setTelegramAuthCode(e.target.value)}
                    placeholder="Введите код из Telegram"
                  />
                </div>
                <Button
                  onClick={handleLinkTelegram}
                  disabled={loading || !telegramAuthCode}
                  className="w-full"
                >
                  {loading ? "Подключение..." : "Связать с Telegram"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ZenMoney</CardTitle>
            <CardDescription>Синхронизация данных с ZenMoney</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {zenmoneyLinked ? (
              <div className="space-y-4">
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-sm font-medium">✅ ZenMoney подключен</p>
                  {zenmoneyLastSync && (
                    <p className="text-sm text-muted-foreground">
                      Последняя синхронизация: {new Date(zenmoneyLastSync).toLocaleString('ru-RU')}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Синхронизация позволяет импортировать счета, категории и транзакции из ZenMoney в CrystalBudget.
                  </p>
                </div>
                <Button
                  onClick={handleSyncZenMoney}
                  disabled={zenmoneySyncing || loading}
                  className="w-full"
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${zenmoneySyncing ? 'animate-spin' : ''}`} />
                  {zenmoneySyncing ? "Синхронизация..." : "Синхронизировать"}
                </Button>
                <Button
                  onClick={handleUnlinkZenMoney}
                  disabled={loading}
                  variant="destructive"
                  className="w-full"
                >
                  Отключить ZenMoney
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Подключите ZenMoney для автоматической синхронизации ваших финансовых данных.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Импорт счетов и балансов</li>
                    <li>Импорт категорий расходов</li>
                    <li>Импорт транзакций</li>
                  </ul>
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => setZenmoneyManualMode(false)}
                    variant={!zenmoneyManualMode ? "default" : "outline"}
                    className="flex-1"
                  >
                    OAuth
                  </Button>
                  <Button
                    onClick={() => setZenmoneyManualMode(true)}
                    variant={zenmoneyManualMode ? "default" : "outline"}
                    className="flex-1"
                  >
                    Zero App API
                  </Button>
                </div>

                {!zenmoneyManualMode ? (
                  <Button
                    onClick={handleConnectZenMoney}
                    disabled={loading}
                    className="w-full"
                  >
                    <Link2 className="mr-2 h-4 w-4" />
                    {loading ? "Подключение..." : "Подключить через OAuth"}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="zenmoneyAccessToken">Access Token *</Label>
                      <div className="flex gap-2">
                        <Input
                          id="zenmoneyAccessToken"
                          type="password"
                          value={zenmoneyAccessToken}
                          onChange={(e) => setZenmoneyAccessToken(e.target.value)}
                          placeholder="Введите Access Token из Zero App"
                          className="flex-1"
                        />
                        <Button
                          onClick={handleRequestZeroAppTokens}
                          disabled={loading}
                          variant="outline"
                          type="button"
                        >
                          Запросить API
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Получите токен через Zero App API или введите вручную
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zenmoneyRefreshToken">Refresh Token (опционально)</Label>
                      <Input
                        id="zenmoneyRefreshToken"
                        type="password"
                        value={zenmoneyRefreshToken}
                        onChange={(e) => setZenmoneyRefreshToken(e.target.value)}
                        placeholder="Введите Refresh Token"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zenmoneyExpiresIn">Expires In (секунды, опционально)</Label>
                      <Input
                        id="zenmoneyExpiresIn"
                        type="number"
                        value={zenmoneyExpiresIn}
                        onChange={(e) => setZenmoneyExpiresIn(e.target.value)}
                        placeholder="Время жизни токена в секундах"
                      />
                    </div>
                    <Button
                      onClick={handleSaveZenMoneyTokens}
                      disabled={loading || !zenmoneyAccessToken}
                      className="w-full"
                    >
                      {loading ? "Сохранение..." : "Сохранить токены"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {zenmoneyLinked && zenmoneyCategories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Сопоставление категорий ZenMoney</CardTitle>
              <CardDescription>Сопоставьте категории из ZenMoney с категориями CrystalBudget</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                onClick={handleAIMapCategories}
                disabled={aiMapping || loading}
                variant="outline"
                className="w-full"
              >
                <Sparkles className={`mr-2 h-4 w-4 ${aiMapping ? 'animate-pulse' : ''}`} />
                {aiMapping ? "Сопоставляю через ИИ..." : "Автоматически сопоставить через ИИ"}
              </Button>
              <div className="space-y-3">
                {zenmoneyCategories.map((zmCategory) => {
                  const currentMapping = categoryMappings[zmCategory.zenmoney_id || ''];
                  const isMapped = currentMapping === zmCategory.id;
                  
                  return (
                    <div key={zmCategory.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium">{zmCategory.name}</p>
                        <p className="text-sm text-muted-foreground">Категория из ZenMoney</p>
                      </div>
                      <Select
                        value={currentMapping || ''}
                        onValueChange={(value) => {
                          if (zmCategory.zenmoney_id) {
                            handleMapCategory(zmCategory.zenmoney_id, value);
                          }
                        }}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Выберите категорию" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={zmCategory.id}>
                            {isMapped ? `✓ ${zmCategory.name}` : zmCategory.name}
                          </SelectItem>
                          {allCategories
                            .filter(cat => cat.id !== zmCategory.id)
                            .map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Используйте ИИ для автоматического сопоставления или выберите вручную. Сопоставленные категории позволят транзакциям из ZenMoney автоматически попадать в правильные категории CrystalBudget.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Семья</CardTitle>
            <CardDescription>Управление доступом к финансам семьи</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!family && (
              <div className="space-y-4">
                <div>
                  <Button onClick={handleCreateFamily} disabled={loading} className="w-full">
                    <Users className="mr-2 h-4 w-4" />
                    Создать семью
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">
                    Создайте семью, чтобы делиться доступом к финансам
                  </p>
                </div>
              </div>
            )}

            {!family && (
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    или
                  </span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="joinCode">Присоединиться к семье</Label>
              <div className="flex gap-2">
                <Input
                  id="joinCode"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="Введите код приглашения"
                  maxLength={8}
                />
                <Button onClick={handleJoinFamily} disabled={loading || !joinCode}>
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Введите код от владельца семьи
              </p>
            </div>

            {family && (
              <div className="space-y-4">
                {family.owner_id === user?.id ? (
                  <div className="space-y-2">
                    <Label htmlFor="familyName">Название семьи</Label>
                    <div className="flex gap-2">
                      <Input
                        id="familyName"
                        value={familyName}
                        onChange={(e) => setFamilyName(e.target.value)}
                        placeholder="Название семьи"
                      />
                      <Button
                        onClick={handleUpdateFamilyName}
                        disabled={loading || familyName === family.name}
                      >
                        Сохранить
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium">Название семьи</p>
                    <p className="text-sm text-muted-foreground">{family.name}</p>
                  </div>
                )}

                {family.owner_id === user?.id && (
                  <div className="space-y-3">
                    <Label>Код приглашения</Label>

                    {activeCodes.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex gap-2 items-center p-3 border rounded-lg bg-muted/30">
                          <Input
                            value={activeCodes[0].code}
                            readOnly
                            className="flex-1 font-mono text-lg text-center"
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(activeCodes[0].code);
                              toast({ title: "Код скопирован" });
                            }}
                            variant="outline"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button
                          onClick={handleGenerateCode}
                          disabled={loading}
                          variant="outline"
                          className="w-full"
                        >
                          Сгенерировать новый код
                        </Button>
                      </div>
                    ) : (
                      <Button
                        onClick={handleGenerateCode}
                        disabled={loading}
                        className="w-full"
                      >
                        Сгенерировать код
                      </Button>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Код действителен 5 минут и может быть использован один раз
                    </p>
                  </div>
                )}

                {family.owner_id !== user?.id && (
                  <div className="space-y-2">
                    <div className="p-3 border rounded-lg bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        Вы являетесь членом этой семьи
                      </p>
                    </div>
                    <Button
                      onClick={handleLeaveFamily}
                      disabled={loading}
                      variant="destructive"
                      className="w-full"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Покинуть семью
                    </Button>
                  </div>
                )}

                {familyMembers.length > 0 && (
                  <div className="space-y-2">
                    <Label>Члены семьи ({familyMembers.length})</Label>
                    <div className="space-y-2">
                      {familyMembers.map((member) => (
                        <div
                          key={member.user_id}
                          className="text-sm p-3 border rounded-lg flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">
                                {member.full_name.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">{member.full_name}</p>
                              {member.is_owner && (
                                <p className="text-xs text-muted-foreground">Владелец</p>
                              )}
                              {member.joined_at && (
                                <p className="text-xs text-muted-foreground">
                                  Присоединился {new Date(member.joined_at).toLocaleDateString('ru-RU')}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {member.user_id === user?.id && (
                              <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                                Вы
                              </span>
                            )}
                            {family.owner_id === user?.id && !member.is_owner && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveMember(member.user_id)}
                                disabled={loading}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Аккаунт</CardTitle>
            <CardDescription>Управление вашим аккаунтом</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleLogout} variant="outline" className="w-full">
              <LogOut className="mr-2 h-4 w-4" />
              Выйти из аккаунта
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Данные</CardTitle>
            <CardDescription>Управление вашими данными</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={handleExportData}
                disabled={loading}
              >
                {loading ? "Экспортирую..." : "Экспортировать данные"}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={loading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {loading ? "Импортирую..." : "Импортировать данные"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportData}
                disabled={loading}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Импорт заменит все существующие данные. Используйте файл, экспортированный из CrystalBudget.
            </p>
            
            {zenmoneyLinked && (
              <div className="space-y-2 pt-2 border-t">
                <p className="text-sm font-medium">Очистка данных ZenMoney</p>
                <p className="text-xs text-muted-foreground">
                  Если у вас проблемы с синхронизацией или хотите начать заново:
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleClearZenMoneyData}
                  disabled={loading}
                >
                  {loading ? "Очищаю..." : "Очистить транзакции из ZenMoney"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Удалит только транзакции из ZenMoney. Категории и источники дохода останутся. После этого выполните синхронизацию заново.
                </p>
              </div>
            )}

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium">Очистка текущего месяца</p>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleClearCurrentMonth}
                disabled={loading}
              >
                {loading ? "Очищаю..." : "Очистить текущий месяц"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Удалит все транзакции за текущий месяц. Полезно, если хотите начать месяц заново.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-destructive">Полная очистка</p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleClearData}
                disabled={loading}
              >
                {loading ? "Очищаю..." : "Очистить все данные"}
              </Button>
              <p className="text-xs text-muted-foreground">
                ⚠️ Удалит ВСЕ данные: транзакции, категории, источники дохода. Действие необратимо!
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
