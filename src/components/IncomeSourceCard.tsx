import { TrendingUp, Pencil, Trash2, AlertCircle } from "lucide-react";
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
    <div className={cn(
      "bg-card rounded-lg border p-3 hover:shadow-md transition-all hover:border-primary/50",
      isOverSpent ? "border-destructive/40 bg-destructive/5" : "border-border",
      "h-full flex flex-col" // Ensure cards have equal height
    )}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: source.color }}
          />
          <span className="font-semibold text-sm truncate">{source.name}</span>
          <Badge 
            variant={progressStatus.color === 'success' ? 'default' : progressStatus.color}
            className={cn(
              "text-[10px] font-semibold px-2 py-0 shrink-0",
              progressStatus.color === 'success' && "bg-success text-success-foreground"
            )}
          >
            {progressStatus.label}
          </Badge>
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
            {summary.summariesByCurrency && Object.keys(summary.summariesByCurrency).length > 1 ? (
              // Multiple currencies - show separate sections (compact)
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {Object.entries(summary.summariesByCurrency).map(([currency, currencySummary]) => {
                  const currencySpentPercentage = currencySummary.totalIncome > 0
                    ? (currencySummary.totalSpent / currencySummary.totalIncome) * 100
                    : 0;
                  const currencyIsOverSpent = currencySpentPercentage > 100;
                  const currencyHasDebt = currencySummary.debt > 0;
                  
                  const currencySymbols: Record<string, string> = {
                    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
                    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                  };
                  const symbol = currencySymbols[currency] || currency;
                  
                  return (
                    <div key={currency} className="space-y-1.5 pb-2 border-b last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wide">
                          {currency} {symbol}
                        </span>
                        <Badge 
                          variant={currencyIsOverSpent ? 'destructive' : 'default'}
                          className="text-[8px] px-1 py-0 h-4"
                        >
                          {currencySpentPercentage.toFixed(0)}%
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <p className="text-[9px] text-muted-foreground">Получено</p>
                          <p className="text-xs font-bold text-success break-words leading-tight">
                            {currencySummary.totalIncome.toLocaleString('ru-RU')} {symbol}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Потрачено</p>
                          <p className="text-xs font-bold text-destructive break-words leading-tight">
                            {currencySummary.totalSpent.toLocaleString('ru-RU')} {symbol}
                          </p>
                        </div>
                      </div>
                      
                      <Progress 
                        value={Math.min(currencySpentPercentage, 100)} 
                        className={cn(
                          "h-1 rounded-full",
                          currencyIsOverSpent && "bg-destructive/20"
                        )}
                      />
                      
                      {currencyIsOverSpent && (
                        <div className="flex items-center gap-1 p-1 bg-destructive/10 rounded">
                          <AlertCircle className="h-2.5 w-2.5 text-destructive shrink-0" />
                          <p className="text-[9px] font-medium text-destructive">
                            +{Math.abs(currencySummary.totalSpent - currencySummary.totalIncome).toLocaleString('ru-RU')} {symbol}
                          </p>
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[9px] font-medium",
                          currencyHasDebt ? "text-destructive" : "text-success"
                        )}>
                          {currencyHasDebt ? "Долг после распределения" : "Остаток после распределения"}
                        </span>
                        <span className={cn(
                          "text-xs font-bold break-words",
                          currencyHasDebt ? "text-destructive" : "text-success"
                        )}>
                          {currencyHasDebt
                            ? currencySummary.debt.toLocaleString('ru-RU')
                            : currencySummary.remaining.toLocaleString('ru-RU')} {symbol}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single currency - show standard view
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
                
                {/* Показываем превышение если есть */}
                {isOverSpent && (
                  <div className="flex items-center gap-2 p-2 bg-destructive/15 rounded border border-destructive/30">
                    <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-destructive">
                        Превышен на {formatAmount(summary.totalSpent - summary.totalIncome)}
                      </p>
                    </div>
                  </div>
                )}

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
          </>
        )}
      </div>
    </div>
  );
}
