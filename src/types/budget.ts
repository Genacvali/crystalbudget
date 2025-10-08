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
  sourceId: string;
  amount: number;
  date: string;
  description?: string;
}

export interface Expense {
  id: string;
  categoryId: string;
  amount: number;
  date: string;
  description?: string;
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
}

export interface SourceSummary {
  sourceId: string;
  totalIncome: number;
  totalSpent: number;
  remaining: number;
  debt: number;
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
