import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, PieChart as PieChartIcon, BarChart2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useCurrency } from "@/hooks/useCurrency";
import { useAuth } from "@/hooks/useAuth";
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  LineChart,
  Line
} from "recharts";

interface CategoryExpense {
  name: string;
  value: number;
  color: string;
}

interface DailyExpense {
  date: string;
  amount: number;
}

const Reports = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const saved = localStorage.getItem('selectedDate');
    if (saved) {
      try {
        return new Date(saved);
      } catch {
        return new Date();
      }
    }
    return new Date();
  });
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [incomeByCurrency, setIncomeByCurrency] = useState<Record<string, number>>({});
  const [expensesByCurrency, setExpensesByCurrency] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [categoryExpenses, setCategoryExpenses] = useState<CategoryExpense[]>([]);
  const [dailyExpenses, setDailyExpenses] = useState<DailyExpense[]>([]);
  const { formatAmount, currency: userCurrency } = useCurrency();
  const { user } = useAuth();

  // Сохраняем выбранную дату в localStorage
  useEffect(() => {
    localStorage.setItem('selectedDate', selectedDate.toISOString());
  }, [selectedDate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, user]);

  const loadData = async () => {
    if (!user) return;
    
    setLoading(true);
    
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    console.log('Loading data for period:', monthStart, 'to', monthEnd);

    // Get family members to include their transactions
    let familyUserIds = [user.id];

    // Check if user is a family owner
    const { data: ownedFamily } = await supabase
      .from('families')
      .select('id')
      .eq('owner_id', user.id)
      .maybeSingle();

    let familyId: string | null = null;

    if (ownedFamily?.id) {
      familyId = ownedFamily.id;
    } else {
      // Check if user is a family member
      const { data: membership } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membership?.family_id) {
        familyId = membership.family_id;
      }
    }

    // Store effectiveUserId and familyData for reuse
    let effectiveUserId = user.id;
    let familyOwnerId: string | null = null;

    if (familyId) {
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

      // Include owner and all members
      if (familyData?.owner_id) {
        familyOwnerId = familyData.owner_id;
        effectiveUserId = familyOwnerId; // Use owner's ID for categories
        familyUserIds = [familyOwnerId];
        if (members && members.length > 0) {
          familyUserIds = [familyOwnerId, ...members.map(m => m.user_id)];
        }
      }
    }

    // Загрузка доходов (family scope) - включая валюту
    const { data: incomesData, error: incomesError } = await supabase
      .from("incomes")
      .select("amount, currency")
      .in("user_id", familyUserIds)
      .gte("date", monthStart.toISOString())
      .lte("date", monthEnd.toISOString());

    if (incomesError) {
      console.error('Error loading incomes:', incomesError);
    }
    console.log('Incomes data:', incomesData);

    // Загрузка расходов (family scope) - включая валюту
    const { data: expensesData, error: expensesError } = await supabase
      .from("expenses")
      .select("amount, date, category_id, currency")
      .in("user_id", familyUserIds)
      .gte("date", monthStart.toISOString())
      .lte("date", monthEnd.toISOString());

    if (expensesError) {
      console.error('Error loading expenses:', expensesError);
    }
    console.log('Expenses data:', expensesData);

    // Загрузка категорий (effective user scope - already determined above)
    const { data: categoriesData } = await supabase
      .from("categories")
      .select("id, name, icon")
      .eq("user_id", effectiveUserId);
    
    console.log('Categories data:', categoriesData);

    // Группировка по валютам
    const incomeByCurrency: Record<string, number> = {};
    const expensesByCurrency: Record<string, number> = {};
    
    (incomesData || []).forEach((income) => {
      const currency = (income as any).currency || userCurrency || 'RUB';
      incomeByCurrency[currency] = (incomeByCurrency[currency] || 0) + Number(income.amount);
    });
    
    (expensesData || []).forEach((expense) => {
      const currency = (expense as any).currency || userCurrency || 'RUB';
      expensesByCurrency[currency] = (expensesByCurrency[currency] || 0) + Number(expense.amount);
    });

    // Для обратной совместимости - сумма всех валют
    const income = Object.values(incomeByCurrency).reduce((sum, val) => sum + val, 0);
    const expenses = Object.values(expensesByCurrency).reduce((sum, val) => sum + val, 0);

    setTotalIncome(income);
    setTotalExpenses(expenses);
    setIncomeByCurrency(incomeByCurrency);
    setExpensesByCurrency(expensesByCurrency);

    // Группировка расходов по категориям для круговой диаграммы (группируем по валюте тоже)
    const categoryMap = new Map<string, { name: string; value: number; icon: string; currency: string }>();
    
    if (expensesData && expensesData.length > 0 && categoriesData) {
      expensesData.forEach((expense) => {
        const category = categoriesData.find((cat) => cat.id === expense.category_id);
        const categoryName = category?.name || "Без категории";
        const categoryIcon = category?.icon || "📦";
        const expenseCurrency = (expense as any).currency || userCurrency || 'RUB';
        const key = `${categoryName}_${expenseCurrency}`;
        const existing = categoryMap.get(key);
        if (existing) {
          existing.value += Number(expense.amount);
        } else {
          categoryMap.set(key, {
            name: `${categoryName} (${expenseCurrency})`,
            value: Number(expense.amount),
            icon: categoryIcon,
            currency: expenseCurrency
          });
        }
      });
    }

    const COLORS = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#06b6d4', '#84cc16'];
    const categoryData = Array.from(categoryMap.values())
      .sort((a, b) => b.value - a.value)
      .map((item, index) => ({
        name: item.name,
        value: item.value,
        color: COLORS[index % COLORS.length],
        currency: item.currency
      }));

    console.log('Category data for charts:', categoryData);
    setCategoryExpenses(categoryData);

    // Группировка расходов по дням для линейного графика (по валютам)
    const dailyMap = new Map<string, { amount: number; currency: string }>();
    
    if (expensesData && expensesData.length > 0) {
      expensesData.forEach((expense) => {
        const day = format(new Date(expense.date), 'dd.MM');
        const expenseCurrency = (expense as any).currency || userCurrency || 'RUB';
        const key = `${day}_${expenseCurrency}`;
        const existing = dailyMap.get(key);
        if (existing) {
          dailyMap.set(key, { amount: existing.amount + Number(expense.amount), currency: expenseCurrency });
        } else {
          dailyMap.set(key, { amount: Number(expense.amount), currency: expenseCurrency });
        }
      });
    }

    const dailyData = Array.from(dailyMap.entries())
      .map(([key, data]) => {
        const [date] = key.split('_');
        return { date, amount: data.amount, currency: data.currency };
      })
      .sort((a, b) => {
        const [dayA, monthA] = a.date.split('.').map(Number);
        const [dayB, monthB] = b.date.split('.').map(Number);
        return monthA === monthB ? dayA - dayB : monthA - monthB;
      });

    console.log('Daily data for charts:', dailyData);
    setDailyExpenses(dailyData);
    setLoading(false);
  };

  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const avgDailyExpense = totalExpenses / daysInMonth;

  // Функция для форматирования суммы с валютой
  const formatAmountWithCurrency = (amount: number, currency: string) => {
    const currencySymbols: Record<string, string> = {
      RUB: '₽', USD: '$', EUR: '€', GBP: '£',
      JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
    };
    const symbol = currencySymbols[currency] || currency;
    return `${Math.round(amount).toLocaleString('ru-RU')} ${symbol}`;
  };

  // Получаем все валюты из доходов и расходов
  const allCurrencies = new Set([
    ...Object.keys(incomeByCurrency),
    ...Object.keys(expensesByCurrency)
  ]);

  return (
    <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Отчёты</h1>
          <p className="text-muted-foreground">Анализ и статистика ваших финансов</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Доходы за месяц
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {loading ? (
                    <p className="text-2xl font-bold text-success">—</p>
                  ) : allCurrencies.size > 1 ? (
                    <div className="space-y-1">
                      {Array.from(allCurrencies).map(currency => {
                        const amount = incomeByCurrency[currency] || 0;
                        if (amount === 0) return null;
                        return (
                          <p key={currency} className="text-xl font-bold text-success">
                            {formatAmountWithCurrency(amount, currency)}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-success">
                      {formatAmountWithCurrency(totalIncome, Array.from(allCurrencies)[0] || userCurrency || 'RUB')}
                    </p>
                  )}
                </div>
                <TrendingUp className="h-5 w-5 text-success" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Все доходы за месяц
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Расходы за месяц
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {loading ? (
                    <p className="text-2xl font-bold text-destructive">—</p>
                  ) : allCurrencies.size > 1 ? (
                    <div className="space-y-1">
                      {Array.from(allCurrencies).map(currency => {
                        const amount = expensesByCurrency[currency] || 0;
                        if (amount === 0) return null;
                        return (
                          <p key={currency} className="text-xl font-bold text-destructive">
                            {formatAmountWithCurrency(amount, currency)}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-2xl font-bold text-destructive">
                      {formatAmountWithCurrency(totalExpenses, Array.from(allCurrencies)[0] || userCurrency || 'RUB')}
                    </p>
                  )}
                </div>
                <TrendingDown className="h-5 w-5 text-destructive" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Все расходы за месяц
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Средний расход в день
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  {loading ? (
                    <p className="text-2xl font-bold">—</p>
                  ) : allCurrencies.size > 1 ? (
                    <div className="space-y-1">
                      {Array.from(allCurrencies).map(currency => {
                        const amount = (expensesByCurrency[currency] || 0) / daysInMonth;
                        if (amount === 0) return null;
                        return (
                          <p key={currency} className="text-xl font-bold">
                            {formatAmountWithCurrency(amount, currency)}
                          </p>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-2xl font-bold">
                      {formatAmountWithCurrency(avgDailyExpense, Array.from(allCurrencies)[0] || userCurrency || 'RUB')}
                    </p>
                  )}
                </div>
                <BarChart2 className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                За {format(selectedDate, "LLLL yyyy", { locale: ru })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Норма сбережений
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <p className="text-2xl font-bold text-accent">
                  {loading ? "—" : Math.round(savingsRate)}%
                </p>
                <PieChartIcon className="h-5 w-5 text-accent" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {loading ? "—" : allCurrencies.size > 1 ? (
                  <div className="space-y-0.5">
                    {Array.from(allCurrencies).map(currency => {
                      const income = incomeByCurrency[currency] || 0;
                      const expense = expensesByCurrency[currency] || 0;
                      const saving = income - expense;
                      if (saving === 0 && income === 0) return null;
                      return (
                        <div key={currency}>
                          {formatAmountWithCurrency(saving, currency)} накоплено
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  `${formatAmountWithCurrency(savings, Array.from(allCurrencies)[0] || userCurrency || 'RUB')} накоплено`
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Графики */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Круговая диаграмма - Расходы по категориям */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                Расходы по категориям
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-muted-foreground">Загрузка...</p>
                </div>
              ) : categoryExpenses.length === 0 ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-muted-foreground">Нет данных за выбранный период</p>
                </div>
              ) : (
                <>
                  {/* Десктоп версия - легенда справа */}
                  <div className="hidden md:block h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryExpenses}
                          cx="35%"
                          cy="50%"
                          labelLine={false}
                          label={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {categoryExpenses.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number, name: string, props: any) => {
                            const currency = props.payload?.currency || userCurrency || 'RUB';
                            return formatAmountWithCurrency(value, currency);
                          }}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Legend 
                          layout="vertical"
                          verticalAlign="middle" 
                          align="right"
                          wrapperStyle={{ fontSize: '12px', paddingLeft: '20px' }}
                          formatter={(value, entry) => {
                            const percent = ((entry.payload.value / categoryExpenses.reduce((sum, cat) => sum + cat.value, 0)) * 100).toFixed(0);
                            return `${value} (${percent}%)`;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Мобильная версия - легенда внизу, показываем только топ-8 */}
                  <div className="block md:hidden">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryExpenses.slice(0, 8)}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {categoryExpenses.slice(0, 8).map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            formatter={(value: number, name: string, props: any) => {
                              const currency = props.payload?.currency || userCurrency || 'RUB';
                              return formatAmountWithCurrency(value, currency);
                            }}
                            contentStyle={{ 
                              backgroundColor: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              borderRadius: '8px'
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      {categoryExpenses.slice(0, 8).map((entry, index) => {
                        const percent = ((entry.value / categoryExpenses.reduce((sum, cat) => sum + cat.value, 0)) * 100).toFixed(0);
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-sm shrink-0" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="truncate">{entry.name} ({percent}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Столбчатая диаграмма - Топ категорий */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart2 className="h-5 w-5 text-primary" />
                Топ категорий по расходам
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-muted-foreground">Загрузка...</p>
                </div>
              ) : categoryExpenses.length === 0 ? (
                <div className="h-80 flex items-center justify-center">
                  <p className="text-muted-foreground">Нет данных за выбранный период</p>
                </div>
              ) : (
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryExpenses.slice(0, 6)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="name" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        formatter={(value: number, name: string, props: any) => {
                          const currency = props.payload?.currency || userCurrency || 'RUB';
                          return formatAmountWithCurrency(value, currency);
                        }}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {categoryExpenses.slice(0, 6).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Линейный график - Расходы по дням */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-primary" />
              Динамика расходов за месяц
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-80 flex items-center justify-center">
                <p className="text-muted-foreground">Загрузка...</p>
              </div>
            ) : dailyExpenses.length === 0 ? (
              <div className="h-80 flex items-center justify-center">
                <p className="text-muted-foreground">Нет данных за выбранный период</p>
              </div>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyExpenses}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      tick={{ fontSize: 12 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      formatter={(value: number, name: string, props: any) => {
                        const currency = props.payload?.currency || userCurrency || 'RUB';
                        return formatAmountWithCurrency(value, currency);
                      }}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      dot={{ fill: '#8b5cf6', r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Reports;
