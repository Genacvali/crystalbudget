import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Subscription, SubscriptionPlan } from "@/types/budget";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { Crown, Sparkles, Check } from "lucide-react";

const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    type: 'monthly',
    name: 'Месяц',
    price: 99,
    duration: '1 месяц',
    description: 'Идеально для начала'
  },
  {
    type: 'quarterly',
    name: '3 месяца',
    price: 256,
    duration: '3 месяца',
    description: 'Выгода 13%'
  },
  {
    type: 'yearly',
    name: 'Год',
    price: 1200,
    duration: '12 месяцев',
    description: 'Выгода 33%'
  }
];

export function SubscriptionManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSubscription();
    }
  }, [user]);

  const loadSubscription = async () => {
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', user?.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (error) throw error;
      setSubscription(data);
    } catch (error: any) {
      console.error('Error loading subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (plan: SubscriptionPlan) => {
    if (!user) return;

    try {
      const now = new Date();
      let expiresAt = new Date();

      switch (plan.type) {
        case 'monthly':
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          break;
        case 'quarterly':
          expiresAt.setMonth(expiresAt.getMonth() + 3);
          break;
        case 'yearly':
          expiresAt.setFullYear(expiresAt.getFullYear() + 1);
          break;
      }

      const { error } = await supabase.from('subscriptions').insert({
        user_id: user.id,
        plan_type: plan.type,
        status: 'active',
        started_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        amount: plan.price
      });

      if (error) throw error;

      toast({
        title: "Подписка оформлена!",
        description: `Вы подписались на план "${plan.name}"`
      });

      loadSubscription();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Загрузка...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const isTrial = subscription?.plan_type === 'trial';
  const isActive = subscription && new Date(subscription.expires_at) > new Date();

  return (
    <div className="space-y-6">
      {subscription && isActive && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {isTrial ? (
                    <>
                      <Sparkles className="h-5 w-5 text-yellow-500" />
                      Пробный период
                    </>
                  ) : (
                    <>
                      <Crown className="h-5 w-5 text-amber-500" />
                      Активная подписка
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  {isTrial
                    ? 'Доступны все премиум функции'
                    : `План: ${SUBSCRIPTION_PLANS.find(p => p.type === subscription.plan_type)?.name}`}
                </CardDescription>
              </div>
              <Badge variant={isTrial ? "secondary" : "default"}>
                {isTrial ? 'Trial' : 'Premium'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {isTrial ? 'Истекает' : 'Активна до'}:{' '}
              <span className="font-medium text-foreground">
                {format(new Date(subscription.expires_at), 'd MMMM yyyy', { locale: ru })}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {(!subscription || isTrial) && (
        <div>
          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-2">Премиум подписка</h3>
            <p className="text-sm text-muted-foreground">
              Получите доступ к сканированию чеков и распознаванию голосовых сообщений
            </p>
          </div>

          {isTrial && (
            <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg border border-yellow-200 dark:border-yellow-900">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                💡 У вас активен пробный период на 5 дней. Оформите подписку, чтобы продолжить пользоваться премиум функциями после его окончания.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SUBSCRIPTION_PLANS.map((plan) => (
              <Card key={plan.type} className="relative">
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-3xl font-bold">{plan.price} ₽</div>
                    <div className="text-sm text-muted-foreground">{plan.duration}</div>
                  </div>

                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Сканирование чеков</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Голосовые сообщения</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Неограниченное использование</span>
                    </li>
                  </ul>

                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(plan)}
                    variant={plan.type === 'yearly' ? 'default' : 'outline'}
                  >
                    Оформить
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
