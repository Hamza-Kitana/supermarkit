import { useMemo, useState } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { useProducts } from "@/hooks/useProducts";
import { useEffect } from "react";
import { getInvoiceItems, subscribeDbChanges } from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { Input } from "@/components/ui/input";
import {
  DollarSign, TrendingUp, Package, AlertTriangle, ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";

type InvoiceItemRow = {
  invoice_id: string;
  product_name: string;
  quantity: number;
  returned_quantity: number;
  subtotal: number;
};

function getIsoWeekStart(year: number, week: number) {
  const jan4 = new Date(year, 0, 4);
  const day = jan4.getDay() || 7;
  const firstMonday = new Date(jan4);
  firstMonday.setDate(jan4.getDate() - day + 1);
  const start = new Date(firstMonday);
  start.setDate(firstMonday.getDate() + (week - 1) * 7);
  return start;
}

export default function Dashboard() {
  const { invoices } = useInvoices();
  const { products } = useProducts();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [allItems, setAllItems] = useState<InvoiceItemRow[]>([]);
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("day");
  const [selectedDay, setSelectedDay] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const now = new Date();
    const date = new Date(now.getTime());
    date.setDate(now.getDate() + 4 - (now.getDay() || 7));
    const yearStart = new Date(date.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${date.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()));

  useEffect(() => {
    const refreshItems = () => {
      const data = getInvoiceItems().map((item) => ({
        invoice_id: item.invoice_id,
        product_name: item.product_name,
        quantity: item.quantity,
        returned_quantity: item.returned_quantity ?? 0,
        subtotal: item.subtotal,
      }));
      setAllItems(data);
    };

    refreshItems();
    return subscribeDbChanges(refreshItems);
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const d = new Date(inv.created_at);
      if (period === "day") {
        const [y, m, day] = selectedDay.split("-").map(Number);
        const start = new Date(y, m - 1, day);
        const end = new Date(y, m - 1, day + 1);
        return d >= start && d < end;
      }
      if (period === "week") {
        const [weekYearPart, weekPart] = selectedWeek.split("-W");
        const weekYear = Number(weekYearPart);
        const weekNumber = Number(weekPart);
        if (!weekYear || !weekNumber) return false;
        const start = getIsoWeekStart(weekYear, weekNumber);
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
        return d >= start && d < end;
      }
      if (period === "month") {
        const [y, m] = selectedMonth.split("-").map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        return d >= start && d < end;
      }
      const y = Number(selectedYear);
      const start = new Date(y, 0, 1);
      const end = new Date(y + 1, 0, 1);
      return d >= start && d < end;
    });
  }, [invoices, period, selectedDay, selectedWeek, selectedMonth, selectedYear]);

  const totalSales = filteredInvoices.reduce((sum, invoice) => {
    const returned = invoice.returned_amount ?? 0;
    const net = Math.max(0, invoice.total - returned);
    return sum + net;
  }, 0);
  const totalInvoices = filteredInvoices.filter((invoice) => Math.max(0, invoice.total - (invoice.returned_amount ?? 0)) > 0).length;
  const lowStockProducts = products.filter((p) => p.stock <= p.min_stock && p.stock > 0);
  const outOfStockProducts = products.filter((p) => p.stock <= 0);

  // Top sold products
  const productSales = useMemo(() => {
    const map: Record<string, { name: string; qty: number; revenue: number }> = {};
    const invoiceIdsInPeriod = new Set(filteredInvoices.map((inv) => inv.id));
    allItems.forEach((item) => {
      if (!invoiceIdsInPeriod.has(item.invoice_id)) return;
      if (!map[item.product_name]) map[item.product_name] = { name: item.product_name, qty: 0, revenue: 0 };
      const netQty = item.quantity - item.returned_quantity;
      if (netQty <= 0) return;
      map[item.product_name].qty += netQty;
      map[item.product_name].revenue += (item.subtotal / item.quantity) * netQty;
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty).slice(0, 10);
  }, [allItems, filteredInvoices]);

  const periods = [
    { key: "day" as const, label: tx("Today", "اليوم") },
    { key: "week" as const, label: tx("Week", "الأسبوع") },
    { key: "month" as const, label: tx("Month", "الشهر") },
    { key: "year" as const, label: tx("Year", "السنة") },
  ];

  const availableYears = Array.from(
    new Set(invoices.map((inv) => new Date(inv.created_at).getFullYear()).concat(new Date().getFullYear())),
  ).sort((a, b) => b - a);

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      {/* Period selector */}
      <div className="flex flex-wrap bg-muted rounded-xl p-1 w-full sm:w-fit">
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={cn("px-4 sm:px-5 py-2 rounded-lg text-sm font-semibold transition-all",
              period === p.key ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="glass-card rounded-xl p-3 w-full sm:w-fit">
        {period === "day" && (
          <Input type="date" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)} dir="ltr" />
        )}
        {period === "week" && (
          <Input type="week" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} dir="ltr" />
        )}
        {period === "month" && (
          <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} dir="ltr" />
        )}
        {period === "year" && (
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {availableYears.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-primary" />
            </div>
            <span className="text-sm text-muted-foreground">{tx("Total Sales", "إجمالي المبيعات")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{formatMoney(totalSales)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-info" />
            </div>
            <span className="text-sm text-muted-foreground">{tx("Invoices Count", "عدد الفواتير")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{totalInvoices}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-warning" />
            </div>
            <span className="text-sm text-muted-foreground">{tx("Low Stock", "كمية منخفضة")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{lowStockProducts.length}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-destructive" />
            </div>
            <span className="text-sm text-muted-foreground">{tx("Out Of Stock", "نفذت الكمية")}</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{outOfStockProducts.length}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top products */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            {tx("Top Selling Products", "أكثر المنتجات مبيعاً")}
          </h3>
          <div className="space-y-2">
            {productSales.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">{tx("No data", "لا توجد بيانات")}</p>
            ) : (
              productSales.map((p, i) => (
                <div key={p.name} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/50">
                  <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary text-sm font-bold flex items-center justify-center">{i + 1}</span>
                  <span className="flex-1 font-medium text-sm">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{p.qty} {tx("pcs", "قطعة")}</span>
                  <span className="text-sm font-bold text-primary">{formatMoney(p.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Low stock alert */}
        <div className="glass-card rounded-2xl p-5">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            {tx("Stock Alerts", "تنبيهات المخزون")}
          </h3>
          <div className="space-y-2">
            {[...outOfStockProducts, ...lowStockProducts].length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">{tx("Stock is healthy", "المخزون جيد")}</p>
            ) : (
              [...outOfStockProducts, ...lowStockProducts].map((p) => (
                <div key={p.id} className={cn("flex items-center gap-3 p-2 rounded-xl",
                  p.stock <= 0 ? "bg-destructive/5" : "bg-warning/5"
                )}>
                  <span className={cn("text-xs font-bold px-2 py-1 rounded-lg",
                    p.stock <= 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
                  )}>
                    {p.stock <= 0 ? tx("Out", "نفذ") : tx("Low", "منخفض")}
                  </span>
                  <span className="flex-1 font-medium text-sm">{p.name}</span>
                  <span className="text-sm text-muted-foreground">{tx("Remaining", "متبقي")}: {p.stock}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
