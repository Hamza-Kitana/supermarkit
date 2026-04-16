import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import POS from "@/pages/POS";
import Dashboard from "@/pages/Dashboard";
import Products from "@/pages/Products";
import Invoices from "@/pages/Invoices";
import CreditPage from "@/pages/Credit";
import AccessControl from "@/pages/AccessControl";
import Trash from "@/pages/Trash";
import AppLayout from "@/components/AppLayout";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user || !role) return <Login />;

  const isAdmin = role === "admin" || role === "super_admin";
  const defaultPath = isAdmin ? "/dashboard" : "/cashier";

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to={defaultPath} replace />} />
        <Route path="/cashier" element={<POS />} />
        {isAdmin && <Route path="/dashboard" element={<Dashboard />} />}
        {isAdmin && <Route path="/products" element={<Products />} />}
        <Route path="/invoices" element={<Invoices />} />
        {isAdmin && <Route path="/credit" element={<CreditPage />} />}
        {role === "super_admin" && <Route path="/access-control" element={<AccessControl />} />}
        {role === "super_admin" && <Route path="/trash" element={<Trash />} />}
        <Route path="*" element={<Navigate to={defaultPath} replace />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <ProtectedRoutes />
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
