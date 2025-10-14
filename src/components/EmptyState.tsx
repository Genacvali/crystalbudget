import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: LucideIcon;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const ActionIcon = action?.icon;
  
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="rounded-full bg-muted/50 p-6 mb-4 animate-in fade-in zoom-in duration-300">
        <Icon className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-100">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200">
        {description}
      </p>
      {action && (
        <Button 
          onClick={action.onClick} 
          size="lg"
          className="animate-in fade-in slide-in-from-bottom-2 duration-300 delay-300"
        >
          {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
          {action.label}
        </Button>
      )}
    </div>
  );
}

