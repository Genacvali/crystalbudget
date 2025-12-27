/**
 * Centralized budget calculation logic
 * Used across Dashboard, Categories, and Reports pages
 */

import { Category, CategoryAllocation, Income, IncomeSource, Expense, CategoryBudget } from "@/types/budget";
import { safeNumber, validateAmount } from "./validators";
import { logger } from "./logger";

interface CalculateBudgetParams {
  category: Category;
  incomes: Income[];
  expenses: Expense[];
  incomeSources: IncomeSource[];
  categoryDebts?: Record<string, Record<string, number>>;
  categoryCarryOvers?: Record<string, Record<string, number>>;
  userCurrency?: string;
}

/**
 * Calculate budget for a single category with multi-currency support
 */
export const calculateCategoryBudget = ({
  category,
  incomes,
  expenses,
  incomeSources,
  categoryDebts = {},
  categoryCarryOvers = {},
  userCurrency = 'RUB'
}: CalculateBudgetParams): CategoryBudget => {
  // Group expenses by currency
  const expensesByCurrency: Record<string, number> = {};
  const categoryExpenses = expenses.filter(exp => exp.category_id === category.id);

  categoryExpenses.forEach(exp => {
    const expCurrency = exp.currency || userCurrency;
    expensesByCurrency[expCurrency] = (expensesByCurrency[expCurrency] || 0) + safeNumber(exp.amount);
  });

  // Calculate budgets by currency
  const budgetsByCurrency: Record<string, {
    allocated: number;
    spent: number;
    remaining: number;
    debt?: number;
    carryOver?: number;
  }> = {};

  // Group allocations by currency
  const allocationsByCurrency: Record<string, CategoryAllocation[]> = {};

  if (category.allocations && category.allocations.length > 0) {
    category.allocations.forEach(alloc => {
      const allocCurrency = alloc.currency || userCurrency;
      if (!allocationsByCurrency[allocCurrency]) {
        allocationsByCurrency[allocCurrency] = [];
      }
      allocationsByCurrency[allocCurrency].push(alloc);
    });
  } else {
    // Legacy support - use user's currency
    allocationsByCurrency[userCurrency] = [];
  }

  // Calculate allocated budget for each currency
  Object.keys(allocationsByCurrency).forEach(currency => {
    let allocated = 0;
    
    allocationsByCurrency[currency].forEach(alloc => {
      if (alloc.allocationType === 'amount') {
        allocated += safeNumber(alloc.allocationValue);
      } else if (alloc.allocationType === 'percent') {
        // Filter incomes by currency and source
        const sourceIncomes = incomes.filter(inc =>
          inc.source_id === alloc.incomeSourceId &&
          (inc.currency || userCurrency) === currency
        );
        const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + safeNumber(inc.amount), 0);
        const expectedSourceAmount = incomeSources.find(s => s.id === alloc.incomeSourceId)?.amount || 0;
        const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
        allocated += safeNumber(base * alloc.allocationValue / 100);
      }
    });

    // Legacy support - if no allocations, use legacy fields
    if (allocationsByCurrency[currency].length === 0) {
      if (category.allocationAmount) {
        allocated = safeNumber(category.allocationAmount);
      } else if (category.linkedSourceId && category.allocationPercent) {
        const sourceIncomes = incomes.filter(inc =>
          inc.source_id === category.linkedSourceId &&
          (inc.currency || userCurrency) === currency
        );
        const actualSourceTotal = sourceIncomes.reduce((sum, inc) => sum + safeNumber(inc.amount), 0);
        const expectedSourceAmount = incomeSources.find(s => s.id === category.linkedSourceId)?.amount || 0;
        const base = actualSourceTotal > 0 ? actualSourceTotal : expectedSourceAmount;
        allocated = safeNumber(base * category.allocationPercent / 100);
      }
    }

    const spent = expensesByCurrency[currency] || 0;
    const debt = (categoryDebts[category.id] || {})[currency] || 0;
    const carryOver = (categoryCarryOvers[category.id] || {})[currency] || 0;
    const totalAllocated = allocated + carryOver;

    budgetsByCurrency[currency] = {
      allocated: totalAllocated,
      spent,
      remaining: totalAllocated - spent - debt,
      debt,
      carryOver
    };
  });

  // Also add currencies that have expenses but no allocations
  Object.keys(expensesByCurrency).forEach(currency => {
    if (!budgetsByCurrency[currency]) {
      budgetsByCurrency[currency] = {
        allocated: 0,
        spent: expensesByCurrency[currency],
        remaining: -expensesByCurrency[currency],
        debt: 0,
        carryOver: 0
      };
    }
  });

  // Calculate total (for backward compatibility)
  let totalAllocated = 0;
  let totalSpent = 0;
  Object.values(budgetsByCurrency).forEach(budget => {
    totalAllocated += budget.allocated;
    totalSpent += budget.spent;
  });

  const totalDebt = Object.values(budgetsByCurrency).reduce((sum, b) => sum + (b.debt || 0), 0);
  const totalCarryOver = Object.values(budgetsByCurrency).reduce((sum, b) => sum + (b.carryOver || 0), 0);

  const currenciesCount = Object.keys(budgetsByCurrency).length;
  const hasCurrencies = currenciesCount > 0;

  return {
    categoryId: category.id,
    allocated: totalAllocated,
    spent: totalSpent,
    remaining: totalAllocated - totalSpent - totalDebt,
    debt: totalDebt,
    carryOver: totalCarryOver,
    budgetsByCurrency: hasCurrencies ? budgetsByCurrency : undefined
  };
};

/**
 * Calculate budgets for multiple categories
 */
export const calculateCategoryBudgets = (params: Omit<CalculateBudgetParams, 'category'> & { categories: Category[] }): CategoryBudget[] => {
  const { categories, ...rest } = params;
  return categories.map(category => calculateCategoryBudget({ category, ...rest }));
};

/**
 * Calculate totals by currency
 */
export const calculateBalancesByCurrency = (
  incomes: Income[],
  expenses: Expense[],
  userCurrency: string = 'RUB',
  carryOverBalance: number = 0
): Record<string, { income: number; expense: number; balance: number; totalBalance: number }> => {
  const incomeByCurrency: Record<string, number> = {};
  const expenseByCurrency: Record<string, number> = {};

  incomes.forEach(inc => {
    const currency = inc.currency || userCurrency;
    const amount = safeNumber(inc.amount);
    
    if (!validateAmount(amount)) {
      logger.warn('Balance - Невалидная сумма дохода:', inc.id);
      return;
    }
    
    incomeByCurrency[currency] = (incomeByCurrency[currency] || 0) + amount;
  });

  expenses.forEach(exp => {
    const currency = exp.currency || userCurrency;
    const amount = safeNumber(exp.amount);
    
    if (!validateAmount(amount)) {
      logger.warn('Balance - Невалидная сумма расхода:', exp.id);
      return;
    }
    
    expenseByCurrency[currency] = (expenseByCurrency[currency] || 0) + amount;
  });

  const allCurrencies = new Set([
    ...Object.keys(incomeByCurrency),
    ...Object.keys(expenseByCurrency)
  ]);

  const result: Record<string, {
    income: number;
    expense: number;
    balance: number;
    totalBalance: number;
  }> = {};

  allCurrencies.forEach(currency => {
    const income = incomeByCurrency[currency] || 0;
    const expense = expenseByCurrency[currency] || 0;
    const balance = income - expense;
    // Only add carry-over balance for primary currency
    const totalBalance = currency === userCurrency 
      ? balance + carryOverBalance
      : balance;

    result[currency] = { income, expense, balance, totalBalance };
  });

  return result;
};
