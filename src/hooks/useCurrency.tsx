import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { CURRENCY_SYMBOLS } from "@/constants";

export function useCurrency() {
  const { user } = useAuth();
  const [currency, setCurrency] = useState(localStorage.getItem("currency") || "RUB");
  const [isLoading, setIsLoading] = useState(true);

  // Load currency from database on mount and when user changes
  useEffect(() => {
    const loadCurrencyFromDB = async () => {
      if (!user) {
        // If no user, use localStorage or default
        const localCurrency = localStorage.getItem("currency") || "RUB";
        setCurrency(localCurrency);
        setIsLoading(false);
        return;
      }

      try {
        // Try to load from database
        const { data, error } = await supabase
          .from("user_preferences")
          .select("currency")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error("Error loading currency from DB:", error);
        }

        const dbCurrency = data?.currency || "RUB";
        
        // Sync with localStorage
        const localCurrency = localStorage.getItem("currency");
        
        // If DB has currency, use it and update localStorage
        if (data?.currency) {
          setCurrency(dbCurrency);
          if (localCurrency !== dbCurrency) {
            localStorage.setItem("currency", dbCurrency);
          }
        } else if (localCurrency) {
          // If no DB currency but localStorage has one, save to DB
          setCurrency(localCurrency);
          await supabase
            .from("user_preferences")
            .upsert({
              user_id: user.id,
              currency: localCurrency
            }, {
              onConflict: "user_id"
            });
        } else {
          // Default to RUB
          setCurrency("RUB");
          localStorage.setItem("currency", "RUB");
          await supabase
            .from("user_preferences")
            .upsert({
              user_id: user.id,
              currency: "RUB"
            }, {
              onConflict: "user_id"
            });
        }
      } catch (error) {
        console.error("Error in loadCurrencyFromDB:", error);
        // Fallback to localStorage or default
        const localCurrency = localStorage.getItem("currency") || "RUB";
        setCurrency(localCurrency);
      } finally {
        setIsLoading(false);
      }
    };

    loadCurrencyFromDB();
  }, [user]);

  useEffect(() => {
    const handleStorageChange = () => {
      const newCurrency = localStorage.getItem("currency") || "RUB";
      setCurrency(newCurrency);
      
      // Sync to DB if user is logged in
      if (user) {
        supabase
          .from("user_preferences")
          .upsert({
            user_id: user.id,
            currency: newCurrency
          }, {
            onConflict: "user_id"
          })
          .then(({ error }) => {
            if (error) {
              console.error("Error syncing currency to DB:", error);
            }
          });
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // Custom event for same-tab updates
    window.addEventListener("currencyChange", handleStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("currencyChange", handleStorageChange);
    };
  }, [user]);

  const formatAmount = (amount: number): string => {
    const symbol = CURRENCY_SYMBOLS[currency as keyof typeof CURRENCY_SYMBOLS] || "₽";
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

  // Function to update currency (saves to both localStorage and DB)
  const updateCurrency = async (newCurrency: string) => {
    setCurrency(newCurrency);
    localStorage.setItem("currency", newCurrency);
    
    // Dispatch custom event for same-tab updates
    window.dispatchEvent(new Event("currencyChange"));
    
    // Save to database if user is logged in
    if (user) {
      try {
        const { error } = await supabase
          .from("user_preferences")
          .upsert({
            user_id: user.id,
            currency: newCurrency
          }, {
            onConflict: "user_id"
          });
        
        if (error) {
          console.error("Error saving currency to DB:", error);
        }
      } catch (error) {
        console.error("Error in updateCurrency:", error);
      }
    }
  };

  return {
    currency,
    formatAmount,
    convertToRubles,
    convertFromRubles,
    updateCurrency,
    isLoading
  };
}
