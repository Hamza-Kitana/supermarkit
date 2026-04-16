import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingCart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/useLanguage";

export default function Login() {
  const [account, setAccount] = useState<"cash" | "admin" | "sadmin">("cash");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const { toast } = useToast();
  const { tx, isArabic } = useLanguage();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn(account, password);
    } catch (err: any) {
      toast({
        title: tx("Login failed", "فشل تسجيل الدخول"),
        description: err.message || tx("Check your account and password", "تحقق من الحساب وكلمة المرور"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/30" dir={isArabic ? "rtl" : "ltr"}>
      <div className="w-full max-w-md mx-4">
        <div className="glass-card rounded-3xl p-8 space-y-8">
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <ShoppingCart className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Supermarket</h1>
            <p className="text-muted-foreground">{tx("Sign in to continue", "سجل الدخول للمتابعة")}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{tx("Account", "الحساب")}</label>
              <Select
                value={account}
                onValueChange={(value: "cash" | "admin" | "sadmin") => setAccount(value)}
              >
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue placeholder={tx("Select account", "اختر الحساب")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">cash</SelectItem>
                  <SelectItem value="admin">admin</SelectItem>
                  <SelectItem value="sadmin">Sadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{tx("Password", "كلمة المرور")}</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-12 rounded-xl text-left"
                dir="ltr"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-xl text-lg font-semibold"
              disabled={loading}
            >
              {loading ? tx("Signing in...", "جاري تسجيل الدخول...") : tx("Sign in", "تسجيل الدخول")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
