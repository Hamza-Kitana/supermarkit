import { useEffect, useState } from "react";
import {
  getWholesaleMinQty,
  setWholesaleMinQty as saveWholesaleMinQty,
  subscribeDbChanges,
} from "@/lib/localDb";

export function useWholesaleMinQty() {
  const [wholesaleMinQty, setWholesaleMinQtyState] = useState(10);

  useEffect(() => {
    const refresh = () => setWholesaleMinQtyState(getWholesaleMinQty());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  const setWholesaleMinQty = (value: number) => {
    saveWholesaleMinQty(value);
    setWholesaleMinQtyState(Math.max(1, Math.floor(value || 1)));
  };

  return { wholesaleMinQty, setWholesaleMinQty };
}
