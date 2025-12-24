import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpRight, ArrowDownRight, Edit, ArrowUpDown, Trash2, MoreVertical, LayoutGrid, List, Calendar, ChevronDown, ChevronUp, X } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/useNotifications";
import { useCurrency } from "@/hooks/useCurrency";
import { useAuth } from "@/hooks/useAuth";
import { IncomeDialog } from "@/components/IncomeDialog";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Income, Expense, IncomeSource, Category } from "@/types/budget";

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  description?: string;
  sourceId?: string;
  categoryId?: string | null;
  userName?: string;
  currency?: string; // Currency of the transaction
}

const Transactions = () => {
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
  const { toast } = useToast();
  const { formatAmount, currency: userCurrency } = useCurrency();
  const { createNotification } = useNotifications();

  // Format amount with currency symbol (без копеек)
  const formatAmountWithCurrency = (amount: number, currency?: string) => {
    const currencySymbols: Record<string, string> = {
      RUB: '₽', USD: '$', EUR: '€', GBP: '£',
      JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
    };
    const curr = currency || userCurrency || 'RUB';
    const symbol = currencySymbols[curr] || curr;
    return `${Math.round(amount).toLocaleString('ru-RU')} ${symbol}`;
  };
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  // New states for enhanced features
  const [compactView, setCompactView] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [fabOpen, setFabOpen] = useState(false);

  // Сохраняем выбранную дату в localStorage
  useEffect(() => {
    localStorage.setItem('selectedDate', selectedDate.toISOString());
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  useEffect(() => {
    // Сбрасываем фильтр категории при смене типа транзакции
    setFilterCategory("all");
  }, [filterType]);

  const fetchData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();
    const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

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

    // Store effectiveUserId for reuse
    let effectiveUserId = user.id;

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
        effectiveUserId = familyData.owner_id; // Use owner's ID for categories/sources
        familyUserIds = [familyData.owner_id];
        if (members && members.length > 0) {
          familyUserIds = [familyData.owner_id, ...members.map(m => m.user_id)];
        }
      }
    }

    const [incomesRes, expensesRes, sourcesRes, categoriesRes, profilesRes] = await Promise.all([
      supabase.from("incomes").select("*").in("user_id", familyUserIds).gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }),
      supabase.from("expenses").select("*").in("user_id", familyUserIds).gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }),
      supabase.from("income_sources").select("*").eq("user_id", effectiveUserId),
      supabase.from("categories").select("*").eq("user_id", effectiveUserId),
      supabase.from("profiles").select("user_id, full_name").in("user_id", familyUserIds),
    ]);

    setIncomeSources(sourcesRes.data || []);
    setCategories(categoriesRes.data || []);

    // Create a map of user_id to full_name
    const profilesMap: Record<string, string> = {};
    (profilesRes.data || []).forEach((profile) => {
      if (profile.user_id === user.id) {
        // Current user
        profilesMap[profile.user_id] = profile.full_name || "Вы";
      } else {
        // Other family members
        profilesMap[profile.user_id] = profile.full_name || "Пользователь";
      }
    });

    // Add current user if not in profiles
    if (!profilesMap[user.id]) {
      profilesMap[user.id] = "Вы";
    }

    setProfiles(profilesMap);

    const incomeTransactions: Transaction[] = (incomesRes.data || []).map((income) => {
      const source = (sourcesRes.data || []).find((s) => s.id === income.source_id);
      return {
        id: income.id,
        type: "income" as const,
        amount: Number(income.amount),
        category: source?.name || "Доход",
        date: income.date,
        description: income.description,
        sourceId: income.source_id,
        userName: profilesMap[income.user_id] || "Вы",
        currency: (income as any).currency, // Add currency field
      };
    });

    const expenseTransactions: Transaction[] = (expensesRes.data || []).map((expense) => {
      const category = (categoriesRes.data || []).find((c) => c.id === expense.category_id);
      return {
        id: expense.id,
        type: "expense" as const,
        amount: Number(expense.amount),
        category: category?.name || "Расход",
        date: expense.date,
        description: expense.description,
        categoryId: expense.category_id,
        userName: profilesMap[expense.user_id] || "Вы",
        currency: (expense as any).currency, // Add currency field
      };
    });

    // Combine both income and expense transactions
    setTransactions([...incomeTransactions, ...expenseTransactions]);
  };

  const handleAddIncome = async (income: { sourceId: string; amount: number; date: string; description?: string; currency?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingIncome) {
      const { error } = await supabase.from("incomes").update({
        source_id: income.sourceId,
        amount: income.amount,
        date: income.date,
        description: income.description,
        currency: income.currency || userCurrency || 'RUB',
      }).eq("id", editingIncome.id);

      if (error) {
        toast({ title: "Ошибка", description: "Не удалось обновить доход", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Доход обновлен" });
        fetchData();
      }
      setEditingIncome(null);
    } else {
      const { error } = await supabase.from("incomes").insert({
        user_id: user.id,
        source_id: income.sourceId,
        amount: income.amount,
        date: income.date,
        description: income.description,
        currency: income.currency || userCurrency || 'RUB',
      });

      if (error) {
        toast({ title: "Ошибка", description: "Не удалось добавить доход", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Доход добавлен" });

        // Create additional notification for better UX
        try {
          const sourceName = incomeSources.find(s => s.id === income.sourceId)?.name || 'Неизвестный источник';
          await createNotification(
            'income',
            'Доход добавлен',
            `Получен доход ${formatAmount(income.amount)} от источника "${sourceName}"`,
            {
              amount: income.amount,
              sourceId: income.sourceId,
              sourceName
            }
          );
        } catch (notificationError) {
          console.error('Failed to create notification:', notificationError);
          // Don't fail the whole operation if notification fails
        }

        fetchData();
      }
    }
  };

  const handleAddExpense = async (expense: { categoryId: string; amount: number; date: string; description?: string; currency?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingExpense) {
      const { error } = await supabase.from("expenses").update({
        category_id: expense.categoryId,
        amount: expense.amount,
        date: expense.date,
        description: expense.description,
        currency: expense.currency || userCurrency || 'RUB',
      }).eq("id", editingExpense.id);

      if (error) {
        toast({ title: "Ошибка", description: "Не удалось обновить расход", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Расход обновлен" });
        fetchData();
      }
      setEditingExpense(null);
    } else {
      const { error } = await supabase.from("expenses").insert({
        user_id: user.id,
        category_id: expense.categoryId,
        amount: expense.amount,
        date: expense.date,
        description: expense.description,
        currency: expense.currency || userCurrency || 'RUB',
      });

      if (error) {
        toast({ title: "Ошибка", description: "Не удалось добавить расход", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Расход добавлен" });

        // Create additional notification for better UX
        try {
          const categoryName = categories.find(c => c.id === expense.categoryId)?.name || 'Неизвестная категория';
          await createNotification(
            'expense',
            'Расход добавлен',
            `Потрачено ${formatAmount(expense.amount)} на категорию "${categoryName}"`,
            {
              amount: expense.amount,
              categoryId: expense.categoryId,
              categoryName
            }
          );
        } catch (notificationError) {
          console.error('Failed to create notification:', notificationError);
          // Don't fail the whole operation if notification fails
        }

        fetchData();
      }
    }
  };

  const handleEditTransaction = (transaction: Transaction) => {
    if (transaction.type === "income") {
      setEditingIncome({
        id: transaction.id,
        source_id: transaction.sourceId || "",
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
        currency: transaction.currency,
      });
      setIncomeDialogOpen(true);
    } else {
      setEditingExpense({
        id: transaction.id,
        category_id: transaction.categoryId || "",
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
        currency: transaction.currency,
      });
      setExpenseDialogOpen(true);
    }
  };

  const handleDeleteTransaction = async () => {
    if (!deletingTransaction) return;

    const tableName = deletingTransaction.type === "income" ? "incomes" : "expenses";
    const { error } = await supabase
      .from(tableName)
      .delete()
      .eq("id", deletingTransaction.id);

    if (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить транзакцию",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Успешно",
        description: `${deletingTransaction.type === "income" ? "Доход" : "Расход"} удалён`,
      });
      fetchData();
    }

    setDeletingTransaction(null);
  };

  const filteredTransactions = transactions.filter((transaction) => {
    // Фильтр по типу транзакции
    if (filterType !== "all" && transaction.type !== filterType) {
      return false;
    }

    // Фильтр по категории/источнику
    if (filterCategory !== "all") {
      if (transaction.type === "expense" && transaction.categoryId !== filterCategory) {
        return false;
      }
      if (transaction.type === "income" && transaction.sourceId !== filterCategory) {
        return false;
      }
    }

    return true;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    if (sortBy === "date") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    } else {
      return b.amount - a.amount;
    }
  });

  // Группировка транзакций по датам
  interface GroupedTransactions {
    date: string;
    dateLabel: string;
    relativeLabel: string;
    transactions: Transaction[];
    totalIncome: number;
    totalExpense: number;
    netAmount: number;
    // Multi-currency support
    totalsByCurrency?: Record<string, {
      totalIncome: number;
      totalExpense: number;
      netAmount: number;
    }>;
  }

  const groupTransactionsByDate = (transactions: Transaction[]): GroupedTransactions[] => {
    const grouped = new Map<string, Transaction[]>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    transactions.forEach(transaction => {
      const date = new Date(transaction.date);
      const dateKey = format(date, 'yyyy-MM-dd');

      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, []);
      }
      grouped.get(dateKey)!.push(transaction);
    });

    return Array.from(grouped.entries()).map(([dateKey, transactions]) => {
      const date = new Date(dateKey);

      // Group by currency
      const totalsByCurrency: Record<string, {
        totalIncome: number;
        totalExpense: number;
        netAmount: number;
      }> = {};

      transactions.forEach(transaction => {
        const currency = transaction.currency || userCurrency || 'RUB';
        if (!totalsByCurrency[currency]) {
          totalsByCurrency[currency] = { totalIncome: 0, totalExpense: 0, netAmount: 0 };
        }

        if (transaction.type === 'income') {
          totalsByCurrency[currency].totalIncome += transaction.amount;
        } else {
          totalsByCurrency[currency].totalExpense += transaction.amount;
        }
        totalsByCurrency[currency].netAmount = totalsByCurrency[currency].totalIncome - totalsByCurrency[currency].totalExpense;
      });

      // Calculate totals for primary currency (for backward compatibility)
      const primaryCurrency = userCurrency || 'RUB';
      const primaryTotals = totalsByCurrency[primaryCurrency] || { totalIncome: 0, totalExpense: 0, netAmount: 0 };

      // Определяем относительную метку
      let relativeLabel = '';
      const dateWithoutTime = new Date(date);
      dateWithoutTime.setHours(0, 0, 0, 0);

      if (dateWithoutTime.getTime() === today.getTime()) {
        relativeLabel = 'Сегодня';
      } else if (dateWithoutTime.getTime() === yesterday.getTime()) {
        relativeLabel = 'Вчера';
      }

      return {
        date: dateKey,
        dateLabel: format(date, 'd MMMM yyyy', { locale: ru }),
        relativeLabel,
        transactions: transactions.sort((a, b) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
        ),
        totalIncome: primaryTotals.totalIncome,
        totalExpense: primaryTotals.totalExpense,
        netAmount: primaryTotals.netAmount,
        totalsByCurrency: Object.keys(totalsByCurrency).length > 1 ? totalsByCurrency : undefined
      };
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  };

  const groupedByDate = groupTransactionsByDate(sortedTransactions);

  return (
    <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Транзакции</h1>
            <p className="text-sm text-muted-foreground">История доходов и расходов</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
          <div className="flex flex-col sm:flex-row gap-2 flex-1 w-full sm:w-auto">
            <Select value={filterType} onValueChange={(value: "all" | "income" | "expense") => setFilterType(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все транзакции</SelectItem>
                <SelectItem value="income">Доходы</SelectItem>
                <SelectItem value="expense">Расходы</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full sm:w-[220px]">
                <SelectValue placeholder="Категория/Источник" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {filterType !== "income" && categories.length > 0 && (
                  <>
                    <SelectItem value="expenses-header" disabled className="font-semibold">
                      Категории расходов
                    </SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.icon} {category.name}
                      </SelectItem>
                    ))}
                  </>
                )}
                {filterType !== "expense" && incomeSources.length > 0 && (
                  <>
                    <SelectItem value="incomes-header" disabled className="font-semibold">
                      Источники дохода
                    </SelectItem>
                    {incomeSources
                      .filter(source => source.name !== "Корректировка баланса")
                      .map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          💰 {source.name}
                        </SelectItem>
                      ))}
                  </>
                )}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value: "date" | "amount") => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">По дате</SelectItem>
                <SelectItem value="amount">По сумме</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </div>

        <div className="space-y-4 sm:space-y-6">
          {sortedTransactions.length === 0 ? (
            <Card>
              <CardContent className="p-6 sm:p-8">
                {filterType !== "all" || filterCategory !== "all" ? (
                  <EmptyState
                    icon={X}
                    title="Нет результатов"
                    description="Попробуйте изменить фильтры или добавить новую транзакцию"
                    action={{
                      label: "Сбросить фильтры",
                      onClick: () => {
                        setFilterType("all");
                        setFilterCategory("all");
                      },
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={ArrowUpDown}
                    title="Нет транзакций"
                    description="Начните отслеживать свои доходы и расходы, добавив первую транзакцию"
                    action={{
                      label: "Добавить транзакцию",
                      onClick: () => setIncomeDialogOpen(true),
                      icon: Plus,
                    }}
                  />
                )}
              </CardContent>
            </Card>
          ) : viewMode === "calendar" ? (
            // Calendar View
            <div className="space-y-4">
              <div className="grid grid-cols-7 gap-2">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                  <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-2">
                {(() => {
                  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
                  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
                  const daysInMonth = monthEnd.getDate();
                  const firstDayOfWeek = monthStart.getDay();
                  const days: (Date | null)[] = [];
                  
                  // Adjust for Monday as first day (0 = Sunday, 1 = Monday)
                  const adjustedFirstDay = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
                  
                  // Add empty cells for days before month start
                  for (let i = 0; i < adjustedFirstDay; i++) {
                    days.push(null);
                  }
                  
                  // Add all days of the month
                  for (let day = 1; day <= daysInMonth; day++) {
                    days.push(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day));
                  }
                  
                  // Group transactions by date
                  const transactionsByDate = new Map<string, Transaction[]>();
                  sortedTransactions.forEach(t => {
                    const dateKey = format(new Date(t.date), 'yyyy-MM-dd');
                    if (!transactionsByDate.has(dateKey)) {
                      transactionsByDate.set(dateKey, []);
                    }
                    transactionsByDate.get(dateKey)!.push(t);
                  });
                  
                  return days.map((date, idx) => {
                    if (!date) {
                      return <div key={`empty-${idx}`} className="aspect-square" />;
                    }
                    
                    const dateKey = format(date, 'yyyy-MM-dd');
                    const dayTransactions = transactionsByDate.get(dateKey) || [];
                    const dayIncome = dayTransactions
                      .filter(t => t.type === 'income')
                      .reduce((sum, t) => sum + t.amount, 0);
                    const dayExpense = dayTransactions
                      .filter(t => t.type === 'expense')
                      .reduce((sum, t) => sum + t.amount, 0);
                    const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                    
                    return (
                      <Card
                        key={dateKey}
                        className={`aspect-square p-2 cursor-pointer hover:shadow-md transition-shadow ${
                          isToday ? 'border-primary border-2' : ''
                        } ${dayTransactions.length > 0 ? 'bg-card' : 'bg-muted/30'}`}
                        onClick={() => {
                          // Expand only this day, collapse others
                          setCollapsedDays(new Set([dateKey]));
                          setViewMode("list");
                          // Scroll to this day
                          setTimeout(() => {
                            const element = document.querySelector(`[data-date="${dateKey}"]`);
                            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }, 100);
                        }}
                      >
                        <div className="flex flex-col h-full">
                          <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                            {format(date, 'd')}
                          </div>
                          <div className="flex-1 flex flex-col gap-0.5 text-[10px] overflow-hidden">
                            {dayIncome > 0 && (
                              <div className="text-success font-medium truncate">
                                +{formatAmountWithCurrency(dayIncome, userCurrency)}
                              </div>
                            )}
                            {dayExpense > 0 && (
                              <div className="text-destructive font-medium truncate">
                                -{formatAmountWithCurrency(dayExpense, userCurrency)}
                              </div>
                            )}
                            {dayTransactions.length > 0 && (
                              <div className="text-muted-foreground text-[9px] mt-auto">
                                {dayTransactions.length} {dayTransactions.length === 1 ? 'транзакция' : 'транзакций'}
                              </div>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  });
                })()}
              </div>
            </div>
          ) : (
            groupedByDate.map((group) => (
              <div key={group.date} data-date={group.date} className="space-y-2 sm:space-y-3">
                {/* Заголовок даты с суммами */}
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-1 py-2 border-b">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => {
                        const newCollapsed = new Set(collapsedDays);
                        if (newCollapsed.has(group.date)) {
                          newCollapsed.delete(group.date);
                        } else {
                          newCollapsed.add(group.date);
                        }
                        setCollapsedDays(newCollapsed);
                      }}
                      className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-1 text-left"
                    >
                      {collapsedDays.has(group.date) ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      )}
                      <h3 className="font-semibold text-base sm:text-lg">
                        {group.relativeLabel && (
                          <span className="text-primary">{group.relativeLabel} • </span>
                        )}
                        {group.dateLabel}
                      </h3>
                    </button>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      {group.totalsByCurrency && Object.keys(group.totalsByCurrency).length > 1 ? (
                        // Multiple currencies - show separate badges
                        Object.entries(group.totalsByCurrency).map(([currency, totals]) => {
                          const currencySymbols: Record<string, string> = {
                            RUB: '₽', USD: '$', EUR: '€', GBP: '£',
                            JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                          };
                          const symbol = currencySymbols[currency] || currency;

                          return (
                            <div key={currency} className="flex items-center gap-1.5">
                              {totals.totalIncome > 0 && (
                                <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px] sm:text-xs">
                                  <ArrowUpRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5" />
                                  +{totals.totalIncome.toLocaleString('ru-RU')} {symbol}
                                </Badge>
                              )}
                              {totals.totalExpense > 0 && (
                                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px] sm:text-xs">
                                  <ArrowDownRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5" />
                                  -{totals.totalExpense.toLocaleString('ru-RU')} {symbol}
                                </Badge>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        // Single currency - show standard view
                        <>
                          {group.totalIncome > 0 && (
                            <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                              <ArrowUpRight className="h-3 w-3 mr-1" />
                              +{formatAmountWithCurrency(group.totalIncome, group.totalsByCurrency ? Object.keys(group.totalsByCurrency)[0] : userCurrency)}
                            </Badge>
                          )}
                          {group.totalExpense > 0 && (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                              <ArrowDownRight className="h-3 w-3 mr-1" />
                              -{formatAmountWithCurrency(group.totalExpense, group.totalsByCurrency ? Object.keys(group.totalsByCurrency)[0] : userCurrency)}
                            </Badge>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Транзакции этого дня */}
                {!collapsedDays.has(group.date) && group.transactions.map((transaction) => (
                  <Card key={transaction.id} className="hover:shadow-md transition-shadow group">
                    <CardContent className={compactView ? "p-2" : "p-3 sm:p-4"}>
                      {compactView ? (
                        // Compact view
                        <div className="flex items-center gap-2">
                          <div className={`p-1.5 rounded shrink-0 ${transaction.type === "income"
                            ? "bg-success/10"
                            : "bg-destructive/10"
                            }`}>
                            {transaction.type === "income" ? (
                              <ArrowUpRight className="h-3 w-3 text-success" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3 text-destructive" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-sm truncate">
                                {transaction.category}
                              </p>
                              <p className={`text-sm font-bold shrink-0 ${transaction.type === "income"
                                ? "text-success"
                                : "text-destructive"
                                }`}>
                                {transaction.type === "income" ? "+" : "-"}
                                {formatAmountWithCurrency(transaction.amount, transaction.currency)}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {transaction.description || "Без описания"}
                            </p>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditTransaction(transaction)}>
                                <Edit className="h-4 w-4 mr-2" />
                                Редактировать
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeletingTransaction(transaction)}
                                className="text-destructive"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Удалить
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      ) : (
                        // Normal view
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex items-start sm:items-center gap-3">
                            <div className={`p-2 rounded-lg shrink-0 ${transaction.type === "income"
                              ? "bg-success/10"
                              : "bg-destructive/10"
                              }`}>
                              {transaction.type === "income" ? (
                                <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5 text-success" />
                              ) : (
                                <ArrowDownRight className="h-4 w-4 sm:h-5 sm:w-5 text-destructive" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-sm sm:text-base truncate">
                                {transaction.category}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-1">
                                <span className="text-xs text-muted-foreground truncate">
                                  {transaction.description || "Без описания"}
                                </span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">
                                  {transaction.userName}
                                </span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(transaction.date), "HH:mm", { locale: ru })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                            <p className={`text-lg sm:text-xl font-bold ${transaction.type === "income"
                              ? "text-success"
                              : "text-destructive"
                              }`}>
                              {transaction.type === "income" ? "+" : "-"}
                              {formatAmountWithCurrency(transaction.amount, transaction.currency)}
                            </p>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEditTransaction(transaction)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Редактировать
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeletingTransaction(transaction)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Удалить
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <IncomeDialog
        open={incomeDialogOpen}
        onOpenChange={(open) => {
          setIncomeDialogOpen(open);
          if (!open) setEditingIncome(null);
        }}
        incomeSources={incomeSources}
        onSave={handleAddIncome}
        editingIncome={editingIncome}
        onSourceCreated={fetchData}
      />

      <ExpenseDialog
        open={expenseDialogOpen}
        onOpenChange={(open) => {
          setExpenseDialogOpen(open);
          if (!open) setEditingExpense(null);
        }}
        categories={categories}
        onSave={handleAddExpense}
        editingExpense={editingExpense}
      />

      <AlertDialog open={!!deletingTransaction} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить транзакцию?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingTransaction && (
                <>
                  Вы уверены что хотите удалить {deletingTransaction.type === "income" ? "доход" : "расход"}{" "}
                  <span className="font-semibold">
                    {formatAmount(deletingTransaction.amount)}
                  </span>{" "}
                  ({deletingTransaction.category})?
                  <br />
                  Это действие нельзя будет отменить.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTransaction}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Floating Action Button (FAB) for Mobile */}
      <div className="fixed bottom-6 right-6 z-50 sm:hidden">
        <div className="relative">
          {fabOpen && (
            <>
              {/* Backdrop */}
              <div 
                className="fixed inset-0 bg-background/80 backdrop-blur-sm -z-10"
                onClick={() => setFabOpen(false)}
              />
              {/* Action Buttons */}
              <div className="absolute bottom-16 right-0 flex flex-col gap-3 mb-2">
                <div className="flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <span className="text-xs text-muted-foreground bg-card px-2 py-1 rounded">Доход</span>
                  <Button
                    size="lg"
                    className="rounded-full w-14 h-14 shadow-lg bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70"
                    onClick={() => {
                      setEditingIncome(null);
                      setIncomeDialogOpen(true);
                      setFabOpen(false);
                    }}
                    title="Добавить доход"
                  >
                    <ArrowUpRight className="h-6 w-6" />
                  </Button>
                </div>
                <div className="flex flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
                  <span className="text-xs text-muted-foreground bg-card px-2 py-1 rounded">Расход</span>
                  <Button
                    size="lg"
                    className="rounded-full w-14 h-14 shadow-lg bg-gradient-to-r from-destructive to-destructive/80 hover:from-destructive/90 hover:to-destructive/70"
                    onClick={() => {
                      setEditingExpense(null);
                      setExpenseDialogOpen(true);
                      setFabOpen(false);
                    }}
                    title="Добавить расход"
                  >
                    <ArrowDownRight className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </>
          )}
          <Button
            size="lg"
            className={`rounded-full w-16 h-16 shadow-xl bg-primary hover:bg-primary/90 transition-all duration-300 ${
              fabOpen ? 'rotate-45' : 'rotate-0'
            }`}
            onClick={() => setFabOpen(!fabOpen)}
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </Layout>
  );
};

export default Transactions;
