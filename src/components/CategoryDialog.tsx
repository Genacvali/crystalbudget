import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Category, IncomeSource, CategoryAllocation } from "@/types/budget";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { handleNumericInput } from "@/lib/numberInput";

const categorySchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  icon: z.string().min(1, "Иконка обязательна"),
  allocations: z.array(z.object({
    incomeSourceId: z.string().min(1, "Выберите источник"),
    allocationType: z.enum(['amount', 'percent']),
    allocationValue: z.number().min(0)
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
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [allocations, setAllocations] = useState<CategoryAllocation[]>([]);

  useEffect(() => {
    if (category) {
      setName(category.name);
      setIcon(category.icon);
      setAllocations(category.allocations || []);
    } else {
      setName("");
      setIcon("📁");
      setAllocations([]);
    }
  }, [category, open]);

  const handleAddAllocation = () => {
    setAllocations([...allocations, {
      incomeSourceId: "",
      allocationType: "amount",
      allocationValue: 0
    }]);
  };

  const handleRemoveAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const handleAllocationChange = (index: number, field: keyof CategoryAllocation, value: any) => {
    const newAllocations = [...allocations];
    newAllocations[index] = { ...newAllocations[index], [field]: value };
    setAllocations(newAllocations);
  };

  const handleSave = () => {
    try {
      const validated = categorySchema.parse({
        name: name.trim(),
        icon: icon.trim(),
        allocations: allocations
          .filter(a => a.incomeSourceId) // Filter out empty source selections
          .map(a => ({
            incomeSourceId: a.incomeSourceId,
            allocationType: a.allocationType,
            allocationValue: typeof a.allocationValue === 'string' ? parseFloat(a.allocationValue) : a.allocationValue
          }))
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
