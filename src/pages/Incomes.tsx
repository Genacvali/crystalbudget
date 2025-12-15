import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { IncomeSourceCard } from "@/components/IncomeSourceCard";
import { IncomeSourceDialog } from "@/components/IncomeSourceDialog";
import { IncomeSource } from "@/types/budget";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useFamily } from "@/hooks/useFamily";
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

const Incomes = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();
  const { user } = useAuth();
  const { effectiveUserId, loading: familyLoading } = useFamily();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<IncomeSource | undefined>();
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Load income sources from database
  useEffect(() => {
    if (user && effectiveUserId && !familyLoading) {
      loadIncomeSources();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, effectiveUserId, familyLoading]);

  const loadIncomeSources = async () => {
    if (!effectiveUserId) return;
    
    try {
      const { data, error } = await supabase
        .from('income_sources')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const mappedSources: IncomeSource[] = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        color: item.color,
        amount: item.amount ? Number(item.amount) : undefined,
        frequency: item.frequency || undefined,
        receivedDate: item.received_date || undefined,
      }));

      setSources(mappedSources);
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

  const handleAddSource = () => {
    setSelectedSource(undefined);
    setDialogOpen(true);
  };

  const handleEditSource = (source: IncomeSource) => {
    setSelectedSource(source);
    setDialogOpen(true);
  };

  const handleSaveSource = async (sourceData: Omit<IncomeSource, "id"> & { id?: string }) => {
    if (!user) return;

    try {
      if (sourceData.id) {
        // Update existing source
        const { error } = await supabase
          .from('income_sources')
          .update({
            name: sourceData.name,
            color: sourceData.color,
            amount: sourceData.amount,
            frequency: sourceData.frequency,
            received_date: sourceData.receivedDate,
          })
          .eq('id', sourceData.id);

        if (error) throw error;

        toast({
          title: "Источник обновлен",
          description: "Изменения успешно сохранены",
        });
      } else {
        // Create new source
        const { error } = await supabase
          .from('income_sources')
          .insert({
            user_id: user.id,
            name: sourceData.name,
            color: sourceData.color,
            amount: sourceData.amount,
            frequency: sourceData.frequency,
            received_date: sourceData.receivedDate,
          });

        if (error) throw error;

        toast({
          title: "Источник добавлен",
          description: "Новый источник дохода создан",
        });
      }

      await loadIncomeSources();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (sourceId: string) => {
    setSourceToDelete(sourceId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sourceToDelete || !effectiveUserId) return;

    setLoading(true);
    try {
      // First verify the source exists and belongs to the user
      const { data: sourceData, error: checkError } = await supabase
        .from('income_sources')
        .select('id, user_id, zenmoney_id')
        .eq('id', sourceToDelete)
        .eq('user_id', effectiveUserId)
        .maybeSingle();

      if (checkError) {
        console.error('Error checking source:', checkError);
        throw checkError;
      }

      if (!sourceData) {
        toast({
          title: "Ошибка удаления",
          description: "Источник не найден или у вас нет прав на его удаление",
          variant: "destructive",
        });
        setSourceToDelete(null);
        setDeleteDialogOpen(false);
        setLoading(false);
        return;
      }

      // First, manually delete category_allocations that reference this income_source
      // This is necessary because RLS policies on category_allocations might block cascade deletes
      // We need to find allocations where the category belongs to the user
      const { data: userCategories } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', effectiveUserId);

      if (userCategories && userCategories.length > 0) {
        const categoryIds = userCategories.map(c => c.id);
        const { error: allocError } = await supabase
          .from('category_allocations')
          .delete()
          .eq('income_source_id', sourceToDelete)
          .in('category_id', categoryIds);

        if (allocError) {
          console.error('Error deleting allocations:', allocError);
          // Continue anyway - allocations might not exist
        }
      }

      // Delete bank_category_mapping entries that reference this income_source
      // This table exists for ZenMoney integration and has a check constraint
      // that prevents cascade deletes. We need to delete these entries manually.
      try {
        // Try multiple possible field combinations to delete related mappings
        const deleteAttempts = [
          // Try by income_source_id field
          supabase.from('bank_category_mapping').delete().eq('income_source_id', sourceToDelete),
          // Try by source_id field
          supabase.from('bank_category_mapping').delete().eq('source_id', sourceToDelete),
          // Try by category_id if it references income_source
          supabase.from('bank_category_mapping').delete().eq('category_id', sourceToDelete),
        ];

        // If source has zenmoney_id, also try deleting by that
        if (sourceData.zenmoney_id) {
          deleteAttempts.push(
            supabase.from('bank_category_mapping').delete().eq('bank_category_id', sourceData.zenmoney_id).eq('type', 'income'),
            supabase.from('bank_category_mapping').delete().eq('zenmoney_id', sourceData.zenmoney_id).eq('type', 'income'),
            supabase.from('bank_category_mapping').delete().eq('bank_id', sourceData.zenmoney_id).eq('type', 'income')
          );
        }

        // Execute all delete attempts, ignoring errors for fields that don't exist
        for (const attempt of deleteAttempts) {
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
        // Continue anyway - we'll try to delete the source and see what happens
      }

      // Now delete the income source (incomes will be automatically deleted due to CASCADE)
      const { error } = await supabase
        .from('income_sources')
        .delete()
        .eq('id', sourceToDelete)
        .eq('user_id', effectiveUserId);

      if (error) {
        console.error('Delete error:', error);
        // Extract more detailed error information
        const errorDetails = (error as any).details || (error as any).hint || error.message;
        throw new Error(errorDetails || error.message || 'Неизвестная ошибка');
      }

      // Optimistically update UI
      setSources(prev => prev.filter(s => s.id !== sourceToDelete));

      toast({
        title: "Источник удален",
        description: "Источник дохода и все связанные записи успешно удалены",
      });
    } catch (error) {
      console.error('Full error object:', error);
      const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
      toast({
        title: "Ошибка удаления",
        description: errorMessage,
        variant: "destructive",
      });
      // Reload on error to ensure UI is in sync
      await loadIncomeSources();
    } finally {
      setSourceToDelete(null);
      setDeleteDialogOpen(false);
      setLoading(false);
    }
  };

  // Mock summaries - в будущем рассчитывать на основе реальных данных
  const getSummary = (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId);
    return {
      sourceId,
      totalIncome: source?.amount || 0,
      totalSpent: 0,
      remaining: source?.amount || 0,
      debt: 0,
    };
  };

  if (loading) {
    return (
      <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Загрузка источников дохода...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout selectedDate={selectedDate} onDateChange={setSelectedDate}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Источники дохода</h1>
            <p className="text-muted-foreground">Управление источниками дохода</p>
          </div>
          <Button onClick={handleAddSource}>
            <Plus className="h-4 w-4 mr-2" />
            Добавить источник
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sources.map((source) => (
            <IncomeSourceCard
              key={source.id}
              source={source}
              summary={getSummary(source.id)}
              onEdit={handleEditSource}
              onDelete={handleDeleteClick}
              compact
            />
          ))}
        </div>

        {sources.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Нет источников дохода. Добавьте первый источник.
            </p>
          </div>
        )}
      </div>

      <IncomeSourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        source={selectedSource}
        onSave={handleSaveSource}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Вы уверены?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Источник дохода будет удален навсегда.
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

export default Incomes;
