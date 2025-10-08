import { TrendingUp, Pencil, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { IncomeSource, SourceSummary } from "@/types/budget";
import { useCurrency } from "@/hooks/useCurrency";

interface IncomeSourceCardProps {
  source: IncomeSource;
  summary: SourceSummary;
  onEdit?: (source: IncomeSource) => void;
  onDelete?: (sourceId: string) => void;
  compact?: boolean;
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function IncomeSourceCard({ source, summary, onEdit, onDelete, compact = false }: IncomeSourceCardProps) {
  const { formatAmount } = useCurrency();
  const spentPercentage = summary.totalIncome > 0
    ? (summary.totalSpent / summary.totalIncome) * 100
    : 0;

  const hasDebt = summary.debt > 0;

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
                <span className="font-medium">{spentPercentage.toFixed(0)}%</span>
              </div>
              <Progress value={spentPercentage} className="h-2" />
            </div>

            <div className="pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className={cn(
                  "text-xs font-medium",
                  hasDebt ? "text-destructive" : "text-success"
                )}>
                  {hasDebt ? "Долг" : "Остаток"}
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
