import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bot, Zap, Camera, MessageSquare, Settings } from "lucide-react";

interface TelegramGuideProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnectNow: () => void;
}

export function TelegramGuide({ open, onOpenChange, onConnectNow }: TelegramGuideProps) {
  const handleSkip = () => {
    localStorage.setItem("telegram_guide_shown", "true");
    onOpenChange(false);
  };

  const handleConnect = () => {
    localStorage.setItem("telegram_guide_shown", "true");
    onConnectNow();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bot className="h-6 w-6 text-primary" />
            Telegram бот для CrystalBudget
          </DialogTitle>
          <DialogDescription>
            Управляйте финансами ещё проще и быстрее!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-6 text-center space-y-3">
            <Bot className="h-12 w-12 text-primary mx-auto" />
            <p className="text-lg font-semibold">
              У нас есть Telegram бот! 🎉
            </p>
            <p className="text-sm text-muted-foreground">
              Добавляйте транзакции прямо из мессенджера за пару секунд
            </p>
          </div>

          <div className="space-y-3">
            <p className="font-medium text-sm">Что умеет бот:</p>
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Быстрое добавление</p>
                  <p className="text-xs text-muted-foreground">
                    Добавляйте доходы и расходы через удобные кнопки в Telegram
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Camera className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Сканирование чеков</p>
                  <p className="text-xs text-muted-foreground">
                    Просто сфотографируйте чек - AI автоматически распознает сумму и категорию
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">Проверка баланса</p>
                  <p className="text-xs text-muted-foreground">
                    Узнавайте текущий баланс, доходы и расходы не открывая приложение
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
            <Settings className="h-3 w-3 inline mr-1" />
            Вы всегда можете настроить Telegram бот позже в разделе <span className="font-medium">Настройки</span>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleSkip} className="flex-1">
              Может позже
            </Button>
            <Button onClick={handleConnect} className="flex-1">
              Подключить сейчас
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
