import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

const currencySymbols: Record<string, string> = {
  RUB: '₽', USD: '$', EUR: '€', GBP: '£',
  JPY: '¥', CNY: '¥', KRW: '₩', GEL: '₾', AMD: '֏'
};

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "success" | "destructive" | "warning";
  valuesByCurrency?: Record<string, number>; // Multi-currency support
  className?: string;
  action?: React.ReactNode;
  history?: number[]; // Array of values for trend chart
}

export function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend = "neutral",
  variant = "default",
  valuesByCurrency,
  className,
  action,
  history,
}: SummaryCardProps) {
  const variantClasses = {
    default: "bg-card border-border/60 shadow-sm hover:shadow-md hover:border-primary/20",
    success: "bg-card border-success/20 shadow-sm hover:shadow-md hover:border-success/40",
    destructive: "bg-card border-destructive/20 shadow-sm hover:shadow-md hover:border-destructive/40",
    warning: "bg-card border-yellow-500/20 shadow-sm hover:shadow-md hover:border-yellow-500/40",
  };

  const iconContainerClasses = {
    default: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-yellow-500/10 text-yellow-600",
  };

  const textClasses = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
    warning: "text-yellow-600",
  };

  // Prepare data for chart
  const chartData = history?.map((val, i) => ({ value: val })) || [];
  const isPositiveTrend = history && history.length > 1 && history[history.length - 1] >= history[0];
  const chartColor = variant === 'success' ? '#22c55e' : variant === 'destructive' ? '#ef4444' : '#3b82f6';

  return (
    <Card className={cn("transition-all duration-300 h-full flex flex-col", variantClasses[variant], className)}>
      <CardContent className="p-5 flex flex-col flex-1">
        <div className="flex items-start justify-between mb-4">
          <div className={cn(
            "p-2.5 rounded-xl flex items-center justify-center shrink-0",
            iconContainerClasses[variant]
          )}>
            <Icon className="h-5 w-5" />
          </div>
          {action && (
            <div className="shrink-0">
              {action}
            </div>
          )}
        </div>

        <div className="space-y-1 flex-1 flex flex-col">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          
          <div className="flex items-end justify-between gap-4 flex-1">
            <div className="flex-1 min-w-0">
              {valuesByCurrency && Object.keys(valuesByCurrency).length > 1 ? (
                // Multiple currencies - show separate values
                <div className="space-y-1">
                  {Object.entries(valuesByCurrency).map(([currency, amount]) => {
                    const symbol = currencySymbols[currency] || currency;
                    return (
                      <p key={currency} className={cn("text-2xl font-bold break-words tracking-tight", textClasses[variant])}>
                        {Math.round(amount).toLocaleString('ru-RU')} <span className="text-lg">{symbol}</span>
                      </p>
                    );
                  })}
                </div>
              ) : (
                // Single currency - show standard value
                <p className={cn("text-3xl font-bold break-words tracking-tight", textClasses[variant])}>
                  {value}
                </p>
              )}
            </div>

            {/* Mini Chart */}
            {history && history.length > 0 && (
              <div className="h-[40px] w-[80px] shrink-0 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <Area 
                      type="monotone" 
                      dataKey="value" 
                      stroke={chartColor} 
                      fill={chartColor} 
                      fillOpacity={0.2} 
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1 font-medium">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
