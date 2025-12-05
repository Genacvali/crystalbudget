import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Scale } from "lucide-react";

interface BalanceAdjustmentDialogProps {
  currentBalance: number;
  onAdjustmentComplete: () => void;
}

export function BalanceAdjustmentDialog({ currentBalance, onAdjustmentComplete }: BalanceAdjustmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [actualBalance, setActualBalance] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { currency, formatAmount } = useCurrency();
  const { user } = useAuth();
  const { toast } = useToast();

  // Reset input when dialog opens
  useEffect(() => {
    if (open) {
      // Round to 2 decimal places to avoid floating point errors
      const rounded = Math.round(currentBalance * 100) / 100;
      setActualBalance(rounded.toString());
    }
  }, [open, currentBalance]);

  const handleAdjust = async () => {
    if (!user || !actualBalance) return;

    // Round to 2 decimal places to avoid floating point errors
    const actual = Math.round(parseFloat(actualBalance) * 100) / 100;
    if (isNaN(actual)) return;

    // Round current balance too
    const roundedCurrent = Math.round(currentBalance * 100) / 100;
    const difference = actual - roundedCurrent;
    
    // If difference is negligible, do nothing
    if (Math.abs(difference) < 0.01) {
      setOpen(false);
      return;
    }

    setLoading(true);
    try {
      const today = new Date().toISOString();

      if (difference < 0) {
        // We have LESS money than in app -> Create EXPENSE
        // Need to find or create "Correction" category
        let categoryId: string;
        
        const { data: existingCat } = await supabase
          .from("categories")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", "Корректировка баланса")
          .maybeSingle();

        if (existingCat) {
          categoryId = existingCat.id;
        } else {
          const { data: newCat, error: catError } = await supabase
            .from("categories")
            .insert({
              user_id: user.id,
              name: "Корректировка баланса",
              icon: "⚖️",
              allocation_amount: 0
            })
            .select()
            .single();
          
          if (catError) throw catError;
          categoryId = newCat.id;
        }

        const { error } = await supabase.from("expenses").insert({
          user_id: user.id,
          amount: Math.abs(difference),
          category_id: categoryId,
          date: today,
          description: "Ручная корректировка баланса",
          currency: currency
        });

        if (error) throw error;

      } else {
        // We have MORE money than in app -> Create INCOME
        // Need to find or create "Correction" income source
        let sourceId: string;
        
        const { data: existingSource } = await supabase
          .from("income_sources")
          .select("id")
          .eq("user_id", user.id)
          .ilike("name", "Корректировка баланса")
          .maybeSingle();

        if (existingSource) {
          sourceId = existingSource.id;
        } else {
          const { data: newSource, error: sourceError } = await supabase
            .from("income_sources")
            .insert({
              user_id: user.id,
              name: "Корректировка баланса",
              color: "#94a3b8" // slate-400
            })
            .select()
            .single();
          
          if (sourceError) throw sourceError;
          sourceId = newSource.id;
        }

        const { error } = await supabase.from("incomes").insert({
          user_id: user.id,
          amount: difference,
          source_id: sourceId,
          date: today,
          description: "Ручная корректировка баланса",
          currency: currency
        });

        if (error) throw error;
      }

      toast({
        title: "Баланс скорректирован",
        description: `Создана транзакция на сумму ${formatAmount(Math.abs(difference))}`,
      });
      
      onAdjustmentComplete();
      setOpen(false);

    } catch (error: any) {
      console.error("Error adjusting balance:", error);
      toast({
        variant: "destructive",
        title: "Ошибка",
        description: error.message || "Не удалось скорректировать баланс",
      });
    } finally {
      setLoading(false);
    }
  };

  const difference = parseFloat(actualBalance || "0") - currentBalance;
  const isNegative = difference < 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 px-3 border-primary/30 bg-primary/5 hover:bg-primary/10 hover:border-primary/50 text-primary font-medium shadow-sm hover:shadow-md transition-all"
          title="Скорректировать баланс"
        >
          <Scale className="h-4 w-4 mr-2" />
          <span className="text-xs sm:text-sm">Корректировка</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Корректировка баланса</DialogTitle>
          <DialogDescription>
            Если баланс в приложении не совпадает с реальным, введите фактическую сумму. 
            Приложение создаст корректирующую транзакцию.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>Расчетный баланс (в приложении)</Label>
            <div className="text-2xl font-bold text-muted-foreground">
              {formatAmount(currentBalance)}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="actual-balance">Фактический баланс (в банке/кармане)</Label>
            <Input
              id="actual-balance"
              type="number"
              step="0.01"
              value={actualBalance}
              onChange={(e) => {
                const value = e.target.value;
                // Allow empty input or valid number
                if (value === '' || !isNaN(parseFloat(value))) {
                  setActualBalance(value);
                }
              }}
              onBlur={(e) => {
                // Round on blur to fix floating point issues
                const num = parseFloat(e.target.value);
                if (!isNaN(num)) {
                  const rounded = Math.round(num * 100) / 100;
                  setActualBalance(rounded.toString());
                }
              }}
              placeholder="0"
              className="text-lg"
            />
          </div>
          
          {actualBalance && !isNaN(parseFloat(actualBalance)) && Math.abs(difference) > 0.01 && (
            <div className={`p-3 rounded-md border ${isNegative ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
              <div className="text-sm font-medium mb-1">Будет создана корректировка:</div>
              <div className="flex justify-between items-center">
                <span>{isNegative ? "Списание (Расход)" : "Пополнение (Доход)"}</span>
                <span className="font-bold text-lg">{formatAmount(Math.abs(difference))}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Отмена
          </Button>
          <Button onClick={handleAdjust} disabled={loading || !actualBalance}>
            {loading ? "Сохранение..." : "Скорректировать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

