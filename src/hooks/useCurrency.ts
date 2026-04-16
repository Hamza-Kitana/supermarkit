import { useEffect, useState } from "react";
import {
  getCurrency,
  setCurrency as setCurrencyInDb,
  subscribeDbChanges,
  type CurrencyCode,
} from "@/lib/localDb";

export function useCurrency() {
  const [currency, setCurrencyState] = useState<CurrencyCode>("JOD");

  useEffect(() => {
    const refresh = () => setCurrencyState(getCurrency());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const setCurrency = (nextCurrency: CurrencyCode) => {
    setCurrencyInDb(nextCurrency);
    setCurrencyState(nextCurrency);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return { currency, setCurrency, formatMoney };
}
