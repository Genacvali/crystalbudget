import { useEffect, useRef, ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isPulling = useRef<boolean>(false);
  const isRefreshing = useRef<boolean>(false);
  const refreshIndicatorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Только если прокрутка в самом верху
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing.current) return;

      currentY.current = e.touches[0].clientY;
      const diff = currentY.current - startY.current;

      // Только если тянем вниз и находимся в верху страницы
      if (diff > 0 && window.scrollY === 0) {
        e.preventDefault();

        const pullDistance = Math.min(diff * 0.5, 80); // Максимум 80px

        if (refreshIndicatorRef.current) {
          refreshIndicatorRef.current.style.height = `${pullDistance}px`;
          refreshIndicatorRef.current.style.opacity = `${Math.min(pullDistance / 80, 1)}`;

          // Вращаем индикатор
          const rotation = (pullDistance / 80) * 360;
          const icon = refreshIndicatorRef.current.querySelector('svg');
          if (icon) {
            icon.style.transform = `rotate(${rotation}deg)`;
          }
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current || isRefreshing.current) return;

      const diff = currentY.current - startY.current;
      isPulling.current = false;

      // Если потянули достаточно далеко (больше 60px)
      if (diff > 60 && window.scrollY === 0) {
        isRefreshing.current = true;

        if (refreshIndicatorRef.current) {
          refreshIndicatorRef.current.style.height = '60px';
          refreshIndicatorRef.current.classList.add('refreshing');
        }

        try {
          await onRefresh();
        } catch (error) {
          console.error('Refresh failed:', error);
        } finally {
          isRefreshing.current = false;

          if (refreshIndicatorRef.current) {
            refreshIndicatorRef.current.classList.remove('refreshing');
            refreshIndicatorRef.current.style.height = '0px';
            refreshIndicatorRef.current.style.opacity = '0';
          }
        }
      } else {
        // Анимация возврата
        if (refreshIndicatorRef.current) {
          refreshIndicatorRef.current.style.height = '0px';
          refreshIndicatorRef.current.style.opacity = '0';
        }
      }

      startY.current = 0;
      currentY.current = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onRefresh]);

  return (
    <div ref={containerRef} className="relative">
      <div
        ref={refreshIndicatorRef}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm overflow-hidden transition-all duration-200"
        style={{ height: 0, opacity: 0 }}
      >
        <Loader2 className="h-6 w-6 text-primary transition-transform duration-200" />
      </div>
      <style>{`
        .refreshing svg {
          animation: spin 1s linear infinite !important;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      {children}
    </div>
  );
}
