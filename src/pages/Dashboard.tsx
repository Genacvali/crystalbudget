import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { TrendingUp, TrendingDown, PiggyBank, Plus, Wallet, FolderOpen, BarChart3, Bot, ArrowUpDown, LayoutGrid, List, Filter } from "lucide-react";
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
import { QuickGuide } from "@/components/QuickGuide";
import { TelegramGuide } from "@/components/TelegramGuide";
import { DashboardSkeleton } from "@/components/DashboardSkeleton";
import { EmptyState } from "@/components/EmptyState";
// import { PullToRefresh } from "@/components/PullToRefresh";
import { useAuth } from "@/hooks/useAuth";
import { useNotifications } from "@/hooks/useNotifications";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { IncomeSource, Category, SourceSummary, CategoryBudget } from "@/types/budget";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
const Dashboard = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
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
  const [incomes, setIncomes] = useState<Array<{ id: string; source_id: string; amount: number; date: string; description?: string }>>([]);
  const [expenses, setExpenses] = useState<Array<{ id: string; category_id: string; amount: number; date: string; description?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [telegramGuideOpen, setTelegramGuideOpen] = useState(false);
  const [carryOverBalance, setCarryOverBalance] = useState(0);
  const [categoryDebts, setCategoryDebts] = useState<Record<string, number>>({});
  const [categoryCarryOvers, setCategoryCarryOvers] = useState<Record<string, number>>({});
  const [categorySortBy, setCategorySortBy] = useState<"name" | "spent" | "remaining">("name");
  const [compactView, setCompactView] = useState(() => {
    const saved = localStorage.getItem('dashboard_compact_view');
    return saved ? JSON.parse(saved) : false;
  });
  const [categoryFilter, setCategoryFilter] = useState<"all" | "attention" | "exceeded">("all");
  useEffect(() => {
    if (user) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedDate]);

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
      const { data: family } = await supabase
        .from('families')
        .select('id')
        .eq('owner_id', user!.id)
        .maybeSingle();
      
      if (family?.id) {
        const { data: members } = await supabase
          .from('family_members')
          .select('user_id')
          .eq('family_id', family.id);
        
        if (members && members.length > 0) {
          familyUserIds = [user!.id, ...members.map(m => m.user_id)];
        }
      }

      // Calculate carry-over balance from all previous months (family scope)
      const {
        data: previousIncomes
      } = await supabase.from('incomes').select('amount').in('user_id', familyUserIds).lt('date', startOfMonth);
      const {
        data: previousExpenses
      } = await supabase.from('expenses').select('amount').in('user_id', familyUserIds).lt('date', startOfMonth);
      const previousTotalIncome = (previousIncomes || []).reduce((sum, inc) => sum + Number(inc.amount), 0);
      const previousTotalExpenses = (previousExpenses || []).reduce((sum, exp) => sum + Number(exp.amount), 0);
      const calculatedCarryOver = previousTotalIncome - previousTotalExpenses;
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
          const currency = alloc.currency || 'RUB';
          // Debug: log currency for categories with multiple currencies
          if (item.name === 'Красота' || item.name === 'просто так') {
            console.log(`Category ${item.name} allocation: currency=${currency}, value=${alloc.allocation_value}`);
          }
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
      setIncomes(incomesData || []);

      // Load expenses for selected month (family scope)
      const {
        data: expensesData,
        error: expensesError
      } = await supabase.from('expenses').select('*').in('user_id', familyUserIds).gte('date', startOfMonth).lte('date', endOfMonth);
      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);

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

      // Calculate debts and carry-overs for each category from previous month
      const debts: Record<string, number> = {};
      const carryOvers: Record<string, number> = {};
      console.log('Previous month range:', previousMonthStart, '-', previousMonthEnd);
      console.log('Previous incomes:', previousIncomesData?.length);
      console.log('Previous expenses:', previousExpensesData?.length);
      
      mappedCategories.forEach(category => {
        let allocated = 0;
        
        if (category.allocations && category.allocations.length > 0) {
          category.allocations.forEach(alloc => {
            if (alloc.allocationType === 'amount') {
              allocated += alloc.allocationValue;
            } else if (alloc.allocationType === 'percent') {
              const sourceIncomes = (previousIncomesData || []).filter(inc => inc.source_id === alloc.incomeSourceId);
              const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
              const expectedSourceAmount = mappedSources.find(s => s.id === alloc.incomeSourceId)?.amount || 0;
              const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
              allocated += base * alloc.allocationValue / 100;
              console.log(`Category ${category.name}: actualSourceTotal=${actualSourceTotal}, expectedSourceAmount=${expectedSourceAmount}, base=${base}, percent=${alloc.allocationValue}, allocated+=${base * alloc.allocationValue / 100}`);
            }
          });
        } else {
          // Legacy support
          if (category.allocationAmount) {
            allocated = category.allocationAmount;
          } else if (category.linkedSourceId && category.allocationPercent) {
            const sourceIncomes = (previousIncomesData || []).filter(inc => inc.source_id === category.linkedSourceId);
            const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
            const expectedSourceAmount = mappedSources.find(s => s.id === category.linkedSourceId)?.amount || 0;
            const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
            allocated = base * category.allocationPercent / 100;
          }
        }

        const spent = (previousExpensesData || [])
          .filter(exp => exp.category_id === category.id)
          .reduce((sum, exp) => sum + Number(exp.amount), 0);

        const balance = allocated - spent;
        
        // If overspent, save the debt
        if (balance < 0) {
          debts[category.id] = Math.abs(balance);
          console.log(`Category ${category.name} has debt: spent=${spent}, allocated=${allocated}, debt=${Math.abs(balance)}`);
        } 
        // If under-spent, save the carry-over
        else if (balance > 0) {
          carryOvers[category.id] = balance;
          console.log(`Category ${category.name} has carry-over: spent=${spent}, allocated=${allocated}, carryOver=${balance}`);
        }
      });

      setCategoryDebts(debts);
      setCategoryCarryOvers(carryOvers);
      console.log('Category debts from previous month:', debts);
      console.log('Category carry-overs from previous month:', carryOvers);
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
        console.error('Failed to create notification:', notificationError);
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
        console.error('Failed to create notification:', notificationError);
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
              if (alloc.currency !== currency) return;
              
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
      
      return {
        sourceId: source.id,
        totalIncome: primarySummary.totalIncome,
        totalSpent: primarySummary.totalSpent,
        remaining: primarySummary.remaining,
        debt: primarySummary.debt,
        summariesByCurrency: Object.keys(summariesByCurrency).length > 1 ? summariesByCurrency : undefined
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
        const currencies = Object.keys(allocationsByCurrency);
        if (currencies.length > 1) {
          console.log(`Category ${category.name} has ${currencies.length} currencies:`, currencies);
        }
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
      const hasMultipleCurrencies = currenciesCount > 1;
      
      // Debug: log if category should show multiple currencies
      if (hasMultipleCurrencies) {
        console.log(`Category ${category.name} has ${currenciesCount} currencies in budgetsByCurrency:`, Object.keys(budgetsByCurrency));
      }
      
      return {
        categoryId: category.id,
        allocated: totalAllocated,
        spent: totalSpent,
        remaining: totalAllocated - totalSpent - totalDebt,
        debt: totalDebt,
        carryOver: totalCarryOver,
        budgetsByCurrency: hasMultipleCurrencies ? budgetsByCurrency : undefined
      };
    });
  };

  // OPTIMIZATION: Memoized calculations with multi-currency support
  const balancesByCurrency = useMemo(() => {
    const incomeByCurrency: Record<string, number> = {};
    const expenseByCurrency: Record<string, number> = {};
    
    incomes.forEach(inc => {
      const currency = inc.currency || userCurrency || 'RUB';
      incomeByCurrency[currency] = (incomeByCurrency[currency] || 0) + Number(inc.amount);
    });
    
    expenses.forEach(exp => {
      const currency = exp.currency || userCurrency || 'RUB';
      expenseByCurrency[currency] = (expenseByCurrency[currency] || 0) + Number(exp.amount);
    });
    
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
    
    allCurrencies.forEach(currency => {
      const income = incomeByCurrency[currency] || 0;
      const expense = expenseByCurrency[currency] || 0;
      const balance = income - expense;
      const totalBalance = balance + (carryOverBalance || 0); // Note: carryOverBalance is in primary currency
      
      result[currency] = { income, expense, balance, totalBalance };
    });
    
    return result;
  }, [incomes, expenses, userCurrency, carryOverBalance]);
  
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <SummaryCard 
            title={`Баланс за ${monthName}`} 
            value={formatAmount(monthBalance)} 
            subtitle={monthBalance > 0 ? "Профицит" : monthBalance < 0 ? "Дефицит" : "Ноль"} 
            icon={TrendingUp} 
            variant={monthBalance > 0 ? "success" : monthBalance < 0 ? "destructive" : "default"}
            valuesByCurrency={Object.keys(balancesByCurrency).length > 1 ? 
              Object.fromEntries(Object.entries(balancesByCurrency).map(([curr, data]) => [curr, data.balance])) : 
              undefined
            }
          />
          <SummaryCard 
            title="Общие расходы" 
            value={formatAmount(totalExpenses)} 
            subtitle={currentMonthIncome > 0 ? `${(totalExpenses / currentMonthIncome * 100).toFixed(0)}% от дохода` : undefined} 
            icon={TrendingDown} 
            variant="destructive"
            valuesByCurrency={Object.keys(balancesByCurrency).length > 1 ? 
              Object.fromEntries(Object.entries(balancesByCurrency).map(([curr, data]) => [curr, data.expense])) : 
              undefined
            }
          />
          <SummaryCard 
            title="Общий баланс" 
            value={formatAmount(totalBalance)} 
            subtitle={carryOverBalance !== 0 ? `${formatAmount(monthBalance)} ${carryOverBalance >= 0 ? '+' : '-'} ${formatAmount(Math.abs(carryOverBalance))} остаток` : `Только за ${monthName}`} 
            icon={PiggyBank} 
            variant={totalBalance > 0 ? "success" : totalBalance < 0 ? "destructive" : "default"}
            valuesByCurrency={Object.keys(balancesByCurrency).length > 1 ? 
              Object.fromEntries(Object.entries(balancesByCurrency).map(([curr, data]) => [curr, data.totalBalance])) : 
              undefined
            }
          />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 sm:gap-3">
          <Button 
            className="flex-1 h-auto py-2.5 sm:py-3 text-sm bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]" 
            onClick={() => {
              console.log('Income button clicked');
              setIncomeDialogOpen(true);
            }}
          >
            <Plus className="h-5 w-5 mr-1 sm:mr-2 transition-transform duration-300 hover:rotate-90" strokeWidth={2.5} />
            <span className="hidden xs:inline">Добавить </span>Доход
          </Button>
          <Button 
            className="flex-1 h-auto py-2.5 sm:py-3 text-sm bg-gradient-to-r from-destructive to-destructive/80 hover:from-destructive/90 hover:to-destructive/70 text-destructive-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]" 
            onClick={() => {
              console.log('Expense button clicked');
              setExpenseDialogOpen(true);
            }}
          >
            <Plus className="h-5 w-5 mr-1 sm:mr-2 transition-transform duration-300 hover:rotate-90" strokeWidth={2.5} />
            <span className="hidden xs:inline">Добавить </span>Расход
          </Button>
          <Button className="h-auto py-2.5 sm:py-3 text-sm px-3 sm:px-4 flex items-center gap-2" variant="secondary" onClick={() => setAiChatOpen(true)}>
            <Bot className="h-5 w-5" />
            <span className="hidden sm:inline font-medium">G.A.I.A.</span>
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
                  {incomeSources.map(source => {
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
                {incomeSources.map(source => {
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