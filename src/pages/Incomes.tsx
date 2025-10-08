import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { IncomeSourceCard } from "@/components/IncomeSourceCard";
import { IncomeSourceDialog } from "@/components/IncomeSourceDialog";
import { IncomeSource } from "@/types/budget";
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

const Incomes = () => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { toast } = useToast();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<IncomeSource | undefined>();
  const [sourceToDelete, setSourceToDelete] = useState<string | null>(null);
  const [sources, setSources] = useState<IncomeSource[]>([]);
  const [loading, setLoading] = useState(true);

  // Load income sources from database
  useEffect(() => {
    if (user) {
      loadIncomeSources();
    }
  }, [user]);

  const loadIncomeSources = async () => {
    try {
      const { data, error } = await supabase
        .from('income_sources')
        .select('*')
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
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (sourceId: string) => {
    setSourceToDelete(sourceId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sourceToDelete) return;

    try {
      const { error } = await supabase
        .from('income_sources')
        .delete()
        .eq('id', sourceToDelete);

      if (error) throw error;

      toast({
        title: "Источник удален",
        description: "Источник дохода успешно удален",
      });

      await loadIncomeSources();
    } catch (error: any) {
      toast({
        title: "Ошибка удаления",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSourceToDelete(null);
      setDeleteDialogOpen(false);
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
