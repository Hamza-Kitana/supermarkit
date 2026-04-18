import { useEffect, useMemo, useState } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { applyCreditPayment, getInvoiceItems } from "@/lib/localDb";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type CreditCustomerRow = {
  name: string;
  outstanding: number;
  paid: number;
  fullPaidCount: number;
  partialCount: number;
  invoices: {
    id: string;
    created_at: string;
    total: number;
    paid: number;
    netAmount: number;
    status: "outstanding" | "partial" | "paid";
  }[];
};

export default function CreditPage() {
  const { invoices } = useInvoices();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [cashierFilter, setCashierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [datePreset, setDatePreset] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [dayValue, setDayValue] = useState("");
  const [weekValue, setWeekValue] = useState("");
  const [monthValue, setMonthValue] = useState("");
  const [yearValue, setYearValue] = useState(String(new Date().getFullYear()));
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");

  const creditInvoices = useMemo(
    () =>
      invoices.filter((inv) => inv.is_credit && inv.customer_name),
    [invoices],
  );

  const customers: CreditCustomerRow[] = useMemo(() => {
    const map = new Map<string, CreditCustomerRow>();
    for (const inv of creditInvoices) {
      const name = inv.customer_name!.trim();
      const existing = map.get(name) ?? {
        name,
        outstanding: 0,
        paid: 0,
        fullPaidCount: 0,
        partialCount: 0,
        invoices: [],
      };
      const netTotal = Math.max(0, inv.total - (inv.returned_amount ?? 0));
      const paid = Math.max(0, Math.min(inv.paid, netTotal));
      const remaining = Math.max(0, netTotal - paid);
      const status: "outstanding" | "partial" | "paid" =
        remaining <= 0 ? "paid" : paid > 0 ? "partial" : "outstanding";
      existing.outstanding += remaining;
      existing.paid += paid;
      if (status === "paid") existing.fullPaidCount += 1;
      if (status === "partial") existing.partialCount += 1;
      existing.invoices.push({
        id: inv.id,
        created_at: inv.created_at,
        total: netTotal,
        paid,
        netAmount: remaining,
        status,
      });
      map.set(name, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [creditInvoices]);

  const creditCashiers = useMemo(
    () =>
      Array.from(new Set(creditInvoices.map((inv) => inv.cashier_name).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "en"),
      ),
    [creditInvoices],
  );

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers
      .map((customer) => {
        const filteredInvoices = customer.invoices.filter((invoiceRow) => {
          const sourceInvoice = creditInvoices.find((inv) => inv.id === invoiceRow.id);
          if (!sourceInvoice) return false;

          if (query) {
            const matchesQuery =
              customer.name.toLowerCase().includes(query) ||
              invoiceRow.id.toLowerCase().includes(query) ||
              sourceInvoice.cashier_name.toLowerCase().includes(query) ||
              (sourceInvoice.customer_phone ?? "").toLowerCase().includes(query);
            if (!matchesQuery) return false;
          }

          if (cashierFilter !== "all" && sourceInvoice.cashier_name !== cashierFilter) {
            return false;
          }

          if (statusFilter !== "all" && invoiceRow.status !== statusFilter) {
            return false;
          }

          const createdAt = new Date(invoiceRow.created_at);
          if (dateFrom) {
            const fromDate = new Date(dateFrom);
            fromDate.setHours(0, 0, 0, 0);
            if (createdAt < fromDate) return false;
          }
          if (dateTo) {
            const toDate = new Date(dateTo);
            toDate.setHours(23, 59, 59, 999);
            if (createdAt > toDate) return false;
          }

          return true;
        });

        const outstanding = filteredInvoices.reduce((sum, inv) => sum + inv.netAmount, 0);
        const paid = filteredInvoices.reduce((sum, inv) => sum + inv.paid, 0);
        const fullPaidCount = filteredInvoices.filter((inv) => inv.status === "paid").length;
        const partialCount = filteredInvoices.filter((inv) => inv.status === "partial").length;

        return {
          ...customer,
          invoices: filteredInvoices,
          outstanding,
          paid,
          fullPaidCount,
          partialCount,
        };
      })
      .filter((customer) => customer.invoices.length > 0)
      .sort((a, b) => b.outstanding - a.outstanding);
  }, [customers, creditInvoices, search, cashierFilter, statusFilter, dateFrom, dateTo]);

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
    creditInvoices.forEach((inv) => years.add(new Date(inv.created_at).getFullYear()));
    return Array.from(years).sort((a, b) => b - a);
  }, [creditInvoices]);

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
    setStatusFilter("all");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
  };

  const selectedInvoice =
    selectedInvoiceId && invoices.find((inv) => inv.id === selectedInvoiceId) ? invoices.find((inv) => inv.id === selectedInvoiceId) : null;

  const formatDate = (d: string) =>
    new Date(d).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const items = selectedInvoiceId ? getInvoiceItems(selectedInvoiceId) : [];
  const selectedInvoiceRemaining = selectedInvoice
    ? Math.max(0, selectedInvoice.total - (selectedInvoice.returned_amount ?? 0) - selectedInvoice.paid)
    : 0;

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="w-full">
          <Input
            placeholder={tx("Search by customer, invoice, cashier, phone...", "بحث باسم الزبون أو الفاتورة أو الكاشير أو الهاتف...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          <Select value={cashierFilter} onValueChange={setCashierFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Cashier", "الكاشير")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All cashiers", "كل الكاشير")}</SelectItem>
              {creditCashiers.map((cashier) => (
                <SelectItem key={cashier} value={cashier}>
                  {cashier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder={tx("Payment status", "حالة السداد")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tx("All statuses", "كل الحالات")}</SelectItem>
              <SelectItem value="outstanding">{tx("Outstanding", "غير مسدد")}</SelectItem>
              <SelectItem value="partial">{tx("Partial paid", "مسدد جزئي")}</SelectItem>
              <SelectItem value="paid">{tx("Paid", "مسدد")}</SelectItem>
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
            {tx("Filtered customers:", "الزبائن بعد الفلترة:")} <span className="font-semibold text-foreground">{filteredCustomers.length}</span>
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
                <th className="text-right p-3 font-semibold">{tx("Customer", "الزبون")}</th>
                <th className="text-right p-3 font-semibold">{tx("Outstanding Amount", "المبلغ المتبقي")}</th>
                <th className="text-right p-3 font-semibold">{tx("Invoices Count", "عدد الفواتير")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((c) => (
                <tr key={c.name} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">
                    <div className="space-y-1">
                      <p className="font-bold text-primary">{formatMoney(c.outstanding)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {tx("Paid", "المدفوع")}: {formatMoney(c.paid)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {tx("Full paid", "مسدد كامل")}: {c.fullPaidCount} · {tx("Partial", "جزئي")}: {c.partialCount}
                      </p>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2 justify-end">
                      {c.invoices.map((inv) => (
                        <button
                          key={inv.id}
                          type="button"
                          onClick={() => setSelectedInvoiceId(inv.id)}
                          className="px-2 py-1 rounded-lg text-xs bg-muted hover:bg-muted/80"
                        >
                          <span className="block" dir="ltr">
                            {formatDate(inv.created_at)}
                          </span>
                          <span className="block font-semibold">
                            {formatMoney(inv.netAmount)}
                          </span>
                          <span className="block text-[10px] text-muted-foreground">
                            {inv.status === "paid"
                              ? tx("Paid", "مسدد")
                              : inv.status === "partial"
                                ? tx("Partial paid", "مسدد جزئي")
                                : tx("Outstanding", "غير مسدد")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    {tx("No active credit customers", "لا يوجد زبائن عليهم دين حالياً")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={Boolean(selectedInvoiceId)} onOpenChange={() => setSelectedInvoiceId(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{tx("Credit Invoice Details", "تفاصيل فاتورة الدين")}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Customer", "الزبون")}</p>
                  <p className="font-bold">{selectedInvoice.customer_name}</p>
                  {selectedInvoice.customer_phone && (
                    <p className="text-xs text-muted-foreground" dir="ltr">
                      {selectedInvoice.customer_phone}
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Purchase Time", "وقت الشراء")}</p>
                  <p className="font-bold">{formatDate(selectedInvoice.created_at)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Outstanding Amount", "المبلغ المتبقي")}</p>
                  <p className="font-bold text-primary">
                    {formatMoney(
                      Math.max(
                        0,
                        selectedInvoice.total -
                          (selectedInvoice.returned_amount ?? 0) -
                          selectedInvoice.paid,
                      ),
                    )}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Paid", "المدفوع")}</p>
                  <p className="font-bold">{formatMoney(selectedInvoice.paid)}</p>
                </div>
              </div>
              <div className="rounded-xl border p-3 space-y-2">
                <p className="text-sm font-semibold">{tx("Record Payment", "تسجيل دفعة")}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder={tx("Payment amount", "قيمة الدفعة")}
                    dir="ltr"
                  />
                  <Button
                    type="button"
                    disabled={selectedInvoiceRemaining <= 0}
                    onClick={() => {
                      try {
                        if (!selectedInvoiceId) return;
                        const applied = applyCreditPayment(selectedInvoiceId, Number(paymentAmount));
                        setPaymentAmount("");
                        toast({
                          title: tx("Payment recorded ✓", "تم تسجيل الدفعة ✓"),
                          description: tx(`Applied: ${formatMoney(applied)}`, `تم تسجيل: ${formatMoney(applied)}`),
                        });
                      } catch (err) {
                        const message = err instanceof Error ? err.message : tx("Failed to record payment", "فشل تسجيل الدفعة");
                        toast({ title: tx("Error", "خطأ"), description: message, variant: "destructive" });
                      }
                    }}
                  >
                    {tx("Apply payment", "تسجيل الدفعة")}
                  </Button>
                </div>
                {selectedInvoiceRemaining <= 0 && (
                  <p className="text-xs text-success">
                    {tx("This credit invoice is fully paid and closed.", "هذه الفاتورة مسددة بالكامل ومغلقة.")}
                  </p>
                )}
              </div>
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b">
                      <th className="text-right p-2">{tx("Product", "المنتج")}</th>
                      <th className="text-right p-2">{tx("Quantity", "الكمية")}</th>
                      <th className="text-right p-2">{tx("Unit Price", "سعر الوحدة")}</th>
                      <th className="text-right p-2">{tx("Total", "المجموع")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const netQty = item.quantity - (item.returned_quantity ?? 0);
                      return (
                        <tr key={item.id} className="border-b last:border-b-0">
                          <td className="p-2 font-medium">{item.product_name}</td>
                          <td className="p-2">{netQty} / {item.quantity}</td>
                          <td className="p-2">{formatMoney(item.unit_price)}</td>
                          <td className="p-2 font-bold">{formatMoney(item.unit_price * netQty)}</td>
                        </tr>
                      );
                    })}
                    {items.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="p-4 text-center text-muted-foreground"
                        >
                          {tx("No items in this invoice", "لا توجد عناصر في هذه الفاتورة")}
                        </td>
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

