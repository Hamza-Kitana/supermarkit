import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  getInvoicesWithReturns,
  getInvoiceItems,
  subscribeDbChanges,
  type LocalInvoice,
  type LocalInvoiceItem,
} from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { ChevronDown, Package } from "lucide-react";

function safeFormat(iso: string | null | undefined, pattern: string) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}

export default function Returns() {
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [invoices, setInvoices] = useState<LocalInvoice[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setInvoices(getInvoicesWithReturns());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const itemsByInvoice = useMemo(() => {
    const map = new Map<string, LocalInvoiceItem[]>();
    for (const inv of invoices) {
      const lines = getInvoiceItems(inv.id).filter((it) => (it.returned_quantity ?? 0) > 0);
      map.set(inv.id, lines);
    }
    return map;
  }, [invoices]);

  return (
    <div className="space-y-4 max-w-4xl" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold">{tx("Returns log", "سجل المرتجعات")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {tx(
            "Every invoice with a return is listed below. Expand a row to see returned lines and amounts.",
            "كل فاتورة عليها إرجاع تظهر هنا. وسّع السطر لعرض بنود الإرجاع والمبالغ.",
          )}
        </p>
      </div>

      {invoices.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
          {tx("No returns recorded yet.", "لا توجد مرتجعات مسجّلة بعد.")}
        </div>
      ) : (
        <ul className="space-y-2">
          {invoices.map((inv) => {
            const returned = inv.returned_amount ?? 0;
            const net = Math.max(0, inv.total - returned);
            const lines = itemsByInvoice.get(inv.id) ?? [];
            const expanded = openId === inv.id;
            const fullReturn = inv.is_return || net <= 0.0001;
            const statusLabel = fullReturn
              ? tx("Fully returned", "مرتجع كامل")
              : tx("Partially returned", "مرتجع جزئي");

            return (
              <li key={inv.id} className="glass-card rounded-2xl border border-border/60 overflow-hidden">
                <button
                  type="button"
                  className="w-full flex items-start gap-3 p-4 text-start hover:bg-muted/40 transition-colors"
                  onClick={() => setOpenId(expanded ? null : inv.id)}
                >
                  <ChevronDown
                    className={cn(
                      "w-5 h-5 shrink-0 mt-0.5 text-muted-foreground transition-transform",
                      expanded && "rotate-180",
                    )}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{inv.id.slice(0, 8)}…</span>
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full font-semibold",
                          fullReturn ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
                        )}
                      >
                        {statusLabel}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium">
                        {inv.sale_type === "wholesale" ? tx("Wholesale", "جملة") : tx("Retail", "مفرق")}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {safeFormat(inv.created_at, "yyyy-MM-dd HH:mm")} · {inv.cashier_name}
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm pt-1">
                      <span>
                        {tx("Invoice total", "إجمالي الفاتورة")}:{" "}
                        <span className="font-semibold text-foreground">{formatMoney(inv.total)}</span>
                      </span>
                      <span>
                        {tx("Returned", "مرتجع")}:{" "}
                        <span className="font-semibold text-destructive">{formatMoney(returned)}</span>
                      </span>
                      <span>
                        {tx("Net after return", "الصافي بعد الإرجاع")}:{" "}
                        <span className="font-semibold text-foreground">{formatMoney(net)}</span>
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {tx("Last return at", "آخر إرجاع")}: {safeFormat(inv.last_returned_at, "yyyy-MM-dd HH:mm")}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-border/60 bg-muted/20 px-4 py-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {tx("Returned lines", "بنود مرتجعة")}
                    </p>
                    {lines.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {tx("(Line details unavailable)", "(تفاصيل البنود غير متوفرة)")}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {lines.map((line) => {
                          const rq = line.returned_quantity ?? 0;
                          const back = rq * line.unit_price;
                          return (
                            <li
                              key={line.id}
                              className="rounded-lg border border-border/50 bg-card/50 px-3 py-2 text-sm flex flex-wrap justify-between gap-2"
                            >
                              <span className="font-medium">{line.product_name}</span>
                              <span className="text-muted-foreground font-mono text-xs">
                                {tx("Returned qty", "كمية مرتجعة")}: {rq} × {formatMoney(line.unit_price)} ={" "}
                                <span className="text-destructive font-semibold">{formatMoney(back)}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-1">
                      <span>
                        {tx("Payment", "الدفع")}: {inv.payment_method}
                      </span>
                      {inv.is_credit && (
                        <span>
                          {tx("Credit", "دين")} — {inv.customer_name ?? "—"}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-muted-foreground">
        {tx(
          "New returns processed from the POS Return dialog appear here automatically.",
          "أي إرجاع يتم من نافذة «إرجاع» في نقطة البيع يظهر هنا تلقائياً.",
        )}
      </p>
    </div>
  );
}
