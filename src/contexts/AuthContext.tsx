import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type AppRole = "super_admin" | "admin" | "cashier";
type AccountKey = "cash" | "admin" | "sadmin";

interface LocalUser {
  id: string;
  email: string;
  accountKey: AccountKey;
}

interface LoginAccount {
  key: AccountKey;
  role: AppRole;
  email: string;
  password: string;
}

const AUTH_ACCOUNTS_KEY = "supermart_auth_accounts";
const AUTH_SESSION_KEY = "supermart_auth_session";

const defaultAccounts: LoginAccount[] = [
  { key: "cash", role: "cashier", email: "cash@local", password: "000" },
  { key: "admin", role: "admin", email: "admin@local", password: "000" },
  { key: "sadmin", role: "super_admin", email: "sadmin@local", password: "000" },
];

function readAccounts(): LoginAccount[] {
  const raw = localStorage.getItem(AUTH_ACCOUNTS_KEY);
  if (!raw) {
    localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(defaultAccounts));
    return defaultAccounts;
  }

  try {
    const parsed = JSON.parse(raw) as LoginAccount[];
    if (!Array.isArray(parsed) || parsed.length !== 3) {
      localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(defaultAccounts));
      return defaultAccounts;
    }
    return parsed;
  } catch {
    localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(defaultAccounts));
    return defaultAccounts;
  }
}

export function updateLocalAccountPassword(accountKey: AccountKey, password: string) {
  const accounts = readAccounts();
  const updated = accounts.map((acc) => (acc.key === accountKey ? { ...acc, password } : acc));
  localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(updated));
}

interface AuthContextType {
  user: LocalUser | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (accountKey: AccountKey, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionRaw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!sessionRaw) {
      setLoading(false);
      return;
    }

    try {
      const session = JSON.parse(sessionRaw) as { accountKey: AccountKey };
      const account = readAccounts().find((acc) => acc.key === session.accountKey);
      if (account) {
        setUser({
          id: account.key,
          email: account.email,
          accountKey: account.key,
        });
        setRole(account.role);
      } else {
        localStorage.removeItem(AUTH_SESSION_KEY);
      }
    } catch {
      localStorage.removeItem(AUTH_SESSION_KEY);
    }
    setLoading(false);
  }, []);

  const signIn = async (accountKey: AccountKey, password: string) => {
    const account = readAccounts().find((acc) => acc.key === accountKey);
    if (!account || account.password !== password) {
      throw new Error("Invalid account or password");
    }

    const nextUser: LocalUser = {
      id: account.key,
      email: account.email,
      accountKey: account.key,
    };

    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ accountKey }));
    setUser(nextUser);
    setRole(account.role);
  };

  const signOut = async () => {
    localStorage.removeItem(AUTH_SESSION_KEY);
    setUser(null);
    setRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
