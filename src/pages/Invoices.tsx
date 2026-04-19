import { useMemo, useState, useEffect } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Eye, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getInvoiceItems,
  getInvoiceReturnSummary,
  invoiceDisplayGrossTotal,
  invoiceDisplayPaid,
  parseCartFullDisplay,
  removeInvoice,
  type LocalInvoiceItem,
} from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type InvoiceItem = LocalInvoiceItem;

export default function Invoices() {
  const { invoices } = useInvoices();
  const { role } = useAuth();
  const { toast } = useToast();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [search, setSearch] = useState("");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [saleTypeFilter, setSaleTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dayValue, setDayValue] = useState("");
  const [weekValue, setWeekValue] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [yearValue, setYearValue] = useState(String(new Date().getFullYear()));
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, InvoiceItem[]>>({});

  const cashiers = useMemo(() => {
    return Array.from(new Set(invoices.map((inv) => inv.cashier_name).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "en")
    );
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const query = search.trim().toLowerCase();
      if (query) {
        const idMatch = inv.id.toLowerCase().includes(query);
        const saleTypeMatch = inv.sale_type.toLowerCase().includes(query);
        const cashierMatch = inv.cashier_name.toLowerCase().includes(query);
        const paymentMatch = inv.payment_method.toLowerCase().includes(query);
        const customerMatch = (inv.customer_name ?? "").toLowerCase().includes(query);
        if (!idMatch && !saleTypeMatch && !cashierMatch && !paymentMatch && !customerMatch) {
          return false;
        }
      }

      if (cashierFilter !== "all" && inv.cashier_name !== cashierFilter) {
        return false;
      }

      if (paymentFilter !== "all") {
        if (paymentFilter === "credit" && !inv.is_credit) {
          return false;
        }
        if (paymentFilter !== "credit" && inv.payment_method !== paymentFilter) {
          return false;
        }
      }

      if (saleTypeFilter !== "all" && inv.sale_type !== saleTypeFilter) {
        return false;
      }

      if (statusFilter !== "all") {
        const hasPartialReturn = (inv.returned_amount ?? 0) > 0 && !inv.is_return;
        if (statusFilter === "completed" && (inv.is_return || hasPartialReturn)) {
          return false;
        }
        if (statusFilter === "partial_returned" && !hasPartialReturn) {
          return false;
        }
        if (statusFilter === "returned" && !inv.is_return) {
          return false;
        }
      }

      const createdAt = new Date(inv.created_at);
      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        fromDate.setHours(0, 0, 0, 0);
        if (createdAt < fromDate) {
          return false;
        }
      }
      if (dateTo) {
        const toDate = new Date(dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (createdAt > toDate) {
          return false;
        }
      }

      return true;
    });
  }, [invoices, search, cashierFilter, paymentFilter, saleTypeFilter, statusFilter, dateFrom, dateTo]);

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
    invoices.forEach((inv) => years.add(new Date(inv.created_at).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices]);

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
    setCashierFilter("all");
    setPaymentFilter("all");
    setSaleTypeFilter("all");
    setStatusFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  };

  const deleteInvoice = async (id: string) => {
    if (role !== "super_admin") {
      toast({ title: tx("Not allowed", "غير مسموح"), description: tx("Only super admin can delete invoices", "فقط السوبر أدمن يمكنه حذف الفواتير"), variant: "destructive" });
      return;
    }
    removeInvoice(id);
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    toast({ title: tx("Invoice moved to trash ✓", "تم نقل الفاتورة إلى سلة المحذوفات ✓") });
  };

  const formatDate = (d: string) => {
    return new Date(d).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  const selectedInvoice = viewInvoiceId ? invoices.find((inv) => inv.id === viewInvoiceId) ?? null : null;
  const selectedItems = viewInvoiceId ? (items[viewInvoiceId] ?? getInvoiceItems(viewInvoiceId)) : [];
  const selectedCartSnap = useMemo(() => {
    if (!selectedInvoice) return null;
    return parseCartFullDisplay(selectedInvoice.notes);
  }, [selectedInvoice]);
  const todayGrossTotal = filtered.reduce((sum, inv) => {
    const isToday = new Date(inv.created_at).toDateString() === new Date().toDateString();
    if (!isToday) return sum;
    return sum + invoiceDisplayGrossTotal(inv);
  }, 0);

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="relative w-full">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tx("Search by invoice ID, cashier, customer, payment...", "بحث برقم الفاتورة أو الكاشير أو الزبون أو الدفع...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 rounded-xl"
            dir="ltr"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-2">
          <Select value={cashierFilter} onValueChange={setCashierFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Cashier", "الكاشير")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All cashiers", "كل الكاشير")}</SelectItem>
              {cashiers.map((cashier) => (
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

          <Select value={saleTypeFilter} onValueChange={setSaleTypeFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Sale type", "نوع البيع")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All sale types", "كل أنواع البيع")}</SelectItem>
              <SelectItem value="retail">{tx("Retail", "مفرق")}</SelectItem>
              <SelectItem value="wholesale">{tx("Wholesale", "جملة")}</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Status", "الحالة")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All statuses", "كل الحالات")}</SelectItem>
              <SelectItem value="completed">{tx("Completed", "مكتمل")}</SelectItem>
              <SelectItem value="partial_returned">{tx("Partially Returned", "مرتجع جزئي")}</SelectItem>
              <SelectItem value="returned">{tx("Returned", "مُرجع")}</SelectItem>
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
            {tx("Filtered invoices:", "الفواتير بعد الفلترة:")} <span className="font-semibold text-foreground">{filtered.length}</span>
          </p>
          <Button variant="outline" className="rounded-xl" onClick={resetFilters}>
            {tx("Clear filters", "مسح الفلاتر")}
          </Button>
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right p-3 font-semibold">{tx("Date", "التاريخ")}</th>
                <th className="text-right p-3 font-semibold">{tx("Type", "النوع")}</th>
                <th className="text-right p-3 font-semibold">{tx("Cashier", "الكاشير")}</th>
                <th className="text-right p-3 font-semibold">{tx("Payment", "الدفع")}</th>
                <th className="text-right p-3 font-semibold">{tx("Basket total (face)", "إجمالي السلة")}</th>
                <th className="text-right p-3 font-semibold">{tx("Paid", "المدفوع")}</th>
                <th className="text-right p-3 font-semibold">{tx("Change", "الباقي")}</th>
                <th className="text-right p-3 font-semibold">{tx("Status", "الحالة")}</th>
                <th className="text-right p-3 font-semibold">{tx("Actions", "إجراءات")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-3 text-xs">{formatDate(inv.created_at)}</td>
                    <td className="p-3">
                      <div className="flex flex-col items-end gap-1">
                        <span className={cn("text-xs font-semibold px-2 py-1 rounded-lg",
                          inv.sale_type === "retail" ? "bg-primary/10 text-primary" : "bg-info/10 text-info"
                        )}>
                          {inv.sale_type === "retail" ? tx("Retail", "مفرق") : tx("Wholesale", "جملة")}
                        </span>
                        {inv.is_credit && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-800" dir="ltr">
                            {tx("Credit", "دين")}{inv.customer_name ? ` · ${inv.customer_name}` : ""}
                          </span>
                        )}
                        {inv.pos_exclusion_only && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-orange-500/15 text-orange-900 dark:text-orange-100">
                            {tx("Full cart close", "إغلاق سلة — إرجاع كامل")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {inv.cashier_name}
                    </td>
                    <td className="p-3">
                      {!inv.is_credit ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-muted/60">
                          {inv.payment_method === "visa"
                            ? tx("Visa", "فيزا")
                            : inv.payment_method === "wallet"
                              ? tx("Wallet", "محفظة")
                            : tx("Cash", "كاش")}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {tx("Credit", "دين")}
                        </span>
                      )}
                    </td>
                    <td className="p-3 font-bold">{formatMoney(invoiceDisplayGrossTotal(inv))}</td>
                    <td className="p-3">{formatMoney(invoiceDisplayPaid(inv))}</td>
                    <td className="p-3">{formatMoney(inv.change_amount)}</td>
                    <td className="p-3">
                      {(inv.returned_amount ?? 0) > 0 && !inv.is_return ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-warning/10 text-warning">{tx("Partially Returned", "مرتجع جزئي")}</span>
                      ) : inv.is_return ? (
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-destructive/10 text-destructive">{tx("Returned", "مُرجع")}</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-success/10 text-success">{tx("Completed", "مكتمل")}</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            if (!items[inv.id]) {
                              const data = getInvoiceItems(inv.id);
                              setItems((prev) => ({ ...prev, [inv.id]: data }));
                            }
                            setViewInvoiceId(inv.id);
                          }}
                          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-primary/10 text-primary transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {role === "super_admin" && (
                          <button onClick={() => deleteInvoice(inv.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-destructive transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-4">
        <p className="text-sm text-muted-foreground">{tx("Today's basket totals (face)", "مجموع اليوم (إجمالي السلة المعروض)")}</p>
        <p className="text-2xl font-bold text-primary">{formatMoney(todayGrossTotal)}</p>
      </div>

      <Dialog open={Boolean(viewInvoiceId)} onOpenChange={() => setViewInvoiceId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{tx("Invoice Details", "تفاصيل الفاتورة")}</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Invoice ID", "رقم الفاتورة")}</p>
                  <p className="font-bold text-xs" dir="ltr">{selectedInvoice.id}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Purchase Time", "وقت الشراء")}</p>
                  <p className="font-bold">{formatDate(selectedInvoice.created_at)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Sale Type", "نوع البيع")}</p>
                  <p className="font-bold">
                    {selectedInvoice.sale_type === "retail" ? tx("Retail", "مفرق") : tx("Wholesale", "جملة")}
                    {selectedInvoice.is_credit && ` · ${tx("Credit", "دين")}`}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Cashier", "الكاشير")}</p>
                  <p className="font-bold">{selectedInvoice.cashier_name}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Payment Method", "طريقة الدفع")}</p>
                  <p className="font-bold">
                    {selectedInvoice.is_credit
                      ? tx("Credit", "دين")
                      : selectedInvoice.payment_method === "visa"
                        ? tx("Visa", "فيزا")
                        : selectedInvoice.payment_method === "wallet"
                          ? tx("Wallet", "محفظة")
                        : tx("Cash", "كاش")}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Return Time", "وقت الإرجاع")}</p>
                  <p className="font-bold">
                    {selectedInvoice.last_returned_at
                      ? formatDate(selectedInvoice.last_returned_at)
                      : tx("No return yet", "لا يوجد إرجاع بعد")}
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2 border border-primary/20">
                  <p className="text-muted-foreground">{tx("Full basket (all lines)", "إجمالي السلة (كل الأسطر)")}</p>
                  <p className="font-bold text-lg text-primary">{formatMoney(invoiceDisplayGrossTotal(selectedInvoice))}</p>
                </div>
                {selectedCartSnap && (
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-muted-foreground">{tx("Charged sale amount", "مبلغ البيع المحسوم")}</p>
                    <p className="font-bold">{formatMoney(selectedInvoice.total)}</p>
                  </div>
                )}
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Net After Returns", "الصافي بعد المرتجعات")}</p>
                  <p className="font-bold text-primary">{formatMoney(getInvoiceReturnSummary(selectedInvoice.id).netAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Paid Amount", "المبلغ المدفوع")}</p>
                  <p className="font-bold">{formatMoney(invoiceDisplayPaid(selectedInvoice))}</p>
                  {(selectedInvoice.returned_amount ?? 0) > 0 && !selectedInvoice.is_credit && (
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      {tx(
                        "Full tender at checkout (not reduced when items are returned).",
                        "المبلغ المستلم عند البيع كاملاً (لا ينقص عند مرتجع أصناف).",
                      )}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Change To Customer", "الباقي للزبون")}</p>
                  <p className="font-bold">{formatMoney(selectedInvoice.change_amount)}</p>
                </div>
              </div>

              {selectedInvoice.pos_exclusion_only ? (
                <p className="text-sm text-muted-foreground rounded-lg bg-orange-500/10 px-3 py-2 border border-orange-500/25">
                  {tx(
                    "Full cart exclusion close: shown here as a normal cash receipt (cash, paid equals total). Line amounts match the excluded cart; stock was not sold on this slip.",
                    "إغلاق إرجاع كامل للسلة: يظهر هنا كإيصال كاش اعتيادي (كاش، المدفوع = الإجمالي). قيم الأسطر كالسلة المستبعدة؛ لم يُبَع المخزون في هذه العملية.",
                  )}
                </p>
              ) : selectedCartSnap ? (
                <p className="text-sm text-muted-foreground rounded-lg bg-muted/30 px-3 py-2 border border-border/50">
                  {tx(
                    "Table shows every line that was in the cart (sold + excluded). Charged amount and payment match the actual sale only.",
                    "الجدول يعرض كل أسطر السلة (المباع والمستبعد). المبلغ المحسوم والدفع يطابقان البيع الفعلي فقط.",
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground rounded-lg bg-muted/30 px-3 py-2 border border-border/50">
                  {tx(
                    "Line quantities and amounts below are the original sale (full values). Net after returns is shown above as “Net After Returns”.",
                    "الكميات والمجاميع أدناه هي البيع الأصلي (القيم الكاملة). الصافي بعد المرتجعات يظهر أعلاه في «الصافي بعد المرتجعات».",
                  )}
                </p>
              )}

              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-right p-2">{tx("Product", "المنتج")}</th>
                      <th className="text-right p-2">{tx("Quantity", "الكمية")}</th>
                      <th className="text-right p-2">{tx("Unit Price", "سعر الوحدة")}</th>
                      <th className="text-right p-2">{tx("Line total", "مجموع السطر")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCartSnap ? (
                      selectedCartSnap.lines.map((line, idx) => (
                        <tr key={`snap-${idx}`} className="border-b last:border-b-0">
                          <td className="p-2 font-medium">{line.product_name}</td>
                          <td className="p-2">{line.quantity}</td>
                          <td className="p-2">{formatMoney(line.unit_price)}</td>
                          <td className="p-2 font-bold">{formatMoney(line.line_gross)}</td>
                        </tr>
                      ))
                    ) : (
                      selectedItems.map((item) => {
                        const rq = item.returned_quantity ?? 0;
                        return (
                          <tr key={item.id} className="border-b last:border-b-0">
                            <td className="p-2 font-medium">{item.product_name}</td>
                            <td className="p-2">
                              {item.quantity}
                              {rq > 0 && (
                                <span className="text-destructive text-xs font-medium ms-1">
                                  ({tx("returned", "مرتجع")} {rq})
                                </span>
                              )}
                            </td>
                            <td className="p-2">{formatMoney(item.unit_price)}</td>
                            <td className="p-2 font-bold">{formatMoney(item.subtotal)}</td>
                          </tr>
                        );
                      })
                    )}
                    {!selectedCartSnap && selectedItems.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-muted-foreground">{tx("No items in this invoice", "لا توجد عناصر في هذه الفاتورة")}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
