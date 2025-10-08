import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { IncomeSource } from "@/types/budget";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

const incomeSourceSchema = z.object({
  name: z.string().min(1, "Название обязательно").max(100),
  frequency: z.string().min(1, "Периодичность обязательна"),
});

interface IncomeSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: IncomeSource;
  onSave: (source: Omit<IncomeSource, "id"> & { id?: string }) => void;
}

export function IncomeSourceDialog({ open, onOpenChange, source, onSave }: IncomeSourceDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("");
  const [color, setColor] = useState("#10b981");

  useEffect(() => {
    if (source) {
      setName(source.name);
      setFrequency(source.frequency || "");
      setColor(source.color);
    } else {
      setName("");
      setFrequency("");
      setColor("#10b981");
    }
  }, [source, open]);

  const handleSave = () => {
    try {
      const validated = incomeSourceSchema.parse({
        name: name.trim(),
        frequency: frequency.trim(),
      });

      onSave({
        id: source?.id,
        name: validated.name,
        frequency: validated.frequency,
        color,
      });

      onOpenChange(false);
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Ошибка валидации",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {source ? "Редактировать источник" : "Добавить источник дохода"}
          </DialogTitle>
          <DialogDescription>
            {source
              ? "Измените данные источника дохода"
              : "Создайте новый источник дохода"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Название</Label>
            <Input
              id="name"
              placeholder="Зарплата, Фриланс..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="frequency">Периодичность</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите периодичность" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="Ежемесячно">Ежемесячно</SelectItem>
                <SelectItem value="Еженедельно">Еженедельно</SelectItem>
                <SelectItem value="Разово">Разово</SelectItem>
                <SelectItem value="Ежегодно">Ежегодно</SelectItem>
                <SelectItem value="Ежеквартально">Ежеквартально</SelectItem>
                <SelectItem value="Непостоянно">Непостоянно</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="color">Цвет</Label>
            <div className="flex items-center gap-2">
              <Input
                id="color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-20 h-10"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave}>
            {source ? "Сохранить" : "Добавить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
