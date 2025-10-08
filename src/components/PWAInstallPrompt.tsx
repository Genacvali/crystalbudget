import { useState, useEffect } from "react";
import { X, Download, Smartphone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import crystalIcon from "@/assets/crystal-icon.png";

export function PWAInstallPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Check if already dismissed
    const dismissed = localStorage.getItem("pwa-install-dismissed");
    if (dismissed) return;

    // Check if already installed
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
    if (isStandalone) return;

    // Detect platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    const android = /android/.test(userAgent);

    setIsIOS(ios);
    setIsAndroid(android);

    // Show prompt after a delay
    const timer = setTimeout(() => {
      setShowPrompt(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa-install-dismissed", "true");
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in">
      <Card className="border-2 border-primary/50 shadow-xl bg-gradient-to-br from-card to-card/95 backdrop-blur">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0">
              <img src={crystalIcon} alt="CrystalBudget" className="w-12 h-12" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  Установите CrystalBudget
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 -mt-1"
                  onClick={handleDismiss}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground mb-3">
                Добавьте приложение на главный экран для быстрого доступа
              </p>

              {isIOS && (
                <div className="space-y-2 text-xs">
                  <p className="font-medium flex items-center gap-1.5">
                    <Download className="h-3 w-3" />
                    Инструкция для iOS:
                  </p>
                  <ol className="space-y-1 pl-5 text-muted-foreground list-decimal">
                    <li>Нажмите кнопку "Поделиться" (квадрат со стрелкой вверх)</li>
                    <li>Прокрутите вниз и выберите "На экран Домой"</li>
                    <li>Нажмите "Добавить" в правом верхнем углу</li>
                  </ol>
                </div>
              )}

              {isAndroid && (
                <div className="space-y-2 text-xs">
                  <p className="font-medium flex items-center gap-1.5">
                    <Download className="h-3 w-3" />
                    Инструкция для Android:
                  </p>
                  <ol className="space-y-1 pl-5 text-muted-foreground list-decimal">
                    <li>Нажмите меню (три точки) в браузере</li>
                    <li>Выберите "Установить приложение" или "Добавить на главный экран"</li>
                    <li>Подтвердите установку</li>
                  </ol>
                </div>
              )}

              {!isIOS && !isAndroid && (
                <div className="space-y-2 text-xs">
                  <p className="font-medium flex items-center gap-1.5">
                    <Download className="h-3 w-3" />
                    Инструкция:
                  </p>
                  <p className="text-muted-foreground">
                    Используйте меню браузера, чтобы установить это приложение на ваше устройство
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
