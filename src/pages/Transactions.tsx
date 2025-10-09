import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, ArrowUpRight, ArrowDownRight, Edit, ArrowUpDown, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
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
import type { Income, Expense, IncomeSource, Category } from "@/types/budget";

interface Transaction {
  id: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string;
  description?: string;
  sourceId?: string;
  categoryId?: string;
  userName?: string;
}

const Transactions = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();
  const { formatAmount } = useCurrency();
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

  useEffect(() => {
    fetchData();
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

    const [incomesRes, expensesRes, sourcesRes, categoriesRes, profilesRes] = await Promise.all([
      supabase.from("incomes").select("*").gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }),
      supabase.from("expenses").select("*").gte("date", startOfMonth).lte("date", endOfMonth).order("date", { ascending: false }),
      supabase.from("income_sources").select("*"),
      supabase.from("categories").select("*"),
      supabase.from("profiles").select("user_id, full_name"),
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
      };
    });

    // Combine both income and expense transactions
    setTransactions([...incomeTransactions, ...expenseTransactions]);
  };

  const handleAddIncome = async (income: { sourceId: string; amount: number; date: string; description?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingIncome) {
      const { error } = await supabase.from("incomes").update({
        source_id: income.sourceId,
        amount: income.amount,
        date: income.date,
        description: income.description,
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
      });

      if (error) {
        toast({ title: "Ошибка", description: "Не удалось добавить доход", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Доход добавлен" });
        fetchData();
      }
    }
  };

  const handleAddExpense = async (expense: { categoryId: string; amount: number; date: string; description?: string }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editingExpense) {
      const { error } = await supabase.from("expenses").update({
        category_id: expense.categoryId,
        amount: expense.amount,
        date: expense.date,
        description: expense.description,
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
      });

      if (error) {
        toast({ title: "Ошибка", description: "Не удалось добавить расход", variant: "destructive" });
      } else {
        toast({ title: "Успешно", description: "Расход добавлен" });
        fetchData();
      }
    }
  };

  const handleEditTransaction = (transaction: Transaction) => {
    if (transaction.type === "income") {
      setEditingIncome({
        id: transaction.id,
        sourceId: transaction.sourceId || "",
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
      });
      setIncomeDialogOpen(true);
    } else {
      setEditingExpense({
        id: transaction.id,
        categoryId: transaction.categoryId || "",
        amount: transaction.amount,
        date: transaction.date,
        description: transaction.description,
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

  return (
    <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold">Транзакции</h1>
            <p className="text-sm text-muted-foreground">История доходов и расходов</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              className="flex-1 sm:flex-none bg-gradient-to-r from-success to-success/80 hover:from-success/90 hover:to-success/70 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              onClick={() => { setEditingIncome(null); setIncomeDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Добавить </span>Доход
            </Button>
            <Button
              className="flex-1 sm:flex-none bg-gradient-to-r from-destructive to-destructive/80 hover:from-destructive/90 hover:to-destructive/70 text-destructive-foreground border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02]"
              onClick={() => { setEditingExpense(null); setExpenseDialogOpen(true); }}
            >
              <Plus className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Добавить </span>Расход
            </Button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
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
                  {incomeSources.map((source) => (
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

        <div className="space-y-2 sm:space-y-3">
          {sortedTransactions.length === 0 ? (
            <Card>
              <CardContent className="p-6 sm:p-8 text-center">
                <p className="text-sm sm:text-base text-muted-foreground">Нет транзакций за выбранный период</p>
              </CardContent>
            </Card>
          ) : (
            sortedTransactions.map((transaction) => (
              <Card key={transaction.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start sm:items-center gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${
                        transaction.type === "income" 
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
                            {format(new Date(transaction.date), "d MMM yyyy", { locale: ru })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4">
                      <p className={`text-lg sm:text-xl font-bold ${
                        transaction.type === "income"
                          ? "text-success"
                          : "text-destructive"
                      }`}>
                        {transaction.type === "income" ? "+" : "-"}
                        {formatAmount(transaction.amount)}
                      </p>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => handleEditTransaction(transaction)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingTransaction(transaction)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
    </Layout>
  );
};

export default Transactions;
