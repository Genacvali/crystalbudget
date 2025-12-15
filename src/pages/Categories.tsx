import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCard } from "@/components/CategoryCard";
import { CategoryDialog } from "@/components/CategoryDialog";
import { Category, IncomeSource, CategoryBudget, CategoryAllocation } from "@/types/budget";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/hooks/useFamily";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
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

const Categories = () => {
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
  const { user } = useAuth();
  const { currency: userCurrency } = useCurrency();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>();
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<Array<{ category_id: string | null; amount: number; currency?: string }>>([]);
  const [incomes, setIncomes] = useState<Array<{ source_id: string; amount: number; currency?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"name" | "spent" | "remaining">("name");
  const [categoryDebts, setCategoryDebts] = useState<Record<string, Record<string, number>>>({});
  const [categoryCarryOvers, setCategoryCarryOvers] = useState<Record<string, Record<string, number>>>({});

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

  const loadData = async () => {
    if (!user) return;

    try {
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

      // Load income sources (effective user scope)
      const { data: sourcesData, error: sourcesError } = await supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', effectiveUserId);

      if (sourcesError) throw sourcesError;

      // Calculate actual amounts from incomes for current month (family scope)
      const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59).toISOString();

      const { data: incomesData, error: incomesError } = await supabase
        .from('incomes')
        .select('source_id, amount, currency')
        .in('user_id', familyUserIds)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      if (incomesError) throw incomesError;
      setIncomes(incomesData || []);

      // Calculate total income per source
      const sourceAmounts = (incomesData || []).reduce((acc, income) => {
        const sourceId = income.source_id;
        if (!sourceId) return acc;
        acc[sourceId] = (acc[sourceId] || 0) + Number(income.amount);
        return acc;
      }, {} as Record<string, number>);

      // Create sources with expected amounts (for carry-over calculation)
      const sourcesWithExpectedAmounts: IncomeSource[] = (sourcesData || []).map(item => ({
        id: item.id,
        name: item.name,
        color: item.color,
        amount: item.amount ? Number(item.amount) : undefined,
        frequency: item.frequency || undefined,
        receivedDate: item.received_date || undefined,
      }));

      // Create sources with actual amounts from current month (for display)
      const mappedSources: IncomeSource[] = (sourcesData || []).map(item => ({
        id: item.id,
        name: item.name,
        color: item.color,
        amount: sourceAmounts[item.id] || (item.amount ? Number(item.amount) : undefined),
        frequency: item.frequency || undefined,
        receivedDate: item.received_date || undefined,
      }));

      console.log('Loaded income sources with amounts:', mappedSources);
      setIncomeSources(mappedSources);

      // Load categories (effective user scope)
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false });

      if (categoriesError) throw categoriesError;

      // Load category allocations
      const { data: allocationsData, error: allocationsError } = await supabase
        .from('category_allocations')
        .select('*');

      if (allocationsError) throw allocationsError;

      // Load expenses for current month (family scope, include currency)
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('category_id, amount, currency')
        .in('user_id', familyUserIds)
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);

      const mappedCategories: Category[] = (categoriesData || []).map(item => {
        const categoryAllocations = (allocationsData || [])
          .filter(alloc => alloc.category_id === item.id)
          .map(alloc => ({
            id: alloc.id,
            incomeSourceId: alloc.income_source_id,
            allocationType: alloc.allocation_type as 'amount' | 'percent',
            allocationValue: Number(alloc.allocation_value),
            currency: alloc.currency || 'RUB'
          }));

        return {
          id: item.id,
          name: item.name,
          icon: item.icon,
          allocations: categoryAllocations,
          linkedSourceId: item.linked_source_id || undefined,
          allocationAmount: item.allocation_amount ? Number(item.allocation_amount) : undefined,
          allocationPercent: item.allocation_percent ? Number(item.allocation_percent) : undefined,
        };
      });
      setCategories(mappedCategories);

      // Calculate category debts and carry-overs from previous month
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
                const expectedSourceAmount = sourcesWithExpectedAmounts.find(s => s.id === alloc.incomeSourceId)?.amount || 0;
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
              const expectedSourceAmount = sourcesWithExpectedAmounts.find(s => s.id === category.linkedSourceId)?.amount || 0;
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
      console.log('Categories page - Category debts from previous month:', debts);
      console.log('Categories page - Category carry-overs from previous month:', carryOvers);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка загрузки",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = () => {
    setSelectedCategory(undefined);
    setDialogOpen(true);
  };

  const handleEditCategory = (category: Category) => {
    setSelectedCategory(category);
    setDialogOpen(true);
  };

  const handleSaveCategory = async (categoryData: Omit<Category, "id"> & { id?: string }) => {
    if (!user) return;

    try {
      let categoryId = categoryData.id;

      if (categoryId) {
        // Update category
        const { error } = await supabase
          .from('categories')
          .update({
            name: categoryData.name,
            icon: categoryData.icon,
          })
          .eq('id', categoryId);

        if (error) throw error;

        // Delete existing allocations
        const { error: deleteError } = await supabase
          .from('category_allocations')
          .delete()
          .eq('category_id', categoryId);

        if (deleteError) throw deleteError;
      } else {
        // Create new category
        const { data: newCategory, error } = await supabase
          .from('categories')
          .insert({
            user_id: user.id,
            name: categoryData.name,
            icon: categoryData.icon,
          })
          .select()
          .single();

        if (error) throw error;
        categoryId = newCategory.id;
      }

      // Insert new allocations
      if (categoryData.allocations && categoryData.allocations.length > 0) {
        const { error: allocError } = await supabase
          .from('category_allocations')
          .insert(
            categoryData.allocations.map(alloc => ({
              category_id: categoryId,
              income_source_id: alloc.incomeSourceId,
              allocation_type: alloc.allocationType,
              allocation_value: alloc.allocationValue,
              currency: alloc.currency || 'RUB',
            }))
          );

        if (allocError) throw allocError;
      }

      toast({
        title: categoryData.id ? "Категория обновлена" : "Категория добавлена",
        description: categoryData.id ? "Изменения успешно сохранены" : "Новая категория создана",
      });

      await loadData();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (categoryId: string) => {
    setCategoryToDelete(categoryId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete || !user) return;

    setLoading(true);
    try {
      // First, get category data including zenmoney_id and linked_source_id
      const { data: categoryData } = await supabase
        .from('categories')
        .select('id, user_id, zenmoney_id, linked_source_id')
        .eq('id', categoryToDelete)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!categoryData) {
        toast({
          title: "Ошибка удаления",
          description: "Категория не найдена или у вас нет прав на её удаление",
          variant: "destructive",
        });
        setCategoryToDelete(null);
        setDeleteDialogOpen(false);
        setLoading(false);
        return;
      }

      // First, delete all category allocations (budget settings)
      const { error: allocError } = await supabase
        .from('category_allocations')
        .delete()
        .eq('category_id', categoryToDelete);

      if (allocError) {
        console.error('Error deleting allocations:', allocError);
        // Continue anyway - allocations might not exist
      }

      // Delete bank_category_mapping entries that reference this category
      // This table exists for ZenMoney integration and has a check constraint
      // that prevents cascade deletes. We need to delete these entries manually.
      try {
        // Try multiple possible field combinations to delete related mappings
        const deleteAttempts = [
          // Try by category_id field
          supabase.from('bank_category_mapping').delete().eq('category_id', categoryToDelete),
          // Try by income_source_id if category is linked to a source
          categoryData.linked_source_id ? supabase.from('bank_category_mapping').delete().eq('income_source_id', categoryData.linked_source_id) : null,
        ];

        // If category has zenmoney_id, also try deleting by that
        if (categoryData.zenmoney_id) {
          deleteAttempts.push(
            supabase.from('bank_category_mapping').delete().eq('bank_category_id', categoryData.zenmoney_id).eq('type', 'expense'),
            supabase.from('bank_category_mapping').delete().eq('zenmoney_id', categoryData.zenmoney_id).eq('type', 'expense'),
            supabase.from('bank_category_mapping').delete().eq('bank_id', categoryData.zenmoney_id).eq('type', 'expense')
          );
        }

        // Execute all delete attempts, ignoring errors for fields that don't exist
        for (const attempt of deleteAttempts.filter(Boolean)) {
          try {
            const { error } = await attempt;
            if (error && !error.message.includes('does not exist') && !error.message.includes('column') && !error.code?.includes('42703')) {
              console.error('Error deleting bank_category_mapping:', error);
            }
          } catch (e) {
            // Ignore individual errors
          }
        }
      } catch (e) {
        console.log('Error attempting to delete bank_category_mapping entries:', e);
        // Continue anyway - we'll try to delete the category and see what happens
      }

      // Also check if there are expenses linked to this category
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('id')
        .eq('category_id', categoryToDelete)
        .limit(1);

      if (expensesData && expensesData.length > 0) {
        // Ask user if they want to delete expenses too or just unlink them
        const shouldDeleteExpenses = confirm(
          'У этой категории есть связанные расходы. Удалить их вместе с категорией?\n\n' +
          'Нажмите "OK" чтобы удалить расходы, или "Отмена" чтобы отменить удаление категории.'
        );

        if (shouldDeleteExpenses) {
          // Delete all expenses for this category
          const { error: expensesError } = await supabase
            .from('expenses')
            .delete()
            .eq('category_id', categoryToDelete);

          if (expensesError) {
            throw new Error(`Не удалось удалить расходы: ${expensesError.message}`);
          }
        } else {
          // User cancelled - don't delete category
          setCategoryToDelete(null);
          setDeleteDialogOpen(false);
          setLoading(false);
          return;
        }
      }

      // Now delete the category
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryToDelete)
        .eq('user_id', user.id); // Add user_id check for safety

      if (error) {
        console.error('Delete error:', error);
        // Extract more detailed error information
        const errorDetails = (error as any).details || (error as any).hint || error.message;
        throw new Error(errorDetails || error.message || 'Неизвестная ошибка');
      }

      // Optimistically update UI without full reload
      setCategories(prev => prev.filter(c => c.id !== categoryToDelete));

      // Also remove from expenses if they were deleted
      if (expensesData && expensesData.length > 0) {
        setExpenses(prev => prev.filter(e => e.category_id !== categoryToDelete));
      }

      toast({
        title: "Категория удалена",
        description: "Категория и все связанные настройки бюджета успешно удалены",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка удаления",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setCategoryToDelete(null);
      setDeleteDialogOpen(false);
      setLoading(false);
    }
  };

  const getCategoryBudget = (category: Category): CategoryBudget => {
    // Group expenses by currency
    const expensesByCurrency: Record<string, number> = {};
    const categoryExpenses = expenses.filter(exp => exp.category_id === category.id);

    categoryExpenses.forEach(exp => {
      const expCurrency = exp.currency || userCurrency || 'RUB';
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
            (inc.currency || userCurrency || 'RUB') === currency
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
            (inc.currency || userCurrency || 'RUB') === currency
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
    // Always include budgetsByCurrency if there are any currencies
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
  };

  if (loading) {
    return (
      <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Загрузка категорий...</p>
        </div>
      </Layout>
    );
  }

  // Sort categories (excluding "Корректировка баланса")
  const sortedCategories = [...categories]
    .filter(category => category.name !== "Корректировка баланса")
    .sort((a, b) => {
    const budgetA = getCategoryBudget(a);
    const budgetB = getCategoryBudget(b);

    switch (sortBy) {
      case "name":
        return a.name.localeCompare(b.name);
      case "spent":
        return budgetB.spent - budgetA.spent;
      case "remaining":
        return budgetB.remaining - budgetA.remaining;
      default:
        return 0;
    }
  });

  return (
    <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Категории расходов</h1>
            <p className="text-muted-foreground">Управление категориями и бюджетами</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={sortBy} onValueChange={(value: "name" | "spent" | "remaining") => setSortBy(value)}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Имя</SelectItem>
                <SelectItem value="spent">Траты</SelectItem>
                <SelectItem value="remaining">Остаток</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleAddCategory} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Добавить категорию
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {sortedCategories.map((category) => (
            <CategoryCard
              key={category.id}
              category={category}
              budget={getCategoryBudget(category)}
              incomeSources={incomeSources}
              onEdit={handleEditCategory}
              onDelete={handleDeleteClick}
              hideBudgetDetails={true}
            />
          ))}
        </div>

        {categories.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Нет категорий расходов. Добавьте первую категорию.
            </p>
          </div>
        )}
      </div>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={selectedCategory}
        incomeSources={incomeSources}
        onSave={handleSaveCategory}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Категория будет удалена навсегда.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Categories;
