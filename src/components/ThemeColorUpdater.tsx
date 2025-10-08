import { useEffect } from 'react';
import { useTheme } from 'next-themes';

export function ThemeColorUpdater() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    // Определяем актуальную тему (system может быть dark или light)
    const currentTheme = theme === 'system' ? resolvedTheme : theme;
    
    // Цвета для статус-бара в зависимости от темы
    const themeColor = currentTheme === 'dark' ? '#0f172a' : '#ffffff';
    
    // Обновляем мета-тег theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeColor);
    }
  }, [theme, resolvedTheme]);

  return null;
}
