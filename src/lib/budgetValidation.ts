/**
 * Budget validation utilities
 * Ensures budget allocations are consistent with available income
 */

import { Category, IncomeSource, Income } from "@/types/budget";
import { safeNumber, validateAmount } from "./validators";
import { logger } from "./logger";

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details?: {
    totalAllocated: number;
    totalIncome: number;
    difference: number;
    overAllocatedCategories: string[];
  };
}

/**
 * Validates that total category allocations don't exceed available income
 */
export const validateBudgetConsistency = (
  categories: Category[],
  incomeSources: IncomeSource[],
  incomes: Income[],
  userCurrency: string = 'RUB'
): ValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Calculate total income for the month
  const totalIncome = incomes.reduce((sum, inc) => {
    const currency = inc.currency || userCurrency;
    if (currency !== userCurrency) return sum; // Only count primary currency for now
    return sum + safeNumber(inc.amount);
  }, 0);
  
  // Calculate expected income (if no actual income yet)
  const expectedIncome = incomeSources.reduce((sum, source) => {
    return sum + safeNumber(source.amount || 0);
  }, 0);
  
  const availableIncome = totalIncome > 0 ? totalIncome : expectedIncome;
  
  // Calculate total allocated across all categories
  let totalAllocated = 0;
  const overAllocatedCategories: string[] = [];
  
  categories.forEach(category => {
    let categoryAllocated = 0;
    
    if (category.allocations && category.allocations.length > 0) {
      category.allocations.forEach(alloc => {
        const allocCurrency = alloc.currency || userCurrency;
        if (allocCurrency !== userCurrency) return; // Skip other currencies
        
        if (alloc.allocationType === 'amount') {
          categoryAllocated += safeNumber(alloc.allocationValue);
        } else if (alloc.allocationType === 'percent') {
          // Calculate based on source income
          const sourceIncomes = incomes.filter(inc => 
            inc.source_id === alloc.incomeSourceId &&
            (inc.currency || userCurrency) === userCurrency
          );
          const actualSourceTotal = sourceIncomes.reduce((sum, inc) => 
            sum + safeNumber(inc.amount), 0
          );
          const expectedSourceAmount = incomeSources.find(
            s => s.id === alloc.incomeSourceId
          )?.amount || 0;
          const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
          categoryAllocated += base * alloc.allocationValue / 100;
        }
      });
    } else if (category.allocationAmount) {
      categoryAllocated = safeNumber(category.allocationAmount);
    } else if (category.linkedSourceId && category.allocationPercent) {
      const sourceIncomes = incomes.filter(inc => 
        inc.source_id === category.linkedSourceId
      );
      const actualSourceTotal = sourceIncomes.reduce((sum, inc) => 
        sum + safeNumber(inc.amount), 0
      );
      const expectedSourceAmount = incomeSources.find(
        s => s.id === category.linkedSourceId
      )?.amount || 0;
      const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
      categoryAllocated = base * category.allocationPercent / 100;
    }
    
    totalAllocated += categoryAllocated;
    
    // Check if category is over-allocated
    if (categoryAllocated > availableIncome * 0.5) { // Single category > 50% of income
      warnings.push(`Категория "${category.name}" выделяет более 50% дохода (${Math.round(categoryAllocated)} из ${Math.round(availableIncome)})`);
      overAllocatedCategories.push(category.name);
    }
  });
  
  // Check if total allocation exceeds income
  const difference = totalAllocated - availableIncome;
  const overallocationPercent = availableIncome > 0 
    ? (difference / availableIncome) * 100 
    : 0;
  
  if (difference > 0) {
    errors.push(
      `Перерасход бюджета: выделено ${Math.round(totalAllocated)} ₽, ` +
      `доходов ${Math.round(availableIncome)} ₽, ` +
      `превышение ${Math.round(difference)} ₽ (${overallocationPercent.toFixed(1)}%)`
    );
  }
  
  // Warning if allocation is very close to income (< 5% buffer)
  if (difference > -availableIncome * 0.05 && difference <= 0) {
    warnings.push(
      `Бюджет почти полностью распределен. ` +
      `Остаток: ${Math.round(Math.abs(difference))} ₽ (${Math.abs(overallocationPercent).toFixed(1)}%)`
    );
  }
  
  logger.debug('Budget validation:', {
    totalIncome,
    expectedIncome,
    availableIncome,
    totalAllocated,
    difference,
    isValid: errors.length === 0
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    details: {
      totalAllocated,
      totalIncome: availableIncome,
      difference,
      overAllocatedCategories
    }
  };
};

/**
 * Validates if a new category allocation is possible
 */
export const validateNewAllocation = (
  newAllocationAmount: number,
  currentTotalAllocated: number,
  totalIncome: number
): { canAllocate: boolean; reason?: string } => {
  if (!validateAmount(newAllocationAmount)) {
    return { canAllocate: false, reason: 'Некорректная сумма' };
  }
  
  const newTotal = currentTotalAllocated + newAllocationAmount;
  
  if (newTotal > totalIncome) {
    const excess = newTotal - totalIncome;
    return { 
      canAllocate: false, 
      reason: `Превышение бюджета на ${Math.round(excess)} ₽. Доступно: ${Math.round(totalIncome - currentTotalAllocated)} ₽` 
    };
  }
  
  return { canAllocate: true };
};

/**
 * Suggests optimal budget allocation across categories
 */
export const suggestBudgetAllocation = (
  categories: Category[],
  totalIncome: number,
  historicalSpending: Record<string, number> = {}
): Record<string, number> => {
  const suggestions: Record<string, number> = {};
  
  // Calculate total historical spending
  const totalHistorical = Object.values(historicalSpending).reduce((s, v) => s + v, 0);
  
  if (totalHistorical === 0) {
    // No historical data - distribute evenly
    const perCategory = totalIncome / categories.length;
    categories.forEach(cat => {
      suggestions[cat.id] = perCategory;
    });
  } else {
    // Distribute based on historical spending patterns
    categories.forEach(cat => {
      const historicalAmount = historicalSpending[cat.id] || 0;
      const proportion = historicalAmount / totalHistorical;
      suggestions[cat.id] = Math.round(totalIncome * proportion);
    });
  }
  
  return suggestions;
};
