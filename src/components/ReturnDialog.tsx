import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getInvoiceItems,
  getInvoiceReturnSummary,
  getReturnPassword,
  getReturnableInvoices,
  processInvoiceReturn,
} from "@/lib/localDb";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ReturnDialog({ open, onOpenChange }: Props) {
  const [password, setPassword] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [returnMode, setReturnMode] = useState<"all" | "items">("all");
  const [itemQuantities, setItemQuantities] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"password" | "invoice">("password");
  const { toast } = useToast();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();

  const returnableInvoices = getReturnableInvoices();
  const currentItems = invoiceId ? getInvoiceItems(invoiceId) : [];
  const currentItemsWithRemaining = currentItems
    .map((item) => ({
      ...item,
      remaining: item.quantity - (item.returned_quantity ?? 0),
    }))
    .filter((item) => item.remaining > 0);

  const invoiceSummary = invoiceId ? getInvoiceReturnSummary(invoiceId) : null;

  const verifyPassword = async () => {
    setLoading(true);
    const returnPassword = getReturnPassword();
    if (returnPassword === password) {
      setStep("invoice");
    } else {
      toast({ title: tx("Invalid password", "كلمة المرور غير صحيحة"), variant: "destructive" });
    }
    setLoading(false);
  };

  const processReturn = async () => {
    if (!invoiceId.trim()) {
      toast({ title: tx("Select an invoice first", "اختر الفاتورة أولًا"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      if (returnMode === "all") {
        processInvoiceReturn({ invoiceId, returnAll: true });
      } else {
        const lines = Object.entries(itemQuantities)
          .map(([itemId, qty]) => ({ itemId, quantity: parseInt(qty, 10) || 0 }))
          .filter((line) => line.quantity > 0);

        processInvoiceReturn({
          invoiceId,
          returnAll: false,
          lines,
        });
      }

      toast({ title: tx("Return processed successfully ✓", "تم الإرجاع بنجاح ✓") });
      handleClose();
    } catch (err: any) {
      toast({ title: tx("Error", "خطأ"), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword("");
    setInvoiceId("");
    setItemQuantities({});
    setReturnMode("all");
    setStep("password");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl" dir={isArabic ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{step === "password" ? tx("Return Password", "كلمة مرور الإرجاع") : tx("Return Invoice / Items", "إرجاع فاتورة / منتجات")}</DialogTitle>
        </DialogHeader>

        {step === "password" ? (
          <div className="space-y-4">
            <Input
              type="password"
              placeholder={tx("Enter super admin return password", "أدخل كلمة مرور السوبر أدمن")}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="text-center"
              dir="ltr"
            />
            <DialogFooter>
              <Button onClick={verifyPassword} disabled={!password || loading} className="w-full">
                {loading ? tx("Verifying...", "جاري التحقق...") : tx("Verify", "تحقق")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{tx("Select invoice", "اختر الفاتورة")}</label>
              <Select
                value={invoiceId}
                onValueChange={(value) => {
                  setInvoiceId(value);
                  setItemQuantities({});
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tx("Select invoice ID", "اختر رقم الفاتورة")} />
                </SelectTrigger>
                <SelectContent>
                  {returnableInvoices.map((inv) => {
                    const summary = getInvoiceReturnSummary(inv.id);
                    return (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.id.slice(0, 8)}... | {tx("Net", "الصافي")}: {formatMoney(summary.netAmount)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {invoiceId && invoiceSummary && (
              <div className="rounded-xl border p-3 text-sm space-y-1">
                <p>{tx("Original total", "الإجمالي الأصلي")}: <span className="font-bold">{formatMoney(invoiceSummary.netAmount + invoiceSummary.returnedAmount)}</span></p>
                <p>{tx("Returned before", "المرتجع سابقًا")}: <span className="font-bold">{formatMoney(invoiceSummary.returnedAmount)}</span></p>
                <p>{tx("Remaining returnable", "المتبقي للإرجاع")}: <span className="font-bold text-primary">{formatMoney(invoiceSummary.netAmount)}</span></p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={returnMode === "all" ? "default" : "outline"}
                onClick={() => setReturnMode("all")}
              >
                {tx("Return Full Invoice", "إرجاع الفاتورة كاملة")}
              </Button>
              <Button
                type="button"
                variant={returnMode === "items" ? "default" : "outline"}
                onClick={() => setReturnMode("items")}
              >
                {tx("Return Specific Items", "إرجاع منتجات محددة")}
              </Button>
            </div>

            {returnMode === "items" && invoiceId && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {currentItemsWithRemaining.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">{tx("No returnable quantities", "لا توجد كميات قابلة للإرجاع")}</p>
                ) : (
                  currentItemsWithRemaining.map((item) => (
                    <div key={item.id} className="grid grid-cols-[1fr_90px] items-center gap-2 border rounded-xl p-2">
                      <div>
                        <p className="text-sm font-medium">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {tx("Returnable", "المتاح للإرجاع")}: {item.remaining} | {tx("Unit Price", "سعر الوحدة")}: {formatMoney(item.unit_price)}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={item.remaining}
                        value={itemQuantities[item.id] ?? ""}
                        onChange={(e) => setItemQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        dir="ltr"
                        className="text-center"
                        placeholder="0"
                      />
                    </div>
                  ))
                )}
              </div>
            )}
            <DialogFooter>
              <Button onClick={processReturn} disabled={!invoiceId || loading} className="w-full">
                {loading ? tx("Processing...", "جاري المعالجة...") : tx("Process Return", "إرجاع الفاتورة")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
