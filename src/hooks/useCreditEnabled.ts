import { useEffect, useState } from "react";
import { getCreditEnabled, subscribeDbChanges } from "@/lib/localDb";

export function useCreditEnabled() {
  const [creditEnabled, setCreditEnabled] = useState<boolean>(getCreditEnabled());

  useEffect(() => {
    const refresh = () => setCreditEnabled(getCreditEnabled());
    refresh();
    return subscribeDbChanges(refresh);
  }, []);

  return creditEnabled;
}

