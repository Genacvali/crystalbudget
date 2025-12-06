import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import crystalIcon from "@/assets/crystal-icon.png";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
const emailSchema = z.string().email("Неверный формат email");
const passwordSchema = z.string().min(6, "Пароль должен содержать минимум 6 символов");
const Auth = () => {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const [loading, setLoading] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [updatePasswordMode, setUpdatePasswordMode] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const { isInTelegram, initData, user: telegramUser } = useTelegramWebApp();
  const [isTelegramAuthenticating, setIsTelegramAuthenticating] = useState(false);

  // Auto-login via Telegram WebApp
  useEffect(() => {
    if (isInTelegram && initData && !isTelegramAuthenticating) {
      setIsTelegramAuthenticating(true);
      handleTelegramWebAppAuth(initData);
    }
  }, [isInTelegram, initData]);

  const handleTelegramWebAppAuth = async (initData: string) => {
    try {
      console.log('Authenticating via Telegram WebApp...');
      
      const { data, error } = await supabase.functions.invoke('telegram-webapp-auth', {
        body: { initData }
      });

      if (error) {
        console.error('Telegram WebApp auth error:', error);
        throw error;
      }

      if (data?.error) {
        console.error('Telegram WebApp auth error from function:', data.error);
        throw new Error(data.error);
      }

      if (data?.magic_link) {
        // Redirect to magic link for authentication
        window.location.href = data.magic_link;
      } else {
        throw new Error('Не получена ссылка для авторизации');
      }
    } catch (error) {
      console.error('Telegram WebApp auth error:', error);
      setIsTelegramAuthenticating(false);
      const errorMessage = error instanceof Error ? error.message : 'Не удалось войти через Telegram';
      toast({
        title: "Ошибка авторизации",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    // Check if user is coming from password reset link
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const type = hashParams.get('type');
    if (type === 'recovery') {
      setUpdatePasswordMode(true);
      return;
    }
    
    // Check if user is coming from Telegram auth
    const telegramToken = hashParams.get('telegram_token');
    if (telegramToken) {
      handleTelegramAuth(telegramToken);
      return;
    }
    
    supabase.auth.getSession().then(({
      data: {
        session
      }
    }) => {
      if (session && !updatePasswordMode) {
        navigate("/");
      }
    });
  }, [navigate, updatePasswordMode]);
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }
    setLoading(true);
    const {
      error
    } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword
    });
    if (error) {
      toast({
        title: "Ошибка входа",
        description: error.message === "Invalid login credentials" ? "Неверный email или пароль" : error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Успешный вход",
        description: "Добро пожаловать!"
      });
      navigate("/");
    }
    setLoading(false);
  };
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPassword);
      z.string().min(1, "Имя обязательно").parse(signupName);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }
    setLoading(true);
    const redirectUrl = `${window.location.origin}/`;
    const {
      error
    } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: signupName
        }
      }
    });
    if (error) {
      toast({
        title: "Ошибка регистрации",
        description: error.message === "User already registered" ? "Пользователь с таким email уже зарегистрирован" : error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Регистрация успешна",
        description: "Проверьте вашу почту и подтвердите аккаунт для входа в приложение. Письмо с подтверждением было отправлено на " + signupEmail,
        duration: 10000
      });
      // Очищаем поля формы
      setSignupEmail("");
      setSignupPassword("");
      setSignupName("");
      // Переключаем на вкладку входа
      setActiveTab("login");
    }
    setLoading(false);
  };
  const handleTelegramAuth = async (telegramUser: any) => {
    setLoading(true);
    try {
      // Call Supabase Edge Function to verify and authenticate
      const { data, error } = await supabase.functions.invoke('telegram-auth', {
        body: { telegramUser }
      });

      if (error) throw error;

      if (data?.magic_link) {
        // Redirect to magic link for automatic login
        toast({
          title: "Авторизация...",
          description: "Выполняется вход через Telegram"
        });
        
        // Redirect to magic link - it will authenticate and redirect back
        window.location.href = data.magic_link;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ошибка авторизации через Telegram';
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive"
      });
      setLoading(false);
    }
    // Don't set loading to false on success - we're redirecting
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(resetEmail);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }
    setLoading(true);
    const {
      error
    } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth`
    });
    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Письмо отправлено",
        description: "Проверьте вашу почту для восстановления пароля"
      });
      setResetMode(false);
    }
    setLoading(false);
  };
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({
        title: "Ошибка",
        description: "Пароли не совпадают",
        variant: "destructive"
      });
      return;
    }
    try {
      passwordSchema.parse(newPassword);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }
    setLoading(true);
    const {
      error
    } = await supabase.auth.updateUser({
      password: newPassword
    });
    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Пароль обновлен",
        description: "Ваш пароль успешно изменен"
      });
      setUpdatePasswordMode(false);
      navigate("/");
    }
    setLoading(false);
  };
  if (updatePasswordMode) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Создать новый пароль</CardTitle>
            <CardDescription>
              Введите новый пароль для вашего аккаунта
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleUpdatePassword}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Новый пароль</Label>
                <Input id="new-password" type="password" placeholder="••••••" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Подтвердите пароль</Label>
                <Input id="confirm-password" type="password" placeholder="••••••" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Обновить пароль
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>;
  }
  
  // Show loader when authenticating via Telegram WebApp
  if (isTelegramAuthenticating) {
    return <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
      <p className="text-lg font-medium">Вход через Telegram...</p>
      <p className="text-sm text-muted-foreground mt-2">Подождите немного</p>
    </div>;
  }
  
  if (resetMode) {
    return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Восстановление пароля</CardTitle>
            <CardDescription>
              Введите ваш email для получения ссылки восстановления
            </CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordReset}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" placeholder="your@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-2">
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Отправить ссылку
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setResetMode(false)}>
                Назад ко входу
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>;
  }
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-secondary/20 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <img src={crystalIcon} alt="CrystalBudget" className="w-20 h-20" />
          </div>
          <CardTitle className="text-2xl font-bold">CrystalBudget</CardTitle>
          
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Вход</TabsTrigger>
              <TabsTrigger value="signup">Регистрация</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="your@email.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Пароль</Label>
                  <Input id="login-password" type="password" placeholder="••••••" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Войти
                </Button>
                
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Или
                    </span>
                  </div>
                </div>
                
                {!isInTelegram && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
                  <div className="p-3 mb-4 rounded-lg bg-muted/50 border border-muted">
                    <p className="text-sm text-muted-foreground text-center">
                      💡 На мобильных устройствах откройте приложение через Telegram бота для автоматического входа
                    </p>
                  </div>
                )}
                
                <TelegramLoginButton
                  botName="CrystalBudget_bot"
                  onAuth={handleTelegramAuth}
                  buttonSize="large"
                  cornerRadius={8}
                />
                
                <Button type="button" variant="link" className="w-full" onClick={() => setResetMode(true)}>
                  Забыли пароль?
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Имя</Label>
                  <Input id="signup-name" type="text" placeholder="Иван Иванов" value={signupName} onChange={e => setSignupName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" placeholder="your@email.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Пароль</Label>
                  <Input id="signup-password" type="password" placeholder="••••••" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Зарегистрироваться
                </Button>
                
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Или
                    </span>
                  </div>
                </div>
                
                {!isInTelegram && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
                  <div className="p-3 mb-4 rounded-lg bg-muted/50 border border-muted">
                    <p className="text-sm text-muted-foreground text-center">
                      💡 На мобильных устройствах откройте приложение через Telegram бота для автоматического входа
                    </p>
                  </div>
                )}
                
                <TelegramLoginButton
                  botName="CrystalBudget_bot"
                  onAuth={handleTelegramAuth}
                  buttonSize="large"
                  cornerRadius={8}
                />
              </form>
            </TabsContent>
            
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Имя</Label>
                  <Input id="signup-name" type="text" placeholder="Иван Иванов" value={signupName} onChange={e => setSignupName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input id="signup-email" type="email" placeholder="your@email.com" value={signupEmail} onChange={e => setSignupEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Пароль</Label>
                  <Input id="signup-password" type="password" placeholder="••••••" value={signupPassword} onChange={e => setSignupPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Зарегистрироваться
                </Button>
                
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Или
                    </span>
                  </div>
                </div>
                
                {!isInTelegram && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
                  <div className="p-3 mb-4 rounded-lg bg-muted/50 border border-muted">
                    <p className="text-sm text-muted-foreground text-center">
                      💡 На мобильных устройствах откройте приложение через Telegram бота для автоматического входа
                    </p>
                  </div>
                )}
                
                <TelegramLoginButton
                  botName="CrystalBudget_bot"
                  onAuth={handleTelegramAuth}
                  buttonSize="large"
                  cornerRadius={8}
                />
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
};
export default Auth;