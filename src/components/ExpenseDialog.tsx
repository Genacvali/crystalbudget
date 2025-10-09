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
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { Category } from "@/types/budget";
import { handleNumericInput } from "@/lib/numberInput";

const expenseSchema = z.object({
  categoryId: z.string().min(1, "Выберите категорию"),
  amount: z.number().positive("Сумма должна быть положительной"),
  date: z.string().min(1, "Выберите дату"),
  description: z.string().optional(),
});

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onSave: (expense: { categoryId: string; amount: number; date: string; description?: string }) => void;
  editingExpense?: { id: string; categoryId: string; amount: number; date: string; description?: string } | null;
}

export function ExpenseDialog({ open, onOpenChange, categories, onSave, editingExpense }: ExpenseDialogProps) {
  const { toast } = useToast();
  const { convertToRubles, convertFromRubles } = useCurrency();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [description, setDescription] = useState("");
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    if (open && editingExpense) {
      setCategoryId(editingExpense.categoryId);
      // Конвертируем сумму из рублей в текущую валюту для отображения
      const convertedAmount = convertFromRubles(editingExpense.amount);
      setAmount(convertedAmount.toString());
      setDate(new Date(editingExpense.date));
      setDescription(editingExpense.description || "");
    } else if (!open) {
      setCategoryId("");
      setAmount("");
      setDate(new Date());
      setDescription("");
    }
  }, [open, editingExpense, convertFromRubles]);

  const handleSave = () => {
    try {
      const validated = expenseSchema.parse({
        categoryId,
        amount: parseFloat(amount),
        date: date?.toISOString(),
        description: description.trim() || undefined,
      });

      // Конвертируем сумму в рубли перед сохранением
      const amountInRubles = convertToRubles(validated.amount);

      onSave({
        categoryId: validated.categoryId,
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
          <DialogTitle>{editingExpense ? "Редактировать расход" : "Добавить расход"}</DialogTitle>
          <DialogDescription>
            {editingExpense ? "Измените данные расхода" : "Запишите совершенный расход"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="category">Категория</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите категорию" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="amount">Сумма</Label>
            <Input
              id="amount"
              inputMode="decimal"
              placeholder="1000"
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
            {editingExpense ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
