import { ReactNode } from "react";
import { Navigation } from "./Navigation";
import { MobileNav } from "./MobileNav";
import { MonthSelector } from "./MonthSelector";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import crystalLogo from "@/assets/crystal-logo.png";
interface LayoutProps {
  children: ReactNode;
  selectedDate: Date;
  onDateChange: (date: Date) => void;
  showMonthSelector?: boolean;
}
export function Layout({
  children,
  selectedDate,
  onDateChange,
  showMonthSelector = true
}: LayoutProps) {
  return <div className="min-h-screen bg-gradient-to-br from-background to-secondary/30">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <MobileNav selectedDate={selectedDate} onDateChange={onDateChange} />
              <div className="hidden xl:flex xl:items-center xl:gap-2">
                <img src={crystalLogo} alt="Crystal" className="w-8 h-8" />
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  CrystalBudget
                </h1>
              </div>
            </div>

            <div className="hidden xl:flex">
              <Navigation />
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="hidden lg:flex lg:min-w-[280px]">
                {showMonthSelector && <MonthSelector selectedDate={selectedDate} onDateChange={onDateChange} />}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {children}
      </main>

      <PWAInstallPrompt />
    </div>;
}