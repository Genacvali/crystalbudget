import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { TrendingUp, TrendingDown, PiggyBank, Plus, Wallet, FolderOpen, BarChart3, Bot, ArrowUpDown, LayoutGrid, List, Filter, PieChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Layout } from "@/components/Layout";
import { SummaryCard } from "@/components/SummaryCard";
import { IncomeSourceCard } from "@/components/IncomeSourceCard";
import { CategoryCard } from "@/components/CategoryCard";
import { IncomeDialog } from "@/components/IncomeDialog";
import { ExpenseDialog } from "@/components/ExpenseDialog";
import { AIChatDialog } from "@/components/AIChatDialog";
import { BalanceAdjustmentDialog } from "@/components/BalanceAdjustmentDialog";
import { QuickGuide } from "@/components/QuickGuide";
import { TelegramGuide } from "@/components/TelegramGuide";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { IncomeSource, Category, CategoryAllocation, Income, Expense, SourceSummary, CategoryBudget } from "@/types/budget";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
const Dashboard = () => {
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
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  const {
    toast
  } = useToast();
  const {
    formatAmount,
    currency: userCurrency
  } = useCurrency();
  const { createNotification } = useNotifications();
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [telegramGuideOpen, setTelegramGuideOpen] = useState(false);
  const [carryOverBalance, setCarryOverBalance] = useState(0);
  const [categoryDebts, setCategoryDebts] = useState<Record<string, Record<string, number>>>({});
  const [categoryCarryOvers, setCategoryCarryOvers] = useState<Record<string, Record<string, number>>>({});
  const [categorySortBy, setCategorySortBy] = useState<"name" | "spent" | "remaining">("name");
  const [compactView, setCompactView] = useState(() => {
    const saved = localStorage.getItem('dashboard_compact_view');
    return saved ? JSON.parse(saved) : false;
  });
  const [categoryFilter, setCategoryFilter] = useState<"all" | "attention" | "exceeded">("all");
  const [zenmoneyAccounts, setZenmoneyAccounts] = useState<Array<{
    id: string;
    title: string;
    balance: number;
    currency?: string;
    updated_at?: string;
  }>>([]);
  const [isZenMoneyConnected, setIsZenMoneyConnected] = useState(() => {
    return localStorage.getItem('isZenMoneyConnected') === 'true';
  });
  
  // Сохраняем выбранную дату в localStorage
  useEffect(() => {
    localStorage.setItem('selectedDate', selectedDate.toISOString());
  }, [selectedDate]);

  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDate]);

  // Listen for ZenMoney sync events to refresh data
  useEffect(() => {
    const handleZenMoneySync = () => {
      if (user) {
        loadData();
      }
    };

    window.addEventListener('zenmoney-synced', handleZenMoneySync);

    return () => {
      window.removeEventListener('zenmoney-synced', handleZenMoneySync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Save compact view preference
  useEffect(() => {
    localStorage.setItem('dashboard_compact_view', JSON.stringify(compactView));
  }, [compactView]);

  // Show quick guide for new users
  useEffect(() => {
    if (user && !loading && incomeSources.length === 0 && categories.length === 0) {
      setQuickGuideOpen(true);
    }
  }, [user, loading, incomeSources.length, categories.length]);

  // Show Telegram guide after Quick Guide is closed (if not shown before)
  useEffect(() => {
    if (user && !loading && !quickGuideOpen) {
      const telegramGuideShown = localStorage.getItem("telegram_guide_shown");
      if (!telegramGuideShown) {
        // Small delay to avoid showing both dialogs at once
        const timer = setTimeout(() => {
          setTelegramGuideOpen(true);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [user, loading, quickGuideOpen]);
  const loadData = async () => {
    try {
      const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      // Get family members to include their transactions
      let familyUserIds = [user!.id];

      // Check if user is a family owner
      const { data: ownedFamily } = await supabase
        .from('families')
        .select('id')
        .eq('owner_id', user!.id)
        .maybeSingle();

      let familyId: string | null = null;

      if (ownedFamily?.id) {
        familyId = ownedFamily.id;
      } else {
        // Check if user is a family member
        const { data: membership } = await supabase
          .from('family_members')
          .select('family_id')
          .eq('user_id', user!.id)
          .maybeSingle();

        if (membership?.family_id) {
          familyId = membership.family_id;
        }
      }

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
          familyUserIds = [familyData.owner_id];
          if (members && members.length > 0) {
            familyUserIds = [familyData.owner_id, ...members.map(m => m.user_id)];
          }
        }
      }

      // Calculate carry-over balance from all previous months (family scope) with currency support
      const {
        data: previousIncomes
      } = await supabase.from('incomes').select('amount, currency').in('user_id', familyUserIds).lt('date', startOfMonth);
      const {
        data: previousExpenses
      } = await supabase.from('expenses').select('amount, currency').in('user_id', familyUserIds).lt('date', startOfMonth);
      
      // Group previous incomes and expenses by currency
      const prevIncomeByCurrency: Record<string, number> = {};
      const prevExpenseByCurrency: Record<string, number> = {};
      
      (previousIncomes || []).forEach(inc => {
        const curr = inc.currency || userCurrency || 'RUB';
        prevIncomeByCurrency[curr] = (prevIncomeByCurrency[curr] || 0) + Number(inc.amount);
      });
      
      (previousExpenses || []).forEach(exp => {
        const curr = exp.currency || userCurrency || 'RUB';
        prevExpenseByCurrency[curr] = (prevExpenseByCurrency[curr] || 0) + Number(exp.amount);
      });
      
      // Calculate carry-over for primary currency only
      const primaryCurrency = userCurrency || 'RUB';
      const previousTotalIncome = prevIncomeByCurrency[primaryCurrency] || 0;
      const previousTotalExpenses = prevExpenseByCurrency[primaryCurrency] || 0;
      const calculatedCarryOver = previousTotalIncome - previousTotalExpenses;
      
      // Debug: Log carry-over calculation
      console.log('[DEBUG LoadData] Перенос баланса:', {
        previousTotalIncome: previousTotalIncome.toFixed(2),
        previousTotalExpenses: previousTotalExpenses.toFixed(2),
        calculatedCarryOver: calculatedCarryOver.toFixed(2),
        currency: primaryCurrency
      });
      
      setCarryOverBalance(calculatedCarryOver);

      // Load income sources
      const {
        data: sourcesData,
        error: sourcesError
      } = await supabase.from('income_sources').select('*').order('created_at', {
        ascending: false
      });
      if (sourcesError) throw sourcesError;
      const mappedSources: IncomeSource[] = (sourcesData || []).map(item => ({
        id: item.id,
        name: item.name,
        color: item.color,
        amount: item.amount ? Number(item.amount) : undefined,
        frequency: item.frequency || undefined,
        receivedDate: item.received_date || undefined
      }));
      setIncomeSources(mappedSources);

      // Load categories
      const {
        data: categoriesData,
        error: categoriesError
      } = await supabase.from('categories').select('*').order('created_at', {
        ascending: false
      });
      if (categoriesError) throw categoriesError;

      // Load category allocations
      const {
        data: allocationsData,
        error: allocationsError
      } = await supabase.from('category_allocations').select('*');
      if (allocationsError) throw allocationsError;
      const mappedCategories: Category[] = (categoriesData || []).map(item => {
        const categoryAllocations = (allocationsData || []).filter(alloc => alloc.category_id === item.id).map(alloc => {
          const currency = (alloc as any).currency || 'RUB';
          return {
            id: alloc.id,
            incomeSourceId: alloc.income_source_id,
            allocationType: alloc.allocation_type as 'amount' | 'percent',
            allocationValue: Number(alloc.allocation_value),
            currency: currency
          };
        });
        return {
          id: item.id,
          name: item.name,
          icon: item.icon,
          allocations: categoryAllocations,
          linkedSourceId: item.linked_source_id || undefined,
          allocationAmount: item.allocation_amount ? Number(item.allocation_amount) : undefined,
          allocationPercent: item.allocation_percent ? Number(item.allocation_percent) : undefined
        };
      });
      setCategories(mappedCategories);

      // Load incomes for selected month (family scope)
      const {
        data: incomesData,
        error: incomesError
      } = await supabase.from('incomes').select('*').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
      if (incomesError) throw incomesError;
      
      // Debug: Log loaded incomes
      console.log('[DEBUG LoadData] Загружено доходов:', (incomesData || []).length);
      console.log('[DEBUG LoadData] Диапазон дат:', startOfMonth, 'до', endOfMonth);
      console.log('[DEBUG LoadData] Пользователи:', familyUserIds);
      if ((incomesData || []).length > 0) {
        const totalIncome = (incomesData || []).reduce((sum, inc) => sum + Number(inc.amount || 0), 0);
        console.log('[DEBUG LoadData] Сумма доходов:', totalIncome);
        
        // Check for incomes with null or zero amounts
        const incomesWithNullAmount = (incomesData || []).filter(inc => !inc.amount || Number(inc.amount) === 0);
        if (incomesWithNullAmount.length > 0) {
          console.log('[DEBUG LoadData] Доходов с нулевой суммой:', incomesWithNullAmount.length);
        }
        
        // Check for incomes with negative amounts
        const incomesWithNegativeAmount = (incomesData || []).filter(inc => Number(inc.amount) < 0);
        if (incomesWithNegativeAmount.length > 0) {
          console.log('[DEBUG LoadData] Доходов с отрицательной суммой:', incomesWithNegativeAmount.length);
        }
      }
      
      setIncomes(incomesData || []);

      // Load expenses for selected month (family scope)
      const {
        data: expensesData,
        error: expensesError
      } = await supabase.from('expenses').select('*').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
      if (expensesError) throw expensesError;
      
      // Debug: Log loaded expenses
      console.log('[DEBUG LoadData] Загружено расходов:', (expensesData || []).length);
      if ((expensesData || []).length > 0) {
        const totalExpense = (expensesData || []).reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
        console.log('[DEBUG LoadData] Сумма расходов:', totalExpense);
        
        // Check for expenses with null or zero amounts
        const expensesWithNullAmount = (expensesData || []).filter(exp => !exp.amount || Number(exp.amount) === 0);
        if (expensesWithNullAmount.length > 0) {
          console.log('[DEBUG LoadData] Расходов с нулевой суммой:', expensesWithNullAmount.length);
        }
        
        // Check for expenses with negative amounts
        const expensesWithNegativeAmount = (expensesData || []).filter(exp => Number(exp.amount) < 0);
        if (expensesWithNegativeAmount.length > 0) {
          console.log('[DEBUG LoadData] Расходов с отрицательной суммой:', expensesWithNegativeAmount.length);
        }
        
        const expensesWithoutCategory = (expensesData || []).filter(exp => !exp.category_id);
        if (expensesWithoutCategory.length > 0) {
          console.log('[DEBUG LoadData] Расходов без категории (корректировки):', expensesWithoutCategory.length);
          const totalAdjustments = expensesWithoutCategory.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
          console.log('[DEBUG LoadData] Сумма корректировок:', totalAdjustments);
        }
        
        // Check date range issues
        const expensesOutsideRange = (expensesData || []).filter(exp => {
          const expDate = new Date(exp.date);
          return expDate < new Date(startOfMonth) || expDate > new Date(endOfMonth);
        });
        if (expensesOutsideRange.length > 0) {
          console.warn('[DEBUG LoadData] Расходов вне диапазона дат:', expensesOutsideRange.length);
        }
      }
      
      setExpenses(expensesData || []);

      // Check if ZenMoney is connected  
      const { data: zenmoneyConnection } = await (supabase as any)
        .from('zenmoney_connections')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      const isZenMoneyConnected = !!zenmoneyConnection;
      setIsZenMoneyConnected(isZenMoneyConnected);

      // Load ZenMoney accounts (for actual balance)
      const {
        data: zenmoneyAccountsData,
        error: zenmoneyAccountsError
      } = await (supabase as any)
        .from('zenmoney_accounts')
        .select('*')
        .or(familyUserIds.map(id => `user_id.eq.${id}`).join(','))
        .eq('archive', false);

      if (!zenmoneyAccountsError && zenmoneyAccountsData) {
        setZenmoneyAccounts(zenmoneyAccountsData.map((acc: any) => ({
          id: acc.id,
          title: acc.title,
          balance: Number(acc.balance),
          currency: 'RUB', // Default to RUB as ZenMoney usually provides amount in base currency or we need to handle currency field if added
          updated_at: acc.updated_at
        })));
      }

      // Check if we need to sync (if accounts are missing OR older than 1 hour)
      let shouldSync = false;

      if (isZenMoneyConnected) {
        if (!zenmoneyAccountsData || zenmoneyAccountsData.length === 0) {
          shouldSync = true;
        } else {
          // Check age of data
          // We assume all accounts are updated roughly at the same time
          const lastUpdate = new Date(zenmoneyAccountsData[0].updated_at);
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

          if (lastUpdate < oneHourAgo) {
            shouldSync = true;
          }
        }
      }

      if (shouldSync) {
        // Trigger sync and handle response
        supabase.functions.invoke('zenmoney-sync', {
          body: { syncType: 'all' }
        }).then(({ data, error }) => {
          if (!error && data && data.accounts && data.accounts.length > 0) {
            setZenmoneyAccounts(data.accounts.map((acc: any) => ({
              id: acc.id,
              title: acc.title,
              balance: Number(acc.balance),
              currency: 'RUB',
              updated_at: new Date().toISOString()
            })));
          }
        });

        // Poll for accounts as backup only if we have NO data initially
        if (!zenmoneyAccountsData || zenmoneyAccountsData.length === 0) {
          let attempts = 0;
          const maxAttempts = 15;
          const pollInterval = setInterval(async () => {
            attempts++;

            const { data: newAccounts } = await (supabase as any)
              .from('zenmoney_accounts')
              .select('*')
              .or(familyUserIds.map(id => `user_id.eq.${id}`).join(','))
              .eq('archive', false);

            if (newAccounts && newAccounts.length > 0) {
              setZenmoneyAccounts(newAccounts.map((acc: any) => ({
                id: acc.id,
                title: acc.title,
                balance: Number(acc.balance),
                currency: 'RUB',
                updated_at: acc.updated_at
              })));
              clearInterval(pollInterval);
            } else if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
            }
          }, 2000);
        }
      }

      // Calculate category debts from previous month
      const previousMonthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1).toISOString();
      const previousMonthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 0, 23, 59, 59).toISOString();

      const {
        data: previousIncomesData,
        error: previousIncomesError
      } = await supabase.from('incomes').select('*').in('user_id', familyUserIds).gte('date', previousMonthStart).lte('date', previousMonthEnd);
      if (previousIncomesError) throw previousIncomesError;

      const {
        data: previousExpensesData,
        error: previousExpensesError
      } = await supabase.from('expenses').select('*').in('user_id', familyUserIds).gte('date', previousMonthStart).lte('date', previousMonthEnd);
      if (previousExpensesError) throw previousExpensesError;

      // Calculate debts and carry-overs for each category from previous month (by currency)
      const debts: Record<string, Record<string, number>> = {};
      const carryOvers: Record<string, Record<string, number>> = {};

      mappedCategories.forEach(category => {
        // Group expenses by currency for this category
        const expensesByCurrency: Record<string, number> = {};
        const categoryExpenses = (previousExpensesData || []).filter(exp => exp.category_id === category.id);
        categoryExpenses.forEach(exp => {
          const expCurrency = (exp as any).currency || userCurrency || 'RUB';
          expensesByCurrency[expCurrency] = (expensesByCurrency[expCurrency] || 0) + Number(exp.amount);
        });

        // Group allocations by currency
        const allocationsByCurrency: Record<string, CategoryAllocation[]> = {};
        if (category.allocations && category.allocations.length > 0) {
          category.allocations.forEach(alloc => {
            const allocCurrency = alloc.currency || userCurrency || 'RUB';
            if (!allocationsByCurrency[allocCurrency]) {
              allocationsByCurrency[allocCurrency] = [];
            }
            allocationsByCurrency[allocCurrency].push(alloc);
          });
        } else {
          // Legacy support - use user's currency
          const defaultCurrency = userCurrency || 'RUB';
          allocationsByCurrency[defaultCurrency] = [];
        }

        // Calculate allocated and spent for each currency
        const allCurrencies = new Set([
          ...Object.keys(allocationsByCurrency),
          ...Object.keys(expensesByCurrency)
        ]);

        allCurrencies.forEach(currency => {
          let allocated = 0;

          // Calculate allocated budget for this currency
          if (allocationsByCurrency[currency] && allocationsByCurrency[currency].length > 0) {
            allocationsByCurrency[currency].forEach(alloc => {
              if (alloc.allocationType === 'amount') {
                allocated += alloc.allocationValue;
              } else if (alloc.allocationType === 'percent') {
                const sourceIncomes = (previousIncomesData || []).filter(inc => 
                  inc.source_id === alloc.incomeSourceId &&
                  ((inc as any).currency || userCurrency || 'RUB') === currency
                );
                const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
                const expectedSourceAmount = mappedSources.find(s => s.id === alloc.incomeSourceId)?.amount || 0;
                const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
                allocated += base * alloc.allocationValue / 100;
              }
            });
          } else {
            // Legacy support
            if (category.allocationAmount) {
              allocated = category.allocationAmount;
            } else if (category.linkedSourceId && category.allocationPercent) {
              const sourceIncomes = (previousIncomesData || []).filter(inc => 
                inc.source_id === category.linkedSourceId &&
                ((inc as any).currency || userCurrency || 'RUB') === currency
              );
              const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
              const expectedSourceAmount = mappedSources.find(s => s.id === category.linkedSourceId)?.amount || 0;
              const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
              allocated = base * category.allocationPercent / 100;
            }
          }

          const spent = expensesByCurrency[currency] || 0;
          const balance = allocated - spent;

          // If overspent, save the debt
          if (balance < 0) {
            if (!debts[category.id]) {
              debts[category.id] = {};
            }
            debts[category.id][currency] = Math.abs(balance);
          }
          // If under-spent, save the carry-over
          else if (balance > 0) {
            if (!carryOvers[category.id]) {
              carryOvers[category.id] = {};
            }
            carryOvers[category.id][currency] = balance;
          }
        });
      });

      setCategoryDebts(debts);
      setCategoryCarryOvers(carryOvers);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка загрузки",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  // OPTIMIZATION: Memoized callbacks
  const handleAddIncome = useCallback(async (income: {
    sourceId: string;
    amount: number;
    date: string;
    description?: string;
    currency?: string;
  }) => {
    if (!user) return;

    // Optimistic update
    const tempIncome = {
      id: `temp-${Date.now()}`,
      user_id: user.id,
      source_id: income.sourceId,
      amount: income.amount,
      date: income.date,
      description: income.description,
      currency: income.currency || userCurrency || 'RUB',
      created_at: new Date().toISOString()
    };

    setIncomes(prev => [...prev, tempIncome]);

    try {
      const { data, error } = await supabase
        .from('incomes')
        .insert({
          user_id: user.id,
          source_id: income.sourceId,
          amount: income.amount,
          date: income.date,
          description: income.description,
          currency: income.currency || userCurrency || 'RUB'
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temp with real data
      setIncomes(prev => prev.map(i => i.id === tempIncome.id ? data : i));

      toast({
        title: "Доход добавлен",
        description: "Транзакция успешно записана"
      });

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
            transactionId: data.id,
            sourceName
          }
        );
      } catch (notificationError) {
        // Don't fail the whole operation if notification fails
      }
    } catch (error) {
      // Rollback on error
      setIncomes(prev => prev.filter(i => i.id !== tempIncome.id));
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [user, toast, createNotification, incomeSources, formatAmount, userCurrency]);

  const handleAddExpense = useCallback(async (expense: {
    categoryId: string;
    amount: number;
    date: string;
    description?: string;
    currency?: string;
  }) => {
    if (!user) return;

    // Optimistic update
    const tempExpense = {
      id: `temp-${Date.now()}`,
      user_id: user.id,
      category_id: expense.categoryId,
      amount: expense.amount,
      date: expense.date,
      description: expense.description,
      currency: expense.currency || userCurrency || 'RUB',
      created_at: new Date().toISOString()
    };

    setExpenses(prev => [...prev, tempExpense]);

    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_id: user.id,
          category_id: expense.categoryId,
          amount: expense.amount,
          date: expense.date,
          description: expense.description,
          currency: expense.currency || userCurrency || 'RUB'
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temp with real data
      setExpenses(prev => prev.map(e => e.id === tempExpense.id ? data : e));

      toast({
        title: "Расход добавлен",
        description: "Транзакция успешно записана"
      });

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
            transactionId: data.id,
            categoryName
          }
        );
      } catch (notificationError) {
        // Don't fail the whole operation if notification fails
      }
    } catch (error) {
      // Rollback on error
      setExpenses(prev => prev.filter(e => e.id !== tempExpense.id));
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [user, toast, createNotification, categories, formatAmount]);

  // Calculate source summaries
  const calculateSourceSummaries = (): SourceSummary[] => {
    return incomeSources.map(source => {
      const sourceIncomes = incomes.filter(inc => inc.source_id === source.id);

      // Group incomes by currency
      const incomesByCurrency: Record<string, number> = {};
      sourceIncomes.forEach(inc => {
        const currency = inc.currency || userCurrency || 'RUB';
        incomesByCurrency[currency] = (incomesByCurrency[currency] || 0) + Number(inc.amount);
      });

      // Group allocations by currency
      const allocationsByCurrency: Record<string, number> = {};
      categories.forEach(category => {
        if (category.allocations && category.allocations.length > 0) {
          category.allocations.forEach(alloc => {
            if (alloc.incomeSourceId === source.id) {
              const currency = alloc.currency || userCurrency || 'RUB';
              const incomeInCurrency = incomesByCurrency[currency] || 0;

              let allocAmount = 0;
              if (alloc.allocationType === 'amount') {
                allocAmount = alloc.allocationValue;
              } else if (alloc.allocationType === 'percent') {
                allocAmount = incomeInCurrency * alloc.allocationValue / 100;
              }

              allocationsByCurrency[currency] = (allocationsByCurrency[currency] || 0) + allocAmount;
            }
          });
        }
      });

      // Group expenses by currency (distributed proportionally)
      const spentByCurrency: Record<string, number> = {};
      categories.forEach(category => {
        const categoryExpensesByCurrency: Record<string, number> = {};
        expenses
          .filter(exp => exp.category_id === category.id)
          .forEach(exp => {
            const currency = exp.currency || userCurrency || 'RUB';
            categoryExpensesByCurrency[currency] = (categoryExpensesByCurrency[currency] || 0) + Number(exp.amount);
          });

        // For each currency, distribute expenses proportionally
        Object.entries(categoryExpensesByCurrency).forEach(([currency, expenseAmount]) => {
          if (expenseAmount === 0) return;

          // Calculate total budget allocated to this category in this currency
          let categoryTotalBudget = 0;
          let budgetFromThisSource = 0;

          if (category.allocations && category.allocations.length > 0) {
            category.allocations.forEach(alloc => {
              const allocCurrency = alloc.currency || userCurrency || 'RUB';
              if (allocCurrency !== currency) return;

              let allocAmount = 0;
              if (alloc.allocationType === 'amount') {
                allocAmount = alloc.allocationValue;
              } else if (alloc.allocationType === 'percent') {
                const sourceIncomesForAlloc = incomes.filter(inc =>
                  inc.source_id === alloc.incomeSourceId &&
                  (inc.currency || userCurrency || 'RUB') === currency
                );
                const actualSourceTotal = sourceIncomesForAlloc.reduce((sum, inc) => sum + Number(inc.amount), 0);
                allocAmount = actualSourceTotal * alloc.allocationValue / 100;
              }

              categoryTotalBudget += allocAmount;
              if (alloc.incomeSourceId === source.id) {
                budgetFromThisSource += allocAmount;
              }
            });
          }

          // Distribute expenses proportionally
          if (categoryTotalBudget > 0 && budgetFromThisSource > 0) {
            const proportion = budgetFromThisSource / categoryTotalBudget;
            spentByCurrency[currency] = (spentByCurrency[currency] || 0) + (expenseAmount * proportion);
          }
        });
      });

      // Calculate summaries for each currency
      const summariesByCurrency: Record<string, {
        totalIncome: number;
        totalSpent: number;
        remaining: number;
        debt: number;
      }> = {};

      const allCurrencies = new Set([
        ...Object.keys(incomesByCurrency),
        ...Object.keys(allocationsByCurrency),
        ...Object.keys(spentByCurrency)
      ]);

      allCurrencies.forEach(currency => {
        const totalIncome = incomesByCurrency[currency] || 0;
        const totalAllocated = allocationsByCurrency[currency] || 0;
        const totalSpent = spentByCurrency[currency] || 0;
        const remaining = totalIncome - totalAllocated;
        const debt = remaining < 0 ? Math.abs(remaining) : 0;

        summariesByCurrency[currency] = {
          totalIncome,
          totalSpent,
          remaining: remaining >= 0 ? remaining : 0,
          debt
        };
      });

      // Calculate totals (for backward compatibility, use primary currency or first available)
      const primaryCurrency = userCurrency || 'RUB';
      const primarySummary = summariesByCurrency[primaryCurrency] || Object.values(summariesByCurrency)[0] || {
        totalIncome: 0,
        totalSpent: 0,
        remaining: 0,
        debt: 0
      };

      // Always include summariesByCurrency, even for single currency
      const hasMultipleCurrencies = Object.keys(summariesByCurrency).length > 1;

      return {
        sourceId: source.id,
        totalIncome: primarySummary.totalIncome,
        totalSpent: primarySummary.totalSpent,
        remaining: primarySummary.remaining,
        debt: primarySummary.debt,
        summariesByCurrency: Object.keys(summariesByCurrency).length > 0 ? summariesByCurrency : undefined
      };
    });
  };

  // Calculate category budgets (with multi-currency support)
  const calculateCategoryBudgets = (): CategoryBudget[] => {

    return categories.map(category => {
      // Group expenses by currency
      const expensesByCurrency: Record<string, number> = {};
      const categoryExpenses = expenses.filter(exp => exp.category_id === category.id);

      categoryExpenses.forEach(exp => {
        const expCurrency = (exp as any).currency || userCurrency || 'RUB';
        expensesByCurrency[expCurrency] = (expensesByCurrency[expCurrency] || 0) + Number(exp.amount);
      });

      // Calculate budgets by currency
      const budgetsByCurrency: Record<string, {
        allocated: number;
        spent: number;
        remaining: number;
        debt?: number;
        carryOver?: number;
      }> = {};

      // Group allocations by currency
      const allocationsByCurrency: Record<string, CategoryAllocation[]> = {};

      if (category.allocations && category.allocations.length > 0) {
        category.allocations.forEach(alloc => {
          const allocCurrency = alloc.currency || userCurrency || 'RUB';
          if (!allocationsByCurrency[allocCurrency]) {
            allocationsByCurrency[allocCurrency] = [];
          }
          allocationsByCurrency[allocCurrency].push(alloc);
        });

        // Debug: log currencies for categories with multiple currencies
      } else {
        // Legacy support - use user's currency
        const defaultCurrency = userCurrency || 'RUB';
        allocationsByCurrency[defaultCurrency] = [];
      }

      // Calculate allocated budget for each currency
      Object.keys(allocationsByCurrency).forEach(currency => {
        let allocated = 0;
        allocationsByCurrency[currency].forEach(alloc => {
          if (alloc.allocationType === 'amount') {
            allocated += alloc.allocationValue;
          } else if (alloc.allocationType === 'percent') {
            // Filter incomes by currency and source
            const sourceIncomes = incomes.filter(inc =>
              inc.source_id === alloc.incomeSourceId &&
              ((inc as any).currency || userCurrency || 'RUB') === currency
            );
            const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
            const expectedSourceAmount = incomeSources.find(s => s.id === alloc.incomeSourceId)?.amount || 0;
            const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
            allocated += base * alloc.allocationValue / 100;
          }
        });

        // Legacy support - if no allocations, use legacy fields
        if (allocationsByCurrency[currency].length === 0) {
          if (category.allocationAmount) {
            allocated = category.allocationAmount;
          } else if (category.linkedSourceId && category.allocationPercent) {
            const sourceIncomes = incomes.filter(inc =>
              inc.source_id === category.linkedSourceId &&
              ((inc as any).currency || userCurrency || 'RUB') === currency
            );
            const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
            const expectedSourceAmount = incomeSources.find(s => s.id === category.linkedSourceId)?.amount || 0;
            const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
            allocated = base * category.allocationPercent / 100;
          }
        }

        const spent = expensesByCurrency[currency] || 0;
        const debt = (categoryDebts[category.id] || {})[currency] || 0;
        const carryOver = (categoryCarryOvers[category.id] || {})[currency] || 0;
        const totalAllocated = allocated + carryOver;

        // Debug для категории "ЗП Гены"
        if (category.name === "ЗП Гены" && currency === 'RUB') {
          const availableBudget = totalAllocated - debt;
        }

        budgetsByCurrency[currency] = {
          allocated: totalAllocated,
          spent,
          remaining: totalAllocated - spent - debt,
          debt,
          carryOver
        };
      });

      // Also add currencies that have expenses but no allocations
      Object.keys(expensesByCurrency).forEach(currency => {
        if (!budgetsByCurrency[currency]) {
          budgetsByCurrency[currency] = {
            allocated: 0,
            spent: expensesByCurrency[currency],
            remaining: -expensesByCurrency[currency],
            debt: 0,
            carryOver: 0
          };
        }
      });

      // Calculate total (for backward compatibility)
      let totalAllocated = 0;
      let totalSpent = 0;
      Object.values(budgetsByCurrency).forEach(budget => {
        totalAllocated += budget.allocated;
        totalSpent += budget.spent;
      });

      const totalDebt = Object.values(budgetsByCurrency).reduce((sum, b) => sum + (b.debt || 0), 0);
      const totalCarryOver = Object.values(budgetsByCurrency).reduce((sum, b) => sum + (b.carryOver || 0), 0);

      const currenciesCount = Object.keys(budgetsByCurrency).length;
      const hasCurrencies = currenciesCount > 0;


      return {
        categoryId: category.id,
        allocated: totalAllocated,
        spent: totalSpent,
        remaining: totalAllocated - totalSpent - totalDebt,
        debt: totalDebt,
        carryOver: totalCarryOver,
        budgetsByCurrency: hasCurrencies ? budgetsByCurrency : undefined
      };
    });
  };

  // OPTIMIZATION: Memoized calculations with multi-currency support
  const balancesByCurrency = useMemo(() => {
    const incomeByCurrency: Record<string, number> = {};
    const expenseByCurrency: Record<string, number> = {};

    // Debug: Log all transactions
    console.log('[DEBUG Balance] Всего доходов:', incomes.length);
    console.log('[DEBUG Balance] Всего расходов:', expenses.length);
    
    let skippedIncomes = 0;
    let skippedExpenses = 0;

    incomes.forEach(inc => {
      const currency = inc.currency || userCurrency || 'RUB';
      const amount = Number(inc.amount);
      
      // Skip if amount is invalid
      if (isNaN(amount) || amount === null || amount === undefined) {
        skippedIncomes++;
        console.warn('[DEBUG Balance] Пропущен доход (невалидная сумма):', { id: inc.id, amount: inc.amount, currency, date: inc.date, source_id: inc.source_id });
        return;
      }
      
      incomeByCurrency[currency] = (incomeByCurrency[currency] || 0) + amount;
      
      // Debug: Log suspicious transactions
      if (amount <= 0) {
        console.warn('[DEBUG Balance] Подозрительный доход (<= 0):', { id: inc.id, amount, currency, date: inc.date, source_id: inc.source_id });
      }
    });

    expenses.forEach(exp => {
      const currency = exp.currency || userCurrency || 'RUB';
      const amount = Number(exp.amount);
      
      // Skip if amount is invalid
      if (isNaN(amount) || amount === null || amount === undefined) {
        skippedExpenses++;
        console.warn('[DEBUG Balance] Пропущен расход (невалидная сумма):', { id: exp.id, amount: exp.amount, currency, date: exp.date, category_id: exp.category_id });
        return;
      }
      
      expenseByCurrency[currency] = (expenseByCurrency[currency] || 0) + amount;
      
      // Debug: Log suspicious transactions
      if (amount <= 0) {
        console.warn('[DEBUG Balance] Подозрительный расход (<= 0):', { id: exp.id, amount, currency, date: exp.date, category_id: exp.category_id });
      }
      
      // Debug: Log expenses without category (balance adjustments)
      if (!exp.category_id) {
        console.log('[DEBUG Balance] Расход без категории (корректировка):', { id: exp.id, amount, currency, date: exp.date, description: exp.description });
      }
    });
    
    if (skippedIncomes > 0 || skippedExpenses > 0) {
      console.warn('[DEBUG Balance] Пропущено транзакций:', { skippedIncomes, skippedExpenses });
    }
    
    // Debug: Log totals by currency
    console.log('[DEBUG Balance] Доходы по валютам:', incomeByCurrency);
    console.log('[DEBUG Balance] Расходы по валютам:', expenseByCurrency);
    
    // Debug: Calculate and log total sums for verification
    const totalIncomeSum = Object.values(incomeByCurrency).reduce((sum, val) => sum + val, 0);
    const totalExpenseSum = Object.values(expenseByCurrency).reduce((sum, val) => sum + val, 0);
    console.log('[DEBUG Balance] Итоговая сумма доходов:', totalIncomeSum);
    console.log('[DEBUG Balance] Итоговая сумма расходов:', totalExpenseSum);
    console.log('[DEBUG Balance] Разница (доходы - расходы):', totalIncomeSum - totalExpenseSum);

    const allCurrencies = new Set([
      ...Object.keys(incomeByCurrency),
      ...Object.keys(expenseByCurrency)
    ]);

    const result: Record<string, {
      income: number;
      expense: number;
      balance: number;
      totalBalance: number;
    }> = {};

    const primaryCurrency = userCurrency || 'RUB';
    
    allCurrencies.forEach(currency => {
      const income = incomeByCurrency[currency] || 0;
      const expense = expenseByCurrency[currency] || 0;
      const balance = income - expense;
      // Only add carry-over balance for primary currency
      const totalBalance = currency === primaryCurrency 
        ? balance + (carryOverBalance || 0)
        : balance;

      result[currency] = { income, expense, balance, totalBalance };
      
      // Debug: Log balance calculation for primary currency
      if (currency === primaryCurrency) {
        console.log('[DEBUG Balance] Расчет баланса для', currency, ':', {
          income,
          expense,
          balance: balance.toFixed(2),
          carryOverBalance: (carryOverBalance || 0).toFixed(2),
          totalBalance: totalBalance.toFixed(2)
        });
      }
    });

    return result;
  }, [incomes, expenses, userCurrency, carryOverBalance]);

  // Calculate daily history for trends
  const historyData = useMemo(() => {
    const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    const incomeHistory = new Array(daysInMonth).fill(0);
    const expenseHistory = new Array(daysInMonth).fill(0);
    const balanceHistory = new Array(daysInMonth).fill(0);

    const primaryCurrency = userCurrency || 'RUB';

    incomes.forEach(inc => {
      if ((inc.currency || userCurrency || 'RUB') !== primaryCurrency) return;
      const day = new Date(inc.date).getDate() - 1;
      if (day >= 0 && day < daysInMonth) {
        incomeHistory[day] += Number(inc.amount);
      }
    });

    expenses.forEach(exp => {
      if ((exp.currency || userCurrency || 'RUB') !== primaryCurrency) return;
      const day = new Date(exp.date).getDate() - 1;
      if (day >= 0 && day < daysInMonth) {
        expenseHistory[day] += Number(exp.amount);
      }
    });

    // Calculate cumulative balance for the month
    let currentBalance = carryOverBalance || 0;
    for (let i = 0; i < daysInMonth; i++) {
      currentBalance += incomeHistory[i] - expenseHistory[i];
      balanceHistory[i] = currentBalance;
    }

    return { income: incomeHistory, expense: expenseHistory, balance: balanceHistory };
  }, [incomes, expenses, selectedDate, userCurrency, carryOverBalance]);

  // Calculate Safe to Spend (Daily Budget)
  const safeToSpend = useMemo(() => {
    const primaryCurrency = userCurrency || 'RUB';
    const totalBal = balancesByCurrency[primaryCurrency]?.totalBalance || 0;
    
    const today = new Date();
    const isCurrentMonth = today.getMonth() === selectedDate.getMonth() && today.getFullYear() === selectedDate.getFullYear();
    
    if (!isCurrentMonth) return null;

    const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
    const currentDay = today.getDate();
    const daysRemaining = daysInMonth - currentDay + 1; // Including today

    if (daysRemaining <= 0) return 0;
    
    // We use the current total balance (including carry over)
    return Math.max(0, totalBal / daysRemaining);
  }, [balancesByCurrency, selectedDate, userCurrency]);

  const currentMonthIncome = useMemo(
    () => {
      const primaryCurrency = userCurrency || 'RUB';
      return balancesByCurrency[primaryCurrency]?.income || 0;
    },
    [balancesByCurrency, userCurrency]
  );

  const totalExpenses = useMemo(
    () => {
      const primaryCurrency = userCurrency || 'RUB';
      return balancesByCurrency[primaryCurrency]?.expense || 0;
    },
    [balancesByCurrency, userCurrency]
  );

  const monthBalance = useMemo(
    () => {
      const primaryCurrency = userCurrency || 'RUB';
      return balancesByCurrency[primaryCurrency]?.balance || 0;
    },
    [balancesByCurrency, userCurrency]
  );

  const totalBalance = useMemo(
    () => {
      const primaryCurrency = userCurrency || 'RUB';
      return balancesByCurrency[primaryCurrency]?.totalBalance || 0;
    },
    [balancesByCurrency, userCurrency]
  );

  const sourceSummaries = useMemo(
    () => calculateSourceSummaries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incomeSources, incomes, expenses, categories]
  );

  const categoryBudgets = useMemo(
    () => calculateCategoryBudgets(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categories, incomes, expenses, incomeSources, categoryDebts, categoryCarryOvers]
  );

  const monthName = useMemo(
    () => format(selectedDate, "LLLL", { locale: ru }),
    [selectedDate]
  );
  const actualBalance = useMemo(() => {
    return zenmoneyAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  }, [zenmoneyAccounts]);

  const hasZenMoneyAccounts = zenmoneyAccounts.length > 0;
  const balanceDiff = hasZenMoneyAccounts ? actualBalance - totalBalance : 0;
  const showDiffWarning = hasZenMoneyAccounts && Math.abs(balanceDiff) > 100;

  if (loading) {
    return (
      <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
        <DashboardSkeleton />
      </Layout>
    );
  }
  return <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
    {/* <PullToRefresh onRefresh={loadData}> */}
    <div className="space-y-4 sm:space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          title={`Доходы ${monthName}`}
          value={formatAmount(currentMonthIncome)}
          subtitle="Сумма поступлений"
          icon={TrendingUp}
          variant="success"
          history={historyData.income}
          valuesByCurrency={Object.keys(balancesByCurrency).length > 1 ?
            Object.fromEntries(Object.entries(balancesByCurrency).map(([curr, data]) => [curr, data.income])) :
            undefined
          }
        />
        <SummaryCard
          title="Расходы"
          value={formatAmount(totalExpenses)}
          subtitle={currentMonthIncome > 0 ? `${(totalExpenses / currentMonthIncome * 100).toFixed(0)}% от дохода` : undefined}
          icon={TrendingDown}
          variant="destructive"
          history={historyData.expense}
          valuesByCurrency={Object.keys(balancesByCurrency).length > 1 ?
            Object.fromEntries(Object.entries(balancesByCurrency).map(([curr, data]) => [curr, data.expense])) :
            undefined
          }
        />
        <SummaryCard
          title={isZenMoneyConnected ? "Фактический баланс" : "Общий баланс"}
          value={
            isZenMoneyConnected
              ? (hasZenMoneyAccounts ? formatAmount(actualBalance) : "...")
              : formatAmount(totalBalance)
          }
          subtitle={
            isZenMoneyConnected
              ? (hasZenMoneyAccounts
                ? (showDiffWarning
                  ? `Расхождение: ${balanceDiff > 0 ? '+' : ''}${formatAmount(balanceDiff)}`
                  : `Синхронизировано с банком`)
                : "Синхронизация счетов...")
              : undefined
          }
          icon={PiggyBank}
          variant={
            isZenMoneyConnected
              ? (hasZenMoneyAccounts && showDiffWarning ? "warning" : "default")
              : (totalBalance > 0 ? "success" : totalBalance < 0 ? "destructive" : "default")
          }
          history={historyData.balance}
          valuesByCurrency={Object.keys(balancesByCurrency).length > 1 ?
            Object.fromEntries(Object.entries(balancesByCurrency).map(([curr, data]) => [curr, data.totalBalance])) :
            undefined
          }
          className={showDiffWarning ? "border-yellow-500/50 bg-yellow-50/10" : undefined}
          action={
            !isZenMoneyConnected && (
              <BalanceAdjustmentDialog
                currentBalance={totalBalance}
                onAdjustmentComplete={loadData}
              />
            )
          }
        />
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 sm:gap-3">
        <Button
          className="flex-1 h-auto py-2.5 sm:py-3 text-sm bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
          onClick={() => {
            setIncomeDialogOpen(true);
          }}
        >
          <Plus className="h-5 w-5 mr-1 sm:mr-2 transition-transform duration-300 hover:rotate-90" strokeWidth={2.5} />
          <span className="hidden xs:inline">Добавить </span>Доход
        </Button>
        <Button
          className="flex-1 h-auto py-2.5 sm:py-3 text-sm bg-gradient-to-r from-destructive to-destructive/80 hover:from-destructive/90 hover:to-destructive/70 text-destructive-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
          onClick={() => {
            setExpenseDialogOpen(true);
          }}
        >
          <Plus className="h-5 w-5 mr-1 sm:mr-2 transition-transform duration-300 hover:rotate-90" strokeWidth={2.5} />
          <span className="hidden xs:inline">Добавить </span>Расход
        </Button>
      </div>

      {/* Tabs Navigation */}
      <Tabs defaultValue="overview" className="space-y-3 sm:space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="overview" className="gap-1 sm:gap-2 py-2 text-xs sm:text-sm">
            <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Обзор</span>
          </TabsTrigger>
          <TabsTrigger value="sources" className="gap-1 sm:gap-2 py-2 text-xs sm:text-sm">
            <Wallet className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Источники</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="gap-1 sm:gap-2 py-2 text-xs sm:text-sm">
            <FolderOpen className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Категории</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <section className="space-y-1.5 sm:space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-bold flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <span>Источники дохода</span>
              </h2>
            </div>
            {incomeSources.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-2.5">
                {incomeSources
                  .filter(source => source.name !== "Корректировка баланса")
                  .map(source => {
                    const summary = sourceSummaries.find(s => s.sourceId === source.id);
                    return summary ? <IncomeSourceCard key={source.id} source={source} summary={summary} /> : null;
                  })}
              </div>
            ) : (
              <EmptyState
                icon={Wallet}
                title="Нет источников дохода"
                description="Добавьте источник дохода, чтобы начать отслеживать финансы"
                action={{
                  label: "Добавить источник",
                  onClick: () => navigate('/incomes'),
                  icon: Plus
                }}
              />
            )}
          </section>

          <section className="space-y-2 sm:space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                <span>Категории расходов</span>
                <span className="text-xs sm:text-sm text-muted-foreground font-normal">
                  ({categories.length})
                </span>
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Фильтр */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={categoryFilter === "all" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setCategoryFilter("all")}
                  >
                    Все
                  </Button>
                  <Button
                    variant={categoryFilter === "attention" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setCategoryFilter("attention")}
                  >
                    Внимание
                  </Button>
                  <Button
                    variant={categoryFilter === "exceeded" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setCategoryFilter("exceeded")}
                  >
                    Превышены
                  </Button>
                </div>

                {/* Переключатель вида */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={compactView ? "ghost" : "default"}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setCompactView(false)}
                    title="Детальный вид"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={compactView ? "default" : "ghost"}
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setCompactView(true)}
                    title="Компактный вид"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>

                {/* Сортировка */}
                <Select value={categorySortBy} onValueChange={(value: "name" | "spent" | "remaining") => setCategorySortBy(value)}>
                  <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs">
                    <ArrowUpDown className="h-3 w-3 mr-1" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Имя</SelectItem>
                    <SelectItem value="spent">Траты</SelectItem>
                    <SelectItem value="remaining">Остаток</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {categories.length > 0 ? (
              <div className={cn(
                "grid gap-2 sm:gap-3",
                compactView ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              )}>
                {[...categories]
                  .filter(category => {
                    // Hide "Корректировка баланса" category
                    if (category.name === "Корректировка баланса") return false;
                    
                    const budget = categoryBudgets.find(b => b.categoryId === category.id);
                    if (!budget) return false;

                    const usedPercentage = budget.allocated > 0 ? (budget.spent / budget.allocated) * 100 : 0;
                    const isOverBudget = budget.spent > budget.allocated;

                    switch (categoryFilter) {
                      case "attention":
                        return usedPercentage > 70 && !isOverBudget;
                      case "exceeded":
                        return isOverBudget;
                      default:
                        return true;
                    }
                  })
                  .sort((a, b) => {
                    const budgetA = categoryBudgets.find(budget => budget.categoryId === a.id);
                    const budgetB = categoryBudgets.find(budget => budget.categoryId === b.id);
                    if (!budgetA || !budgetB) return 0;

                    switch (categorySortBy) {
                      case "name":
                        return a.name.localeCompare(b.name);
                      case "spent":
                        return budgetB.spent - budgetA.spent;
                      case "remaining":
                        return budgetB.remaining - budgetA.remaining;
                      default:
                        return 0;
                    }
                  })
                  .map(category => {
                    const budget = categoryBudgets.find(b => b.categoryId === category.id);
                    return budget ? (
                      <CategoryCard
                        key={category.id}
                        category={category}
                        budget={budget}
                        incomeSources={incomeSources}
                        showSources={false}
                        compact={compactView}
                      />
                    ) : null;
                  })}
              </div>
            ) : (
              <EmptyState
                icon={FolderOpen}
                title="Нет категорий расходов"
                description="Создайте категории, чтобы организовать свои расходы"
                action={{
                  label: "Создать категорию",
                  onClick: () => navigate('/categories'),
                  icon: Plus
                }}
              />
            )}
          </section>
        </TabsContent>

        {/* Sources Tab */}
        <TabsContent value="sources" className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between">

          </div>
          {incomeSources.length > 0 ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {incomeSources
              .filter(source => source.name !== "Корректировка баланса")
              .map(source => {
                const summary = sourceSummaries.find(s => s.sourceId === source.id);
                return summary ? <IncomeSourceCard key={source.id} source={source} summary={summary} /> : null;
              })}
          </div> : <p className="text-sm text-muted-foreground">Нет источников дохода</p>}
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
              <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span>Категории расходов</span>
              <span className="text-xs sm:text-sm text-muted-foreground font-normal">
                ({categories.length})
              </span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Фильтр */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={categoryFilter === "all" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setCategoryFilter("all")}
                >
                  Все
                </Button>
                <Button
                  variant={categoryFilter === "attention" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setCategoryFilter("attention")}
                >
                  Внимание
                </Button>
                <Button
                  variant={categoryFilter === "exceeded" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => setCategoryFilter("exceeded")}
                >
                  Превышены
                </Button>
              </div>

              {/* Переключатель вида */}
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                <Button
                  variant={compactView ? "ghost" : "default"}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCompactView(false)}
                  title="Детальный вид"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={compactView ? "default" : "ghost"}
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setCompactView(true)}
                  title="Компактный вид"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>

              {/* Сортировка */}
              <Select value={categorySortBy} onValueChange={(value: "name" | "spent" | "remaining") => setCategorySortBy(value)}>
                <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs">
                  <ArrowUpDown className="h-3 w-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Имя</SelectItem>
                  <SelectItem value="spent">Траты</SelectItem>
                  <SelectItem value="remaining">Остаток</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {categories.length > 0 ? (
            <div className={cn(
              "grid gap-2 sm:gap-3",
              compactView ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            )}>
              {[...categories]
                .filter(category => {
                  // Hide "Корректировка баланса" category
                  if (category.name === "Корректировка баланса") return false;
                  
                  const budget = categoryBudgets.find(b => b.categoryId === category.id);
                  if (!budget) return false;

                  // Check if category has multi-currency budgets
                  if (budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0) {
                    // Multi-currency: check each currency
                    let hasAttention = false;
                    let hasExceeded = false;

                    Object.values(budget.budgetsByCurrency).forEach(currencyBudget => {
                      // currencyBudget.allocated уже включает carryOver (базовый бюджет + перенос)
                      // Доступный бюджет = allocated - debt (долг уменьшает доступные средства)
                      const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
                      const currencyUsedPercentage = currencyAvailableBudget > 0 
                        ? (currencyBudget.spent / currencyAvailableBudget) * 100 
                        : 0;
                      const currencyIsOverBudget = currencyBudget.spent > currencyAvailableBudget;

                      if (currencyUsedPercentage > 70 && !currencyIsOverBudget) {
                        hasAttention = true;
                      }
                      if (currencyIsOverBudget) {
                        hasExceeded = true;
                      }
                    });

                    switch (categoryFilter) {
                      case "attention":
                        return hasAttention && !hasExceeded;
                      case "exceeded":
                        return hasExceeded;
                      default:
                        return true;
                    }
                  } else {
                    // Single currency: use standard logic
                    // budget.allocated уже включает carryOver, доступный бюджет = allocated - debt
                    const availableBudget = budget.allocated - (budget.debt || 0);
                    const usedPercentage = availableBudget > 0 ? (budget.spent / availableBudget) * 100 : 0;
                    const isOverBudget = budget.spent > availableBudget;

                    switch (categoryFilter) {
                      case "attention":
                        return usedPercentage > 70 && !isOverBudget;
                      case "exceeded":
                        return isOverBudget;
                      default:
                        return true;
                    }
                  }
                })
                .sort((a, b) => {
                  const budgetA = categoryBudgets.find(budget => budget.categoryId === a.id);
                  const budgetB = categoryBudgets.find(budget => budget.categoryId === b.id);
                  if (!budgetA || !budgetB) return 0;

                  switch (categorySortBy) {
                    case "name":
                      return a.name.localeCompare(b.name);
                    case "spent":
                      return budgetB.spent - budgetA.spent;
                    case "remaining":
                      return budgetB.remaining - budgetA.remaining;
                    default:
                      return 0;
                  }
                })
                .map(category => {
                  const budget = categoryBudgets.find(b => b.categoryId === category.id);
                  return budget ? (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      budget={budget}
                      incomeSources={incomeSources}
                      showSources={true}
                      compact={compactView}
                    />
                  ) : null;
                })}
            </div>
          ) : (
            <EmptyState
              icon={FolderOpen}
              title="Нет категорий расходов"
              description="Создайте категории для отслеживания расходов"
              action={{
                label: "Добавить категорию",
                onClick: () => navigate('/categories'),
                icon: Plus
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
    {/* </PullToRefresh> */}

    <IncomeDialog open={incomeDialogOpen} onOpenChange={setIncomeDialogOpen} incomeSources={incomeSources} onSave={handleAddIncome} onSourceCreated={loadData} />

    <ExpenseDialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen} categories={categories} onSave={handleAddExpense} />

    <AIChatDialog open={aiChatOpen} onOpenChange={setAiChatOpen} />

    {user && (
      <>
        <QuickGuide
          open={quickGuideOpen}
          onOpenChange={setQuickGuideOpen}
          onComplete={() => loadData()}
          userId={user.id}
        />

        <TelegramGuide
          open={telegramGuideOpen}
          onOpenChange={setTelegramGuideOpen}
          onConnectNow={() => navigate("/settings")}
        />
      </>
    )}
  </Layout>;
};
export default Dashboard;