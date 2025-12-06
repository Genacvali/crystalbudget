import { useEffect, useRef, useState } from 'react';
import { useTelegramWebApp } from '@/hooks/useTelegramWebApp';

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginButtonProps {
  botName: string;
  onAuth: (user: TelegramUser) => void;
  buttonSize?: 'large' | 'medium' | 'small';
  cornerRadius?: number;
  requestAccess?: boolean;
}

declare global {
  interface Window {
    telegramLoginCallback?: (user: TelegramUser) => void;
    telegramLoginError?: (error: string) => void;
  }
}

export const TelegramLoginButton = ({
  botName,
  onAuth,
  buttonSize = 'large',
  cornerRadius = 8,
  requestAccess = true,
}: TelegramLoginButtonProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { isInTelegram } = useTelegramWebApp();

  useEffect(() => {
    // Create global callback function
    const callbackName = 'telegramLoginCallback';
    window[callbackName] = (user: TelegramUser) => {
      setError(null);
      onAuth(user);
    };

    // Create error callback
    const errorCallbackName = 'telegramLoginError';
    window[errorCallbackName] = (errorMsg: string) => {
      console.error('Telegram Widget error:', errorMsg);
      setError('Ошибка авторизации через Telegram. Попробуйте открыть приложение через Telegram.');
    };

    // Load Telegram Widget script
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', botName);
    script.setAttribute('data-size', buttonSize);
    script.setAttribute('data-radius', cornerRadius.toString());
    script.setAttribute('data-onauth', `${callbackName}(user)`);
    if (requestAccess) {
      script.setAttribute('data-request-access', 'write');
    }
    script.async = true;

    // Handle script load errors
    script.onerror = () => {
      setError('Не удалось загрузить виджет Telegram. Откройте приложение через Telegram.');
    };

    if (containerRef.current) {
      containerRef.current.appendChild(script);
    }

    return () => {
      // Cleanup
      if (containerRef.current && script.parentNode) {
        containerRef.current.removeChild(script);
      }
      delete window[callbackName];
      delete window[errorCallbackName];
    };
  }, [botName, buttonSize, cornerRadius, onAuth, requestAccess]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-4 text-center">
        <p className="text-sm text-muted-foreground mb-2">{error}</p>
        {!isInTelegram && (
          <p className="text-xs text-muted-foreground">
            Откройте приложение через Telegram бота для автоматического входа
          </p>
        )}
      </div>
    );
  }

  return <div ref={containerRef} className="flex justify-center" />;
};

