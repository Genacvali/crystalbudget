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
import { LogOut, Moon, Sun, Monitor, Users, Copy, UserPlus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const [currency, setCurrency] = useState(localStorage.getItem("currency") || "RUB");
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

  useEffect(() => {
    if (user) {
      loadProfile();
      loadFamily();
      loadTelegramConnection();
    }
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

    const allMembers: any[] = [];

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

  const handleCurrencyChange = (value: string) => {
    setCurrency(value);
    localStorage.setItem("currency", value);
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new Event("currencyChange"));
    toast({
      title: "Валюта изменена",
      description: `Основная валюта: ${value}`,
    });
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
      // Fetch all user data
      const incomeSourcesRes = await supabase.from("income_sources").select("*").eq("user_id", user.id);
      const categoriesRes = await supabase.from("categories").select("*").eq("user_id", user.id);
      const incomesRes = await supabase.from("incomes").select("*").eq("user_id", user.id);
      const expensesRes = await supabase.from("expenses").select("*").eq("user_id", user.id);

      const incomeSources = incomeSourcesRes.data;
      const categories = categoriesRes.data;
      const incomes = incomesRes.data;
      const expenses = expensesRes.data;

      const exportData = {
        exportDate: new Date().toISOString(),
        incomeSources: incomeSources || [],
        categories: categories || [],
        incomes: incomes || [],
        expenses: expenses || []
      };

      // Create and download JSON file
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `crystal-budget-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Данные экспортированы",
        description: "Файл сохранен в папку загрузок",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка экспорта",
        description: error.message,
      });
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
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка очистки",
        description: error.message,
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
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Ошибка установки webhook",
        description: error.message,
      });
    }
    setSettingWebhook(false);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        variant: "destructive",
        title: "Ошибка выхода",
        description: error.message,
      });
    } else {
      toast({
        title: "Вы вышли из системы",
        description: "До встречи!",
      });
      navigate("/auth");
    }
  };

  return (
    <Layout selectedDate={new Date()} onDateChange={() => {}} showMonthSelector={false}>
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
              <Input id="email" value={user?.email || ""} disabled />
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
            <CardTitle>Валюта</CardTitle>
            <CardDescription>Настройка отображения валюты</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currency">Основная валюта</Label>
              <Select value={currency} onValueChange={handleCurrencyChange}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RUB">RUB (₽)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="GBP">GBP (£)</SelectItem>
                  <SelectItem value="JPY">JPY (¥)</SelectItem>
                  <SelectItem value="CNY">CNY (¥)</SelectItem>
                  <SelectItem value="KRW">KRW (₩)</SelectItem>
                  <SelectItem value="GEL">GEL (₾)</SelectItem>
                  <SelectItem value="AMD">AMD (֏)</SelectItem>
                </SelectContent>
              </Select>
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
            <Button
              variant="outline"
              className="w-full"
              onClick={handleExportData}
              disabled={loading}
            >
              {loading ? "Экспортирую..." : "Экспортировать данные"}
            </Button>
            <Button
              variant="destructive"
              className="w-full"
              onClick={handleClearData}
              disabled={loading}
            >
              {loading ? "Очищаю..." : "Очистить все данные"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Settings;
