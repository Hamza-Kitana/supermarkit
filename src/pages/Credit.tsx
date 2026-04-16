import { useMemo, useState } from "react";
import { useInvoices } from "@/hooks/useInvoices";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { applyCreditPayment, getInvoiceItems } from "@/lib/localDb";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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

  const filteredCustomers = customers.filter((c) =>
    !search ? true : c.name.toLowerCase().includes(search.toLowerCase()),
  );

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
      <div className="flex flex-wrap items-center gap-3">
        <div className="max-w-xs w-full">
          <Input
            placeholder={tx("Search by customer name...", "بحث باسم الزبون...")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl"
          />
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

