import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Category, CategoryBudget, IncomeSource } from "@/types/budget";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/useCurrency";

interface CategoryCardProps {
  category: Category;
  budget: CategoryBudget;
  incomeSources?: IncomeSource[];
  onEdit?: (category: Category) => void;
  onDelete?: (categoryId: string) => void;
}

export function CategoryCard({
  category,
  budget,
  incomeSources = [],
  onEdit,
  onDelete
}: CategoryCardProps) {
  const { formatAmount } = useCurrency();
  const usedPercentage = budget.allocated > 0 ? (budget.spent / budget.allocated) * 100 : 0;
  const isOverBudget = budget.spent > budget.allocated;

  return (
    <div className="bg-card rounded-lg border p-3 hover:shadow-md transition-all hover:border-primary/50">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{category.icon}</span>
          <span className="font-semibold text-sm">{category.name}</span>
        </div>
        <div className="flex items-center gap-1">
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

      <div className="space-y-2">
        {category.allocations && category.allocations.length > 0 ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted-foreground">Всего выделено:</span>
              <span className="font-semibold">{formatAmount(budget.allocated)}</span>
            </div>
            
            {category.allocations.map((alloc, idx) => {
              const source = incomeSources.find(s => s.id === alloc.incomeSourceId);
              if (!source) return null;
              
              return (
                <div key={idx} className="text-xs space-y-1 pl-2 border-l-2" style={{ borderColor: source.color }}>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{source.name}:</span>
                    <span className="font-medium">
                      {alloc.allocationType === 'amount' 
                        ? formatAmount(alloc.allocationValue)
                        : `${alloc.allocationValue}%`}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="space-y-1 pt-1">
              <Progress 
                value={Math.min(usedPercentage, 100)} 
                className={cn(
                  "h-2",
                  isOverBudget && "bg-destructive/20"
                )}
              />
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Потрачено: {formatAmount(budget.spent)}</span>
                <span className={cn(
                  "font-medium",
                  isOverBudget ? "text-destructive" : "text-muted-foreground"
                )}>
                  {usedPercentage.toFixed(0)}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center py-2">
            Бюджет не настроен
          </div>
        )}
      </div>
    </div>
  );
}
