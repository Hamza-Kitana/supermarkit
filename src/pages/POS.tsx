import { useState, useMemo, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts, Product } from "@/hooks/useProducts";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ReturnDialog from "@/components/ReturnDialog";
import {
  addCustomer,
  createInvoice,
  createPosExclusionCloseInvoice,
  getCustomers,
  notifyLocalDbChanged,
  recordPosCartExclusionsBatch,
  subscribeDbChanges,
  type CartFullDisplaySnapshot,
  type LocalCustomer,
} from "@/lib/localDb";
import { CASH_PAY_OPTIONS, cashPayLabel } from "@/lib/cashPayCurrencies";
import { useCurrency } from "@/hooks/useCurrency";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import { useCreditEnabled } from "@/hooks/useCreditEnabled";
import { ShoppingBasket, RotateCcw, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartItem {
  product: Product;
  quantity: number;
  /** Units excluded from sale (logged to Returns on complete). 0 … quantity */
  excludedQuantity: number;
}

function saleQty(item: CartItem) {
  return Math.max(0, item.quantity - item.excludedQuantity);
}

export default function POS() {
  const { user, role } = useAuth();
  const { products } = useProducts();
  const { toast } = useToast();
  const { formatMoney, currency, getJodPerUnit, formatCashPay } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const creditEnabled = useCreditEnabled();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [saleType, setSaleType] = useState<"retail" | "wholesale">("retail");
  const [paidAmount, setPaidAmount] = useState("");
  const [search, setSearch] = useState("");
  const [processing, setProcessing] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [saleTypeConfirmOpen, setSaleTypeConfirmOpen] = useState(false);
  const [pendingSaleType, setPendingSaleType] = useState<"retail" | "wholesale" | null>(null);
  const [isCredit, setIsCredit] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "visa" | "wallet">("cash");
  const [customers, setCustomers] = useState<LocalCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  /** Cash denomination for the paid-amount field (default: JOD) */
  const [cashPayCurrency, setCashPayCurrency] = useState<string>("JOD");
  const [fullReturnConfirmOpen, setFullReturnConfirmOpen] = useState(false);
  const [excludeDialogProductId, setExcludeDialogProductId] = useState<string | null>(null);
  const [excludeQtyDraft, setExcludeQtyDraft] = useState("");

  useEffect(() => {
    const refresh = () => setCustomers(getCustomers());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  useEffect(() => {
    if (!creditEnabled && isCredit) {
      setIsCredit(false);
      setSelectedCustomerId("");
      setCustomerName("");
      setShowAddCustomer(false);
    }
  }, [creditEnabled, isCredit]);

  useEffect(() => {
    if (isCredit) setCashPayCurrency("JOD");
  }, [isCredit]);

  useEffect(() => {
    if (currency === "USD") setCashPayCurrency("USD");
    else setCashPayCurrency("JOD");
  }, [currency]);

  useEffect(() => {
    setPaidAmount("");
  }, [cart, saleType]);

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    return products.filter((p) => p.name.includes(search));
  }, [products, search]);

  const includedLines = useMemo(() => cart.filter((i) => saleQty(i) > 0), [cart]);

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const price = saleType === "retail" ? item.product.retail_price : item.product.wholesale_price;
        return sum + price * saleQty(item);
      }, 0),
    [cart, saleType],
  );

  const jodPerUnitPay = useMemo(
    () => (currency === "JOD" ? getJodPerUnit(cashPayCurrency) : 1),
    [currency, cashPayCurrency, getJodPerUnit],
  );

  const totalInPayCurrency = useMemo(() => {
    if (currency !== "JOD") return total;
    if (cashPayCurrency === "JOD") return total;
    if (jodPerUnitPay <= 0) return 0;
    return total / jodPerUnitPay;
  }, [currency, cashPayCurrency, total, jodPerUnitPay]);

  const cashPayIsForeign = currency === "USD" || (currency === "JOD" && cashPayCurrency !== "JOD");

  const paidInShopCurrency = useMemo(() => {
    if (isCredit) return 0;
    if (paymentMethod !== "cash") return total;
    const empty = paidAmount.trim() === "";
    if (currency !== "JOD") {
      return empty ? total : Math.max(0, parseFloat(paidAmount) || 0);
    }
    if (cashPayCurrency === "JOD") {
      return empty ? total : Math.max(0, parseFloat(paidAmount) || 0);
    }
    const rate = jodPerUnitPay;
    const paidForeign = empty ? totalInPayCurrency : Math.max(0, parseFloat(paidAmount) || 0);
    return paidForeign * rate;
  }, [
    isCredit,
    paymentMethod,
    paidAmount,
    currency,
    cashPayCurrency,
    total,
    jodPerUnitPay,
    totalInPayCurrency,
  ]);

  const effectivePaid = !isCredit && paymentMethod !== "cash" ? total : isCredit ? 0 : paidInShopCurrency;
  const change = !isCredit && paymentMethod === "cash" ? Math.max(0, paidInShopCurrency - total) : 0;

  const changeInPayCurrency =
    currency === "JOD" && cashPayCurrency !== "JOD" && jodPerUnitPay > 0 ? change / jodPerUnitPay : 0;

  const addToCart = (product: Product) => {
    const productWholesaleMin = Math.max(1, product.wholesale_min_qty || 1);
    if (product.stock <= 0) {
      toast({ title: tx("Out of stock", "نفذت الكمية"), description: tx(`${product.name} is currently unavailable`, `${product.name} غير متوفر حالياً`), variant: "destructive" });
      return;
    }
    if (saleType === "wholesale" && product.stock < productWholesaleMin) {
      toast({
        title: tx("Wholesale sale not allowed", "البيع بالجملة غير مسموح"),
        description: tx(
          `${product.name} cannot be sold wholesale because stock is below its minimum quantity (${productWholesaleMin}).`,
          `لا يمكن بيع ${product.name} بالجملة لأن المخزون أقل من الحد الأدنى الخاص به (${productWholesaleMin}).`,
        ),
        variant: "destructive",
      });
      return;
    }
    if (saleType === "retail" && product.stock < product.min_stock) {
      toast({ title: tx("Warning", "تنبيه"), description: tx(`${product.name} is below minimum stock (${product.min_stock})`, `كمية ${product.name} أقل من الحد الأدنى (${product.min_stock})`), variant: "destructive" });
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast({ title: tx("Warning", "تنبيه"), description: tx("Cannot add more than available stock", "لا يمكن إضافة أكثر من الكمية المتوفرة"), variant: "destructive" });
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id
            ? {
                ...i,
                quantity: i.quantity + 1,
                excludedQuantity: Math.min(i.excludedQuantity, i.quantity + 1),
              }
            : i,
        );
      }
      const initialQty = saleType === "wholesale" ? productWholesaleMin : 1;
      return [...prev, { product, quantity: initialQty, excludedQuantity: 0 }];
    });
  };

  const openExcludeDialog = useCallback((productId: string) => {
    const row = cart.find((i) => i.product.id === productId);
    if (!row) return;
    setExcludeDialogProductId(productId);
    setExcludeQtyDraft(String(row.excludedQuantity));
  }, [cart]);

  const applyExcludeQuantity = () => {
    if (!excludeDialogProductId) return;
    const row = cart.find((i) => i.product.id === excludeDialogProductId);
    if (!row) return;
    const parsed = Math.floor(Number.parseInt(excludeQtyDraft, 10) || 0);
    const next = Math.min(Math.max(0, parsed), row.quantity);
    setCart((prev) =>
      prev.map((i) => (i.product.id === excludeDialogProductId ? { ...i, excludedQuantity: next } : i)),
    );
    setExcludeDialogProductId(null);
    setExcludeQtyDraft("");
  };

  const excludeDialogItem = useMemo(
    () =>
      excludeDialogProductId
        ? cart.find((i) => i.product.id === excludeDialogProductId)
        : undefined,
    [cart, excludeDialogProductId],
  );

  const confirmFullCartReturn = () => {
    if (!user) return;
    setCart((prev) => prev.map((i) => ({ ...i, excludedQuantity: i.quantity })));
    setFullReturnConfirmOpen(false);
    toast({
      title: tx("All lines excluded ✓", "تم استبعاد كل الأسطر ✓"),
      description: tx(
        "Recorded under Returns. Tap Complete to close the cart.",
        "مُسجّل في المرتجعات. اضغط «إتمام» لإغلاق السلة.",
      ),
    });
  };

  const askSaleTypeChange = (nextType: "retail" | "wholesale") => {
    if (nextType === saleType) return;
    setPendingSaleType(nextType);
    setSaleTypeConfirmOpen(true);
  };

  const confirmSaleTypeChange = () => {
    if (!pendingSaleType) return;
    setSaleType(pendingSaleType);
    setCart([]);
    setSaleTypeConfirmOpen(false);
    setPendingSaleType(null);
  };

  const checkout = async () => {
    if (!user || cart.length === 0) return;
    const linesForSale = cart.filter((i) => saleQty(i) > 0);

    if (linesForSale.length === 0) {
      setProcessing(true);
      try {
        const hasExclusions = cart.some((i) => i.excludedQuantity > 0);
        if (hasExclusions && user) {
          const activeCashierId = user.cashierId ?? user.id;
          const activeCashierName =
            role === "super_admin"
              ? "Sadmin"
              : role === "admin"
                ? "admin"
                : user.displayName;
          const logBatch = cart
            .filter((ci) => ci.excludedQuantity > 0)
            .map((ci) => {
              const unit_price =
                saleType === "retail" ? ci.product.retail_price : ci.product.wholesale_price;
              return {
                cashier_id: activeCashierId,
                cashier_name: activeCashierName,
                product_id: ci.product.id,
                product_name: ci.product.name,
                quantity: ci.excludedQuantity,
                sale_type: saleType,
                unit_price,
              };
            });
          recordPosCartExclusionsBatch(logBatch);
          const snapshotItems = cart.map((ci) => {
            const unit_price =
              saleType === "retail" ? ci.product.retail_price : ci.product.wholesale_price;
            return {
              product_id: ci.product.id,
              product_name: ci.product.name,
              quantity: ci.quantity,
              unit_cost: ci.product.cost_price ?? 0,
              unit_price,
              subtotal: unit_price * ci.quantity,
            };
          });
          createPosExclusionCloseInvoice({
            cashier_id: activeCashierId,
            cashier_name: activeCashierName,
            sale_type: saleType,
            items: snapshotItems,
          });
        }
        toast({
          title: tx("Full return closed ✓", "تم إغلاق الإرجاع الكامل ✓"),
          description: tx(
            "Cart cleared. Logged under Returns and as a cash receipt on Invoices.",
            "تم تفريغ السلة. يُسجّل في المرتجعات وكإيصال كاش في الفواتير.",
          ),
        });
        setCart([]);
        setPaidAmount("");
        setCustomerName("");
        setSelectedCustomerId("");
        setIsCredit(false);
        setShowAddCustomer(false);
        setNewCustomerName("");
        setNewCustomerPhone("");
        setPaymentMethod("cash");
        setCashPayCurrency("JOD");
        notifyLocalDbChanged();
      } finally {
        setProcessing(false);
      }
      return;
    }
    const activeCashierId = user.cashierId ?? user.id;
    const activeCashierName =
      role === "super_admin"
        ? "Sadmin"
        : role === "admin"
          ? "admin"
          : user.displayName;
    if (!isCredit && saleType === "wholesale") {
      const invalidItems = linesForSale.filter((item) => saleQty(item) < item.product.wholesale_min_qty);
      if (invalidItems.length > 0) {
        const invalidNames = invalidItems
          .map((item) => `${item.product.name} (${item.product.wholesale_min_qty})`)
          .join(", ");
        toast({
          title: tx("Wholesale sale not allowed", "البيع بالجملة غير مسموح"),
          description: tx(
            `Each product has its own minimum wholesale quantity. Non-compliant products: ${invalidNames}`,
            `كل منتج له حد أدنى خاص للجملة. المنتجات المخالفة: ${invalidNames.replaceAll(",", "،")}`,
          ),
          variant: "destructive",
        });
        return;
      }
    }
    if (!isCredit) {
      if (paymentMethod !== "cash") {
        // For card/wallet payments, no need to type paid amount.
      } else if (paidInShopCurrency + 1e-6 < total) {
        toast({ title: tx("Insufficient paid amount", "المبلغ المدفوع غير كافٍ"), variant: "destructive" });
        return;
      }
    } else {
      if (!creditEnabled) {
        toast({ title: tx("Credit sales are disabled", "البيع بالدين متوقف حالياً"), variant: "destructive" });
        return;
      }
      if (!selectedCustomerId && !customerName.trim()) {
        toast({ title: tx("Customer name is required for credit sale", "اسم الزبون مطلوب للبيع بالدين"), variant: "destructive" });
        return;
      }
    }

    setProcessing(true);
    try {
      const logBatch = cart
        .filter((i) => i.excludedQuantity > 0)
        .map((ci) => {
          const unit_price =
            saleType === "retail" ? ci.product.retail_price : ci.product.wholesale_price;
          return {
            cashier_id: activeCashierId,
            cashier_name: activeCashierName,
            product_id: ci.product.id,
            product_name: ci.product.name,
            quantity: ci.excludedQuantity,
            sale_type: saleType,
            unit_price,
          };
        });
      recordPosCartExclusionsBatch(logBatch);

      const items = linesForSale.map((item) => {
        const sq = saleQty(item);
        const unit_price =
          saleType === "retail" ? item.product.retail_price : item.product.wholesale_price;
        return {
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: sq,
          unit_cost: item.product.cost_price ?? 0,
          unit_price,
          subtotal: unit_price * sq,
        };
      });

      const cart_full_display: CartFullDisplaySnapshot = {
        grossTotal: cart.reduce((sum, i) => {
          const up = saleType === "retail" ? i.product.retail_price : i.product.wholesale_price;
          return sum + up * i.quantity;
        }, 0),
        lines: cart.map((i) => {
          const up = saleType === "retail" ? i.product.retail_price : i.product.wholesale_price;
          const q = i.quantity;
          return {
            product_name: i.product.name,
            quantity: q,
            unit_price: up,
            line_gross: up * q,
          };
        }),
      };

      const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
      const finalCustomerName = isCredit
        ? (selectedCustomer?.name ?? customerName.trim())
        : null;
      const finalCustomerPhone = isCredit
        ? (selectedCustomer?.phone ?? null)
        : null;

      createInvoice({
        cashier_id: activeCashierId,
        cashier_name: activeCashierName,
        sale_type: saleType,
        total,
        paid: isCredit ? 0 : effectivePaid,
        change_amount: isCredit ? 0 : Math.max(0, effectivePaid - total),
        is_credit: isCredit,
        customer_name: finalCustomerName,
        customer_phone: finalCustomerPhone,
        payment_method: isCredit ? "cash" : paymentMethod,
        items,
        cart_full_display,
      });

      toast({
        title: isCredit
          ? tx("Credit sale saved ✓", "تم حفظ البيع بالدين ✓")
          : tx("Sale completed successfully ✓", "تمت العملية بنجاح ✓"),
        description: isCredit
          ? tx(
              `Customer: ${customerName.trim()} | Total: ${formatMoney(total)}`,
              `الزبون: ${customerName.trim()} | المجموع: ${formatMoney(total)}`,
            )
          : tx(
              currency === "JOD" && cashPayCurrency !== "JOD" && change > 0.0005
                ? `Total: ${formatMoney(total)} | Change: ${formatMoney(change)} (${formatCashPay(changeInPayCurrency, cashPayCurrency)})`
                : `Total: ${formatMoney(total)} | Change: ${formatMoney(change)}`,
              currency === "JOD" && cashPayCurrency !== "JOD" && change > 0.0005
                ? `المجموع: ${formatMoney(total)} | الباقي: ${formatMoney(change)} (${formatCashPay(changeInPayCurrency, cashPayCurrency)})`
                : `المجموع: ${formatMoney(total)} | الباقي: ${formatMoney(change)}`,
            ),
      });

      setCart([]);
      setPaidAmount("");
      setCustomerName("");
      setSelectedCustomerId("");
      setIsCredit(false);
      setShowAddCustomer(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setPaymentMethod("cash");
      setCashPayCurrency("JOD");
    } catch (err: any) {
      toast({ title: tx("Error", "خطأ"), description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-0 h-full lg:min-h-[28rem]" dir={isArabic ? "rtl" : "ltr"}>
      {/* Products Grid */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex bg-muted rounded-xl p-1 w-full sm:w-auto">
            <button
              onClick={() => askSaleTypeChange("retail")}
                className={cn("flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                saleType === "retail" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {tx("Retail", "مفرق")}
            </button>
            <button
              onClick={() => askSaleTypeChange("wholesale")}
                className={cn("flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-semibold transition-all",
                saleType === "wholesale" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {tx("Wholesale", "جملة")}
            </button>
          </div>
          {saleType === "wholesale" && (
            <div className="text-xs px-3 py-2 rounded-lg bg-warning/10 text-warning font-semibold">
              {tx("Each product has its own wholesale minimum quantity", "كل منتج له حد أدنى مستقل للبيع بالجملة")}
            </div>
          )}
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={tx("Search product...", "بحث عن منتج...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10 rounded-xl"
            />
          </div>
          <div className="text-xs px-3 py-2 rounded-lg bg-muted/70 text-muted-foreground">
            {tx("Selling as", "البيع باسم")}:{" "}
            <span className="font-semibold text-foreground">
              {role === "super_admin" ? "Sadmin" : role === "admin" ? "admin" : user?.displayName}
            </span>
          </div>
          <Button variant="outline" className="rounded-xl gap-2 w-full sm:w-auto" onClick={() => setReturnOpen(true)}>
            <RotateCcw className="w-4 h-4" />
            {tx("Return", "إرجاع")}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 [grid-auto-rows:1fr] content-start min-h-[320px]">
          {filteredProducts.map((product) => {
            const outOfStock = product.stock <= 0;
            const notAvailableForSaleType = saleType === "retail" ? !product.sell_retail : !product.sell_wholesale;
            const wholesaleStockBelowMin =
              saleType === "wholesale" && product.stock < Math.max(1, product.wholesale_min_qty || 1);
            const isDisabled = outOfStock || notAvailableForSaleType || wholesaleStockBelowMin;
            const lowStock = product.stock > 0 && product.stock <= product.min_stock;
            const price = saleType === "retail" ? product.retail_price : product.wholesale_price;
            const inCart = cart.find((i) => i.product.id === product.id);
            const inCartSaleQty = inCart ? saleQty(inCart) : 0;

            return (
              <button
                key={product.id}
                onClick={() => !isDisabled && addToCart(product)}
                className={cn(
                  "pos-btn relative",
                  isDisabled && "pos-btn-disabled",
                  /* Highlight & qty chip only for active lines; excluded state is visible only in the cart */
                  inCartSaleQty > 0 && "pos-btn-active",
                )}
                disabled={isDisabled}
              >
                {lowStock && (
                  <AlertTriangle className="absolute top-1 left-1 w-3.5 h-3.5 text-warning" />
                )}
                {inCart && inCart.quantity > 0 && (
                  <span className="absolute top-1 right-1 min-w-[1.25rem] h-5 px-1 rounded-full text-xs flex items-center justify-center font-bold bg-primary text-primary-foreground">
                    {inCart.quantity}
                  </span>
                )}
                {product.image_url && (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-20 rounded-lg object-cover border border-border/40"
                  />
                )}
                {!product.image_url && (
                  <div className="w-full h-20 rounded-lg border border-dashed border-border/70 bg-muted/40 flex items-center justify-center text-[11px] text-muted-foreground">
                    {tx("No image", "بدون صورة")}
                  </div>
                )}
                <span className="text-xs font-bold text-foreground text-center leading-tight line-clamp-2 min-h-[32px]">{product.name}</span>
                <span className="text-xs font-semibold text-primary">{formatMoney(price)}</span>
                {saleType === "wholesale" && (
                  <span className="text-[10px] text-muted-foreground font-semibold">
                    {tx("Min", "الحد الأدنى")}: {product.wholesale_min_qty}
                  </span>
                )}
                {outOfStock && <span className="text-[10px] text-destructive font-bold">Out</span>}
                {!outOfStock && wholesaleStockBelowMin && (
                  <span className="text-[10px] text-destructive font-bold">
                    {tx("Below wholesale minimum stock", "أقل من حد الجملة")}
                  </span>
                )}
                {!outOfStock && notAvailableForSaleType && (
                  <span className="text-[10px] text-muted-foreground font-bold">
                    {saleType === "retail" ? tx("Wholesale only", "جملة فقط") : tx("Retail only", "مفرق فقط")}
                  </span>
                )}
              </button>
            );
          })}
          {filteredProducts.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              {tx("No products", "لا توجد منتجات")}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="w-full lg:w-80 xl:w-96 glass-card rounded-2xl flex flex-col lg:max-h-[calc(100vh-7rem)]">
        <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
          <ShoppingBasket className="w-5 h-5 text-primary shrink-0" />
          <h2 className="font-bold text-lg">{tx("Cart", "السلة")}</h2>
          <span className="text-sm text-muted-foreground ms-auto">
            {includedLines.length}/{cart.length} {tx("active / lines", "مفعّل / أسطر")}
          </span>
        </div>
        {cart.length > 0 && (
          <p className="px-4 pb-2 text-[11px] text-muted-foreground leading-snug -mt-2">
            {tx(
              "Tap product on the grid to add quantity. Tap a cart row to set how many units to exclude from the sale (logged on complete).",
              "اضغط المنتج في الشبكة لزيادة الكمية. اضغط سطراً في السلة لتحديد كم وحدة تُستبعد من البيع (يُسجّل عند الإتمام).",
            )}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">{tx("Cart is empty", "السلة فارغة")}</div>
          ) : (
            cart.map((item) => {
              const price = saleType === "retail" ? item.product.retail_price : item.product.wholesale_price;
              const sq = saleQty(item);
              const ex = item.excludedQuantity;
              const saleLine = price * sq;
              const exLine = price * ex;
              return (
                <div
                  key={item.product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openExcludeDialog(item.product.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openExcludeDialog(item.product.id);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-2 rounded-xl p-2 border-2 transition-colors cursor-pointer select-none",
                    ex === 0 ? "bg-muted/50 border-transparent" : "bg-destructive/8 border-destructive/50",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-semibold truncate",
                        ex > 0 && "text-destructive/95",
                      )}
                    >
                      {item.product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {tx("In cart", "في السلة")}: {item.quantity} · {tx("For sale", "للبيع")}: {sq}
                      {ex > 0 ? ` · ${tx("Excluded", "مستبعد")}: ${ex}` : ""}
                    </p>
                    <p className="text-xs mt-0.5">
                      <span className="text-foreground font-medium">
                        {tx("Sale", "بيع")}: {formatMoney(price)} × {sq} = {formatMoney(saleLine)}
                      </span>
                      {ex > 0 && (
                        <span className="text-destructive font-semibold ms-2">
                          {tx("Excluded", "مستبعد")}: {formatMoney(exLine)}
                        </span>
                      )}
                    </p>
                    {ex > 0 && (
                      <p className="text-[10px] font-bold text-destructive mt-0.5">
                        {tx("Tap to change excluded quantity", "اضغط لتغيير كمية المستبعد")}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 rounded-lg bg-muted/80 px-2.5 py-1.5 min-w-[2.5rem] text-center">
                    <span className="text-xs text-muted-foreground block leading-none">{tx("Qty", "الكمية")}</span>
                    <span className="text-base font-bold tabular-nums">{item.quantity}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {cart.length > 0 && includedLines.length > 0 && (
          <div className="px-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={() => setFullReturnConfirmOpen(true)}
            >
              {tx("Full return — exclude all lines", "إرجاع كامل — استبعاد كل الأسطر")}
            </Button>
          </div>
        )}

        <div className="p-4 border-t border-border space-y-3">
          <div className="flex justify-between text-lg font-bold gap-2">
            <span>{tx("Amount due", "المطلوب")}</span>
            <div className="text-end min-w-0">
              <div className="text-primary">{formatMoney(total)}</div>
              {currency === "JOD" && cashPayCurrency !== "JOD" && !isCredit && (
                <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                  ≈ {formatCashPay(totalInPayCurrency, cashPayCurrency)}
                </div>
              )}
            </div>
          </div>
          {creditEnabled && (
            <div className="space-y-2">
              <Button
                type="button"
                variant={isCredit ? "default" : "outline"}
                className="rounded-xl gap-2 w-full"
                onClick={() => setIsCredit((prev) => !prev)}
              >
                {isCredit ? tx("Credit Sale Active", "البيع بالدين مفعّل") : tx("Mark as Credit Sale", "تسجيلها كبيع دين")}
              </Button>
              {isCredit && (
              <div className="space-y-2">
                <select
                  value={selectedCustomerId}
                  onChange={(e) => {
                    setSelectedCustomerId(e.target.value);
                    const chosen = customers.find((c) => c.id === e.target.value);
                    setCustomerName(chosen?.name ?? "");
                  }}
                  className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">{tx("Choose customer for credit", "اختر زبون الدين")}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl"
                  onClick={() => setShowAddCustomer((prev) => !prev)}
                >
                  {showAddCustomer ? tx("Cancel add customer", "إلغاء إضافة زبون") : tx("Add new customer", "إضافة زبون جديد")}
                </Button>
                {showAddCustomer && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder={tx("Customer name", "اسم الزبون")}
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="rounded-xl"
                    />
                    <Input
                      placeholder={tx("Customer phone", "رقم الهاتف")}
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="rounded-xl"
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      className="sm:col-span-2 rounded-xl"
                      onClick={() => {
                        if (!newCustomerName.trim() || !newCustomerPhone.trim()) {
                          toast({ title: tx("Enter customer name and phone", "أدخل اسم الزبون ورقم الهاتف"), variant: "destructive" });
                          return;
                        }
                        const created = addCustomer(newCustomerName.trim(), newCustomerPhone.trim());
                        if (created) {
                          setSelectedCustomerId(created.id);
                          setCustomerName(created.name);
                        }
                        setShowAddCustomer(false);
                        setNewCustomerName("");
                        setNewCustomerPhone("");
                        toast({ title: tx("Customer saved ✓", "تم حفظ الزبون ✓") });
                      }}
                    >
                      {tx("Save customer", "حفظ الزبون")}
                    </Button>
                  </div>
                )}
              </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {tx("Payment Method (before complete sale)", "طريقة الدفع (قبل إتمام البيع)")}
            </p>
            <div className="flex bg-muted rounded-xl p-1 w-full">
              <button
                type="button"
                onClick={() => setPaymentMethod("cash")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all",
                  !isCredit && paymentMethod === "cash"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                disabled={isCredit}
              >
                {tx("Cash", "كاش")}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("visa")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all",
                  !isCredit && paymentMethod === "visa"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                disabled={isCredit}
              >
                {tx("Visa", "فيزا")}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("wallet")}
                className={cn(
                  "flex-1 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all",
                  !isCredit && paymentMethod === "wallet"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
                disabled={isCredit}
              >
                {tx("Wallet", "محفظة")}
              </button>
            </div>
          </div>
          {paymentMethod === "cash" && !isCredit && (
            <div className="space-y-2">
              {currency === "JOD" && (
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">
                    {tx("Currency for the paid amount", "عملة المبلغ المدفوع")}
                  </p>
                  <Select
                    value={cashPayCurrency}
                    onValueChange={(v) => {
                      setCashPayCurrency(v);
                      setPaidAmount("");
                    }}
                  >
                    <SelectTrigger
                      className="w-full h-11 rounded-xl border-input bg-background text-start font-medium"
                      dir={isArabic ? "rtl" : "ltr"}
                    >
                      <SelectValue
                        placeholder={tx("Jordanian Dinar (default)", "دينار أردني (افتراضي)")}
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(22rem,65vh)]" dir={isArabic ? "rtl" : "ltr"}>
                      {CASH_PAY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.code} value={opt.code} className="cursor-pointer">
                          {cashPayLabel(opt, isArabic ? "ar" : "en")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div
                className={cn(
                  "rounded-xl border-2 px-3 py-2.5 text-center text-sm font-semibold leading-snug",
                  cashPayIsForeign
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-muted/50 text-foreground",
                )}
              >
                {currency === "USD"
                  ? tx(
                      "You are entering how much the customer paid — in US Dollars (USD).",
                      "تكتب هنا كم دفع الزبون — المبلغ بالدولار الأمريكي (USD).",
                    )
                  : cashPayCurrency !== "JOD"
                    ? (
                      <span className="block space-y-1">
                        <span className="block">
                          {tx(
                            "The amount you type below is in the selected currency. Invoice total above stays in JOD.",
                            "المبلغ الذي تكتبه أدناه بالعملة المختارة. إجمالي الفاتورة أعلاه يبقى بالدينار الأردني.",
                          )}
                        </span>
                        <span className="block text-xs font-bold text-primary">
                          {cashPayLabel(
                            CASH_PAY_OPTIONS.find((o) => o.code === cashPayCurrency) ?? CASH_PAY_OPTIONS[0],
                            isArabic ? "ar" : "en",
                          )}
                        </span>
                      </span>
                      )
                    : tx(
                        "You are entering how much the customer paid — in Jordanian Dinar (JOD).",
                        "تكتب هنا كم دفع الزبون — بالدينار الأردني (JOD).",
                      )}
              </div>

              <p className="text-[11px] text-muted-foreground leading-snug">
                {currency === "JOD" && cashPayCurrency !== "JOD"
                  ? tx(
                      "Leave empty for exact payment in the selected currency, or type what the customer gave.",
                      "اترك الحقل فارغاً للدفع بالضبط بالعملة المختارة، أو اكتب ما دفعه الزبون.",
                    )
                  : tx(
                      "Leave empty for exact payment (no change). Type more to calculate change.",
                      "اترك الحقل فارغاً للدفع بالضبط (بدون باقي). اكتب رقماً أكبر لحساب الباقي.",
                    )}
              </p>
              <Input
                type="number"
                min={0}
                step="0.01"
                placeholder={
                  currency === "USD"
                    ? tx("Amount paid (USD)", "المبلغ المدفوع (USD)")
                    : tx(
                        `Paid (${cashPayCurrency})`,
                        `المدفوع (${cashPayCurrency})`,
                      )
                }
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                className="h-12 rounded-xl text-lg text-center font-bold"
                dir="ltr"
              />
              {currency === "JOD" && cashPayCurrency !== "JOD" && (
                <p className="text-xs text-muted-foreground text-center">
                  {tx(`Invoice due (JOD): ${formatMoney(total)}`, `المطلوب للفاتورة (دينار): ${formatMoney(total)}`)}
                </p>
              )}
            </div>
          )}
          {paymentMethod !== "cash" && !isCredit && (
            <div className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {tx("For Visa/Wallet, payment is counted as fully paid automatically.", "عند فيزا/محفظة يتم احتساب المبلغ مدفوع بالكامل تلقائياً.")}
            </div>
          )}
          {paymentMethod === "cash" && !isCredit && paidInShopCurrency + 1e-6 >= total && change > 0.0005 && (
            <div className="flex justify-between items-start gap-2 bg-success/10 rounded-xl p-3">
              <span className="font-semibold shrink-0">{tx("Change", "الباقي")}</span>
              <div className="text-end min-w-0">
                <div className="text-xl font-bold text-success">{formatMoney(change)}</div>
                {currency === "JOD" && cashPayCurrency !== "JOD" && (
                  <div className="text-sm font-semibold text-success/90 mt-0.5">
                    {formatCashPay(changeInPayCurrency, cashPayCurrency)}
                  </div>
                )}
              </div>
            </div>
          )}
          <Button
            onClick={checkout}
            disabled={
              cart.length === 0
              || processing
              || (includedLines.length > 0
                && !isCredit
                && paymentMethod === "cash"
                && paidInShopCurrency + 1e-6 < total)
            }
            className="w-full h-12 rounded-xl text-lg font-bold"
          >
            {processing
              ? tx("Processing...", "جاري المعالجة...")
              : includedLines.length === 0 && cart.length > 0
                ? tx("Complete — close full return", "إتمام — إغلاق الإرجاع الكامل")
                : isCredit
                  ? tx("Complete Credit", "إتمام الدين")
                  : tx("Complete Sale", "إتمام البيع")}
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(excludeDialogProductId)}
        onOpenChange={(open) => {
          if (!open) {
            setExcludeDialogProductId(null);
            setExcludeQtyDraft("");
          }
        }}
      >
        <DialogContent className="max-w-md" dir={isArabic ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{tx("Exclude from sale", "استبعاد من البيع")}</DialogTitle>
          </DialogHeader>
          {excludeDialogItem && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx(
                  "How many units should be excluded (not sold)? They will appear under Returns when you complete the cart.",
                  "كم وحدة تُستبعد من البيع؟ ستظهر في المرتجعات عند إتمام السلة.",
                )}
              </p>
              <p className="font-semibold">{excludeDialogItem.product.name}</p>
              <p className="text-xs text-muted-foreground">
                {tx("Total in cart", "الإجمالي في السلة")}: {excludeDialogItem.quantity}
              </p>
              <Input
                type="number"
                min={0}
                max={excludeDialogItem.quantity}
                value={excludeQtyDraft}
                onChange={(e) => setExcludeQtyDraft(e.target.value)}
                className="text-center text-lg font-bold h-12"
                dir="ltr"
              />
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setExcludeQtyDraft("0")}
                >
                  {tx("None (all for sale)", "لا شيء (الكل للبيع)")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl border-destructive/40"
                  onClick={() => setExcludeQtyDraft(String(excludeDialogItem.quantity))}
                >
                  {tx("Exclude all", "استبعاد الكل")}
                </Button>
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => {
                    setExcludeDialogProductId(null);
                    setExcludeQtyDraft("");
                  }}
                >
                  {tx("Cancel", "إلغاء")}
                </Button>
                <Button type="button" className="rounded-xl" onClick={applyExcludeQuantity}>
                  {tx("Save", "حفظ")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} />
      <AlertDialog
        open={fullReturnConfirmOpen}
        onOpenChange={setFullReturnConfirmOpen}
      >
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("Confirm full return", "تأكيد الإرجاع الكامل")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                "All cart lines will be marked not sold (red) and logged under Returns. You can then tap Complete to close the cart with no sale.",
                "سيتم استبعاد كل أسطر السلة (بالأحمر) وتسجيلها في المرتجعات. بعدها يمكنك الضغط على «إتمام» لإغلاق السلة دون بيع.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmFullCartReturn}
            >
              {tx("Confirm full return", "تأكيد الإرجاع الكامل")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={saleTypeConfirmOpen}
        onOpenChange={(open) => {
          setSaleTypeConfirmOpen(open);
          if (!open) setPendingSaleType(null);
        }}
      >
        <AlertDialogContent dir={isArabic ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("Confirm Sale Type Change", "تأكيد تغيير نوع البيع")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tx(
                "Switching between retail and wholesale will clear the current cart. Do you want to continue?",
                "التبديل بين المفرق والجملة سيقوم بتفريغ السلة الحالية. هل تريد المتابعة؟",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSaleTypeChange}>
              {tx("Continue", "متابعة")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
