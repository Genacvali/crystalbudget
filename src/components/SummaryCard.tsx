import { Card, CardContent } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  variant?: "default" | "success" | "destructive";
}

export function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend = "neutral",
  variant = "default",
}: SummaryCardProps) {
  const variantClasses = {
    default: "bg-card border-border",
    success: "bg-success/5 border-success/20",
    destructive: "bg-destructive/5 border-destructive/20",
  };

  const textClasses = {
    default: "text-foreground",
    success: "text-success",
    destructive: "text-destructive",
  };

  return (
    <Card className={cn("hover:shadow-md transition-shadow", variantClasses[variant])}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1 sm:space-y-2 min-w-0 flex-1">
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">{title}</p>
            <p className={cn("text-xl sm:text-3xl font-bold break-words", textClasses[variant])}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            "p-2 sm:p-3 rounded-lg flex-shrink-0",
            variant === "success" && "bg-success/10",
            variant === "destructive" && "bg-destructive/10",
            variant === "default" && "bg-primary/10"
          )}>
            <Icon className={cn(
              "h-4 w-4 sm:h-6 sm:w-6",
              textClasses[variant]
            )} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
