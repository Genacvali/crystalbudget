import { useState, useEffect } from "react";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { IncomeSource } from "@/types/budget";
import { IncomeSourceDialog } from "./IncomeSourceDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { handleNumericInput } from "@/lib/numberInput";

const incomeSchema = z.object({
  sourceId: z.string().min(1, "Выберите источник дохода"),
  amount: z.number().positive("Сумма должна быть положительной"),
  date: z.string().min(1, "Выберите дату"),
  description: z.string().optional(),
});

interface IncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incomeSources: IncomeSource[];
  onSave: (income: { sourceId: string; amount: number; date: string; description?: string }) => void;
  editingIncome?: { id: string; sourceId: string; amount: number; date: string; description?: string } | null;
  onSourceCreated?: () => void;
}

export function IncomeDialog({ open, onOpenChange, incomeSources, onSave, editingIncome, onSourceCreated }: IncomeDialogProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { convertToRubles, convertFromRubles } = useCurrency();
  const [sourceId, setSourceId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [description, setDescription] = useState("");
  const [showSourceDialog, setShowSourceDialog] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handleSourceSave = async (sourceData: Omit<IncomeSource, "id"> & { id?: string }) => {
    if (!user) return;

    const { error } = await supabase
      .from("income_sources")
      .insert({
        user_id: user.id,
        name: sourceData.name,
        frequency: sourceData.frequency,
        color: sourceData.color,
      });

    if (error) {
      toast({
        title: "Ошибка создания источника",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setShowSourceDialog(false);
      onSourceCreated?.();
      toast({
        title: "Источник создан",
        description: "Теперь выберите его из списка",
      });
    }
  };

  useEffect(() => {
    if (open && editingIncome) {
      setSourceId(editingIncome.sourceId);
      // Конвертируем сумму из рублей в текущую валюту для отображения
      const convertedAmount = convertFromRubles(editingIncome.amount);
      setAmount(convertedAmount.toString());
      setDate(new Date(editingIncome.date));
      setDescription(editingIncome.description || "");
    } else if (!open) {
      setSourceId("");
      setAmount("");
      setDate(new Date());
      setDescription("");
    }
  }, [open, editingIncome, convertFromRubles]);

  const handleSave = () => {
    try {
      const validated = incomeSchema.parse({
        sourceId,
        amount: parseFloat(amount),
        date: date?.toISOString(),
        description: description.trim() || undefined,
      });

      // Конвертируем сумму в рубли перед сохранением
      const amountInRubles = convertToRubles(validated.amount);

      onSave({
        sourceId: validated.sourceId,
        amount: amountInRubles,
        date: validated.date,
        description: validated.description,
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editingIncome ? "Редактировать доход" : "Добавить доход"}</DialogTitle>
          <DialogDescription>
            {editingIncome ? "Измените данные дохода" : "Запишите полученный доход"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="source">Источник</Label>
            <Select 
              value={sourceId} 
              onValueChange={(value) => {
                if (value === "create-new") {
                  setShowSourceDialog(true);
                } else {
                  setSourceId(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Выберите источник" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {incomeSources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {source.name}
                  </SelectItem>
                ))}
                <div className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground border-t mt-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowSourceDialog(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="font-medium">Создать новый источник</span>
                </div>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount">Сумма</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="50000"
              value={amount}
              onChange={(e) => handleNumericInput(e.target.value, setAmount)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Дата</Label>
            <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? (
                    format(date, "dd MMMM yyyy", { locale: ru })
                  ) : (
                    <span>Выберите дату</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                  locale={ru}
                  className="pointer-events-auto"
                />
                <Separator />
                <div className="flex gap-2 p-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDate(new Date());
                    }}
                    className="flex-1"
                  >
                    Сегодня
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setIsCalendarOpen(false)}
                    className="flex-1"
                  >
                    ОК
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Описание (необязательно)</Label>
            <Textarea
              id="description"
              placeholder="Дополнительная информация..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            {editingIncome ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
      
      <IncomeSourceDialog
        open={showSourceDialog}
        onOpenChange={setShowSourceDialog}
        onSave={handleSourceSave}
      />
    </Dialog>
  );
}
