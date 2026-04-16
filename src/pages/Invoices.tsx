import { useState, useEffect } from "react";
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

type InvoiceItem = LocalInvoiceItem;

export default function Invoices() {
  const { invoices } = useInvoices();
  const { role } = useAuth();
  const { toast } = useToast();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [search, setSearch] = useState("");
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, InvoiceItem[]>>({});

  const filtered = invoices.filter((inv) => {
    if (!search) return true;
    return inv.id.includes(search) || inv.sale_type.includes(search);
  });

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
  const todayNetTotal = filtered.reduce((sum, inv) => {
    const isToday = new Date(inv.created_at).toDateString() === new Date().toDateString();
    if (!isToday) return sum;
    return sum + getInvoiceReturnSummary(inv.id).netAmount;
  }, 0);

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder={tx("Search by invoice ID...", "بحث برقم الفاتورة...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10 rounded-xl" dir="ltr" />
      </div>

      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-right p-3 font-semibold">{tx("Date", "التاريخ")}</th>
                <th className="text-right p-3 font-semibold">{tx("Type", "النوع")}</th>
                <th className="text-right p-3 font-semibold">{tx("Total", "المجموع")}</th>
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
                      </div>
                    </td>
                    <td className="p-3 font-bold">{formatMoney(getInvoiceReturnSummary(inv.id).netAmount)}</td>
                    <td className="p-3">{formatMoney(inv.paid)}</td>
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
        <p className="text-sm text-muted-foreground">{tx("Today's Total (Net)", "مجموع اليوم (صافي)")}</p>
        <p className="text-2xl font-bold text-primary">{formatMoney(todayNetTotal)}</p>
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
                  <p className="text-muted-foreground">{tx("Return Time", "وقت الإرجاع")}</p>
                  <p className="font-bold">
                    {selectedInvoice.last_returned_at
                      ? formatDate(selectedInvoice.last_returned_at)
                      : tx("No return yet", "لا يوجد إرجاع بعد")}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Original Total", "الإجمالي الأصلي")}</p>
                  <p className="font-bold">{formatMoney(selectedInvoice.total)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Net After Returns", "الصافي بعد المرتجعات")}</p>
                  <p className="font-bold text-primary">{formatMoney(getInvoiceReturnSummary(selectedInvoice.id).netAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Paid Amount", "المبلغ المدفوع")}</p>
                  <p className="font-bold">{formatMoney(selectedInvoice.paid)}</p>
                </div>
                <div className="rounded-lg bg-muted/40 p-2">
                  <p className="text-muted-foreground">{tx("Change To Customer", "الباقي للزبون")}</p>
                  <p className="font-bold">{formatMoney(selectedInvoice.change_amount)}</p>
                </div>
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
                    {selectedItems.map((item) => {
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
                    {selectedItems.length === 0 && (
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
