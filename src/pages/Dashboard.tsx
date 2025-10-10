import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { TrendingUp, TrendingDown, PiggyBank, Plus, Wallet, FolderOpen, BarChart3, Bot, ArrowUpDown } from "lucide-react";
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
// import { PullToRefresh } from "@/components/PullToRefresh";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { IncomeSource, Category, SourceSummary, CategoryBudget } from "@/types/budget";
import { useNavigate } from "react-router-dom";
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
    formatAmount
  } = useCurrency();
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [quickGuideOpen, setQuickGuideOpen] = useState(false);
  const [telegramGuideOpen, setTelegramGuideOpen] = useState(false);
  const [carryOverBalance, setCarryOverBalance] = useState(0);
  const [categorySortBy, setCategorySortBy] = useState<"name" | "spent" | "remaining">("name");
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedDate]);

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

      // Calculate carry-over balance from all previous months
      const {
        data: previousIncomes
      } = await supabase.from('incomes').select('amount').lt('date', startOfMonth);
      const {
        data: previousExpenses
      } = await supabase.from('expenses').select('amount').lt('date', startOfMonth);
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
        const categoryAllocations = (allocationsData || []).filter(alloc => alloc.category_id === item.id).map(alloc => ({
          id: alloc.id,
          incomeSourceId: alloc.income_source_id,
          allocationType: alloc.allocation_type as 'amount' | 'percent',
          allocationValue: Number(alloc.allocation_value)
        }));
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

      // Load incomes for selected month
      const {
        data: incomesData,
        error: incomesError
      } = await supabase.from('incomes').select('*').gte('date', startOfMonth).lte('date', endOfMonth);
      if (incomesError) throw incomesError;
      setIncomes(incomesData || []);

      // Load expenses for selected month
      const {
        data: expensesData,
        error: expensesError
      } = await supabase.from('expenses').select('*').gte('date', startOfMonth).lte('date', endOfMonth);
      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleAddIncome = async (income: {
    sourceId: string;
    amount: number;
    date: string;
    description?: string;
  }) => {
    if (!user) return;
    const {
      error
    } = await supabase.from('incomes').insert({
      user_id: user.id,
      source_id: income.sourceId,
      amount: income.amount,
      date: income.date,
      description: income.description
    });
    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Доход добавлен",
        description: "Транзакция успешно записана"
      });
      loadData();
    }
  };
  const handleAddExpense = async (expense: {
    categoryId: string;
    amount: number;
    date: string;
    description?: string;
  }) => {
    if (!user) return;
    const {
      error
    } = await supabase.from('expenses').insert({
      user_id: user.id,
      category_id: expense.categoryId,
      amount: expense.amount,
      date: expense.date,
      description: expense.description
    });
    if (error) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Расход добавлен",
        description: "Транзакция успешно записана"
      });
      loadData();
    }
  };

  // Calculate source summaries
  const calculateSourceSummaries = (): SourceSummary[] => {
    return incomeSources.map(source => {
      const sourceIncomes = incomes.filter(inc => inc.source_id === source.id);
      const actualIncome = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);

      // Use actual income if exists, otherwise use expected amount
      const totalIncome = actualIncome > 0 ? actualIncome : source.amount || 0;

      // Calculate allocated amounts from this source to categories
      let totalAllocated = 0;
      categories.forEach(category => {
        if (category.allocations && category.allocations.length > 0) {
          // New multi-source allocation system
          category.allocations.forEach(alloc => {
            if (alloc.incomeSourceId === source.id) {
              if (alloc.allocationType === 'amount') {
                totalAllocated += alloc.allocationValue;
              } else if (alloc.allocationType === 'percent') {
                totalAllocated += totalIncome * alloc.allocationValue / 100;
              }
            }
          });
        } else {
          // Legacy support
          if (category.linkedSourceId === source.id) {
            if (category.allocationAmount) {
              totalAllocated += category.allocationAmount;
            } else if (category.allocationPercent) {
              totalAllocated += totalIncome * category.allocationPercent / 100;
            }
          }
        }
      });

      // Calculate expenses linked to this source (for totalSpent display)
      // Include both new allocation system and legacy linkedSourceId
      const linkedCategoryIds: string[] = [];
      
      categories.forEach(category => {
        // New allocation system
        if (category.allocations && category.allocations.length > 0) {
          const hasAllocationFromSource = category.allocations.some(
            alloc => alloc.incomeSourceId === source.id
          );
          if (hasAllocationFromSource) {
            linkedCategoryIds.push(category.id);
          }
        }
        // Legacy system
        else if (category.linkedSourceId === source.id) {
          linkedCategoryIds.push(category.id);
        }
      });
      
      const totalSpent = expenses
        .filter(exp => linkedCategoryIds.includes(exp.category_id))
        .reduce((sum, exp) => sum + Number(exp.amount), 0);
      
      // Remaining is based on allocated amounts, not spent
      const remaining = totalIncome - totalAllocated;
      const debt = remaining < 0 ? Math.abs(remaining) : 0;
      
      return {
        sourceId: source.id,
        totalIncome,
        totalSpent,
        remaining: remaining > 0 ? remaining : 0,
        debt
      };
    });
  };

  // Calculate category budgets
  const calculateCategoryBudgets = (): CategoryBudget[] => {
    return categories.map(category => {
      let allocated = 0;
      if (category.allocations && category.allocations.length > 0) {
        // New multi-source allocation system
        category.allocations.forEach(alloc => {
          if (alloc.allocationType === 'amount') {
            allocated += alloc.allocationValue;
          } else if (alloc.allocationType === 'percent') {
            // Use actual source income if present, else fall back to expected source amount
            const sourceIncomes = incomes.filter(inc => inc.source_id === alloc.incomeSourceId);
            const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
            const expectedSourceAmount = incomeSources.find(s => s.id === alloc.incomeSourceId)?.amount || 0;
            const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
            allocated += base * alloc.allocationValue / 100;
          }
        });
      } else {
        // Legacy support
        if (category.allocationAmount) {
          allocated = category.allocationAmount;
        } else if (category.linkedSourceId && category.allocationPercent) {
          const sourceIncomes = incomes.filter(inc => inc.source_id === category.linkedSourceId);
          const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
          const expectedSourceAmount = incomeSources.find(s => s.id === category.linkedSourceId)?.amount || 0;
          const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
          allocated = base * category.allocationPercent / 100;
        }
      }
      const spent = expenses.filter(exp => exp.category_id === category.id).reduce((sum, exp) => sum + Number(exp.amount), 0);
      return {
        categoryId: category.id,
        allocated,
        spent,
        remaining: allocated - spent
      };
    });
  };

  // Overall summary - balance only for current month
  const currentMonthIncome = incomes.reduce((sum, inc) => sum + Number(inc.amount), 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + Number(exp.amount), 0);
  const monthBalance = currentMonthIncome - totalExpenses;
  const totalBalance = currentMonthIncome + carryOverBalance - totalExpenses;
  const sourceSummaries = calculateSourceSummaries();
  const categoryBudgets = calculateCategoryBudgets();
  const monthName = format(selectedDate, "LLLL", { locale: ru });
  if (loading) {
    return <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Загрузка данных...</p>
        </div>
      </Layout>;
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
          />
          <SummaryCard 
            title="Общие расходы" 
            value={formatAmount(totalExpenses)} 
            subtitle={currentMonthIncome > 0 ? `${(totalExpenses / currentMonthIncome * 100).toFixed(0)}% от дохода` : undefined} 
            icon={TrendingDown} 
            variant="destructive" 
          />
          <SummaryCard 
            title="Общий баланс" 
            value={formatAmount(totalBalance)} 
            subtitle={carryOverBalance !== 0 ? `${formatAmount(monthBalance)} + ${formatAmount(carryOverBalance)} остаток` : `Только за ${monthName}`} 
            icon={PiggyBank} 
            variant={totalBalance > 0 ? "success" : totalBalance < 0 ? "destructive" : "default"} 
          />
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2 sm:gap-3">
          <Button 
            className="flex-1 h-auto py-2.5 sm:py-3 text-sm bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-success-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]" 
            onClick={() => setIncomeDialogOpen(true)}
          >
            <Plus className="h-5 w-5 mr-1 sm:mr-2 transition-transform duration-300 hover:rotate-90" strokeWidth={2.5} />
            <span className="hidden xs:inline">Добавить </span>Доход
          </Button>
          <Button 
            className="flex-1 h-auto py-2.5 sm:py-3 text-sm bg-gradient-to-r from-destructive to-destructive/80 hover:from-destructive/90 hover:to-destructive/70 text-destructive-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]" 
            onClick={() => setExpenseDialogOpen(true)}
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
              {incomeSources.length > 0 ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-2.5">
                  {incomeSources.map(source => {
                const summary = sourceSummaries.find(s => s.sourceId === source.id);
                return summary ? <IncomeSourceCard key={source.id} source={source} summary={summary} /> : null;
              })}
                </div> : <p className="text-xs sm:text-sm text-muted-foreground">Нет источников дохода</p>}
            </section>

            <section className="space-y-2 sm:space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold flex items-center gap-2">
                  <FolderOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <span>Категории расходов</span>
                </h2>
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-muted-foreground">
                    {categories.length}
                  </span>
                  <Select value={categorySortBy} onValueChange={(value: "name" | "spent" | "remaining") => setCategorySortBy(value)}>
                    <SelectTrigger className="w-[120px] sm:w-[140px] h-8 text-xs">
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
              {categories.length > 0 ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                  {[...categories].sort((a, b) => {
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
                  }).map(category => {
                const budget = categoryBudgets.find(b => b.categoryId === category.id);
                return budget ? <CategoryCard key={category.id} category={category} budget={budget} incomeSources={incomeSources} /> : null;
              })}
                </div> : <p className="text-sm text-muted-foreground">Нет категорий расходов</p>}
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold">Категории расходов</h2>
              <Select value={categorySortBy} onValueChange={(value: "name" | "spent" | "remaining") => setCategorySortBy(value)}>
                <SelectTrigger className="w-[160px]">
                  <ArrowUpDown className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">По названию</SelectItem>
                  <SelectItem value="spent">По потраченному</SelectItem>
                  <SelectItem value="remaining">По остатку</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {categories.length > 0 ? <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                {[...categories].sort((a, b) => {
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
                }).map(category => {
              const budget = categoryBudgets.find(b => b.categoryId === category.id);
              return budget ? <CategoryCard key={category.id} category={category} budget={budget} incomeSources={incomeSources} /> : null;
            })}
              </div> : <p className="text-sm text-muted-foreground">Нет категорий расходов</p>}
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