/**
 * Cash payment denominations when the shop totals are in JOD.
 * Rates are **JOD per 1 unit** of the foreign currency (editable in Access Control).
 */
export const DEFAULT_JOD_PER_UNIT: Record<string, number> = {
  USD: 0.709,
  EUR: 0.77,
  GBP: 0.89,
  AED: 0.193,
  SAR: 0.189,
  QAR: 0.195,
  EGP: 0.0147,
  IQD: 0.00054,
  TRY: 0.021,
  LBP: 0.00005,
  BHD: 1.88,
  KWD: 2.31,
};

export type CashPayOption = {
  code: string;
  labelEn: string;
  labelAr: string;
};

/** Base currency first, then regional & major — shown in POS dropdown */
export const CASH_PAY_OPTIONS: readonly CashPayOption[] = [
  { code: "JOD", labelEn: "Jordanian Dinar (JOD)", labelAr: "دينار أردني (د.أ)" },
  { code: "USD", labelEn: "US Dollar (USD)", labelAr: "دولار أمريكي" },
  { code: "EUR", labelEn: "Euro (EUR)", labelAr: "يورو" },
  { code: "GBP", labelEn: "British Pound (GBP)", labelAr: "جنيه إسترليني" },
  { code: "AED", labelEn: "UAE Dirham (AED)", labelAr: "درهم إماراتي" },
  { code: "SAR", labelEn: "Saudi Riyal (SAR)", labelAr: "ريال سعودي" },
  { code: "QAR", labelEn: "Qatari Riyal (QAR)", labelAr: "ريال قطري" },
  { code: "EGP", labelEn: "Egyptian Pound (EGP)", labelAr: "جنيه مصري" },
  { code: "IQD", labelEn: "Iraqi Dinar (IQD)", labelAr: "دينار عراقي" },
  { code: "TRY", labelEn: "Turkish Lira (TRY)", labelAr: "ليرة تركية" },
  { code: "LBP", labelEn: "Lebanese Pound (LBP)", labelAr: "ليرة لبنانية" },
  { code: "BHD", labelEn: "Bahraini Dinar (BHD)", labelAr: "دينار بحريني" },
  { code: "KWD", labelEn: "Kuwaiti Dinar (KWD)", labelAr: "دينار كويتي" },
] as const;

const intlCache = new Map<string, Intl.NumberFormat>();

export function formatCashPayInCurrency(amount: number, currencyCode: string): string {
  if (currencyCode === "JOD") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "JOD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(amount);
  }
  let fmt = intlCache.get(currencyCode);
  if (!fmt) {
    const fraction = ["IQD", "LBP"].includes(currencyCode) ? 0 : 2;
    fmt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction === 0 ? 0 : 2,
    });
    intlCache.set(currencyCode, fmt);
  }
  return fmt.format(amount);
}

export function cashPayLabel(option: CashPayOption, lang: "en" | "ar"): string {
  return lang === "ar" ? option.labelAr : option.labelEn;
}
