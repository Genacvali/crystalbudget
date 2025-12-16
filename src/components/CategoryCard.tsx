import { Pencil, Trash2, AlertCircle, TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Category, CategoryBudget, IncomeSource } from "@/types/budget";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";
import { useState } from "react";

interface CategoryCardProps {
  category: Category;
  budget: CategoryBudget;
  incomeSources?: IncomeSource[];
  onEdit?: (category: Category) => void;
  onDelete?: (categoryId: string) => void;
  onAddExpense?: (categoryId: string) => void;
  showSources?: boolean;
  compact?: boolean;
  hideBudgetDetails?: boolean; // Скрыть информацию о переносах, долгах и превышениях
}

export function CategoryCard({
  category,
  budget,
  incomeSources = [],
  onEdit,
  onDelete,
  onAddExpense,
  showSources = true,
  compact = false,
  hideBudgetDetails = false
}: CategoryCardProps) {
  const { formatAmount, currency: userCurrency } = useCurrency();
  const [detailsOpen, setDetailsOpen] = useState(false);
  
  // budget.allocated уже включает carryOver (базовый бюджет + перенос)
  // Доступный бюджет = allocated - debt (долг уменьшает доступные средства)
  const availableBudget = budget.allocated - (budget.debt || 0);
  // Процент должен считаться от базового бюджета (allocated), а не от доступного
  // Потому что долг - это уже прошлое превышение, а процент показывает текущее использование
  const baseBudget = budget.allocated;
  const usedPercentage = baseBudget > 0 ? (budget.spent / baseBudget) * 100 : 0;
  // Превышение определяется от базового бюджета, а не от доступного
  // Долг учитывается отдельно в расчете доступного бюджета
  const isOverBudget = budget.spent > baseBudget;
  const remaining = availableBudget - budget.spent;
  
  // Debug logging для категории "ЗП Гены"
  if (category.name === "ЗП Гены") {
    console.log(`[DEBUG ЗП Гены] Детальный расчет:`, {
      categoryName: category.name,
      allocated: budget.allocated,
      carryOver: budget.carryOver,
      debt: budget.debt,
      spent: budget.spent,
      baseBudget: budget.allocated - (budget.carryOver || 0),
      availableBudget,
      usedPercentage: usedPercentage.toFixed(2),
      budgetsByCurrency: budget.budgetsByCurrency
    });
  }
  
  // Определяем статус и цвет
  // Статус определяется по проценту от базового бюджета, а не по доступному
  // Потому что долг - это прошлое превышение, а статус показывает текущее состояние
  const getStatus = () => {
    // Если потрачено больше базового бюджета - превышен
    if (budget.spent > baseBudget) return { label: 'Превышен', color: 'destructive' as const };
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
      <>
        <div 
          className={cn(
            "group relative bg-card rounded-lg border p-3 transition-all duration-200",
            hideBudgetDetails ? "" : "cursor-pointer hover:shadow-md hover:border-primary/50",
            isOverBudget ? "border-destructive/40 bg-destructive/5" : "border-border"
          )}
          onClick={hideBudgetDetails ? undefined : () => setDetailsOpen(true)}
        >
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
            {!hideBudgetDetails && budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
              <div className="space-y-1 mb-1">
                {Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
                  // currencyBudget.allocated уже включает carryOver
                  // Доступный бюджет = allocated - debt
                  const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
                  // Процент считаем от базового бюджета (allocated), а не от доступного
                  const currencyUsedPercentage = currencyBudget.allocated > 0 
                    ? (currencyBudget.spent / currencyBudget.allocated) * 100 
                    : 0;
                  // Превышение определяется от базового бюджета
                  const currencyIsOverBudget = currencyBudget.spent > currencyBudget.allocated;
                  
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
              !hideBudgetDetails && (
                <div className="relative mb-1">
                  <Progress 
                    value={Math.min(usedPercentage, 100)} 
                    className={cn(
                      "h-1 rounded-full",
                      isOverBudget && "bg-destructive/20"
                    )}
                  />
                </div>
              )
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
                      {/* Итого доступно */}
                      <div className="text-[11px]">
                        <span className="text-muted-foreground">Итого доступно: </span>
                        <span className="font-bold">
                          {currencyAvailableBudget.toLocaleString('ru-RU')} {symbol}
                        </span>
                      </div>
                      
                    </div>
                  );
                })}
              </div>
            ) : (
              // Single currency - simple and clear
              <div className="space-y-0.5">
                {/* Итого доступно */}
                <div className="text-xs">
                  <span className="text-muted-foreground">Итого доступно: </span>
                  <span className="font-bold">{formatAmount(availableBudget)}</span>
                </div>
                
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
                  // Процент считаем от базового бюджета (allocated), а не от доступного
                  // Потому что долг - это уже прошлое превышение, а процент показывает текущее использование
                  const currencyUsedPercentage = currencyBudget.allocated > 0 
                    ? (currencyBudget.spent / currencyBudget.allocated) * 100 
                    : 0;
                  // Превышение определяется от базового бюджета, а не от доступного
                  const currencyIsOverBudget = currencyBudget.spent > currencyBudget.allocated;
                  const currencyRemaining = currencyAvailableBudget - currencyBudget.spent;
                  const currencyOverBudget = currencyIsOverBudget ? currencyBudget.spent - currencyBudget.allocated : 0;
                  
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
              !hideBudgetDetails && (
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
              )
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
      
      {/* Модальное окно с деталями */}
      {!hideBudgetDetails && (
        <CategoryDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          category={category}
          budget={budget}
          availableBudget={availableBudget}
          formatAmount={formatAmount}
          userCurrency={userCurrency}
        />
      )}
      </>
    );
  }

  // Детальный режим
  return (
    <>
      <div 
        className={cn(
          "group relative bg-card rounded-lg border p-3 transition-all duration-200",
          hideBudgetDetails ? "" : "cursor-pointer hover:shadow-md hover:border-primary/50",
          isOverBudget ? "border-destructive/40 bg-destructive/5" : "border-border"
        )}
        onClick={hideBudgetDetails ? undefined : () => setDetailsOpen(true)}
      >
      {/* Иконка + Название + Статус */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="text-3xl shrink-0">
            {category.icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm truncate mb-1">{category.name}</h3>
            {!hideBudgetDetails && (
              <Badge 
                variant={status.color === 'success' ? 'default' : status.color}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0",
                  status.color === 'success' && "bg-success text-success-foreground"
                )}
              >
                {status.label}
              </Badge>
            )}
          </div>
        </div>
        
        {/* Кнопки появляются при hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 shrink-0">
          {onEdit && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7" 
              onClick={(e) => {
                e.stopPropagation();
                onEdit(category);
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 text-destructive hover:text-destructive" 
              onClick={(e) => {
                e.stopPropagation();
                onDelete(category.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Суммы */}
      {!hideBudgetDetails && (
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
        {!hideBudgetDetails && budget.carryOver && budget.carryOver > 0 ? (
          <div className="text-center py-1 px-2 bg-blue-500/10 rounded border border-blue-500/20">
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
              Перенос с прошлого месяца: +{formatAmount(budget.carryOver)}
            </span>
          </div>
        ) : null}

        {/* Задолженность из предыдущего месяца */}
        {!hideBudgetDetails && budget.debt && budget.debt > 0 ? (
          <div className="text-center py-1 px-2 bg-orange-500/10 rounded border border-orange-500/20">
            <span className="text-xs font-semibold text-orange-600 dark:text-orange-400">
              Долг с прошлого месяца: -{formatAmount(budget.debt)}
            </span>
          </div>
        ) : null}

        {/* Остаток или превышение */}
        {!hideBudgetDetails && !isOverBudget && remaining > 0 ? (
          <div className="text-center py-1 px-2 bg-success/10 rounded border border-success/20">
            <span className="text-xs font-semibold text-success">
              Осталось {formatAmount(remaining)}
            </span>
          </div>
        ) : null}
      </div>
      )}

      {/* Прогресс-бары (мультивалютные или один) */}
      {!hideBudgetDetails && (
      <div className="space-y-2 mb-2">
        {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 0 ? (
          // Show currency-specific progress bars
          Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
            // currencyBudget.allocated уже включает carryOver
            // Доступный бюджет = allocated - debt
            const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
            // Процент считаем от базового бюджета (allocated), а не от доступного
            const currencyUsedPercentage = currencyBudget.allocated > 0 
              ? (currencyBudget.spent / currencyBudget.allocated) * 100 
              : 0;
            // Превышение определяется от базового бюджета
            const currencyIsOverBudget = currencyBudget.spent > currencyBudget.allocated;
            const currencyRemaining = currencyAvailableBudget - currencyBudget.spent;
            const currencyOverBudget = currencyIsOverBudget ? currencyBudget.spent - currencyBudget.allocated : 0;
            
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
                {!hideBudgetDetails && currencyIsOverBudget && currencyOverBudget > 0 && (
                  <div className="text-[10px] text-destructive font-medium">
                    Превышен на {currencyOverBudget.toLocaleString('ru-RU')} {symbol}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          // Single currency - show one progress bar (backward compatibility)
          !hideBudgetDetails && (
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
          )
        )}
      </div>
      )}

      {/* Предупреждение о превышении */}
      {!hideBudgetDetails && isOverBudget && (
        <div className="flex items-center gap-2 p-2 mb-2 bg-destructive/15 rounded border border-destructive/30">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-destructive">
              Превышен на {formatAmount(budget.spent - availableBudget)}
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
            onClick={(e) => {
              e.stopPropagation();
              onAddExpense(category.id);
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Добавить расход
          </Button>
        </div>
      )}
    </div>
    
    {/* Модальное окно с деталями */}
    {!hideBudgetDetails && (
      <CategoryDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        category={category}
        budget={budget}
        availableBudget={availableBudget}
        formatAmount={formatAmount}
        userCurrency={userCurrency}
      />
    )}
    </>
  );
}

// Компонент модального окна с детальной информацией о бюджете
interface CategoryDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category;
  budget: CategoryBudget;
  availableBudget: number;
  formatAmount: (amount: number) => string;
  userCurrency: string;
}

function CategoryDetailsDialog({
  open,
  onOpenChange,
  category,
  budget,
  availableBudget,
  formatAmount,
  userCurrency
}: CategoryDetailsDialogProps) {
  const baseBudget = budget.allocated - (budget.carryOver || 0);
  const hasCarryOver = (budget.carryOver || 0) > 0;
  const hasDebt = (budget.debt || 0) > 0;
  const hasAdjustments = hasCarryOver || hasDebt;
  
  const currencySymbols: Record<string, string> = {
    RUB: '₽', USD: '$', EUR: '€', GBP: '£', 
    JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
  };
  const symbol = currencySymbols[userCurrency] || userCurrency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{category.icon}</span>
            <span>{category.name}</span>
          </DialogTitle>
          <DialogDescription>
            Детальная информация о бюджете категории
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* 1. Сумма выделена в этом месяце */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Сумма выделена в этом месяце:</span>
              <span className="text-base font-bold">{formatAmount(baseBudget)}</span>
            </div>
          </div>
          
          {/* 2. Долг или остаток */}
          {(hasDebt || hasCarryOver) && (
            <div className="space-y-2">
              {hasDebt && (
                <div className="flex justify-between items-center p-2 bg-orange-500/10 rounded border border-orange-500/20">
                  <span className="text-sm text-muted-foreground">Долг с прошлого месяца:</span>
                  <span className="text-base font-bold text-orange-600 dark:text-orange-400">
                    −{formatAmount(budget.debt || 0)}
                  </span>
                </div>
              )}
              {hasCarryOver && (
                <div className="flex justify-between items-center p-2 bg-blue-500/10 rounded border border-blue-500/20">
                  <span className="text-sm text-muted-foreground">Остаток с прошлого месяца:</span>
                  <span className="text-base font-bold text-blue-600 dark:text-blue-400">
                    +{formatAmount(budget.carryOver || 0)}
                  </span>
                </div>
              )}
            </div>
          )}
          
          {/* 3. Расчет бюджета */}
          <div className="pt-4 border-t space-y-2">
            <h4 className="text-sm font-semibold">Расчет бюджета:</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Базовый бюджет:</span>
                <span className="font-medium">{formatAmount(baseBudget)}</span>
              </div>
              {hasCarryOver && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Перенос с прошлого месяца:</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    +{formatAmount(budget.carryOver || 0)}
                  </span>
                </div>
              )}
              {hasDebt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Долг с прошлого месяца:</span>
                  <span className="font-medium text-orange-600 dark:text-orange-400">
                    −{formatAmount(budget.debt || 0)}
                  </span>
                </div>
              )}
              <div className="pt-2 border-t flex justify-between items-center">
                <span className="font-semibold">Итого доступно:</span>
                <span className="text-base font-bold">{formatAmount(availableBudget)}</span>
              </div>
            </div>
          </div>
          
          {/* 4. Потрачено и остаток/превышение */}
          <div className="pt-4 border-t space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Потрачено в этом месяце:</span>
              <span className="text-base font-bold">{formatAmount(budget.spent)}</span>
            </div>
            {budget.spent < availableBudget ? (
              <div className="flex justify-between items-center p-2 bg-green-500/10 rounded border border-green-500/20">
                <span className="text-sm text-muted-foreground">Осталось:</span>
                <span className="text-base font-bold text-green-600 dark:text-green-400">
                  {formatAmount(availableBudget - budget.spent)}
                </span>
              </div>
            ) : (
              <div className="flex justify-between items-center p-2 bg-red-500/10 rounded border border-red-500/20">
                <span className="text-sm text-muted-foreground">Превышено на:</span>
                <span className="text-base font-bold text-red-600 dark:text-red-400">
                  {formatAmount(budget.spent - availableBudget)}
                </span>
              </div>
            )}
          </div>
          
          {/* 5. Из чего состоит бюджет */}
          {hasAdjustments && (
            <div className="pt-4 border-t space-y-2">
              <h4 className="text-sm font-semibold">Состав бюджета:</h4>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Выделено в этом месяце:</span>
                  <span className="font-medium">{formatAmount(baseBudget)}</span>
                </div>
                {hasCarryOver && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Перенесено с прошлого месяца:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {formatAmount(budget.carryOver || 0)}
                    </span>
                  </div>
                )}
                {hasDebt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Вычтено долга:</span>
                    <span className="font-medium text-orange-600 dark:text-orange-400">
                      {formatAmount(budget.debt || 0)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
          
          {/* Мультивалютная информация */}
          {budget.budgetsByCurrency && Object.keys(budget.budgetsByCurrency).length > 1 && (
            <div className="pt-4 border-t space-y-3">
              <h4 className="text-sm font-semibold">По валютам:</h4>
              {Object.entries(budget.budgetsByCurrency).map(([currency, currencyBudget]) => {
                const currencyAvailableBudget = currencyBudget.allocated - (currencyBudget.debt || 0);
                const currencyBaseBudget = currencyBudget.allocated - (currencyBudget.carryOver || 0);
                const currencySymbol = currencySymbols[currency] || currency;
                const currencyHasCarryOver = (currencyBudget.carryOver || 0) > 0;
                const currencyHasDebt = (currencyBudget.debt || 0) > 0;
                
                return (
                  <div key={currency} className="space-y-3 p-3 bg-muted/30 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">{currency} {currencySymbol}</span>
                    </div>
                    
                    {/* 1. Сумма выделена в этом месяце */}
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Сумма выделена в этом месяце:</span>
                      <span className="text-sm font-bold">{currencyBaseBudget.toLocaleString('ru-RU')} {currencySymbol}</span>
                    </div>
                    
                    {/* 2. Долг или остаток */}
                    {(currencyHasDebt || currencyHasCarryOver) && (
                      <div className="space-y-1.5">
                        {currencyHasDebt && (
                          <div className="flex justify-between items-center p-2 bg-orange-500/10 rounded border border-orange-500/20">
                            <span className="text-xs text-muted-foreground">Долг с прошлого месяца:</span>
                            <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                              −{(currencyBudget.debt || 0).toLocaleString('ru-RU')} {currencySymbol}
                            </span>
                          </div>
                        )}
                        {currencyHasCarryOver && (
                          <div className="flex justify-between items-center p-2 bg-blue-500/10 rounded border border-blue-500/20">
                            <span className="text-xs text-muted-foreground">Остаток с прошлого месяца:</span>
                            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                              +{(currencyBudget.carryOver || 0).toLocaleString('ru-RU')} {currencySymbol}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* 3. Расчет бюджета */}
                    <div className="pt-2 border-t space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Базовый бюджет:</span>
                        <span className="font-medium">{currencyBaseBudget.toLocaleString('ru-RU')} {currencySymbol}</span>
                      </div>
                      {currencyHasCarryOver && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">+ Перенос с прошлого месяца:</span>
                          <span className="font-medium text-blue-600 dark:text-blue-400">
                            +{(currencyBudget.carryOver || 0).toLocaleString('ru-RU')} {currencySymbol}
                          </span>
                        </div>
                      )}
                      {currencyHasDebt && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">− Долг с прошлого месяца:</span>
                          <span className="font-medium text-orange-600 dark:text-orange-400">
                            −{(currencyBudget.debt || 0).toLocaleString('ru-RU')} {currencySymbol}
                          </span>
                        </div>
                      )}
                      <div className="pt-1 border-t flex justify-between items-center">
                        <span className="font-semibold">Итого доступно:</span>
                        <span className="text-sm font-bold">{currencyAvailableBudget.toLocaleString('ru-RU')} {currencySymbol}</span>
                      </div>
                    </div>
                    
                    {/* 4. Потрачено и остаток/превышение */}
                    <div className="pt-2 border-t space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground">Потрачено в этом месяце:</span>
                        <span className="text-sm font-bold">{currencyBudget.spent.toLocaleString('ru-RU')} {currencySymbol}</span>
                      </div>
                      {currencyBudget.spent < currencyAvailableBudget ? (
                        <div className="flex justify-between items-center p-2 bg-green-500/10 rounded border border-green-500/20">
                          <span className="text-xs text-muted-foreground">Осталось:</span>
                          <span className="text-sm font-bold text-green-600 dark:text-green-400">
                            {(currencyAvailableBudget - currencyBudget.spent).toLocaleString('ru-RU')} {currencySymbol}
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center p-2 bg-red-500/10 rounded border border-red-500/20">
                          <span className="text-xs text-muted-foreground">Превышено на:</span>
                          <span className="text-sm font-bold text-red-600 dark:text-red-400">
                            {(currencyBudget.spent - currencyAvailableBudget).toLocaleString('ru-RU')} {currencySymbol}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
