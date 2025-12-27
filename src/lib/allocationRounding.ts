/**
 * Banker's rounding algorithm for percentage allocations
 * Ensures sum of allocations equals 100% of income without rounding errors
 */

import { safeNumber } from "./validators";
import { logger } from "./logger";

interface AllocationItem {
  id: string;
  name: string;
  percentage: number;
  rawAmount: number;
  roundedAmount: number;
  fractionalPart: number;
}

/**
 * Distributes amount across allocations using Banker's rounding
 * This ensures the sum equals the total without rounding errors
 * 
 * @param allocations - Array of {id, name, percentage}
 * @param totalAmount - Total amount to distribute
 * @returns Array of {id, name, allocatedAmount}
 */
export const distributeBudgetWithRounding = (
  allocations: Array<{ id: string; name: string; percentage: number }>,
  totalAmount: number
): Array<{ id: string; name: string; allocatedAmount: number }> => {
  if (allocations.length === 0) return [];
  if (!safeNumber(totalAmount) || totalAmount <= 0) return allocations.map(a => ({ ...a, allocatedAmount: 0 }));
  
  // Step 1: Calculate raw amounts and round down
  const items: AllocationItem[] = allocations.map(alloc => {
    const rawAmount = (totalAmount * alloc.percentage) / 100;
    const roundedAmount = Math.floor(rawAmount);
    const fractionalPart = rawAmount - roundedAmount;
    
    return {
      id: alloc.id,
      name: alloc.name,
      percentage: alloc.percentage,
      rawAmount,
      roundedAmount,
      fractionalPart
    };
  });
  
  // Step 2: Calculate remainder to distribute
  const sumRounded = items.reduce((sum, item) => sum + item.roundedAmount, 0);
  const remainder = Math.round(totalAmount - sumRounded);
  
  logger.debug('Budget distribution:', {
    totalAmount,
    sumRounded,
    remainder,
    allocations: items.length
  });
  
  // Step 3: Distribute remainder to items with largest fractional parts
  if (remainder > 0) {
    // Sort by fractional part (descending)
    const sorted = [...items].sort((a, b) => b.fractionalPart - a.fractionalPart);
    
    // Add 1 to top N items
    for (let i = 0; i < remainder && i < sorted.length; i++) {
      sorted[i].roundedAmount += 1;
    }
    
    // Update original items
    sorted.forEach(sortedItem => {
      const item = items.find(i => i.id === sortedItem.id);
      if (item) {
        item.roundedAmount = sortedItem.roundedAmount;
      }
    });
  }
  
  // Step 4: Verify sum equals total
  const finalSum = items.reduce((sum, item) => sum + item.roundedAmount, 0);
  if (Math.abs(finalSum - totalAmount) > 0.01) {
    logger.warn('Rounding produced incorrect sum:', { finalSum, totalAmount, diff: finalSum - totalAmount });
  }
  
  return items.map(item => ({
    id: item.id,
    name: item.name,
    allocatedAmount: item.roundedAmount
  }));
};

/**
 * Validates that percentage allocations sum to reasonable total
 */
export const validatePercentageSum = (
  percentages: number[]
): { isValid: boolean; total: number; message?: string } => {
  const total = percentages.reduce((sum, p) => sum + safeNumber(p), 0);
  
  if (total > 100) {
    return {
      isValid: false,
      total,
      message: `Сумма процентов (${total.toFixed(1)}%) превышает 100%`
    };
  }
  
  if (total > 0 && total < 50) {
    return {
      isValid: true,
      total,
      message: `Распределено только ${total.toFixed(1)}% бюджета`
    };
  }
  
  return { isValid: true, total };
};

/**
 * Adjusts percentages to sum to exactly 100%
 */
export const normalizePercentages = (
  percentages: Array<{ id: string; value: number }>
): Array<{ id: string; value: number }> => {
  const total = percentages.reduce((sum, p) => sum + p.value, 0);
  
  if (total === 0) return percentages;
  if (total === 100) return percentages;
  
  // Scale all percentages proportionally
  const scale = 100 / total;
  
  const normalized = percentages.map(p => ({
    id: p.id,
    value: Math.floor(p.value * scale * 100) / 100 // Round to 2 decimals
  }));
  
  // Handle remaining fractional percent
  const newTotal = normalized.reduce((sum, p) => sum + p.value, 0);
  const remainder = 100 - newTotal;
  
  if (Math.abs(remainder) > 0.01) {
    // Add remainder to largest allocation
    const largest = normalized.reduce((max, p) => p.value > max.value ? p : max);
    largest.value += remainder;
  }
  
  return normalized;
};
