import { useEffect, useState } from "react";
import {
  getProducts,
  subscribeDbChanges,
  type LocalProduct,
} from "@/lib/localDb";

export type Product = LocalProduct;

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = () => {
    setProducts(getProducts());
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    return subscribeDbChanges(fetchProducts);
  }, []);

  return { products, loading, refetch: fetchProducts };
}
