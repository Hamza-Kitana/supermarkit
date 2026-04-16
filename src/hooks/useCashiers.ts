import { useEffect, useState } from "react";
import {
  getCashiers,
  subscribeDbChanges,
  type LocalCashier,
} from "@/lib/localDb";

export type Cashier = LocalCashier;

export function useCashiers(options?: { includeDeleted?: boolean }) {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCashiers = () => {
    setCashiers(getCashiers(options));
    setLoading(false);
  };

  useEffect(() => {
    fetchCashiers();
    return subscribeDbChanges(fetchCashiers);
  }, []);

  return { cashiers, loading, refetch: fetchCashiers };
}

