import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getTrashedInvoices,
  getTrashedProducts,
  permanentlyDeleteInvoice,
  permanentlyDeleteProduct,
  restoreInvoice,
  restoreProduct,
  subscribeDbChanges,
} from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { Search } from "lucide-react";

export default function Trash() {
  const { toast } = useToast();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [trashedProducts, setTrashedProducts] = useState(getTrashedProducts());
  const [trashedInvoices, setTrashedInvoices] = useState(getTrashedInvoices());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dayValue, setDayValue] = useState("");
  const [weekValue, setWeekValue] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [yearValue, setYearValue] = useState(String(new Date().getFullYear()));
  const [pendingDelete, setPendingDelete] = useState<{ type: "product" | "invoice"; id: string } | null>(null);

  useEffect(() => {
    const refresh = () => {
      setTrashedProducts(getTrashedProducts());
      setTrashedInvoices(getTrashedInvoices());
    };
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const invoiceCashiers = useMemo(
    () =>
      Array.from(new Set(trashedInvoices.map((inv) => inv.cashier_name).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "en"),
      ),
    [trashedInvoices],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (typeFilter === "invoices") return [];
    return trashedProducts.filter((product) => {
      if (!query) return true;
      return (
        product.name.toLowerCase().includes(query) ||
        product.id.toLowerCase().includes(query)
      );
    });
  }, [trashedProducts, search, typeFilter]);

  const filteredInvoices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (typeFilter === "products") return [];

    return trashedInvoices.filter((invoice) => {
      if (query) {
        const matchesQuery =
          invoice.id.toLowerCase().includes(query) ||
          invoice.cashier_name.toLowerCase().includes(query) ||
          (invoice.customer_name ?? "").toLowerCase().includes(query);
        if (!matchesQuery) return false;
      }

      if (cashierFilter !== "all" && invoice.cashier_name !== cashierFilter) {
        return false;
      }

      if (paymentFilter !== "all") {
        if (paymentFilter === "credit" && !invoice.is_credit) return false;
        if (paymentFilter !== "credit" && invoice.payment_method !== paymentFilter) return false;
      }

      const deletedAt = new Date(invoice.deleted_at ?? invoice.created_at);
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (deletedAt < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (deletedAt > toDate) return false;
      }

      return true;
    });
  }, [trashedInvoices, search, typeFilter, cashierFilter, paymentFilter, dateFrom, dateTo]);

  const toInputDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getWeekRange = (week: string) => {
    if (!week.includes("-W")) return null;
    const [yearPart, weekPart] = week.split("-W");
    const year = Number(yearPart);
    const weekNo = Number(weekPart);
    if (!year || !weekNo) return null;
    const jan4 = new Date(year, 0, 4);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - jan4Day + (weekNo - 1) * 7);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: monday, to: sunday };
  };

  const yearOptions = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    trashedInvoices.forEach((inv) => years.add(new Date(inv.deleted_at ?? inv.created_at).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [trashedInvoices]);

  useEffect(() => {
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now);

    if (datePreset === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }
    if (datePreset === "custom") return;

    if (datePreset === "day") {
      setDayValue(toInputDate(now));
      setDateFrom(toInputDate(now));
      setDateTo(toInputDate(now));
      return;
    }
    if (datePreset === "week") {
      const weekDay = (now.getDay() + 6) % 7;
      from.setDate(now.getDate() - weekDay);
      const weekNo = Math.ceil((((from.getTime() - new Date(from.getFullYear(), 0, 1).getTime()) / 86400000) + new Date(from.getFullYear(), 0, 1).getDay() + 1) / 7);
      setWeekValue(`${from.getFullYear()}-W${String(weekNo).padStart(2, "0")}`);
      setDateFrom(toInputDate(from));
      setDateTo(toInputDate(to));
      return;
    }
    if (datePreset === "month") {
      setMonthValue(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
      from.setDate(1);
      setDateFrom(toInputDate(from));
      setDateTo(toInputDate(to));
      return;
    }
    if (datePreset === "year") {
      setYearValue(String(now.getFullYear()));
      from.setMonth(0, 1);
      setDateFrom(toInputDate(from));
      setDateTo(toInputDate(to));
    }
  }, [datePreset]);

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
    setCashierFilter("all");
    setPaymentFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold">{tx("Trash", "سلة المحذوفات")}</h2>
        <p className="text-muted-foreground mt-1">{tx("Permanent delete is available to super admin only.", "الحذف النهائي متاح فقط للسوبر أدمن.")}</p>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="relative w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tx("Search by name, invoice ID, cashier, customer...", "بحث باسم العنصر أو رقم الفاتورة أو الكاشير أو الزبون...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 rounded-xl"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Type", "النوع")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All items", "كل العناصر")}</SelectItem>
              <SelectItem value="products">{tx("Products only", "منتجات فقط")}</SelectItem>
              <SelectItem value="invoices">{tx("Invoices only", "فواتير فقط")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={cashierFilter} onValueChange={setCashierFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Cashier", "الكاشير")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All cashiers", "كل الكاشير")}</SelectItem>
              {invoiceCashiers.map((cashier) => (
                <SelectItem key={cashier} value={cashier}>
                  {cashier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Payment", "الدفع")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All payments", "كل طرق الدفع")}</SelectItem>
              <SelectItem value="cash">{tx("Cash", "كاش")}</SelectItem>
              <SelectItem value="visa">{tx("Visa", "فيزا")}</SelectItem>
              <SelectItem value="wallet">{tx("Wallet", "محفظة")}</SelectItem>
              <SelectItem value="credit">{tx("Credit", "دين")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={datePreset} onValueChange={setDatePreset}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Date range", "الفترة الزمنية")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All time", "كل الوقت")}</SelectItem>
              <SelectItem value="day">{tx("Today", "اليوم")}</SelectItem>
              <SelectItem value="week">{tx("This week", "هذا الأسبوع")}</SelectItem>
              <SelectItem value="month">{tx("This month", "هذا الشهر")}</SelectItem>
              <SelectItem value="year">{tx("This year", "هذه السنة")}</SelectItem>
              <SelectItem value="custom">{tx("Custom range", "فترة مخصصة")}</SelectItem>
            </SelectContent>
          </Select>

          {datePreset === "custom" && (
            <>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl"
                aria-label={tx("From date", "من تاريخ")}
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl"
                aria-label={tx("To date", "إلى تاريخ")}
              />
            </>
          )}

          {datePreset === "day" && (
            <Input
              type="date"
              value={dayValue}
              onChange={(e) => {
                const value = e.target.value;
                setDayValue(value);
                setDateFrom(value);
                setDateTo(value);
              }}
              className="rounded-xl"
              aria-label={tx("Pick day", "اختر يوم")}
            />
          )}

          {datePreset === "week" && (
            <Input
              type="week"
              value={weekValue}
              onChange={(e) => {
                const value = e.target.value;
                setWeekValue(value);
                const range = getWeekRange(value);
                if (!range) return;
                setDateFrom(toInputDate(range.from));
                setDateTo(toInputDate(range.to));
              }}
              className="rounded-xl"
              aria-label={tx("Pick week", "اختر أسبوع")}
            />
          )}

          {datePreset === "month" && (
            <Input
              type="month"
              value={monthValue}
              onChange={(e) => {
                const value = e.target.value;
                setMonthValue(value);
                const [year, month] = value.split("-").map(Number);
                if (!year || !month) return;
                const start = new Date(year, month - 1, 1);
                const end = new Date(year, month, 0);
                setDateFrom(toInputDate(start));
                setDateTo(toInputDate(end));
              }}
              className="rounded-xl"
              aria-label={tx("Pick month", "اختر شهر")}
            />
          )}

          {datePreset === "year" && (
            <Select
              value={yearValue}
              onValueChange={(value) => {
                setYearValue(value);
                const year = Number(value);
                if (!year) return;
                setDateFrom(`${year}-01-01`);
                setDateTo(`${year}-12-31`);
              }}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder={tx("Pick year", "اختر سنة")} />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={String(year)}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {tx("Filtered:", "بعد الفلترة:")}{" "}
            <span className="font-semibold text-foreground">
              {tx("Products", "منتجات")} {filteredProducts.length} · {tx("Invoices", "فواتير")} {filteredInvoices.length}
            </span>
          </p>
          <Button variant="outline" className="rounded-xl" onClick={resetFilters}>
            {tx("Clear filters", "مسح الفلاتر")}
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h3 className="font-bold">{tx("Deleted Products", "المنتجات المحذوفة")} ({filteredProducts.length})</h3>
        {filteredProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx("No deleted products", "لا توجد منتجات محذوفة")}</p>
        ) : (
          filteredProducts.map((product) => (
            <div key={product.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border rounded-xl p-3 bg-background/50">
              <div className="flex-1">
                <p className="font-semibold">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {tx("Deleted:", "تم الحذف:")} {product.deleted_at ? formatDate(product.deleted_at) : "-"}
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  ID: {product.id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(product.retail_price)} | {formatMoney(product.wholesale_price)}
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  restoreProduct(product.id);
                  toast({ title: tx("Product restored", "تم استرجاع المنتج") });
                }}
              >
                {tx("Restore", "استرجاع")}
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl"
                onClick={() => setPendingDelete({ type: "product", id: product.id })}
              >
                {tx("Delete Permanently", "حذف نهائي")}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h3 className="font-bold">{tx("Deleted Invoices", "الفواتير المحذوفة")} ({filteredInvoices.length})</h3>
        {filteredInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx("No deleted invoices", "لا توجد فواتير محذوفة")}</p>
        ) : (
          filteredInvoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border rounded-xl p-3 bg-background/50">
              <div className="flex-1">
                <p className="font-semibold text-sm" dir="ltr">{invoice.id}</p>
                <p className="text-xs text-muted-foreground">
                  {tx("Purchase:", "الشراء:")} {formatDate(invoice.created_at)} | {formatMoney(invoice.total)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx("Deleted:", "تم الحذف:")} {invoice.deleted_at ? formatDate(invoice.deleted_at) : "-"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx("Cashier:", "الكاشير:")} {invoice.cashier_name} · {tx("Payment:", "الدفع:")}{" "}
                  {invoice.is_credit
                    ? tx("Credit", "دين")
                    : invoice.payment_method === "visa"
                      ? tx("Visa", "فيزا")
                      : invoice.payment_method === "wallet"
                        ? tx("Wallet", "محفظة")
                        : tx("Cash", "كاش")}
                </p>
              </div>
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  restoreInvoice(invoice.id);
                  toast({ title: tx("Invoice restored", "تم استرجاع الفاتورة") });
                }}
              >
                {tx("Restore", "استرجاع")}
              </Button>
              <Button
                variant="destructive"
                className="rounded-xl"
                onClick={() => setPendingDelete({ type: "invoice", id: invoice.id })}
              >
                {tx("Delete Permanently", "حذف نهائي")}
              </Button>
            </div>
          ))
        )}
      </div>
      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("Confirm permanent delete", "تأكيد الحذف النهائي")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                "This action cannot be undone. The selected item will be deleted permanently.",
                "لا يمكن التراجع عن هذا الإجراء. سيتم حذف العنصر المحدد نهائيًا.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete) return;
                if (pendingDelete.type === "product") {
                  permanentlyDeleteProduct(pendingDelete.id);
                  toast({ title: tx("Product kept for history and marked deleted", "تم الإبقاء على المنتج للتاريخ وتم وسمه كمحذوف") });
                } else {
                  permanentlyDeleteInvoice(pendingDelete.id);
                  toast({ title: tx("Invoice permanently deleted", "تم حذف الفاتورة نهائيًا") });
                }
                setPendingDelete(null);
              }}
            >
              {tx("Delete Permanently", "حذف نهائي")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
