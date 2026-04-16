import { useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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

export default function Trash() {
  const { toast } = useToast();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [trashedProducts, setTrashedProducts] = useState(getTrashedProducts());
  const [trashedInvoices, setTrashedInvoices] = useState(getTrashedInvoices());

  useEffect(() => {
    const refresh = () => {
      setTrashedProducts(getTrashedProducts());
      setTrashedInvoices(getTrashedInvoices());
    };
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  return (
    <div className="space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold">{tx("Trash", "سلة المحذوفات")}</h2>
        <p className="text-muted-foreground mt-1">{tx("Permanent delete is available to super admin only.", "الحذف النهائي متاح فقط للسوبر أدمن.")}</p>
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h3 className="font-bold">{tx("Deleted Products", "المنتجات المحذوفة")} ({trashedProducts.length})</h3>
        {trashedProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx("No deleted products", "لا توجد منتجات محذوفة")}</p>
        ) : (
          trashedProducts.map((product) => (
            <div key={product.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border rounded-xl p-3">
              <div className="flex-1">
                <p className="font-semibold">{product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(product.retail_price)} | {formatMoney(product.wholesale_price)}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  restoreProduct(product.id);
                  toast({ title: tx("Product restored", "تم استرجاع المنتج") });
                }}
              >
                {tx("Restore", "استرجاع")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  permanentlyDeleteProduct(product.id);
                  toast({ title: tx("Product permanently deleted", "تم حذف المنتج نهائيًا") });
                }}
              >
                {tx("Delete Permanently", "حذف نهائي")}
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <h3 className="font-bold">{tx("Deleted Invoices", "الفواتير المحذوفة")} ({trashedInvoices.length})</h3>
        {trashedInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">{tx("No deleted invoices", "لا توجد فواتير محذوفة")}</p>
        ) : (
          trashedInvoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-col sm:flex-row sm:items-center gap-3 border rounded-xl p-3">
              <div className="flex-1">
                <p className="font-semibold text-sm" dir="ltr">{invoice.id}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(invoice.created_at).toLocaleString("en-US")} | {formatMoney(invoice.total)}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  restoreInvoice(invoice.id);
                  toast({ title: tx("Invoice restored", "تم استرجاع الفاتورة") });
                }}
              >
                {tx("Restore", "استرجاع")}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  permanentlyDeleteInvoice(invoice.id);
                  toast({ title: tx("Invoice permanently deleted", "تم حذف الفاتورة نهائيًا") });
                }}
              >
                {tx("Delete Permanently", "حذف نهائي")}
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
