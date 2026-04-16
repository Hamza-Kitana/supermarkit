import { useEffect, useState } from "react";
import {
  getLanguage,
  setLanguage as saveLanguage,
  subscribeDbChanges,
  type LanguageCode,
} from "@/lib/localDb";

const dict = {
  en: {
    dashboard: "Dashboard",
    products: "Products",
    invoices: "Invoices",
    accessControl: "Access Control",
    trash: "Trash",
    cashier: "Cashier",
    signOut: "Sign out",
    account: "Account",
    language: "Language",
    arabic: "Arabic",
    english: "English",
    superAdmin: "Super Admin",
    admin: "Admin",
    cashierRole: "Cashier",
  enableCredit: "Enable credit sales",
  disableCredit: "Disable credit sales",
  },
  ar: {
    dashboard: "لوحة التحكم",
    products: "المنتجات",
    invoices: "الفواتير",
    accessControl: "التحكم بالصلاحيات",
    trash: "سلة المحذوفات",
    cashier: "الكاشير",
    signOut: "تسجيل الخروج",
    account: "الحساب",
    language: "اللغة",
    arabic: "عربي",
    english: "English",
    superAdmin: "سوبر أدمن",
    admin: "أدمن",
    cashierRole: "كاشير",
    enableCredit: "تفعيل البيع بالدين",
    disableCredit: "إلغاء البيع بالدين",
  },
} as const;

type CommonKey = keyof typeof dict.en;

export function useLanguage() {
  const [language, setLanguageState] = useState<LanguageCode>("en");

  useEffect(() => {
    const refresh = () => setLanguageState(getLanguage());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const setLanguage = (nextLanguage: LanguageCode) => {
    saveLanguage(nextLanguage);
    setLanguageState(nextLanguage);
  };

  const t = (key: CommonKey) => dict[language][key];
  const tx = (en: string, ar: string) => (language === "ar" ? ar : en);
  const isArabic = language === "ar";

  return { language, setLanguage, t, tx, isArabic };
}
