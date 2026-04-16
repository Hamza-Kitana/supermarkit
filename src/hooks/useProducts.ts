import { useEffect, useState } from "react";
import {
  getProducts,
  getCategories,
  subscribeDbChanges,
  type LocalProduct,
  type LocalCategory,
} from "@/lib/localDb";

export type Product = LocalProduct;
export type Category = LocalCategory;

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = () => {
    setProducts(getProducts());
    setCategories(getCategories());
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
    return subscribeDbChanges(fetchProducts);
  }, []);

  return { products, categories, loading, refetch: fetchProducts };
}
