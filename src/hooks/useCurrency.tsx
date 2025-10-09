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

// Примерные курсы валют к рублю (можно заменить на API)
const exchangeRates: Record<string, number> = {
  RUB: 1,
  USD: 0.01, // 1 USD = 100 RUB
  EUR: 0.011, // 1 EUR = 90 RUB
  GBP: 0.012, // 1 GBP = 85 RUB
  JPY: 0.067, // 1 JPY = 15 RUB
  CNY: 0.014, // 1 CNY = 70 RUB
  KRW: 0.0075, // 1 KRW = 130 RUB
  GEL: 0.033, // 1 GEL = 30 RUB
  AMD: 0.025, // 1 AMD = 40 RUB
};

export function useCurrency() {
  const [currency, setCurrency] = useState(localStorage.getItem("currency") || "RUB");

  useEffect(() => {
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
