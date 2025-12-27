export interface IncomeSource {
  id: string;
  name: string;
  color: string;
  amount?: number;
  frequency?: string;
  receivedDate?: string;
}

export interface CategoryAllocation {
  id?: string;
  incomeSourceId: string;
  allocationType: 'amount' | 'percent';
  allocationValue: number;
  currency?: string; // Currency for this allocation (default: user's currency)
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  allocations?: CategoryAllocation[];
  // Legacy fields for backward compatibility
  linkedSourceId?: string;
  allocationAmount?: number;
  allocationPercent?: number;
}

export interface Income {
  id: string;
  source_id: string; // Changed from sourceId to match DB schema
  amount: number;
  date: string;
  description?: string;
  currency?: string; // Currency of the income
}

export interface Expense {
  id: string;
  category_id: string | null; // Changed from categoryId to match DB schema
  source_id?: string | null; // Optional income source for the expense
  amount: number;
  date: string;
  description?: string;
  currency?: string; // Currency of the expense
}

export interface MonthData {
  month: string;
  incomes: Income[];
  expenses: Expense[];
  carryOverBalance: number;
}

export interface CategoryBudget {
  categoryId: string;
  allocated: number;
  spent: number;
  remaining: number;
  debt?: number; // Debt from previous month
  carryOver?: number; // Positive balance from previous month
  // Multi-currency support
  budgetsByCurrency?: Record<string, {
    allocated: number;
    spent: number;
    remaining: number;
    debt?: number;
    carryOver?: number;
  }>;
}

export interface SourceSummary {
  sourceId: string;
  totalIncome: number;
  totalSpent: number;
  remaining: number;
  debt: number;
  // Multi-currency support
  summariesByCurrency?: Record<string, {
    totalIncome: number;
    totalSpent: number;
    remaining: number;
    debt: number;
  }>;
}

export type SubscriptionPlanType = 'trial' | 'monthly' | 'quarterly' | 'yearly';
export type SubscriptionStatus = 'active' | 'expired' | 'cancelled';

export interface Subscription {
  id: string;
  user_id: string;
  plan_type: SubscriptionPlanType;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string;
  amount?: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  type: SubscriptionPlanType;
  name: string;
  price: number;
  duration: string;
  description: string;
}
