import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { navItems } from "./Navigation";
import { MonthSelector } from "./MonthSelector";
import crystalLogo from "@/assets/crystal-logo.png";
interface MobileNavProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}
export function MobileNav({
  selectedDate,
  onDateChange
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="xl:hidden mx-0 px-[24px]">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <SheetHeader>
          <SheetTitle>
            <div className="flex items-center gap-2">
              <img src={crystalLogo} alt="Crystal" className="w-7 h-7" />
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                CrystalBudget
              </span>
            </div>
          </SheetTitle>
        </SheetHeader>
        <nav className="mt-8 flex flex-col gap-2">
          {navItems.map(item => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return <Link key={item.path} to={item.path} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>;
        })}
        </nav>
        
        <div className="mt-6 px-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground mb-2">Выбор периода</p>
          <MonthSelector selectedDate={selectedDate} onDateChange={onDateChange} />
        </div>
      </SheetContent>
    </Sheet>;
}