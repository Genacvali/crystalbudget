import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Category, IncomeSource, CategoryAllocation } from "@/types/budget";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { Plus, Trash2 } from "lucide-react";
import { handleNumericInput } from "@/lib/numberInput";
import { supabase } from "@/integrations/supabase/client";

const categorySchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  icon: z.string().min(1, "Иконка обязательна"),
  allocations: z.array(z.object({
    incomeSourceId: z.string().min(1, "Выберите источник"),
    allocationType: z.enum(['amount', 'percent']),
    allocationValue: z.number().min(0),
    currency: z.string().optional()
  })).min(1, "Добавьте хотя бы один источник")
});

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  incomeSources: IncomeSource[];
  onSave: (category: Omit<Category, "id"> & { id?: string }) => void;
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  incomeSources,
  onSave
}: CategoryDialogProps) {
  const { toast } = useToast();
  const { currency: userCurrency } = useCurrency();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [allocations, setAllocations] = useState<CategoryAllocation[]>([]);
  const [sourceCurrencies, setSourceCurrencies] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (category) {
      setName(category.name);
      setIcon(category.icon);
      // Ensure currency is set for each allocation
      setAllocations((category.allocations || []).map(alloc => ({
        ...alloc,
        currency: alloc.currency || userCurrency || 'RUB'
      })));
    } else {
      setName("");
      setIcon("📁");
      setAllocations([]);
    }
  }, [category, open, userCurrency]);

  const handleAddAllocation = () => {
    setAllocations([...allocations, {
      incomeSourceId: "",
      allocationType: "amount",
      allocationValue: 0,
      currency: userCurrency || 'RUB'
    }]);
  };

  const handleRemoveAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  // Load currencies for income sources
  useEffect(() => {
    const loadSourceCurrencies = async () => {
      if (incomeSources.length === 0) return;
      
      try {
        const { data: incomes, error } = await supabase
          .from('incomes')
          .select('source_id, currency')
          .in('source_id', incomeSources.map(s => s.id));

        if (error) {
          console.error('Error loading source currencies:', error);
          return;
        }

        // Group currencies by source_id
        const currenciesBySource: Record<string, Set<string>> = {};
        (incomes || []).forEach(income => {
          if (income.source_id && income.currency) {
            if (!currenciesBySource[income.source_id]) {
              currenciesBySource[income.source_id] = new Set();
            }
            currenciesBySource[income.source_id].add(income.currency);
          }
        });

        // Convert Sets to Arrays
        const result: Record<string, string[]> = {};
        Object.keys(currenciesBySource).forEach(sourceId => {
          result[sourceId] = Array.from(currenciesBySource[sourceId]);
        });

        setSourceCurrencies(result);
      } catch (error) {
        console.error('Error loading source currencies:', error);
      }
    };

    loadSourceCurrencies();
  }, [incomeSources]);

  const handleAllocationChange = (index: number, field: keyof CategoryAllocation, value: string | number) => {
    const newAllocations = [...allocations];
    newAllocations[index] = { ...newAllocations[index], [field]: value };
    
    // If source changed, update currency to match source's currencies
    if (field === 'incomeSourceId' && value) {
      const sourceId = value as string;
      const sourceCurrenciesList = sourceCurrencies[sourceId] || [];
      
      if (sourceCurrenciesList.length > 0) {
        // Use first currency from source, or keep current if it's in the list
        const currentCurrency = newAllocations[index].currency || userCurrency || 'RUB';
        if (sourceCurrenciesList.includes(currentCurrency)) {
          // Keep current currency if it's valid for this source
          newAllocations[index].currency = currentCurrency;
        } else {
          // Use first available currency from source
          newAllocations[index].currency = sourceCurrenciesList[0];
        }
      } else {
        // No incomes for this source yet, use user default
        newAllocations[index].currency = userCurrency || 'RUB';
      }
    }
    
    // Ensure currency is preserved when changing other fields
    if (field !== 'currency' && field !== 'incomeSourceId' && !newAllocations[index].currency) {
      newAllocations[index].currency = userCurrency || 'RUB';
    }
    
    setAllocations(newAllocations);
  };

  const handleSave = () => {
    try {
      // Log allocations before validation
      console.log('Allocations before save:', allocations);
      
      const allocationsToSave = allocations
        .filter(a => a.incomeSourceId) // Filter out empty source selections
        .map(a => {
          // Ensure currency is always set
          const currency = a.currency || userCurrency || 'RUB';
          console.log(`Allocation: ${a.incomeSourceId}, currency: ${a.currency}, final: ${currency}`);
          return {
            incomeSourceId: a.incomeSourceId,
            allocationType: a.allocationType,
            allocationValue: typeof a.allocationValue === 'string' ? parseFloat(a.allocationValue) : a.allocationValue,
            currency: currency
          };
        });
      
      console.log('Allocations to save:', allocationsToSave);
      
      const validated = categorySchema.parse({
        name: name.trim(),
        icon: icon.trim(),
        allocations: allocationsToSave
      });

      onSave({
        id: category?.id,
        name: validated.name,
        icon: validated.icon,
        allocations: validated.allocations as CategoryAllocation[]
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive"
        });
      }
    }
  };

  const commonIcons = ["💰", "💵", "💳", "🏦", "📊", "💸", "🤑", "💲", "🛒", "🍔", "☕", "🏠", "🚗", "⚡", "💊", "📚", "🎓", "👕", "🎬", "🎮", "✈️", "🎁", "📱", "💻"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {category ? "Редактировать категорию" : "Добавить категорию"}
          </DialogTitle>
          <DialogDescription>
            {category ? "Измените данные категории расходов" : "Создайте новую категорию расходов"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Название</Label>
            <Input 
              id="name" 
              placeholder="Продукты, Транспорт..." 
              value={name} 
              onChange={e => setName(e.target.value)} 
            />
          </div>
          
          <div className="grid gap-2">
            <Label>Иконка</Label>
            <div className="flex flex-wrap gap-2 justify-center">
              {commonIcons.map(emoji => (
                <Button
                  key={emoji}
                  type="button"
                  variant={icon === emoji ? "default" : "outline"}
                  className="text-2xl h-12 w-12 p-0"
                  onClick={() => setIcon(emoji)}
                >
                  {emoji}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>Источники и распределение</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddAllocation}
              >
                <Plus className="h-4 w-4 mr-1" />
                Добавить
              </Button>
            </div>
            
            {allocations.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Нет источников. Добавьте источник дохода для распределения бюджета.
              </p>
            )}

            {allocations.map((allocation, index) => (
              <div key={index} className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Источник {index + 1}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveAllocation(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <Select
                  value={allocation.incomeSourceId}
                  onValueChange={(value) => handleAllocationChange(index, 'incomeSourceId', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите источник" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {incomeSources.map(source => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="grid grid-cols-2 gap-2">
                  <Select
                    value={allocation.allocationType}
                    onValueChange={(v) => handleAllocationChange(index, 'allocationType', v as 'amount' | 'percent')}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="amount">Сумма</SelectItem>
                      <SelectItem value="percent">Процент</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    inputMode="decimal"
                    placeholder={allocation.allocationType === 'amount' ? '5000' : '30'}
                    value={allocation.allocationValue || ''}
                    onChange={(e) => handleNumericInput(e.target.value, (val) => handleAllocationChange(index, 'allocationValue', val))}
                    min="0"
                    max={allocation.allocationType === 'percent' ? "100" : undefined}
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label className="text-xs">Валюта</Label>
                  <Select
                    value={allocation.currency || userCurrency || 'RUB'}
                    onValueChange={(v) => handleAllocationChange(index, 'currency', v)}
                    disabled={!allocation.incomeSourceId}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {(() => {
                        const sourceId = allocation.incomeSourceId;
                        const availableCurrencies = sourceId && sourceCurrencies[sourceId] 
                          ? sourceCurrencies[sourceId] 
                          : [];
                        
                        const currencySymbols: Record<string, string> = {
                          RUB: '₽', USD: '$', EUR: '€', GBP: '£',
                          JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                        };
                        
                        // If source has currencies, show only those
                        if (availableCurrencies.length > 0) {
                          return availableCurrencies.map(curr => (
                            <SelectItem key={curr} value={curr}>
                              {currencySymbols[curr] || curr} {curr}
                            </SelectItem>
                          ));
                        }
                        
                        // If no source selected or no currencies found, show user default only
                        const defaultCurrency = userCurrency || 'RUB';
                        return (
                          <SelectItem value={defaultCurrency}>
                            {currencySymbols[defaultCurrency] || defaultCurrency} {defaultCurrency}
                          </SelectItem>
                        );
                      })()}
                    </SelectContent>
                  </Select>
                  {allocation.incomeSourceId && sourceCurrencies[allocation.incomeSourceId]?.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Для этого источника пока нет доходов. Добавьте доход, чтобы выбрать валюту.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            {category ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
