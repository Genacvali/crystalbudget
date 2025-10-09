import { useState, useEffect } from "react";

const currencySymbols: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "¥",
  KRW: "₩",
  GEL: "₾",
  AMD: "֏",
};

// Fallback курсы валют к рублю (если API недоступен)
const fallbackRates: Record<string, number> = {
  RUB: 1,
  USD: 0.01,
  EUR: 0.011,
  GBP: 0.012,
  JPY: 0.67,
  CNY: 0.014,
  KRW: 0.075,
  GEL: 0.033,
  AMD: 0.25,
};

// Загрузка курсов валют
const fetchExchangeRates = async (): Promise<Record<string, number>> => {
  try {
    // Используем API ЦБ РФ (бесплатный, без ключа)
    const response = await fetch('https://www.cbr-xml-daily.ru/latest.js');
    const data = await response.json();

    if (!data.rates) {
      throw new Error('Invalid API response');
    }

    // ЦБ РФ отдает курсы к евро, конвертируем к рублю
    const eurToRub = 1 / data.rates.RUB;

    const rates: Record<string, number> = {
      RUB: 1,
      USD: data.rates.USD ? data.rates.USD / data.rates.RUB : fallbackRates.USD,
      EUR: eurToRub,
      GBP: data.rates.GBP ? data.rates.GBP / data.rates.RUB : fallbackRates.GBP,
      JPY: data.rates.JPY ? data.rates.JPY / data.rates.RUB : fallbackRates.JPY,
      CNY: data.rates.CNY ? data.rates.CNY / data.rates.RUB : fallbackRates.CNY,
      KRW: data.rates.KRW ? data.rates.KRW / data.rates.RUB : fallbackRates.KRW,
      GEL: data.rates.GEL ? data.rates.GEL / data.rates.RUB : fallbackRates.GEL,
      AMD: data.rates.AMD ? data.rates.AMD / data.rates.RUB : fallbackRates.AMD,
    };

    // Кешируем на 24 часа
    localStorage.setItem('exchangeRates', JSON.stringify({
      rates,
      timestamp: Date.now()
    }));

    return rates;
  } catch (error) {
    console.error('Failed to fetch exchange rates:', error);
    return fallbackRates;
  }
};

// Получить курсы из кеша или загрузить новые
const getExchangeRates = async (): Promise<Record<string, number>> => {
  const cached = localStorage.getItem('exchangeRates');

  if (cached) {
    try {
      const { rates, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      const maxAge = 24 * 60 * 60 * 1000; // 24 часа

      // Если кеш свежий - используем его
      if (age < maxAge) {
        return rates;
      }
    } catch (e) {
      console.error('Failed to parse cached rates:', e);
    }
  }

  // Кеш устарел или отсутствует - загружаем новые
  return await fetchExchangeRates();
};

export function useCurrency() {
  const [currency, setCurrency] = useState(localStorage.getItem("currency") || "RUB");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>(fallbackRates);

  useEffect(() => {
    // Загружаем курсы при монтировании
    getExchangeRates().then(setExchangeRates);

    const handleStorageChange = () => {
      setCurrency(localStorage.getItem("currency") || "RUB");
    };

    window.addEventListener("storage", handleStorageChange);

    // Custom event for same-tab updates
    window.addEventListener("currencyChange", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("currencyChange", handleStorageChange);
    };
  }, []);

  // Конвертирует сумму из рублей в выбранную валюту
  const convertFromRubles = (amountInRubles: number): number => {
    const rate = exchangeRates[currency] || 1;
    return amountInRubles * rate;
  };

  // Конвертирует сумму из выбранной валюты в рубли
  const convertToRubles = (amount: number): number => {
    const rate = exchangeRates[currency] || 1;
    return amount / rate;
  };

  const formatAmount = (amountInRubles: number): string => {
    const convertedAmount = convertFromRubles(amountInRubles);
    const symbol = currencySymbols[currency] || "₽";
    return `${convertedAmount.toLocaleString('ru-RU')} ${symbol}`;
  };

  return { 
    currency, 
    formatAmount, 
    convertFromRubles, 
    convertToRubles 
  };
}
