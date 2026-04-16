import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateLocalAccountPassword } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { useCashiers } from "@/hooks/useCashiers";
import {
  getCreditEnabled,
  setCreditEnabled,
  setReturnPassword,
  addCashier,
  updateCashier,
  softDeleteCashier,
} from "@/lib/localDb";
import { useLanguage } from "@/hooks/useLanguage";

type AccountKey = "cash" | "admin" | "sadmin";

const accounts: { key: AccountKey; label: string }[] = [
  { key: "cash", label: "cash" },
  { key: "admin", label: "admin" },
  { key: "sadmin", label: "Sadmin" },
];

export default function AccessControl() {
  const { toast } = useToast();
  const { currency, setCurrency } = useCurrency();
  const { tx, language, setLanguage, isArabic } = useLanguage();
  const { cashiers } = useCashiers({ includeDeleted: true });
  const [selectedAccount, setSelectedAccount] = useState<AccountKey>("cash");
  const [newPassword, setNewPassword] = useState("");
  const [returnPassword, setReturnPasswordInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [creditEnabled, setCreditEnabledState] = useState<boolean>(getCreditEnabled());
  const [cashierName, setCashierName] = useState("");
  const [editingCashierId, setEditingCashierId] = useState<string | null>(null);

  const handleUpdatePassword = async () => {
    if (!newPassword.trim()) {
      toast({ title: tx("Enter a new password", "أدخل كلمة مرور جديدة"), variant: "destructive" });
      return;
    }

    setLoading(true);
    updateLocalAccountPassword(selectedAccount, newPassword.trim());
    toast({ title: tx("Password updated instantly", "تم تحديث كلمة المرور فورًا") });
    setNewPassword("");
    setLoading(false);
  };

  const handleUpdateReturnPassword = async () => {
    if (!returnPassword.trim()) {
      toast({ title: tx("Enter return password", "أدخل كلمة سر الإرجاع"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setReturnPassword(returnPassword.trim());
    toast({ title: tx("Return password updated instantly", "تم تحديث كلمة سر الإرجاع فورًا") });
    setReturnPasswordInput("");
    setLoading(false);
  };

  const handleSaveCashier = () => {
    const trimmed = cashierName.trim();
    if (!trimmed) {
      toast({ title: tx("Enter cashier name", "أدخل اسم الكاشير"), variant: "destructive" });
      return;
    }
    if (editingCashierId) {
      updateCashier(editingCashierId, trimmed);
      toast({ title: tx("Cashier updated ✓", "تم تحديث الكاشير ✓") });
    } else {
      addCashier(trimmed);
      toast({ title: tx("Cashier added ✓", "تمت إضافة الكاشير ✓") });
    }
    setCashierName("");
    setEditingCashierId(null);
  };

  const handleEditCashier = (id: string, name: string) => {
    setEditingCashierId(id);
    setCashierName(name);
  };

  const handleDeleteCashier = (id: string) => {
    softDeleteCashier(id);
    toast({
      title: tx("Cashier archived ✓", "تم أرشفة الكاشير ✓"),
      description: tx(
        "Existing sales will still show this cashier name.",
        "المبيعات السابقة ستبقى باسم هذا الكاشير.",
      ),
    });
    if (editingCashierId === id) {
      setEditingCashierId(null);
      setCashierName("");
    }
  };

  return (
    <div className="max-w-xl space-y-6" dir={isArabic ? "rtl" : "ltr"}>
      <div>
        <h2 className="text-2xl font-bold">{tx("Access Control", "التحكم بالصلاحيات")}</h2>
        <p className="text-muted-foreground mt-1">
          {tx("Manage fixed account passwords: cash / admin / Sadmin", "إدارة كلمات مرور الحسابات الثابتة: cash / admin / Sadmin")}
        </p>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="space-y-2">
          <Label>{tx("Language", "اللغة")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className={
                language === "ar"
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                  : "bg-muted/40 text-foreground hover:bg-muted"
              }
              onClick={() => setLanguage("ar")}
            >
              {tx("Arabic", "عربي")}
            </Button>
            <Button
              variant="outline"
              className={
                language === "en"
                  ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                  : "bg-muted/40 text-foreground hover:bg-muted"
              }
              onClick={() => setLanguage("en")}
            >
              English
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{tx("System Currency", "عملة النظام")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={currency === "JOD" ? "default" : "outline"}
              onClick={() => setCurrency("JOD")}
            >
              Jordanian Dinar (JOD)
            </Button>
            <Button
              variant={currency === "USD" ? "default" : "outline"}
              onClick={() => setCurrency("USD")}
            >
              US Dollar (USD)
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tx("This setting applies instantly across prices and invoices.", "ينطبق هذا الإعداد فورًا على الأسعار والفواتير.")}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{tx("Enable credit sales", "تفعيل البيع بالدين")}</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={creditEnabled ? "default" : "outline"}
              onClick={() => {
                setCreditEnabled(true);
                setCreditEnabledState(true);
                toast({ title: tx("Credit sales enabled", "تم تفعيل البيع بالدين") });
              }}
            >
              {tx("Enable", "تفعيل")}
            </Button>
            <Button
              variant={!creditEnabled ? "default" : "outline"}
              onClick={() => {
                setCreditEnabled(false);
                setCreditEnabledState(false);
                toast({ title: tx("Credit sales disabled", "تم إلغاء البيع بالدين") });
              }}
            >
              {tx("Disable", "إلغاء")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {tx(
              "When enabled, cashier can mark invoices as credit with customer name.",
              "عند التفعيل، يمكن للكاشير تسجيل الفواتير كدين مع اسم الزبون.",
            )}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{tx("Select Account", "اختر الحساب")}</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {accounts.map((account) => (
              <Button
                key={account.key}
                variant={selectedAccount === account.key ? "default" : "outline"}
                onClick={() => setSelectedAccount(account.key)}
              >
                {account.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-password">{tx("New Password", "كلمة المرور الجديدة")}</Label>
          <Input
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={tx("Example: 000", "مثال: 000")}
            dir="ltr"
            className="text-left"
          />
        </div>

        <Button className="w-full" onClick={handleUpdatePassword} disabled={loading}>
          {loading ? tx("Updating...", "جاري التحديث...") : tx("Save Password", "حفظ كلمة المرور")}
        </Button>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-lg">{tx("Cashiers", "الكاشيرية")}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {tx(
              "Add and manage cashiers. Deleting a cashier will not remove their past sales.",
              "أضف وادِر الكاشيرية. حذف الكاشير لا يحذف مبيعاته السابقة.",
            )}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cashier-name">{tx("Cashier Name", "اسم الكاشير")}</Label>
          <Input
            id="cashier-name"
            value={cashierName}
            onChange={(e) => setCashierName(e.target.value)}
            placeholder={tx("Example: Ahmed", "مثال: أحمد")}
          />
        </div>
        <Button className="w-full" type="button" onClick={handleSaveCashier}>
          {editingCashierId
            ? tx("Save Cashier", "حفظ الكاشير")
            : tx("Add Cashier", "إضافة كاشير")}
        </Button>

        <div className="space-y-2">
          <Label>{tx("Existing Cashiers", "الكاشيرية الحاليين")}</Label>
          <div className="max-h-60 overflow-y-auto space-y-1 text-sm">
            {cashiers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {tx("No cashiers yet. Add one above.", "لا يوجد كاشير بعد. أضف واحداً من الأعلى.")}
              </p>
            )}
            {cashiers.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-muted/40"
              >
                <div className="flex flex-col">
                  <span className={c.deleted_at ? "line-through text-muted-foreground" : ""}>
                    {c.name}
                  </span>
                  {c.deleted_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {tx("Archived", "مؤرشف")}
                    </span>
                  )}
                </div>
                {!c.deleted_at && (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => handleEditCashier(c.id, c.name)}
                    >
                      {tx("Edit", "تعديل")}
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      className="text-destructive border-destructive/40"
                      onClick={() => handleDeleteCashier(c.id)}
                    >
                      {tx("Delete", "حذف")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-lg">{tx("Return Password", "كلمة سر الإرجاع")}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {tx("Only super admin can update the return password here.", "فقط السوبر أدمن يمكنه تغيير كلمة سر الإرجاع من هنا.")}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="return-password">{tx("New Return Password", "كلمة سر الإرجاع الجديدة")}</Label>
          <Input
            id="return-password"
            type="password"
            value={returnPassword}
            onChange={(e) => setReturnPasswordInput(e.target.value)}
            placeholder={tx("Example: 000", "مثال: 000")}
            dir="ltr"
            className="text-left"
          />
        </div>

        <Button className="w-full" onClick={handleUpdateReturnPassword} disabled={loading}>
          {loading ? tx("Updating...", "جاري التحديث...") : tx("Save Return Password", "حفظ كلمة سر الإرجاع")}
        </Button>
      </div>
    </div>
  );
}
