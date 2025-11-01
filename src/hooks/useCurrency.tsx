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

  const formatAmount = (amount: number): string => {
    const symbol = currencySymbols[currency] || "₽";
    return `${Math.round(amount).toLocaleString('ru-RU')} ${symbol}`;
  };

  // Convert from current currency to RUB (for storage)
  const convertToRubles = (amount: number): number => {
    // For now, we store everything in the selected currency
    // In the future, this could use exchange rates
    return amount;
  };

  // Convert from RUB to current currency (for display)
  const convertFromRubles = (amount: number): number => {
    // For now, we store everything in the selected currency
    // In the future, this could use exchange rates
    return amount;
  };

  return {
    currency,
    formatAmount,
    convertToRubles,
    convertFromRubles
  };
}
