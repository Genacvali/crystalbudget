import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Wallet, FolderOpen, Link2, CheckCircle2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { handleNumericInput } from "@/lib/numberInput";

interface QuickGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  userId: string;
}

const CATEGORY_PRESETS = [
  { icon: "🏠", name: "Жилье" },
  { icon: "🍕", name: "Питание" },
  { icon: "🚗", name: "Транспорт" },
  { icon: "🎮", name: "Развлечения" },
  { icon: "👕", name: "Одежда" },
  { icon: "💊", name: "Здоровье" },
];

export function QuickGuide({ open, onOpenChange, onComplete, userId }: QuickGuideProps) {
  const [step, setStep] = useState(1);
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Income source data
  const [sourceName, setSourceName] = useState("");
  const [sourceFrequency, setSourceFrequency] = useState<string>("monthly");
  const [createdSourceId, setCreatedSourceId] = useState<string>("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeDate, setIncomeDate] = useState(new Date().toISOString().split('T')[0]);

  // Categories data
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(new Set());
  const [categoryAllocations, setCategoryAllocations] = useState<Record<number, { value: string; type: 'percent' | 'amount' }>>({});

  const totalSteps = 6;
  const progress = (step / totalSteps) * 100;

  const handleCreateSource = async () => {
    if (!sourceName.trim()) {
      toast({
        title: "Заполните поле",
        description: "Укажите название источника дохода",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('income_sources')
        .insert({
          user_id: userId,
          name: sourceName,
          frequency: sourceFrequency,
          color: '#10b981',
        })
        .select()
        .single();

      if (error) throw error;

      setCreatedSourceId(data.id);
      toast({
        title: "Источник создан!",
        description: `${sourceName} успешно добавлен`,
      });
      setStep(3);
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddIncome = async () => {
    if (!incomeAmount) {
      toast({
        title: "Укажите сумму",
        description: "Введите сумму полученного дохода",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('incomes')
        .insert({
          user_id: userId,
          source_id: createdSourceId,
          amount: Number(incomeAmount),
          date: incomeDate,
        });

      if (error) throw error;

      toast({
        title: "Доход добавлен!",
        description: `${incomeAmount} добавлено к источнику`,
      });
      setStep(4);
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleCategory = (index: number) => {
    const newSelected = new Set(selectedCategories);
    if (newSelected.has(index)) {
      newSelected.delete(index);
      const newAllocations = { ...categoryAllocations };
      delete newAllocations[index];
      setCategoryAllocations(newAllocations);
    } else {
      newSelected.add(index);
    }
    setSelectedCategories(newSelected);
  };

  const handleAllocationChange = (index: number, value: string, type: 'percent' | 'amount') => {
    setCategoryAllocations({
      ...categoryAllocations,
      [index]: { value, type },
    });
  };

  const handleCreateCategories = async () => {
    if (selectedCategories.size === 0) {
      toast({
        title: "Выберите категории",
        description: "Выберите хотя бы одну категорию",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Create categories
      const categoriesToCreate = Array.from(selectedCategories).map(index => ({
        user_id: userId,
        name: CATEGORY_PRESETS[index].name,
        icon: CATEGORY_PRESETS[index].icon,
      }));

      const { data: createdCategories, error: categoriesError } = await supabase
        .from('categories')
        .insert(categoriesToCreate)
        .select();

      if (categoriesError) throw categoriesError;

      toast({
        title: "Категории созданы!",
        description: `Создано ${selectedCategories.size} категорий`,
      });
      setStep(5);
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkCategories = async () => {
    const hasAllocations = Object.keys(categoryAllocations).length > 0;
    
    if (!hasAllocations) {
      toast({
        title: "Укажите распределение",
        description: "Задайте сумму или процент хотя бы для одной категории",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get created categories
      const { data: categories, error: fetchError } = await supabase
        .from('categories')
        .select('id, name')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(selectedCategories.size);

      if (fetchError) throw fetchError;

      // Create allocations
      const allocations = Array.from(selectedCategories)
        .filter(index => categoryAllocations[index])
        .map((index, i) => {
          const category = categories[i];
          const allocation = categoryAllocations[index];
          return {
            category_id: category.id,
            income_source_id: createdSourceId,
            allocation_type: allocation.type,
            allocation_value: Number(allocation.value),
          };
        });

      const { error: allocError } = await supabase
        .from('category_allocations')
        .insert(allocations);

      if (allocError) throw allocError;

      toast({
        title: "Связывание завершено!",
        description: "Категории успешно связаны с источником дохода",
      });
      setStep(6);
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Быстрый старт
          </DialogTitle>
          <DialogDescription>
            Шаг {step} из {totalSteps}
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="mb-4" />

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-lg mb-3">Добро пожаловать в CrystalBudget! 💎</h3>
              <div className="bg-muted/50 rounded-lg p-4 space-y-3 text-sm">
                <p className="text-muted-foreground">
                  CrystalBudget — это умный инструмент для управления личными финансами.
                </p>
                <div className="space-y-2">
                  <p className="font-medium">Основной функционал:</p>
                  <ul className="list-disc list-inside space-y-1 text-muted-foreground ml-2">
                    <li><span className="font-medium">Источники дохода</span> — создавайте источники и фиксируйте поступления денег</li>
                    <li><span className="font-medium">Категории расходов</span> — группируйте траты и контролируйте бюджет</li>
                    <li><span className="font-medium">Распределение бюджета</span> — привязывайте категории к источникам и задавайте лимиты</li>
                    <li><span className="font-medium">Отслеживание баланса</span> — смотрите остатки и переносите их между месяцами</li>
                    <li><span className="font-medium">Аналитика</span> — графики и отчеты по вашим финансам</li>
                    <li><span className="font-medium">Telegram бот</span> — добавляйте транзакции и сканируйте чеки прямо из мессенджера 🤖</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
                Пропустить
              </Button>
              <Button onClick={() => setStep(2)} className="flex-1">
                Начать настройку
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Wallet className="h-5 w-5" />
              <h3 className="font-semibold">Создайте первый источник дохода</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Источник дохода - это откуда вы получаете деньги (например, зарплата, фриланс, бизнес)
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="source-name">Название</Label>
                <Input
                  id="source-name"
                  placeholder="Например: Зарплата"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="source-frequency">Частота</Label>
                <Select value={sourceFrequency} onValueChange={setSourceFrequency}>
                  <SelectTrigger id="source-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Ежемесячно</SelectItem>
                    <SelectItem value="weekly">Еженедельно</SelectItem>
                    <SelectItem value="once">Разово</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Назад
              </Button>
              <Button onClick={handleCreateSource} disabled={loading} className="flex-1">
                Далее
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Plus className="h-5 w-5" />
              <h3 className="font-semibold">Добавьте доход в источник</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Укажите сколько денег вы получили из источника "{sourceName}"
            </p>
            <div className="space-y-3">
              <div>
                <Label htmlFor="income-amount">Сумма</Label>
                <Input
                  id="income-amount"
                  inputMode="decimal"
                  placeholder="50000"
                  value={incomeAmount}
                  onChange={(e) => handleNumericInput(e.target.value, setIncomeAmount)}
                />
              </div>
              <div>
                <Label htmlFor="income-date">Дата</Label>
                <Input
                  id="income-date"
                  type="date"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Назад
              </Button>
              <Button onClick={handleAddIncome} disabled={loading} className="flex-1">
                Далее
              </Button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary mb-2">
              <FolderOpen className="h-5 w-5" />
              <h3 className="font-semibold">Выберите категории расходов</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Категории помогут вам отслеживать на что вы тратите деньги
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_PRESETS.map((preset, index) => (
                <Button
                  key={index}
                  variant={selectedCategories.has(index) ? "default" : "outline"}
                  className="h-auto py-3 justify-start"
                  onClick={() => handleToggleCategory(index)}
                >
                  <span className="text-2xl mr-2">{preset.icon}</span>
                  <span>{preset.name}</span>
                </Button>
              ))}
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                Назад
              </Button>
              <Button onClick={handleCreateCategories} disabled={loading} className="flex-1">
                Далее
              </Button>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Link2 className="h-5 w-5" />
              <h3 className="font-semibold">Распределите бюджет</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Укажите процент или фиксированную сумму для каждой категории из "{sourceName}"
            </p>
            <div className="space-y-3 max-h-[300px] overflow-y-auto">
              {Array.from(selectedCategories).map(index => {
                const allocation = categoryAllocations[index];
                const allocationType = allocation?.type || 'percent';
                
                return (
                  <div key={index} className="space-y-2 p-3 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{CATEGORY_PRESETS[index].icon}</span>
                      <span className="flex-1 font-medium">{CATEGORY_PRESETS[index].name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={allocationType} 
                        onValueChange={(value: 'percent' | 'amount') => {
                          handleAllocationChange(index, allocation?.value || "", value);
                        }}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Процент</SelectItem>
                          <SelectItem value="amount">Сумма</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1 flex-1">
                        <Input
                          inputMode="decimal"
                          placeholder={allocationType === 'percent' ? "10" : "5000"}
                          value={allocation?.value || ""}
                          onChange={(e) => handleNumericInput(e.target.value, (val) => handleAllocationChange(index, val, allocationType))}
                          className="text-right"
                          min="0"
                          max={allocationType === 'percent' ? "100" : undefined}
                        />
                        <span className="text-muted-foreground w-8">
                          {allocationType === 'percent' ? '%' : '₽'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 pt-4">
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
                Назад
              </Button>
              <Button onClick={handleLinkCategories} disabled={loading} className="flex-1">
                Далее
              </Button>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4 text-center py-6">
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-success" />
            </div>
            <h3 className="text-2xl font-bold">Готово!</h3>
            <p className="text-muted-foreground">
              Вы успешно создали свой первый источник дохода и категории расходов.
              Теперь вы можете начать отслеживать свой бюджет!
            </p>
            <div className="bg-muted/50 rounded-lg p-4 mt-4 space-y-2 text-sm text-left">
              <p className="font-semibold">Что дальше?</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Добавляйте доходы и расходы через кнопки на главной странице</li>
                <li>Создавайте дополнительные источники дохода и категории</li>
                <li>Подключите Telegram бот для быстрого добавления транзакций 🤖</li>
                <li>Отслеживайте свой баланс и статистику</li>
              </ul>
            </div>
            <Button onClick={handleComplete} className="w-full mt-6">
              Начать пользоваться
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
