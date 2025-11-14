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
import { supabase } from "@/integrations/supabase/client";

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
  onSave: (expense: { categoryId: string; amount: number; date: string; description?: string; currency?: string }) => void;
  editingExpense?: { id: string; categoryId: string; amount: number; date: string; description?: string; currency?: string } | null;
}

export function ExpenseDialog({ open, onOpenChange, categories, onSave, editingExpense }: ExpenseDialogProps) {
  const { toast } = useToast();
  const { convertToRubles, convertFromRubles, currency: userCurrency } = useCurrency();
  const [categoryId, setCategoryId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<string>(userCurrency || 'RUB');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [categoryCurrencies, setCategoryCurrencies] = useState<string[]>([]);
  
  const currencySymbols: Record<string, string> = {
    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
  };

  // Load currencies for selected category
  useEffect(() => {
    const loadCategoryCurrencies = async () => {
      if (!categoryId) {
        setCategoryCurrencies([]);
        return;
      }

      try {
        const { data: allocations, error } = await supabase
          .from('category_allocations')
          .select('currency')
          .eq('category_id', categoryId);

        if (error) {
          console.error('Error loading category currencies:', error);
          setCategoryCurrencies([]);
          return;
        }

        // Get unique currencies from allocations
        const currencies = new Set<string>();
        (allocations || []).forEach(alloc => {
          if (alloc.currency) {
            currencies.add(alloc.currency);
          }
        });

        const currencyArray = Array.from(currencies);
        setCategoryCurrencies(currencyArray);

        // If category has currencies, set the first one (or keep current if it's in the list)
        if (currencyArray.length > 0) {
          if (!currencyArray.includes(currency)) {
            setCurrency(currencyArray[0]);
          }
        } else {
          // No currencies in category, use user default
          setCurrency(userCurrency || 'RUB');
        }
      } catch (error) {
        console.error('Error loading category currencies:', error);
        setCategoryCurrencies([]);
      }
    };

    loadCategoryCurrencies();
  }, [categoryId, userCurrency]);

  useEffect(() => {
    if (open && editingExpense) {
      setCategoryId(editingExpense.categoryId);
      // Используем оригинальную сумму без конвертации (хранится в исходной валюте)
      setAmount(editingExpense.amount.toString());
      setDate(new Date(editingExpense.date));
      setDescription(editingExpense.description || "");
      setCurrency(editingExpense.currency || userCurrency || 'RUB');
    } else if (!open) {
      setCategoryId("");
      setAmount("");
      setDate(new Date());
      setDescription("");
      setCurrency(userCurrency || 'RUB');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingExpense?.id]);

  const handleSave = () => {
    try {
      const validated = expenseSchema.parse({
        categoryId,
        amount: parseFloat(amount),
        date: date?.toISOString(),
        description: description.trim() || undefined,
      });

      // Сохраняем сумму в исходной валюте (без конвертации)
      onSave({
        categoryId: validated.categoryId,
        amount: validated.amount,
        date: validated.date,
        description: validated.description,
        currency: currency,
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
            <div className="flex gap-2">
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                placeholder="1000"
                value={amount}
                onChange={(e) => handleNumericInput(e.target.value, setAmount)}
                onFocus={(e) => e.target.select()}
                className="flex-1"
              />
              <Select value={currency} onValueChange={setCurrency} disabled={!categoryId}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {categoryCurrencies.length > 0 ? (
                    // Show only currencies from category
                    categoryCurrencies.map(curr => (
                      <SelectItem key={curr} value={curr}>
                        {currencySymbols[curr] || curr} {curr}
                      </SelectItem>
                    ))
                  ) : (
                    // Show all currencies if no category selected or category has no allocations
                    <>
                      <SelectItem value="RUB">₽ RUB</SelectItem>
                      <SelectItem value="USD">$ USD</SelectItem>
                      <SelectItem value="EUR">€ EUR</SelectItem>
                      <SelectItem value="GBP">£ GBP</SelectItem>
                      <SelectItem value="JPY">¥ JPY</SelectItem>
                      <SelectItem value="CNY">¥ CNY</SelectItem>
                      <SelectItem value="KRW">₩ KRW</SelectItem>
                      <SelectItem value="GEL">₾ GEL</SelectItem>
                      <SelectItem value="AMD">֏ AMD</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
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
              onFocus={(e) => e.target.select()}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={() => {
            console.log('Add button clicked in ExpenseDialog');
            handleSave();
          }}>
            {editingExpense ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
