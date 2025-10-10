import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus, ArrowUpDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryCard } from "@/components/CategoryCard";
import { CategoryDialog } from "@/components/CategoryDialog";
import { Category, IncomeSource, CategoryBudget } from "@/types/budget";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
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
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | undefined>();
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [expenses, setExpenses] = useState<Array<{ category_id: string; amount: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"name" | "spent" | "remaining">("name");

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedDate]);

  const loadData = async () => {
    try {
      // Load income sources
      const { data: sourcesData, error: sourcesError } = await supabase
        .from('income_sources')
        .select('*');
      
      if (sourcesError) throw sourcesError;

      // Calculate actual amounts from incomes for current month
      const startOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1).toISOString();
      const endOfMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0, 23, 59, 59).toISOString();
      
      const { data: incomesData, error: incomesError } = await supabase
        .from('incomes')
        .select('source_id, amount')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth);
      
      if (incomesError) throw incomesError;

      // Calculate total income per source
      const sourceAmounts = (incomesData || []).reduce((acc, income) => {
        const sourceId = income.source_id;
        if (!sourceId) return acc;
        acc[sourceId] = (acc[sourceId] || 0) + Number(income.amount);
        return acc;
      }, {} as Record<string, number>);

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

      // Load categories
      const { data: categoriesData, error: categoriesError } = await supabase
        .from('categories')
        .select('*')
        .order('created_at', { ascending: false });

      if (categoriesError) throw categoriesError;

      // Load category allocations
      const { data: allocationsData, error: allocationsError } = await supabase
        .from('category_allocations')
        .select('*');

      if (allocationsError) throw allocationsError;

      // Load expenses for current month
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select('category_id, amount')
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
            allocationValue: Number(alloc.allocation_value)
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
    } catch (error: any) {
      toast({
        title: "Ошибка загрузки",
        description: error.message,
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
            }))
          );

        if (allocError) throw allocError;
      }

      toast({
        title: categoryData.id ? "Категория обновлена" : "Категория добавлена",
        description: categoryData.id ? "Изменения успешно сохранены" : "Новая категория создана",
      });

      await loadData();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (categoryId: string) => {
    setCategoryToDelete(categoryId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;

    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', categoryToDelete);

      if (error) throw error;

      toast({
        title: "Категория удалена",
        description: "Категория успешно удалена",
      });

      await loadData();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCategoryToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const getCategoryBudget = (category: Category): CategoryBudget => {
    let allocated = 0;
    
    if (category.allocations && category.allocations.length > 0) {
      // Calculate total from all allocations
      category.allocations.forEach(alloc => {
        const source = incomeSources.find(s => s.id === alloc.incomeSourceId);
        
        if (alloc.allocationType === 'amount') {
          allocated += alloc.allocationValue;
        } else if (alloc.allocationType === 'percent' && source?.amount) {
          allocated += (source.amount * alloc.allocationValue) / 100;
        }
      });
    } else {
      // Legacy support
      if (category.allocationAmount) {
        allocated = category.allocationAmount;
      } else if (category.allocationPercent && category.linkedSourceId) {
        const source = incomeSources.find(s => s.id === category.linkedSourceId);
        if (source?.amount) {
          allocated = (source.amount * category.allocationPercent) / 100;
        }
      }
    }

    // Calculate spent amount from expenses
    const spent = expenses
      .filter(expense => expense.category_id === category.id)
      .reduce((sum, expense) => sum + Number(expense.amount), 0);

    return {
      categoryId: category.id,
      allocated,
      spent,
      remaining: allocated - spent,
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

  // Sort categories
  const sortedCategories = [...categories].sort((a, b) => {
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
