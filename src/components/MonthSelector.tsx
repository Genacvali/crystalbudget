import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
interface MonthSelectorProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}
export function MonthSelector({
  selectedDate,
  onDateChange
}: MonthSelectorProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const handlePrevMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    onDateChange(newDate);
  };
  const handleNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    onDateChange(newDate);
  };
  return <div className="flex w-full items-center justify-between gap-1 sm:gap-2 mx-0">
      <Button variant="outline" size="icon" onClick={handlePrevMonth} className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0">
        <ChevronLeft className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>

      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <div className="flex-1 flex items-center justify-center gap-1.5 cursor-pointer">
            <CalendarIcon className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
            <span className="text-sm font-medium">{format(selectedDate, "MMM yyyy")}</span>
          </div>
        </PopoverTrigger>
        <PopoverContent disablePortal className="w-auto p-0 bg-popover z-50" align="start" side="top" sideOffset={8} avoidCollisions collisionPadding={8}>
          <Calendar mode="single" selected={selectedDate} onSelect={date => date && onDateChange(date)} initialFocus className={cn("p-2 pointer-events-auto")} />
          <Separator />
          <div className="flex gap-2 p-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onDateChange(new Date());
              }}
              className="flex-1 text-xs h-8"
            >
              Сегодня
            </Button>
            <Button
              size="sm"
              onClick={() => setIsCalendarOpen(false)}
              className="flex-1 text-xs h-8"
            >
              ОК
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="icon" onClick={handleNextMonth} className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0">
        <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4" />
      </Button>
    </div>;
}