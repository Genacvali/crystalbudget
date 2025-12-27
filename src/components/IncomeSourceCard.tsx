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

  // Остаток = доход минус потраченное
  const balance = summary.totalIncome - summary.totalSpent;
  const isOverSpent = balance < 0; // Потрачено больше чем получено
  
  // Определяем статус на основе остатка
  const getProgressStatus = () => {
    if (isOverSpent) return { label: 'Перерасход', color: 'destructive' as const };
    if (spentPercentage > 90) return { label: 'Внимание', color: 'warning' as const };
    if (spentPercentage > 70) return { label: 'Активно', color: 'default' as const };
    return { label: 'Отлично', color: 'success' as const };
  };

  const progressStatus = getProgressStatus();

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
                  const currencyBalance = currencySummary.totalIncome - currencySummary.totalSpent;
                  const currencyIsOverSpent = currencyBalance < 0;
                  
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
                            {Math.round(currencySummary.totalIncome).toLocaleString('ru-RU')} {symbol}
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-muted-foreground">Потрачено</p>
                          <p className="text-xs font-bold text-destructive break-words leading-tight">
                            {Math.round(currencySummary.totalSpent).toLocaleString('ru-RU')} {symbol}
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
                      
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-[9px] font-medium",
                          currencyIsOverSpent ? "text-destructive" : "text-success"
                        )}>
                          {currencyIsOverSpent ? "Потрачено больше" : "Остаток"}
                        </span>
                        <span className={cn(
                          "text-xs font-bold break-words",
                          currencyIsOverSpent ? "text-destructive" : "text-success"
                        )}>
                          {Math.round(Math.abs(currencyBalance)).toLocaleString('ru-RU')} {symbol}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single currency - show standard view
              <>
                {(() => {
                  // Get currency from summariesByCurrency if available, otherwise use user default
                  const currency = summary.summariesByCurrency 
                    ? Object.keys(summary.summariesByCurrency)[0]
                    : null;
                  const currencySymbols: Record<string, string> = {
                    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
                    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                  };
                  const symbol = currency ? (currencySymbols[currency] || currency) : null;
                  
                  return (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Получено</p>
                        <p className="text-base font-bold text-success break-words">
                          {currency && symbol
                            ? `${Math.round(summary.totalIncome).toLocaleString('ru-RU')} ${symbol}`
                            : formatAmount(Math.round(summary.totalIncome))}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Потрачено</p>
                        <p className="text-base font-bold text-destructive break-words">
                          {currency && symbol
                            ? `${Math.round(summary.totalSpent).toLocaleString('ru-RU')} ${symbol}`
                            : formatAmount(Math.round(summary.totalSpent))}
                        </p>
                      </div>
                    </div>
                  );
                })()}

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

                {/* Показываем только остаток/перерасход, без дублирования */}
                <div className="pt-2 border-t">
                  {(() => {
                    const currency = summary.summariesByCurrency 
                      ? Object.keys(summary.summariesByCurrency)[0]
                      : null;
                    const currencySymbols: Record<string, string> = {
                      RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
                      JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                    };
                    const symbol = currency ? (currencySymbols[currency] || currency) : null;
                    
                    return (
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "text-xs font-medium",
                          isOverSpent ? "text-destructive" : "text-success"
                        )}>
                          {isOverSpent ? "Перерасход" : "Остаток"}
                        </span>
                        <div className="flex items-center gap-1">
                          <TrendingUp className={cn(
                            "h-3 w-3 flex-shrink-0",
                            isOverSpent ? "text-destructive rotate-180" : "text-success"
                          )} />
                          <span className={cn(
                            "text-base font-bold break-words",
                            isOverSpent ? "text-destructive" : "text-success"
                          )}>
                            {currency && symbol
                              ? `${Math.round(Math.abs(balance)).toLocaleString('ru-RU')} ${symbol}`
                              : formatAmount(Math.round(Math.abs(balance)))}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
