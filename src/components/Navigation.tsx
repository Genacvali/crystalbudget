import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  TrendingUp,
  FolderOpen,
  Receipt,
  BarChart3,
  Settings,
} from "lucide-react";

const navItems = [
  { path: "/", label: "Главное", icon: LayoutDashboard },
  { path: "/incomes", label: "Доходы", icon: TrendingUp },
  { path: "/categories", label: "Категории", icon: FolderOpen },
  { path: "/transactions", label: "Транзакции", icon: Receipt },
  { path: "/reports", label: "Отчёты", icon: BarChart3 },
  { path: "/settings", label: "Настройки", icon: Settings },
];

export function Navigation() {
  const location = useLocation();

  return (
    <nav className="hidden md:flex items-center gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;

        return (
          <Link
            key={item.path}
            to={item.path}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <Icon className="h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export { navItems };
