import { useState } from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuItem
} from '@/components/ui/dropdown-menu';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
}

function NotificationItem({ notification, onMarkAsRead, onDelete }: NotificationItemProps) {
  const isRead = !!notification.read_at;
  
  const getIcon = () => {
    switch (notification.type) {
      case 'income':
        return '💰';
      case 'expense':
        return '💸';
      case 'budget_warning':
        return '⚠️';
      case 'system':
        return '🔔';
      default:
        return '📢';
    }
  };

  const getTypeColor = () => {
    switch (notification.type) {
      case 'income':
        return 'text-green-600';
      case 'expense':
        return 'text-red-600';
      case 'budget_warning':
        return 'text-yellow-600';
      case 'system':
        return 'text-blue-600';
      default:
        return 'text-gray-600';
    }
  };

  return (
    <div className={cn(
      "p-3 hover:bg-accent/50 transition-colors",
      !isRead && "bg-blue-50/50 border-l-2 border-l-blue-500"
    )}>
      <div className="flex items-start gap-3">
        <div className="text-lg">{getIcon()}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={cn(
              "text-sm font-medium",
              !isRead && "font-semibold"
            )}>
              {notification.title}
            </h4>
            <div className="flex items-center gap-1">
              {!isRead && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-accent"
                  onClick={() => onMarkAsRead(notification.id)}
                >
                  <Check className="h-3 w-3 text-foreground" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 w-6 p-0 hover:text-destructive",
                  !isRead ? "text-foreground/70 hover:text-destructive" : "text-muted-foreground hover:text-destructive"
                )}
                onClick={() => onDelete(notification.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
          <p className={cn(
            "text-sm mt-1",
            !isRead ? "text-foreground" : "text-muted-foreground"
          )}>
            {notification.message}
            {notification.data?.actor_name && (
              <span className="block text-xs text-muted-foreground mt-1">Добавил: {notification.data.actor_name}</span>
            )}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={cn("text-xs", getTypeColor())}>
              {notification.type === 'income' && 'Доход'}
              {notification.type === 'expense' && 'Расход'}
              {notification.type === 'budget_warning' && 'Предупреждение'}
              {notification.type === 'system' && 'Система'}
            </span>
            <span className={cn(
              "text-xs",
              !isRead ? "text-foreground/80" : "text-muted-foreground"
            )}>
              {formatDistanceToNow(new Date(notification.created_at), { 
                addSuffix: true, 
                locale: ru 
              })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface NotificationCenterProps {
  className?: string;
}

export function NotificationCenter({ className }: NotificationCenterProps) {
  const { 
    notifications, 
    stats, 
    loading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification 
  } = useNotifications();
  
  const [isOpen, setIsOpen] = useState(false);

  const unreadNotifications = notifications.filter(n => !n.read_at);
  const readNotifications = notifications.filter(n => n.read_at);

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className={cn("relative", className)}>
          <Bell className="h-5 w-5" />
          {stats.unread > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {stats.unread > 99 ? '99+' : stats.unread}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Уведомления</h3>
            <div className="flex items-center gap-2">
              {stats.unread > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="h-7 px-2 text-xs"
                >
                  <CheckCheck className="h-3 w-3 mr-1" />
                  Прочитать все
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
          {stats.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {stats.unread} непрочитанных из {stats.total}
            </p>
          )}
        </div>
        
        <Separator />
        
        <ScrollArea className="h-96">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">
              Загрузка уведомлений...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Нет уведомлений</p>
            </div>
          ) : (
            <div>
              {unreadNotifications.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground">
                      Непрочитанные ({unreadNotifications.length})
                    </p>
                  </div>
                  {unreadNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={markAsRead}
                      onDelete={deleteNotification}
                    />
                  ))}
                </>
              )}
              
              {readNotifications.length > 0 && unreadNotifications.length > 0 && (
                <Separator />
              )}
              
              {readNotifications.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">
                      Прочитанные ({readNotifications.length})
                    </p>
                  </div>
                  {readNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onMarkAsRead={markAsRead}
                      onDelete={deleteNotification}
                    />
                  ))}
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
