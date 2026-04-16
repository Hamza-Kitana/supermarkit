import { useState } from "react";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { addProduct, deleteProduct as removeProduct, seedTestProducts, updateProduct } from "@/lib/localDb";
import { useCurrency } from "@/hooks/useCurrency";
import { useLanguage } from "@/hooks/useLanguage";
import { Plus, Pencil, Trash2, Search } from "lucide-react";

interface ProductForm {
  name: string;
  image_url: string | null;
  retail_price: string;
  wholesale_price: string;
  wholesale_min_qty: string;
  stock: string;
  min_stock: string;
  sell_retail: boolean;
  sell_wholesale: boolean;
}

const emptyForm: ProductForm = {
  name: "", image_url: null, retail_price: "", wholesale_price: "", wholesale_min_qty: "10", stock: "", min_stock: "10",
  sell_retail: true, sell_wholesale: false,
};

export default function Products() {
  const { products } = useProducts();
  const { role } = useAuth();
  const { toast } = useToast();
  const { formatMoney } = useCurrency();
  const { tx, isArabic } = useLanguage();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  const filtered = products.filter((p) => p.name.includes(search));

  const addTestProducts = () => {
    setIsSeeding(true);
    try {
      seedTestProducts(100);
      toast({ title: tx("100 test products added ✓", "تمت إضافة 100 منتج تجريبي ✓") });
    } finally {
      setIsSeeding(false);
    }
  };

  const openNew = () => {
    setForm(emptyForm);
    setEditingId(null);
    setDialogOpen(true);
  };

  const openEdit = (p: typeof products[0]) => {
    setForm({
      name: p.name,
      image_url: p.image_url,
      retail_price: String(p.retail_price),
      wholesale_price: String(p.wholesale_price),
      wholesale_min_qty: String(p.wholesale_min_qty),
      stock: String(p.stock),
      min_stock: String(p.min_stock),
      sell_retail: p.sell_retail,
      sell_wholesale: p.sell_wholesale,
    });
    setEditingId(p.id);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(),
        image_url: form.image_url,
        retail_price: parseFloat(form.retail_price) || 0,
        wholesale_price: parseFloat(form.wholesale_price) || 0,
        wholesale_min_qty: Math.max(1, parseInt(form.wholesale_min_qty, 10) || 1),
        stock: parseInt(form.stock) || 0,
        min_stock: parseInt(form.min_stock) || 10,
        sell_retail: form.sell_retail,
        sell_wholesale: form.sell_wholesale,
      };

      if (editingId) {
        updateProduct(editingId, payload);
        toast({ title: tx("Product updated ✓", "تم تحديث المنتج ✓") });
      } else {
        addProduct(payload);
        toast({ title: tx("Product added ✓", "تمت إضافة المنتج ✓") });
      }
      setDialogOpen(false);
    } catch (err: any) {
      toast({ title: tx("Error", "خطأ"), description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const onImageChange = async (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    const result = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(file);
    });
    setForm((prev) => ({ ...prev, image_url: result }));
  };

  const deleteProduct = async (id: string) => {
    removeProduct(id);
    toast({ title: tx("Product moved to trash ✓", "تم نقل المنتج إلى سلة المحذوفات ✓") });
  };

  return (
    <div className="space-y-4" dir={isArabic ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={tx("Search...", "بحث...")} value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10 rounded-xl" />
        </div>
        <Button onClick={openNew} className="rounded-xl gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          {tx("Add Product", "إضافة منتج")}
        </Button>
        <div className="flex bg-muted rounded-xl p-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              viewMode === "table" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {tx("Table", "جدول")}
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-sm font-semibold transition ${
              viewMode === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {tx("Cards", "كروت")}
          </button>
        </div>
        <Button type="button" variant="outline" onClick={addTestProducts} disabled={isSeeding} className="rounded-xl w-full sm:w-auto">
          {isSeeding ? tx("Adding...", "جاري الإضافة...") : tx("Add 100 Test Products", "إضافة 100 منتج تجريبي")}
        </Button>
      </div>

      {viewMode === "table" ? (
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-right p-3 font-semibold">{tx("Product", "المنتج")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Retail Price", "سعر المفرق")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Wholesale Price", "سعر الجملة")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Wholesale Min Qty", "أقل كمية للجملة")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Stock", "المخزون")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Alert At", "حد التنبيه")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Retail", "مفرق")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Wholesale", "جملة")}</th>
                  <th className="text-right p-3 font-semibold">{tx("Actions", "إجراءات")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-medium">{p.name}</td>
                    <td className="p-3">{formatMoney(p.retail_price)}</td>
                    <td className="p-3">{formatMoney(p.wholesale_price)}</td>
                    <td className="p-3">{p.wholesale_min_qty}</td>
                    <td className="p-3">
                      <span className={p.stock <= p.min_stock ? (p.stock <= 0 ? "text-destructive font-bold" : "text-warning font-bold") : ""}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="p-3">{p.min_stock}</td>
                    <td className="p-3">{p.sell_retail ? "✓" : "✗"}</td>
                    <td className="p-3">{p.sell_wholesale ? "✓" : "✗"}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-primary/10 text-primary transition-colors">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteProduct(p.id)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-destructive/10 text-destructive transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="glass-card rounded-2xl p-3 flex flex-col gap-2">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-28 rounded-xl object-cover border border-border/50" />
              ) : (
                <div className="w-full h-28 rounded-xl border border-dashed border-border/70 bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">
                  {tx("No image", "بدون صورة")}
                </div>
              )}
              <p className="font-bold text-sm line-clamp-2 min-h-[40px]">{p.name}</p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{tx("Retail Price", "سعر المفرق")}: <span className="font-semibold text-foreground">{formatMoney(p.retail_price)}</span></p>
                <p>{tx("Wholesale Price", "سعر الجملة")}: <span className="font-semibold text-foreground">{formatMoney(p.wholesale_price)}</span></p>
                <p>{tx("Wholesale Min Qty", "أقل كمية للجملة")}: <span className="font-semibold text-foreground">{p.wholesale_min_qty}</span></p>
                <p>{tx("Stock", "المخزون")}: <span className="font-semibold text-foreground">{p.stock}</span></p>
              </div>
              <div className="flex items-center gap-2 mt-auto pt-1">
                <Button type="button" variant="outline" className="flex-1 h-9" onClick={() => openEdit(p)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button type="button" variant="outline" className="flex-1 h-9 text-destructive" onClick={() => deleteProduct(p.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? tx("Edit Product", "تعديل المنتج") : tx("Add New Product", "إضافة منتج جديد")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">{tx("Product Name", "اسم المنتج")}</label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-xl" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium mb-1 block">{tx("Product Image (Optional)", "صورة المنتج (اختياري)")}</label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => onImageChange(e.target.files?.[0] ?? null)}
                className="rounded-xl"
              />
              {form.image_url && (
                <div className="flex items-center gap-3">
                  <img src={form.image_url} alt={form.name || "product"} className="w-16 h-16 rounded-lg object-cover border" />
                  <Button type="button" variant="outline" onClick={() => setForm({ ...form, image_url: null })}>
                    {tx("Remove image", "حذف الصورة")}
                  </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">{tx("Retail Price", "سعر المفرق")}</label>
                <Input type="number" value={form.retail_price} onChange={(e) => setForm({ ...form, retail_price: e.target.value })} className="rounded-xl" dir="ltr" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{tx("Wholesale Price", "سعر الجملة")}</label>
                <Input type="number" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: e.target.value })} className="rounded-xl" dir="ltr" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">{tx("Minimum quantity for wholesale", "أقل كمية للبيع بالجملة")}</label>
              <Input
                type="number"
                min={1}
                value={form.wholesale_min_qty}
                onChange={(e) => setForm({ ...form, wholesale_min_qty: e.target.value })}
                className="rounded-xl"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1 block">{tx("Quantity", "الكمية")}</label>
                <Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="rounded-xl" dir="ltr" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">{tx("Stock Alert Threshold", "مقدار تنبيه المخزون")}</label>
                <Input type="number" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: e.target.value })} className="rounded-xl" dir="ltr" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                type="button"
                variant={form.sell_retail ? "default" : "outline"}
                onClick={() => setForm({ ...form, sell_retail: !form.sell_retail })}
                className="w-full"
              >
                {tx("Sell Retail", "بيع مفرق")} {form.sell_retail ? "✓" : ""}
              </Button>
              <Button
                type="button"
                variant={form.sell_wholesale ? "default" : "outline"}
                onClick={() => setForm({ ...form, sell_wholesale: !form.sell_wholesale })}
                className="w-full"
              >
                {tx("Sell Wholesale", "بيع جملة")} {form.sell_wholesale ? "✓" : ""}
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={loading || !form.name.trim()} className="w-full rounded-xl">
              {loading ? tx("Saving...", "جاري الحفظ...") : tx("Save", "حفظ")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
