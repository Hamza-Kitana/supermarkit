import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { format, parseISO } from "date-fns";
import {
  getInvoicesWithReturns,
  getInvoiceItems,
  getPosCartExclusions,
  subscribeDbChanges,
  type LocalInvoice,
  type LocalInvoiceItem,
  type LocalPosCartExclusion,
} from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, Eye, Package, Printer, ShoppingCart } from "lucide-react";

function safeFormat(iso: string | null | undefined, pattern: string) {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), pattern);
  } catch {
    return iso;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type FeedRow =
  | { kind: "invoice"; at: string; inv: LocalInvoice }
  | { kind: "cart"; at: string; ev: LocalPosCartExclusion };

export default function Returns() {
  const location = useLocation();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<LocalInvoice[]>(() => getInvoicesWithReturns());
  const [cartExclusions, setCartExclusions] = useState<LocalPosCartExclusion[]>(() => getPosCartExclusions());
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setInvoices(getInvoicesWithReturns());
      setCartExclusions(getPosCartExclusions());
    };
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  useEffect(() => {
    setInvoices(getInvoicesWithReturns());
    setCartExclusions(getPosCartExclusions());
  }, [location.pathname]);

  /** Full invoice lines (entire “cart” / sale), same source as Invoices page */
  const allItemsByInvoice = useMemo(() => {
    const map = new Map<string, LocalInvoiceItem[]>();
    for (const inv of invoices) {
      map.set(inv.id, getInvoiceItems(inv.id));
    }
    return map;
  }, [invoices]);

  const feed = useMemo((): FeedRow[] => {
    const rows: FeedRow[] = [
      ...invoices.map((inv) => ({
        kind: "invoice" as const,
        at: inv.last_returned_at ?? inv.created_at,
        inv,
      })),
      ...cartExclusions.map((ev) => ({
        kind: "cart" as const,
        at: ev.created_at,
        ev,
      })),
    ];
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [invoices, cartExclusions]);

  const printHtml = useCallback(
    (docHtml: string) => {
      const w = window.open("", "_blank");
      if (!w) {
        toast({
          title: tx("Allow pop-ups to print", "فعّل النوافذ المنبثقة للطباعة"),
          variant: "destructive",
        });
        return;
      }
      w.document.open();
      w.document.write(docHtml);
      w.document.close();
      w.focus();
      w.print();
    },
    [toast, tx],
  );

  const printInvoiceReturn = useCallback(
    (inv: LocalInvoice, lines: LocalInvoiceItem[]) => {
      const returned = inv.returned_amount ?? 0;
      const net = Math.max(0, inv.total - returned);
      const fullReturn = inv.is_return || net <= 0.0001;
      const statusLabel = fullReturn
        ? tx("Fully returned", "مرتجع كامل")
        : tx("Partially returned", "مرتجع جزئي");
      const saleTypeLabel =
        inv.sale_type === "wholesale" ? tx("Wholesale", "جملة") : tx("Retail", "مفرق");
      const paymentLabel =
        inv.payment_method === "visa"
          ? tx("Visa", "فيزا")
          : inv.payment_method === "wallet"
            ? tx("Wallet", "محفظة")
            : tx("Cash", "كاش");

      const rowsHtml =
        lines.length === 0
          ? `<tr><td colspan="5">${escapeHtml(tx("(Line details unavailable)", "(تفاصيل البنود غير متوفرة)"))}</td></tr>`
          : lines
              .map((line) => {
                const rq = line.returned_quantity ?? 0;
                const retVal = rq * line.unit_price;
                return `<tr>
              <td>${escapeHtml(line.product_name)}</td>
              <td>${line.quantity}</td>
              <td>${formatMoney(line.unit_price)}</td>
              <td>${formatMoney(line.subtotal)}</td>
              <td>${rq > 0 ? `${rq} (${formatMoney(retVal)})` : "—"}</td>
            </tr>`;
              })
              .join("");

      const creditLine =
        inv.is_credit && inv.customer_name
          ? `<p><strong>${escapeHtml(tx("Credit customer", "زبون دين"))}:</strong> ${escapeHtml(inv.customer_name)}</p>`
          : "";

      const docHtml = `<!DOCTYPE html>
<html lang="${isArabic ? "ar" : "en"}" dir="${isArabic ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(tx("Invoice return", "إرجاع فاتورة"))} — ${escapeHtml(inv.id)}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111827; font-size: 14px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    h2 { font-size: 15px; margin: 16px 0 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: ${isArabic ? "right" : "left"}; }
    th { background: #f3f4f6; }
    p { margin: 4px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(tx("Returns — invoice", "المرتجعات — فاتورة"))}</h1>
  <p><strong>${escapeHtml(tx("Invoice ID", "رقم الفاتورة"))}:</strong> ${escapeHtml(inv.id)}</p>
  <p><strong>${escapeHtml(tx("Status", "الحالة"))}:</strong> ${escapeHtml(statusLabel)} · ${escapeHtml(saleTypeLabel)}</p>
  <p>${escapeHtml(tx("Sale date", "تاريخ البيع"))}: ${escapeHtml(safeFormat(inv.created_at, "yyyy-MM-dd HH:mm"))} · ${escapeHtml(inv.cashier_name)}</p>
  <p>${escapeHtml(tx("Last return at", "آخر إرجاع"))}: ${escapeHtml(safeFormat(inv.last_returned_at, "yyyy-MM-dd HH:mm"))}</p>
  <p><strong>${escapeHtml(tx("Invoice total", "إجمالي الفاتورة"))}:</strong> ${escapeHtml(formatMoney(inv.total))}</p>
  <p><strong>${escapeHtml(tx("Returned", "مرتجع"))}:</strong> ${escapeHtml(formatMoney(returned))}</p>
  <p><strong>${escapeHtml(tx("Net after return", "الصافي بعد الإرجاع"))}:</strong> ${escapeHtml(formatMoney(net))}</p>
  <p><strong>${escapeHtml(tx("Payment", "الدفع"))}:</strong> ${escapeHtml(paymentLabel)}</p>
  ${creditLine}
  <h2>${escapeHtml(tx("Full invoice (all lines as sold)", "الفاتورة كاملة (كل البنود كما بيعت)"))}</h2>
  <table>
    <thead>
      <tr>
        <th>${escapeHtml(tx("Product", "الصنف"))}</th>
        <th>${escapeHtml(tx("Qty (sold on invoice)", "الكمية (مباعة على الفاتورة)"))}</th>
        <th>${escapeHtml(tx("Unit price", "سعر الوحدة"))}</th>
        <th>${escapeHtml(tx("Line total", "إجمالي السطر"))}</th>
        <th>${escapeHtml(tx("Returned", "مرتجع"))}</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <p style="margin-top:16px;font-size:12px;color:#6b7280;">${escapeHtml(tx("Printed at", "تاريخ الطباعة"))}: ${escapeHtml(new Date().toLocaleString(isArabic ? "ar-JO" : "en-US"))}</p>
</body>
</html>`;
      printHtml(docHtml);
    },
    [formatMoney, isArabic, printHtml, tx],
  );

  const printCartExclusion = useCallback(
    (ev: LocalPosCartExclusion) => {
      const saleTypeLabel =
        ev.sale_type === "wholesale" ? tx("Wholesale", "جملة") : tx("Retail", "مفرق");
      const docHtml = `<!DOCTYPE html>
<html lang="${isArabic ? "ar" : "en"}" dir="${isArabic ? "rtl" : "ltr"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(tx("Cart — not sold", "من السلة — غير مباع"))}</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #111827; font-size: 14px; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { margin: 6px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(tx("Returns — cart line (not sold)", "المرتجعات — سطر سلة (غير مباع)"))}</h1>
  <p><strong>${escapeHtml(tx("Type", "النوع"))}:</strong> ${escapeHtml(saleTypeLabel)}</p>
  <p>${escapeHtml(safeFormat(ev.created_at, "yyyy-MM-dd HH:mm"))} · ${escapeHtml(ev.cashier_name)}</p>
  <p><strong>${escapeHtml(tx("Product", "الصنف"))}:</strong> ${escapeHtml(ev.product_name)}</p>
  <p><strong>${escapeHtml(tx("Qty", "الكمية"))}:</strong> ${escapeHtml(String(ev.quantity))}</p>
  <p><strong>${escapeHtml(tx("Line value", "قيمة السطر"))}:</strong> ${escapeHtml(formatMoney(ev.line_value))}</p>
  <p style="margin-top:16px;font-size:12px;color:#6b7280;">${escapeHtml(tx("Printed at", "تاريخ الطباعة"))}: ${escapeHtml(new Date().toLocaleString(isArabic ? "ar-JO" : "en-US"))}</p>
</body>
</html>`;
      printHtml(docHtml);
    },
    [formatMoney, isArabic, printHtml, tx],
  );

  return (
    <div className="space-y-4 max-w-4xl" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold">{tx("Returns log", "سجل المرتجعات")}</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {tx(
            "Invoice returns and cart lines excluded at the POS (not sold) appear here in real time.",
            "تظهر هنا إرجاعات الفواتير وأسطر السلة المستبعدة في نقطة البيع (غير مباعة) فوراً.",
          )}
        </p>
      </div>

      {feed.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center text-muted-foreground">
          {tx("No returns or cart exclusions yet.", "لا توجد مرتجعات أو استبعادات من السلة بعد.")}
        </div>
      ) : (
        <ul className="space-y-2">
          {feed.map((row) => {
            if (row.kind === "cart") {
              const ev = row.ev;
              return (
                <li
                  key={`cart-${ev.id}`}
                  className="glass-card rounded-2xl border border-orange-500/35 bg-orange-500/5 overflow-hidden"
                >
                  <div className="flex items-start gap-3 p-4">
                    <ShoppingCart className="w-5 h-5 shrink-0 mt-0.5 text-orange-600" />
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-orange-500/20 text-orange-800 dark:text-orange-200"
                        >
                          {tx("Cart — not sold", "من السلة — غير مباع")}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium">
                          {ev.sale_type === "wholesale" ? tx("Wholesale", "جملة") : tx("Retail", "مفرق")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {safeFormat(ev.created_at, "yyyy-MM-dd HH:mm")} · {ev.cashier_name}
                      </p>
                      <p className="font-semibold text-foreground pt-1">{ev.product_name}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <span>
                          {tx("Qty", "الكمية")}: <span className="font-medium">{ev.quantity}</span>
                        </span>
                        <span>
                          {tx("Line value", "قيمة السطر")}:{" "}
                          <span className="font-semibold text-destructive">{formatMoney(ev.line_value)}</span>
                        </span>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 self-start"
                      onClick={() => printCartExclusion(ev)}
                      title={tx("Print this slip", "طباعة هذا الإيصال")}
                      aria-label={tx("Print", "طباعة")}
                    >
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            }

            const inv = row.inv;
            const returned = inv.returned_amount ?? 0;
            const net = Math.max(0, inv.total - returned);
            const lines = allItemsByInvoice.get(inv.id) ?? [];
            const expanded = openId === inv.id;
            const openInvoiceDialog = (e: { preventDefault: () => void; stopPropagation: () => void }) => {
              e.preventDefault();
              e.stopPropagation();
              setViewInvoiceId(inv.id);
            };
            const fullReturn = inv.is_return || net <= 0.0001;
            const statusLabel = fullReturn
              ? tx("Fully returned", "مرتجع كامل")
              : tx("Partially returned", "مرتجع جزئي");

            return (
              <li key={inv.id} className="glass-card relative rounded-2xl border border-border/60 overflow-hidden">
                {/* Fixed corner — avoids being clipped by parent overflow-x-hidden (main layout) */}
                <div className="pointer-events-auto absolute top-3 end-3 z-20 flex flex-row gap-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 shrink-0 border border-primary/30 bg-card shadow-sm text-primary hover:bg-primary/10"
                    onClick={openInvoiceDialog}
                    title={tx("View full invoice", "عرض الفاتورة كاملة")}
                    aria-label={tx("View full invoice", "عرض الفاتورة كاملة")}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="h-9 w-9 shrink-0 border border-border bg-card shadow-sm hover:bg-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      printInvoiceReturn(inv, lines);
                    }}
                    title={tx("Print this invoice return", "طباعة إرجاع هذه الفاتورة")}
                    aria-label={tx("Print", "طباعة")}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex w-full items-stretch pe-[5.75rem]">
                  <button
                    type="button"
                    className="flex-1 min-w-0 flex items-start gap-3 p-4 text-start hover:bg-muted/40 transition-colors"
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
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
                          {tx("Invoice", "فاتورة")}
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
                </div>

                {expanded && (
                  <div className="border-t border-border/60 bg-muted/20 px-4 py-3 space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      {tx("Full invoice (all lines as sold)", "الفاتورة كاملة (كل البنود كما بيعت)")}
                    </p>
                    {lines.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {tx("(Line details unavailable)", "(تفاصيل البنود غير متوفرة)")}
                      </p>
                    ) : (
                      <div className="rounded-xl border border-border/60 overflow-hidden bg-card/30">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border/60">
                              <th className="text-start p-2 font-semibold">{tx("Product", "المنتج")}</th>
                              <th className="text-start p-2 font-semibold whitespace-nowrap">
                                {tx("Qty (sold on invoice)", "الكمية (مباعة)")}
                              </th>
                              <th className="text-start p-2 font-semibold whitespace-nowrap">
                                {tx("Unit Price", "سعر الوحدة")}
                              </th>
                              <th className="text-start p-2 font-semibold whitespace-nowrap">
                                {tx("Line total", "المجموع")}
                              </th>
                              <th className="text-start p-2 font-semibold whitespace-nowrap">
                                {tx("Returned qty", "كمية مرتجعة")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.map((item) => {
                              const rq = item.returned_quantity ?? 0;
                              return (
                                <tr key={item.id} className="border-b border-border/40 last:border-b-0">
                                  <td className="p-2 font-medium align-top">{item.product_name}</td>
                                  <td className="p-2 align-top">{item.quantity}</td>
                                  <td className="p-2 align-top">{formatMoney(item.unit_price)}</td>
                                  <td className="p-2 font-semibold align-top">{formatMoney(item.subtotal)}</td>
                                  <td className="p-2 align-top">
                                    {rq > 0 ? (
                                      <span className="text-destructive font-medium">
                                        {rq}
                                        <span className="text-muted-foreground font-normal">
                                          {" "}
                                          ({formatMoney(rq * item.unit_price)})
                                        </span>
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {tx(
                        "These lines are the same products and quantities as on the original sale invoice.",
                        "هذه البنود هي نفس المنتجات والكميات كما في فاتورة البيع الأصلية.",
                      )}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground pt-1 border-t border-border/40">
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
          "Cart exclusions are logged when a line is turned off (red) on the POS. Invoice returns come from the Return dialog after a sale.",
          "يُسجّل استبعاد السلة عند تعطيل سطر (أحمر) في نقطة البيع. إرجاع الفاتورة يأتي من نافذة الإرجاع بعد البيع.",
        )}
      </p>

      <InvoiceReturnDetailDialog
        open={Boolean(viewInvoiceId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setViewInvoiceId(null);
        }}
        invoiceId={viewInvoiceId}
        invoices={invoices}
        linesByInvoice={allItemsByInvoice}
        formatMoney={formatMoney}
        tx={tx}
        isArabic={isArabic}
        safeFormat={safeFormat}
      />
    </div>
  );
}

function InvoiceReturnDetailDialog({
  open,
  onOpenChange,
  invoiceId,
  invoices,
  linesByInvoice,
  formatMoney,
  tx,
  isArabic,
  safeFormat,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string | null;
  invoices: LocalInvoice[];
  linesByInvoice: Map<string, LocalInvoiceItem[]>;
  formatMoney: (n: number) => string;
  tx: (en: string, ar: string) => string;
  isArabic: boolean;
  safeFormat: (iso: string | null | undefined, pattern: string) => string;
}) {
  const inv = invoiceId ? invoices.find((i) => i.id === invoiceId) ?? null : null;
  const lines = invoiceId ? (linesByInvoice.get(invoiceId) ?? []) : [];
  const returned = inv ? (inv.returned_amount ?? 0) : 0;
  const net = inv ? Math.max(0, inv.total - returned) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[min(90vh,36rem)] flex flex-col gap-0 overflow-hidden p-0"
        dir={isArabic ? "rtl" : "ltr"}
      >
        {inv && (
          <>
            <DialogHeader className="p-5 pb-3 border-b border-border shrink-0 space-y-1 text-start">
              <DialogTitle className="text-lg">{tx("Full invoice", "الفاتورة كاملة")}</DialogTitle>
              <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                {inv.id}
              </p>
              <p className="text-xs text-muted-foreground">
                {safeFormat(inv.created_at, "yyyy-MM-dd HH:mm")} · {inv.cashier_name}
              </p>
            </DialogHeader>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
              <div className="rounded-xl border border-border/60 overflow-hidden bg-card/30">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border/60">
                      <th className="text-start p-2 font-semibold">{tx("Product", "المنتج")}</th>
                      <th className="text-start p-2 font-semibold whitespace-nowrap">
                        {tx("Qty (sold)", "الكمية (مباعة)")}
                      </th>
                      <th className="text-start p-2 font-semibold whitespace-nowrap">{tx("Unit price", "سعر الوحدة")}</th>
                      <th className="text-start p-2 font-semibold whitespace-nowrap">{tx("Line total", "مجموع السطر")}</th>
                      <th className="text-start p-2 font-semibold whitespace-nowrap">{tx("Returned", "مرتجع")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">
                          {tx("(Line details unavailable)", "(تفاصيل البنود غير متوفرة)")}
                        </td>
                      </tr>
                    ) : (
                      lines.map((item) => {
                        const rq = item.returned_quantity ?? 0;
                        const retVal = rq * item.unit_price;
                        return (
                          <tr
                            key={item.id}
                            className={cn(
                              "border-b border-border/40 last:border-b-0",
                              rq > 0 && "bg-destructive/5",
                            )}
                          >
                            <td className="p-2 font-medium align-top">{item.product_name}</td>
                            <td className="p-2 align-top">{item.quantity}</td>
                            <td className="p-2 align-top tabular-nums">{formatMoney(item.unit_price)}</td>
                            <td className="p-2 font-semibold align-top tabular-nums">{formatMoney(item.subtotal)}</td>
                            <td className="p-2 align-top">
                              {rq > 0 ? (
                                <span className="text-destructive font-medium tabular-nums">
                                  {rq} ({formatMoney(retVal)})
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 rounded-xl border border-border bg-muted/25 p-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{tx("Original invoice total", "إجمالي الفاتورة الأصلي")}</span>
                  <span className="font-bold tabular-nums">{formatMoney(inv.total)}</span>
                </div>
                <div className="flex justify-between gap-4 text-destructive">
                  <span className="font-medium">
                    {tx("Deducted — returned items total", "المخصوم — مجموع الأصناف المرتجعة")}
                  </span>
                  <span className="font-bold tabular-nums">{formatMoney(returned)}</span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between gap-4 text-base">
                  <span className="font-semibold">
                    {tx("Total without returned items (net)", "المجموع بدون الأصناف المرتجعة (الصافي)")}
                  </span>
                  <span className="font-bold text-primary tabular-nums">{formatMoney(net)}</span>
                </div>
              </div>
            </div>
            <DialogFooter className="p-4 border-t border-border shrink-0 sm:justify-center">
              <Button type="button" variant="outline" className="rounded-xl min-w-[8rem]" onClick={() => onOpenChange(false)}>
                {tx("Close", "إغلاق")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
