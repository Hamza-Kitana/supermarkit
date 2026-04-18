import { useEffect, useState } from "react";
import {
  getInvoices,
  subscribeDbChanges,
  type LocalInvoice,
  type LocalInvoiceItem,
} from "@/lib/localDb";

export type Invoice = LocalInvoice;
export type InvoiceItem = LocalInvoiceItem;

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>(() => getInvoices());
  const [loading, setLoading] = useState(false);

  const fetchInvoices = () => {
    setInvoices(getInvoices());
    setLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
    return subscribeDbChanges(fetchInvoices);
  }, []);

  return { invoices, loading, refetch: fetchInvoices };
}
