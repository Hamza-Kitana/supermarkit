import { useState, useMemo, useEffect } from "react";
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
import ReturnDialog from "@/components/ReturnDialog";
import { addCustomer, createInvoice, getCustomers, subscribeDbChanges, type LocalCustomer } from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { ShoppingBasket, Trash2, Plus, Minus, RotateCcw, Search, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface CartItem {
  product: Product;
  quantity: number;
}

export default function POS() {
  const { user, role } = useAuth();
  const { products } = useProducts();
  const { toast } = useToast();
  const { formatMoney, currency } = useCurrency();
  const { tx, isArabic } = useLanguage();
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

  useEffect(() => {
    const refresh = () => setCustomers(getCustomers());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    return products.filter((p) => p.name.includes(search));
  }, [products, search]);

  const total = useMemo(
    () => cart.reduce((sum, item) => {
      const price = saleType === "retail" ? item.product.retail_price : item.product.wholesale_price;
      return sum + price * item.quantity;
    }, 0),
    [cart, saleType]
  );

  const paid = parseFloat(paidAmount) || 0;
  const change = Math.max(0, paid - total);

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
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      const initialQty = saleType === "wholesale" ? productWholesaleMin : 1;
      return [...prev, { product, quantity: initialQty }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const target = prev.find((i) => i.product.id === productId);
      if (!target) return prev;

      const nextQty = target.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((i) => i.product.id !== productId);
      }

      if (nextQty > target.product.stock) {
        toast({
          title: tx("Warning", "تنبيه"),
          description: tx("Cannot add more than available stock", "لا يمكن إضافة أكثر من الكمية المتوفرة"),
          variant: "destructive",
        });
        return prev;
      }

      if (saleType === "wholesale") {
        const minQty = Math.max(1, target.product.wholesale_min_qty || 1);
        if (nextQty < minQty) {
          toast({
            title: tx("Wholesale minimum required", "الحد الأدنى للجملة مطلوب"),
            description: tx(
              `Minimum wholesale quantity for ${target.product.name} is ${minQty}.`,
              `الحد الأدنى للجملة لمنتج ${target.product.name} هو ${minQty}.`,
            ),
            variant: "destructive",
          });
          return prev;
        }
      }

      return prev.map((i) => (i.product.id === productId ? { ...i, quantity: nextQty } : i));
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
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
    const activeCashierId = user.cashierId ?? user.id;
    const activeCashierName =
      role === "super_admin"
        ? "Sadmin"
        : role === "admin"
          ? "admin"
          : user.displayName;
    if (!isCredit && saleType === "wholesale") {
      const invalidItems = cart.filter((item) => item.quantity < item.product.wholesale_min_qty);
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
      if (paid < total) {
        toast({ title: tx("Insufficient paid amount", "المبلغ المدفوع غير كافٍ"), variant: "destructive" });
        return;
      }
    } else {
      if (!selectedCustomerId && !customerName.trim()) {
        toast({ title: tx("Customer name is required for credit sale", "اسم الزبون مطلوب للبيع بالدين"), variant: "destructive" });
        return;
      }
    }

    setProcessing(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_cost: item.product.cost_price ?? 0,
        unit_price: saleType === "retail" ? item.product.retail_price : item.product.wholesale_price,
        subtotal: (saleType === "retail" ? item.product.retail_price : item.product.wholesale_price) * item.quantity,
      }));

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
        paid: isCredit ? 0 : paid,
        change_amount: isCredit ? 0 : change,
        is_credit: isCredit,
        customer_name: finalCustomerName,
        customer_phone: finalCustomerPhone,
        payment_method: isCredit ? "cash" : paymentMethod,
        items,
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
              `Total: ${formatMoney(total)} | Change: ${formatMoney(change)}`,
              `المجموع: ${formatMoney(total)} | الباقي: ${formatMoney(change)}`,
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
    } catch (err: any) {
      toast({ title: tx("Error", "خطأ"), description: err.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 min-h-[calc(100vh-7rem)] lg:h-[calc(100vh-7rem)]" dir={isArabic ? "rtl" : "ltr"}>
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

            return (
              <button
                key={product.id}
                onClick={() => !isDisabled && addToCart(product)}
                className={cn("pos-btn relative", isDisabled && "pos-btn-disabled", inCart && "pos-btn-active")}
                disabled={isDisabled}
              >
                {lowStock && (
                  <AlertTriangle className="absolute top-1 left-1 w-3.5 h-3.5 text-warning" />
                )}
                {inCart && (
                  <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">
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
        <div className="p-4 border-b border-border flex items-center gap-2">
          <ShoppingBasket className="w-5 h-5 text-primary" />
          <h2 className="font-bold text-lg">{tx("Cart", "السلة")}</h2>
          <span className="text-sm text-muted-foreground mr-auto">{cart.length} {tx("products", "منتج")}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {cart.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">{tx("Cart is empty", "السلة فارغة")}</div>
          ) : (
            cart.map((item) => {
              const price = saleType === "retail" ? item.product.retail_price : item.product.wholesale_price;
              return (
                <div key={item.product.id} className="flex items-center gap-2 bg-muted/50 rounded-xl p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{item.product.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(price)} × {item.quantity} = {formatMoney(price * item.quantity)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(item.product.id, -1)} className="w-7 h-7 rounded-lg bg-card flex items-center justify-center hover:bg-destructive/10 transition-colors">
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                    <button
                      onClick={() => updateQty(item.product.id, 1)}
                      disabled={item.quantity >= item.product.stock}
                      className="w-7 h-7 rounded-lg bg-card flex items-center justify-center hover:bg-primary/10 transition-colors disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => removeFromCart(item.product.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-destructive/60 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-border space-y-3">
          <div className="flex justify-between text-lg font-bold">
            <span>{tx("Total", "المجموع")}</span>
            <span className="text-primary">{formatMoney(total)}</span>
          </div>
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
          <Input
            type="number"
            placeholder={tx(`Paid amount (${currency})`, `المبلغ المدفوع (${currency})`)}
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            className="h-12 rounded-xl text-lg text-center font-bold"
            dir="ltr"
          />
          {paid > 0 && paid >= total && (
            <div className="flex justify-between items-center bg-success/10 rounded-xl p-3">
              <span className="font-semibold">{tx("Change", "الباقي")}</span>
              <span className="text-xl font-bold text-success">{formatMoney(change)}</span>
            </div>
          )}
          <Button
            onClick={checkout}
            disabled={cart.length === 0 || paid < total || processing}
            className="w-full h-12 rounded-xl text-lg font-bold"
          >
            {processing ? tx("Processing...", "جاري المعالجة...") : tx("Complete Sale", "إتمام البيع")}
          </Button>
        </div>
      </div>

      <ReturnDialog open={returnOpen} onOpenChange={setReturnOpen} />
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
