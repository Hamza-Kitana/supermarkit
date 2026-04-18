import { useCallback, useEffect, useState } from "react";
import {
  getCurrency,
  setCurrency as setCurrencyInDb,
  getCashFxJodPerUnit,
  setJodPerUsd as setJodPerUsdInDb,
  setCashFxJodPerUnit as setCashFxJodPerUnitInDb,
  subscribeDbChanges,
  type CurrencyCode,
} from "@/lib/localDb";
import { formatCashPayInCurrency } from "@/lib/cashPayCurrencies";

export function useCurrency() {
  const [currency, setCurrencyState] = useState<CurrencyCode>("JOD");
  const [fxNonce, setFxNonce] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setCurrencyState(getCurrency());
      setFxNonce((n) => n + 1);
    };
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const setCurrency = (nextCurrency: CurrencyCode) => {
    setCurrencyInDb(nextCurrency);
    setCurrencyState(nextCurrency);
  };

  const getJodPerUnit = useCallback((code: string) => {
    void fxNonce;
    return getCashFxJodPerUnit(code);
  }, [fxNonce]);

  const setJodPerUsd = (value: number) => {
    setJodPerUsdInDb(value);
    setFxNonce((n) => n + 1);
  };

  const setCashFxJodPerUnit = (code: string, value: number) => {
    setCashFxJodPerUnitInDb(code, value);
    setFxNonce((n) => n + 1);
  };

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatCashPay = (amount: number, currencyCode: string) =>
    formatCashPayInCurrency(amount, currencyCode);

  const jodPerUsd = getCashFxJodPerUnit("USD");

  return {
    currency,
    setCurrency,
    formatMoney,
    getJodPerUnit,
    setJodPerUsd,
    setCashFxJodPerUnit,
    formatCashPay,
    jodPerUsd,
  };
}
