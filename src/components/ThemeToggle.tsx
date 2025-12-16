import { Moon, Sun, Sparkles, TreePine, Eye } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const getThemeIcon = () => {
    switch (theme) {
      case "light":
        return <Sun className="h-4 w-4" />;
      case "euphoric":
        return <Sparkles className="h-4 w-4" />;
      case "newyear":
        return <TreePine className="h-4 w-4" />;
      case "night":
        return <Eye className="h-4 w-4" />;
      default:
        return <Moon className="h-4 w-4" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          {getThemeIcon()}
          <span className="sr-only">Переключить тему</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          <span>Светлая</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          <span>Темная</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("euphoric")}>
          <Sparkles className="mr-2 h-4 w-4" />
          <span>Айфори</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("newyear")}>
          <TreePine className="mr-2 h-4 w-4" />
          <span>Новогодняя</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("night")}>
          <Eye className="mr-2 h-4 w-4" />
          <span>Ночная</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

