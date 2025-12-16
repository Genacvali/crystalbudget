import { useEffect } from 'react';
import { useTheme } from 'next-themes';

export function ThemeColorUpdater() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    // Определяем актуальную тему (system может быть dark или light)
    const currentTheme = theme === 'system' ? resolvedTheme : theme;
    
    // Цвета для статус-бара в зависимости от темы
    let themeColor = '#ffffff';
    if (currentTheme === 'dark') {
      themeColor = '#0f172a';
    } else if (currentTheme === 'euphoric') {
      themeColor = '#f3e8ff'; // Светло-фиолетовый для euphoric темы
    } else if (currentTheme === 'newyear') {
      themeColor = '#fef2f2'; // Светло-красный для новогодней темы
    } else if (currentTheme === 'night') {
      themeColor = '#0a0e1a'; // Очень темный для ночной темы
    }
    
    // Обновляем мета-тег theme-color
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', themeColor);
    }
  }, [theme, resolvedTheme]);

  return null;
}
