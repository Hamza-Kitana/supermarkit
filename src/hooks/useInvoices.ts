import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getInvoices,
  subscribeDbChanges,
  type LocalInvoice,
  type LocalInvoiceItem,
} from "@/lib/localDb";

export type Invoice = LocalInvoice;
export type InvoiceItem = LocalInvoiceItem;

export function useInvoices() {
  const location = useLocation();
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

  useEffect(() => {
    setInvoices(getInvoices());
  }, [location.pathname]);

  return { invoices, loading, refetch: fetchInvoices };
}
