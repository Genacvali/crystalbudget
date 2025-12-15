import { Pencil, Trash2, AlertCircle, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Category, CategoryBudget, IncomeSource } from "@/types/budget";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";

interface CategoryCardProps {
  category: Category;
  budget: CategoryBudget;
  incomeSources?: IncomeSource[];
  onEdit?: (category: Category) => void;
  onDelete?: (categoryId: string) => void;
  onAddExpense?: (categoryId: string) => void;
  showSources?: boolean;
  compact?: boolean;
}

export function CategoryCard({
  category,
  budget,
  incomeSources = [],
  onEdit,
  onDelete,
  onAddExpense,
  showSources = true,
  compact = false
}: CategoryCardProps) {
  const { formatAmount, currency: userCurrency } = useCurrency();
  // budget.allocated уже включает carryOver (базовый бюджет + перенос)
  // Доступный бюджет = allocated - debt (долг уменьшает доступные средства)
  const availableBudget = budget.allocated - (budget.debt || 0);
  const usedPercentage = availableBudget > 0 ? (budget.spent / availableBudget) * 100 : 0;
  const isOverBudget = budget.spent > availableBudget;
  const remaining = availableBudget - budget.spent;
  
  // Определяем статус и цвет
  const getStatus = () => {
    if (isOverBudget) return { label: 'Превышен', color: 'destructive' as const };
    if (usedPercentage > 90) return { label: 'Критично', color: 'warning' as const };
    if (usedPercentage > 70) return { label: 'Внимание', color: 'warning' as const };
    if (usedPercentage > 50) return { label: 'Норма', color: 'default' as const };
    return { label: 'Отлично', color: 'success' as const };
  };

  const status = getStatus();

  // Если бюджет не настроен
  if (!category.allocations || category.allocations.length === 0) {
    if (compact) {
      return (
        <div className="group relative bg-card rounded-lg border p-3 hover:shadow-md transition-all hover:border-primary/50 flex items-center gap-3">
          <div className="text-2xl opacity-50">{category.icon}</div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-muted-foreground truncate">{category.name}</h3>
            <p className="text-xs text-muted-foreground">Не настроен</p>
          </div>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 shrink-0"
                onClick={() => onEdit(category)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" 
                onClick={() => onDelete(category.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      );
    }
    
    return (
      <div className="group relative bg-card rounded-xl border-2 border-dashed p-4 hover:shadow-lg transition-all duration-300 hover:border-primary/50">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="text-4xl opacity-50">{category.icon}</div>
            <div className="flex-1">
              <h3 className="font-bold text-base text-muted-foreground">{category.name}</h3>
              <p className="text-xs text-muted-foreground">Бюджет не настроен</p>
            </div>
          </div>
          
          {/* Кнопки редактирования и удаления */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => onEdit(category)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-destructive hover:text-destructive" 
                onClick={() => onDelete(category.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        
        {onEdit && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => onEdit(category)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Настроить бюджет
          </Button>
        )}
      </div>
    );
  }

  // Компактный режим
  if (compact) {
    return (
      <div className={cn(
        "group relative bg-card rounded-lg border p-3 transition-all duration-200",
        "hover:shadow-md hover:border-primary/50",
        isOverBudget ? "border-destructive/40 bg-destructive/5" : "border-border"
      )}>
        <div className="flex items-center gap-3">
          {/* Иконка */}
          <div className="text-3xl shrink-0">
            {category.icon}
          </div>
          
          {/* Название + Статус */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-sm truncate">{category.name}</h3>
              <Badge 
                variant={status.color === 'success' ? 'default' : status.color}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0 shrink-0",
                  status.color === 'success' && "bg-success text-success-foreground"
                )}
              >
                {status.label}
              </Badge>
            </div>
            
            {/* Прогресс-бары (мультивалютные или один) */}
            {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
              <div className="space-y-1 mb-1">
                {Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
                  // currencyBudget.allocated уже включает carryOver
                  // Доступный бюджет = allocated - debt
                  const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
                  const currencyUsedPercentage = currencyAvailableBudget > 0 
                    ? (currencyBudget.spent / currencyAvailableBudget) * 100 
                    : 0;
                  const currencyIsOverBudget = currencyBudget.spent > currencyAvailableBudget;
                  
                  const currencySymbols: Record<string, string> = {
                    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
                    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                  };
                  const symbol = currencySymbols[currency] || currency;
                  
                  return (
                    <div key={currency} className="space-y-0.5">
                      <div className="text-[9px] text-muted-foreground">
                        {currency} {symbol}
                      </div>
                      <Progress 
                        value={Math.min(currencyUsedPercentage, 100)} 
                        className={cn(
                          "h-1 rounded-full",
                          currencyIsOverBudget && "bg-destructive/20"
                        )}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="relative mb-1">
                <Progress 
                  value={Math.min(usedPercentage, 100)} 
                  className={cn(
                    "h-1 rounded-full",
                    isOverBudget && "bg-destructive/20"
                  )}
                />
              </div>
            )}
            
            {/* Суммы */}
            {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
              // Show currency-specific amounts
              <div className="space-y-1">
                {Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
                  // currencyBudget.allocated уже включает carryOver
                  // Доступный бюджет = allocated - debt
                  const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
                  // Базовый бюджет (без переносов) = allocated - carryOver
                  const currencyBaseBudget = currencyBudget.allocated - (currencyBudget.carryOver || 0);
                  const currencySymbols: Record<string, string> = {
                    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
                    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                  };
                  const symbol = currencySymbols[currency] || currency;
                  const hasCarryOver = (currencyBudget.carryOver || 0) > 0;
                  const hasDebt = (currencyBudget.debt || 0) > 0;
                  const hasAdjustments = hasCarryOver || hasDebt;
                  
                  return (
                    <div key={currency} className="space-y-0.5">
                      {/* Основная строка: Потрачено из Доступно */}
                      <div className="text-[11px]">
                        <span className="font-bold">
                          {currencyBudget.spent.toLocaleString('ru-RU')} {symbol}
                        </span>
                        <span className="text-muted-foreground">
                          {' '}из {currencyAvailableBudget.toLocaleString('ru-RU')} {symbol}
                        </span>
                      </div>
                      
                      {/* Расчёт бюджета если есть корректировки */}
                      {hasAdjustments && (
                        <div className="text-[9px] text-muted-foreground">
                          (Бюджет {currencyBaseBudget.toLocaleString('ru-RU')} {symbol}
                          {hasCarryOver && (
                            <span className="text-blue-600 dark:text-blue-400">
                              {' '}+{(currencyBudget.carryOver || 0).toLocaleString('ru-RU')}
                            </span>
                          )}
                          {hasDebt && (
                            <span className="text-orange-600 dark:text-orange-400">
                              {' '}−{(currencyBudget.debt || 0).toLocaleString('ru-RU')}
                            </span>
                          )}
                          {' '}={' '}{currencyAvailableBudget.toLocaleString('ru-RU')} {symbol})
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single currency - simple and clear
              <div className="space-y-0.5">
                {/* Основная строка: Потрачено из Доступно */}
                <div className="text-xs">
                  <span className="font-bold">{formatAmount(budget.spent)}</span>
                  <span className="text-muted-foreground">
                    {' '}из {formatAmount(availableBudget)}
                  </span>
                </div>
                
                {/* Расчёт бюджета если есть корректировки */}
                {((budget.carryOver || 0) > 0 || (budget.debt || 0) > 0) && (
                  <div className="text-[9px] text-muted-foreground">
                    (Бюджет {formatAmount(budget.allocated - (budget.carryOver || 0))}
                    {(budget.carryOver || 0) > 0 && (
                      <span className="text-blue-600 dark:text-blue-400">
                        {' '}+{formatAmount(budget.carryOver)}
                      </span>
                    )}
                    {(budget.debt || 0) > 0 && (
                      <span className="text-orange-600 dark:text-orange-400">
                        {' '}−{formatAmount(budget.debt)}
                      </span>
                    )}
                    {' '}={' '}{formatAmount(availableBudget)})
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Процент */}
          <div className="text-right shrink-0">
            {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
              // Show currency-specific percentages
              <div className="space-y-1">
                {Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
                  // currencyBudget.allocated уже включает carryOver (базовый бюджет + перенос)
                  // Доступный бюджет = allocated - debt (долг уменьшает доступные средства)
                  const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
                  const currencyUsedPercentage = currencyAvailableBudget > 0 
                    ? (currencyBudget.spent / currencyAvailableBudget) * 100 
                    : 0;
                  const currencyIsOverBudget = currencyBudget.spent > currencyAvailableBudget;
                  const currencyRemaining = currencyAvailableBudget - currencyBudget.spent;
                  const currencyOverBudget = currencyIsOverBudget ? currencyBudget.spent - currencyAvailableBudget : 0;
                  
                  const currencySymbols: Record<string, string> = {
                    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
                    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
                  };
                  const symbol = currencySymbols[currency] || currency;
                  
                  return (
                    <div key={currency} className="space-y-0.5">
                      <div className={cn(
                        "text-sm font-bold",
                        currencyIsOverBudget ? "text-destructive" : "text-foreground"
                      )}>
                        {currencyUsedPercentage.toFixed(0)}%
                      </div>
                      {!currencyIsOverBudget && currencyRemaining > 0 ? (
                        <div className="text-[9px] text-muted-foreground font-medium">
                          осталось
                        </div>
                      ) : null}
                      {!currencyIsOverBudget && currencyRemaining > 0 ? (
                        <div className="text-[9px] text-success font-medium">
                          {currencyRemaining.toLocaleString('ru-RU')} {symbol}
                        </div>
                      ) : null}
                      {currencyIsOverBudget && currencyOverBudget > 0 ? (
                        <div className="text-[9px] text-muted-foreground font-medium">
                          превышено
                        </div>
                      ) : null}
                      {currencyIsOverBudget && currencyOverBudget > 0 ? (
                        <div className="text-[9px] text-destructive font-medium">
                          {currencyOverBudget.toLocaleString('ru-RU')} {symbol}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single currency - show standard view
              <>
                <div className={cn(
                  "text-lg font-bold",
                  isOverBudget ? "text-destructive" : "text-foreground"
                )}>
                  {usedPercentage.toFixed(0)}%
                </div>
                {!isOverBudget && remaining > 0 ? (
                  <>
                    <div className="text-[9px] text-muted-foreground font-medium">
                      осталось
                    </div>
                    <div className="text-[10px] text-success font-medium">
                      {formatAmount(remaining)}
                    </div>
                  </>
                ) : null}
                {isOverBudget ? (
                  <>
                    <div className="text-[9px] text-muted-foreground font-medium">
                      превышено
                    </div>
                    <div className="text-[10px] text-destructive font-medium">
                      {formatAmount(Math.abs(remaining))}
                    </div>
                  </>
                ) : null}
              </>
            )}
          </div>
          
          {/* Кнопки */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
            {onEdit && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={() => onEdit(category)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7 text-destructive hover:text-destructive" 
                onClick={() => onDelete(category.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Детальный режим
  return (
    <div className={cn(
      "group relative bg-card rounded-lg border p-3 transition-all duration-200",
      "hover:shadow-md hover:border-primary/50",
      isOverBudget ? "border-destructive/40 bg-destructive/5" : "border-border"
    )}>
      {/* Иконка + Название + Статус */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="text-3xl shrink-0">
            {category.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate mb-1">{category.name}</h3>
            <Badge 
              variant={status.color === 'success' ? 'default' : status.color}
              className={cn(
                "text-[10px] font-semibold px-2 py-0",
                status.color === 'success' && "bg-success text-success-foreground"
              )}
            >
              {status.label}
            </Badge>
          </div>
        </div>
        
        {/* Кнопки появляются при hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
          {onEdit && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={() => onEdit(category)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-destructive hover:text-destructive" 
              onClick={() => onDelete(category.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Суммы */}
      <div className="space-y-2 mb-3">
        {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
          // Show currency-specific amounts
          Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
            const currencySymbols: Record<string, string> = {
              RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
              JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
            };
            const symbol = currencySymbols[currency] || currency;
            
            return (
              <div key={currency} className="flex justify-between items-center text-xs">
                <div>
                  <span className="text-muted-foreground">{currency} {symbol} Потрачено: </span>
                  <span className="font-bold">
                    {currencyBudget.spent.toLocaleString('ru-RU')} {symbol}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">из </span>
                  <span className="font-semibold">
                    {(currencyBudget.allocated - (currencyBudget.debt || 0)).toLocaleString('ru-RU')} {symbol}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          // Single currency - show standard view
          <div className="flex justify-between items-center text-xs">
            <div>
              <span className="text-muted-foreground">Потрачено: </span>
              <span className="font-bold">{formatAmount(budget.spent)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">из </span>
              <span className="font-semibold">{formatAmount(availableBudget)}</span>
            </div>
          </div>
        )}

        {/* Перенос остатка из предыдущего месяца */}
        {budget.carryOver && budget.carryOver > 0 ? (
          <div className="text-center py-1 px-2 bg-blue-500/10 rounded border border-blue-500/20">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Перенос с прошлого месяца: +{formatAmount(budget.carryOver)}
            </span>
          </div>
        ) : null}

        {/* Задолженность из предыдущего месяца */}
        {budget.debt && budget.debt > 0 ? (
          <div className="text-center py-1 px-2 bg-orange-500/10 rounded border border-orange-500/20">
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
              Долг с прошлого месяца: -{formatAmount(budget.debt)}
            </span>
          </div>
        ) : null}

        {/* Остаток или превышение */}
        {!isOverBudget && remaining > 0 ? (
          <div className="text-center py-1 px-2 bg-success/10 rounded border border-success/20">
            <span className="text-xs font-semibold text-success">
              Осталось {formatAmount(remaining)}
            </span>
          </div>
        ) : null}
      </div>

      {/* Прогресс-бары (мультивалютные или один) */}
      <div className="space-y-2 mb-2">
        {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
          // Show currency-specific progress bars
          Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
            // currencyBudget.allocated уже включает carryOver
            // Доступный бюджет = allocated - debt
            const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
            const currencyUsedPercentage = currencyAvailableBudget > 0 
              ? (currencyBudget.spent / currencyAvailableBudget) * 100 
              : 0;
            const currencyIsOverBudget = currencyBudget.spent > currencyAvailableBudget;
            const currencyRemaining = currencyAvailableBudget - currencyBudget.spent;
            const currencyOverBudget = currencyIsOverBudget ? currencyBudget.spent - currencyAvailableBudget : 0;
            
            const currencySymbols: Record<string, string> = {
              RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
              JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
            };
            const symbol = currencySymbols[currency] || currency;
            
            return (
              <div key={currency} className="space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {currency} {symbol}
                  </span>
                  <span className={cn(
                    "text-xs font-bold",
                    currencyIsOverBudget ? "text-destructive" : "text-foreground"
                  )}>
                    {currencyUsedPercentage.toFixed(0)}%
                  </span>
                </div>
                <Progress 
                  value={Math.min(currencyUsedPercentage, 100)} 
                  className={cn(
                    "h-2 rounded-full transition-all duration-500",
                    currencyIsOverBudget && "bg-destructive/20"
                  )}
                />
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-muted-foreground">
                    {currencyBudget.spent.toLocaleString('ru-RU')} {symbol}
                  </span>
                  <span className="text-muted-foreground">
                    из {currencyAvailableBudget.toLocaleString('ru-RU')} {symbol}
                  </span>
                </div>
                {currencyIsOverBudget && currencyOverBudget > 0 && (
                  <div className="text-[10px] text-destructive font-medium">
                    Превышен на {currencyOverBudget.toLocaleString('ru-RU')} {symbol}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Single currency - show one progress bar (backward compatibility)
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                Использовано
              </span>
              <span className={cn(
                "text-xs font-bold",
                isOverBudget ? "text-destructive" : "text-foreground"
              )}>
                {usedPercentage.toFixed(0)}%
              </span>
            </div>
            <Progress 
              value={Math.min(usedPercentage, 100)} 
              className={cn(
                "h-2 rounded-full transition-all duration-500",
                isOverBudget && "bg-destructive/20"
              )}
            />
          </div>
        )}
      </div>

      {/* Предупреждение о превышении */}
      {isOverBudget && (
        <div className="flex items-center gap-2 p-2 mb-2 bg-destructive/15 rounded border border-destructive/30">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-destructive">
              Превышен на {formatAmount(budget.spent - totalAllocated)}
            </p>
          </div>
        </div>
      )}

      {/* Источники финансирования */}
      {showSources && category.allocations && category.allocations.length > 0 && (
        <div className="pt-3 border-t space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Источники</p>
          {category.allocations.map((alloc, idx) => {
            const source = incomeSources.find(s => s.id === alloc.incomeSourceId);
            if (!source) return null;
            
            const currencySymbols: Record<string, string> = {
              RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
              JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
            };
            const allocCurrency = alloc.currency || userCurrency || 'RUB';
            const symbol = currencySymbols[allocCurrency] || allocCurrency;
            
            return (
              <div 
                key={idx} 
                className="flex items-center gap-2.5 text-sm p-2 rounded-lg hover:bg-accent/50 transition-colors border border-transparent hover:border-accent"
              >
                <div 
                  className="w-3 h-3 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-card" 
                  style={{ backgroundColor: source.color }}
                />
                <span className="text-foreground flex-1 truncate font-medium">{source.name}</span>
                <span className="font-semibold shrink-0 text-foreground">
                  {alloc.allocationType === 'amount' 
                    ? `${alloc.allocationValue.toLocaleString('ru-RU')} ${symbol}`
                    : `${alloc.allocationValue}%`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Быстрое действие - добавить расход */}
      {onAddExpense && (
        <div className="pt-3 mt-3 border-t opacity-0 group-hover:opacity-100 transition-opacity">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-xs"
            onClick={() => onAddExpense(category.id)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Добавить расход
          </Button>
        </div>
      )}
    </div>
  );
}
