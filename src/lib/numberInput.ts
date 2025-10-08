/**
 * Обработчик изменения для числовых полей ввода
 * Разрешает только цифры, точку и запятую
 */
export const handleNumericInput = (
  value: string,
  callback: (value: string) => void
) => {
  // Разрешаем только цифры, точку и запятую
  const numericValue = value.replace(/[^\d.,]/g, '');
  
  // Заменяем запятую на точку для унификации
  const normalizedValue = numericValue.replace(',', '.');
  
  // Разрешаем только одну точку
  const parts = normalizedValue.split('.');
  const finalValue = parts.length > 2 
    ? parts[0] + '.' + parts.slice(1).join('')
    : normalizedValue;
  
  callback(finalValue);
};
