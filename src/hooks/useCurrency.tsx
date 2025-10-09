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
    return `${amount.toLocaleString('ru-RU')} ${symbol}`;
  };

  return {
    currency,
    formatAmount
  };
}
