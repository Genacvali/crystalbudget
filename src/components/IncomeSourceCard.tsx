import { TrendingUp, Pencil, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IncomeSource, SourceSummary } from "@/types/budget";
import { useCurrency } from "@/hooks/useCurrency";
import { cn } from "@/lib/utils";

interface IncomeSourceCardProps {
  source: IncomeSource;
  summary: SourceSummary;
  onEdit?: (source: IncomeSource) => void;
  onDelete?: (sourceId: string) => void;
  compact?: boolean;
}

export function IncomeSourceCard({ source, summary, onEdit, onDelete, compact = false }: IncomeSourceCardProps) {
  const { formatAmount } = useCurrency();
  const spentPercentage = summary.totalIncome > 0
    ? (summary.totalSpent / summary.totalIncome) * 100
    : 0;

  const hasDebt = summary.debt > 0;
  
  // Определяем статус и цвет прогресс-бара как в CategoryCard
  const getProgressStatus = () => {
    if (spentPercentage > 100) return { label: 'Превышен', color: 'destructive' as const };
    if (spentPercentage > 90) return { label: 'Критично', color: 'warning' as const };
    if (spentPercentage > 70) return { label: 'Внимание', color: 'warning' as const };
    if (spentPercentage > 50) return { label: 'Норма', color: 'default' as const };
    return { label: 'Отлично', color: 'success' as const };
  };

  const progressStatus = getProgressStatus();
  const isOverSpent = spentPercentage > 100;

  return (
    <div className="bg-card rounded-lg border p-3 hover:shadow-md transition-all hover:border-primary/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: source.color }}
          />
          <span className="font-semibold text-sm truncate">{source.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onEdit(source)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={() => onDelete(source.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="space-y-2">
        {compact ? (
          <div className="flex items-center justify-center">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1">Периодичность</p>
              <p className="text-sm font-medium">{source.frequency}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Получено</p>
                <p className="text-base font-bold text-success break-words">
                  {formatAmount(summary.totalIncome)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Потрачено</p>
                <p className="text-base font-bold text-destructive break-words">
                  {formatAmount(summary.totalSpent)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Использовано</span>
                <span className={cn(
                  "font-bold",
                  isOverSpent ? "text-destructive" : "text-foreground"
                )}>
                  {spentPercentage.toFixed(0)}%
                </span>
              </div>
              <Progress 
                value={Math.min(spentPercentage, 100)} 
                className={cn(
                  "h-2 rounded-full transition-all duration-500",
                  isOverSpent && "bg-destructive/20"
                )}
              />
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs font-medium",
                  hasDebt ? "text-destructive" : "text-success"
                )}>
                  {hasDebt ? "Долг после распределения" : "Остаток после распределения"}
                </span>
                <div className="flex items-center gap-1">
                  <TrendingUp className={cn(
                    "h-3 w-3 flex-shrink-0",
                    hasDebt ? "text-destructive rotate-180" : "text-success"
                  )} />
                  <span className={cn(
                    "text-base font-bold break-words",
                    hasDebt ? "text-destructive" : "text-success"
                  )}>
                    {hasDebt
                      ? formatAmount(summary.debt)
                      : formatAmount(summary.remaining)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
