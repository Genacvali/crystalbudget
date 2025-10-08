import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, PieChart, BarChart2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { ru } from "date-fns/locale";
import { useCurrency } from "@/hooks/useCurrency";

const Reports = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);
  const { formatAmount } = useCurrency();

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);

    const { data: incomesData } = await supabase
      .from("incomes")
      .select("amount")
      .gte("date", monthStart.toISOString())
      .lte("date", monthEnd.toISOString());

    const { data: expensesData } = await supabase
      .from("expenses")
      .select("amount")
      .gte("date", monthStart.toISOString())
      .lte("date", monthEnd.toISOString());

    const income = incomesData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
    const expenses = expensesData?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;

    setTotalIncome(income);
    setTotalExpenses(expenses);
    setLoading(false);
  };

  const savings = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
  const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
  const avgDailyExpense = totalExpenses / daysInMonth;

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
                <p className="text-2xl font-bold text-success">
                  {loading ? "—" : formatAmount(totalIncome)}
                </p>
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
                <p className="text-2xl font-bold text-destructive">
                  {loading ? "—" : formatAmount(totalExpenses)}
                </p>
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
                <p className="text-2xl font-bold">
                  {loading ? "—" : formatAmount(avgDailyExpense)}
                </p>
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
                <PieChart className="h-5 w-5 text-accent" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {loading ? "—" : formatAmount(savings)} накоплено
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Распределение по категориям</CardTitle>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            <p className="text-muted-foreground">Графики будут добавлены позже</p>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Reports;
