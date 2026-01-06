import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Link as LinkIcon } from 'lucide-react';
import { ZENMONEY_CONFIG } from '@/config/zenmoney';

const Settings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [zenMoneyConnected, setZenMoneyConnected] = useState(false);
  const [zenMoneyLoading, setZenMoneyLoading] = useState(false);

  useEffect(() => {
    if (user) {
      checkZenMoneyConnection();
      handleZenMoneyCallbackCheck();
    }
  }, [user]);

  const checkZenMoneyConnection = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('zenmoney_connections')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (data) setZenMoneyConnected(true);
    } catch (error) {
      console.error('Error checking ZenMoney connection:', error);
    }
  };

  const handleZenMoneyCallbackCheck = async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code && user) {
      handleZenMoneyCallback(code);
    }
  };

  const handleZenMoneyAuth = () => {
    const redirectUri = 'https://crystalbudget.net';
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: ZENMONEY_CONFIG.CLIENT_KEY,
      redirect_uri: redirectUri
    });
    
    const authUrl = `${ZENMONEY_CONFIG.AUTH_URL}?${params.toString()}`;
    console.log('🚀 Redirecting to ZenMoney Auth:', authUrl);
    window.location.href = authUrl;
  };

  const handleZenMoneyCallback = async (code: string) => {
    setZenMoneyLoading(true);
    try {
      const redirectUri = 'https://crystalbudget.net';
      window.history.replaceState({}, document.title, window.location.pathname);

      const { data, error } = await supabase.functions.invoke('zenmoney-auth', {
        body: { 
          code, 
          userId: user?.id,
          redirectUri
        }
      });

      if (error) throw error;

      toast({
        title: "ZenMoney подключен",
        description: "Ваши транзакции скоро появятся в системе",
      });
      setZenMoneyConnected(true);
    } catch (error) {
      console.error('ZenMoney auth error:', error);
      toast({
        variant: "destructive",
        title: "Ошибка авторизации",
        description: "Не удалось подключить ZenMoney",
      });
    } finally {
      setZenMoneyLoading(false);
    }
  };

  const handleDisconnectZenMoney = async () => {
    if (!user) return;
    setZenMoneyLoading(true);
    try {
      await supabase.from('zenmoney_connections').delete().eq('user_id', user.id);
      setZenMoneyConnected(false);
      toast({
        title: "ZenMoney отключен",
        description: "Синхронизация прекращена",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: "Не удалось отключить ZenMoney",
      });
    } finally {
      setZenMoneyLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-8">
      <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>ZenMoney</CardTitle>
            <CardDescription>Автоматическая синхронизация транзакций из Дзен-мани</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {zenMoneyConnected ? (
              <div className="space-y-4">
                <div className="p-3 border rounded-lg bg-green-500/10 border-green-500/30 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">✅ ZenMoney подключен</p>
                    <p className="text-xs text-muted-foreground">Транзакции синхронизируются автоматически</p>
                  </div>
                  <RefreshCw className="h-4 w-4 text-green-500 animate-spin" />
                </div>
                <Button
                  onClick={handleDisconnectZenMoney}
                  disabled={zenMoneyLoading}
                  variant="destructive"
                  className="w-full"
                >
                  Отключить ZenMoney
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Подключите ZenMoney, чтобы ваши расходы и доходы автоматически попадали в CrystalBudget.
                  </p>
                </div>
                <Button
                  onClick={handleZenMoneyAuth}
                  disabled={zenMoneyLoading}
                  className="w-full"
                >
                  <LinkIcon className="mr-2 h-4 w-4" />
                  {zenMoneyLoading ? "Подключение..." : "Подключить ZenMoney"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;
