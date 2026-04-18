import { ReactNode, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation } from "react-router-dom";
import { 
  ShoppingCart, LayoutDashboard, Package, FileText, LogOut, Menu, X, 
  Store, ShieldCheck, Trash2, Wallet, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

const navItems = [
  { path: "/dashboard", labelKey: "dashboard", icon: LayoutDashboard, roles: ["admin", "super_admin"] },
  { path: "/products", labelKey: "products", icon: Package, roles: ["admin", "super_admin"] },
  { path: "/invoices", labelKey: "invoices", icon: FileText, roles: ["cashier", "admin", "super_admin"] },
  { path: "/returns", labelKey: "returnsPage", icon: History, roles: ["cashier", "admin", "super_admin"] },
  { path: "/credit", labelKey: "creditPage", icon: Wallet, roles: ["cashier", "admin", "super_admin"] },
  { path: "/access-control", labelKey: "accessControl", icon: ShieldCheck, roles: ["super_admin"] },
  { path: "/trash", labelKey: "trash", icon: Trash2, roles: ["super_admin"] },
  { path: "/cashier", labelKey: "cashier", icon: ShoppingCart, roles: ["cashier", "admin", "super_admin"] },
];
type NavLabelKey = (typeof navItems)[number]["labelKey"];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const { t, language, setLanguage, isArabic } = useLanguage();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNav = navItems
    .filter((item) => role && item.roles.includes(role))
    .sort((a, b) => {
      if (role !== "cashier") return 0;
      const cashierOrder = ["/cashier", "/invoices", "/returns", "/credit"];
      return cashierOrder.indexOf(a.path) - cashierOrder.indexOf(b.path);
    });

  const roleLabel = role === "super_admin" ? t("superAdmin") : role === "admin" ? t("admin") : t("cashierRole");
  const accountName = user?.displayName?.trim() || roleLabel;

  return (
    <div className="min-h-screen flex" dir={isArabic ? "rtl" : "ltr"}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/30 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 z-50 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-300",
        isArabic ? "right-0" : "left-0",
        sidebarOpen
          ? "translate-x-0"
          : isArabic
            ? "translate-x-full lg:translate-x-0"
            : "-translate-x-full lg:translate-x-0",
      )}>
        <div className="p-5 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center">
              <Store className="w-5 h-5 text-sidebar-primary" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Supermarket</h2>
              <p className="text-xs text-sidebar-foreground/60 truncate">{accountName}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {filteredNav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                location.pathname === item.path
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-5 h-5" />
              {t(item.labelKey as NavLabelKey)}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border">
          <div className="px-2 mb-2">
            <p className="text-xs text-sidebar-foreground/50 mb-1">{t("language")}</p>
            <div className="grid grid-cols-2 gap-1">
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "border-sidebar-border transition-colors",
                  language === "ar"
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                    : "bg-sidebar-accent/30 text-sidebar-foreground/80 hover:bg-sidebar-accent",
                )}
                onClick={() => setLanguage("ar")}
              >
                {t("arabic")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className={cn(
                  "border-sidebar-border transition-colors",
                  language === "en"
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                    : "bg-sidebar-accent/30 text-sidebar-foreground/80 hover:bg-sidebar-accent",
                )}
                onClick={() => setLanguage("en")}
              >
                {t("english")}
              </Button>
            </div>
          </div>
          <p className="text-xs text-sidebar-foreground/50 px-4 mb-2 truncate">
            {t("account")}: {accountName}
          </p>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-destructive/80 hover:bg-destructive/10 w-full transition-all"
          >
            <LogOut className="w-5 h-5" />
            {t("signOut")}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={cn("flex-1 min-h-screen min-w-0", isArabic ? "lg:mr-64" : "lg:ml-64")}>
        <header className="h-16 border-b border-border flex items-center px-3 sm:px-4 lg:px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <h1 className="text-base sm:text-lg font-bold mr-3 truncate">
            {filteredNav.find((n) => n.path === location.pathname)
              ? t(filteredNav.find((n) => n.path === location.pathname)!.labelKey as NavLabelKey)
              : "Supermarket"}
          </h1>
        </header>
        <div className="p-3 sm:p-4 lg:p-6">{children}</div>
      </main>
    </div>
  );
}
