export type SaleType = "retail" | "wholesale";
export type CurrencyCode = "JOD" | "USD";
export type LanguageCode = "en" | "ar";
export type PaymentMethod = "cash" | "visa";

export interface LocalProduct {
  id: string;
  name: string;
  image_url: string | null;
  cost_price: number;
  retail_price: number;
  wholesale_price: number;
  wholesale_min_qty: number;
  stock: number;
  min_stock: number;
  sell_retail: boolean;
  sell_wholesale: boolean;
  category_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocalCashier {
  id: string;
  name: string;
  password: string;
  created_at: string;
  deleted_at: string | null;
}

export interface LocalCategory {
  id: string;
  name: string;
  created_at: string;
}

export interface LocalInvoice {
  id: string;
  cashier_id: string;
  cashier_name: string;
  sale_type: SaleType;
  total: number;
  returned_amount: number;
  last_returned_at: string | null;
  paid: number;
  change_amount: number;
  is_credit: boolean;
  customer_name: string | null;
  payment_method: PaymentMethod;
  is_return: boolean;
  deleted_at: string | null;
  return_approved_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface LocalInvoiceItem {
  id: string;
  invoice_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  returned_quantity: number;
  unit_cost: number;
  unit_price: number;
  subtotal: number;
}

type LocalState = {
  products: LocalProduct[];
  cashiers: LocalCashier[];
  categories: LocalCategory[];
  invoices: LocalInvoice[];
  invoice_items: LocalInvoiceItem[];
  settings: {
    return_password: string;
    currency: CurrencyCode;
    wholesale_min_qty: number;
    language: LanguageCode;
    enable_credit: boolean;
    // Future: payment methods config if needed
  };
};

const STORAGE_KEY = "supermart_local_db";
const DB_EVENT = "supermart:db-changed";

const defaultState: LocalState = {
  products: [],
  cashiers: [],
  categories: [],
  invoices: [],
  invoice_items: [],
  settings: {
    return_password: "000",
    currency: "JOD",
    wholesale_min_qty: 10,
    language: "en",
    enable_credit: false,
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readState(): LocalState {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return clone(defaultState);
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalState>;
    return {
      products: (parsed.products ?? []).map((product) => ({
        ...product,
        image_url: (product as LocalProduct).image_url ?? null,
        cost_price: Math.max(0, Number((product as Partial<LocalProduct>).cost_price ?? 0)),
        wholesale_min_qty: Math.max(
          1,
          ((product as Partial<LocalProduct>).wholesale_min_qty ?? parsed.settings?.wholesale_min_qty ?? 10),
        ),
        deleted_at: (product as LocalProduct).deleted_at ?? null,
        category_id: (product as LocalProduct).category_id ?? null,
      })),
      cashiers: (parsed as any).cashiers
        ? (parsed as any).cashiers.map((c: any) => ({
            id: String(c.id),
            name: String(c.name ?? "").trim() || "Cashier",
            password: String(c.password ?? "000"),
            created_at: c.created_at ?? new Date().toISOString(),
            deleted_at: c.deleted_at ?? null,
          }))
        : [],
      categories: (parsed as any).categories ?? [],
      invoices: (parsed.invoices ?? []).map((invoice) => ({
        ...invoice,
        returned_amount: (invoice as LocalInvoice).returned_amount ?? 0,
        last_returned_at: (invoice as LocalInvoice).last_returned_at ?? null,
        deleted_at: (invoice as LocalInvoice).deleted_at ?? null,
        cashier_name: (invoice as LocalInvoice).cashier_name
          ?? (invoice as any).cashier_name
          ?? String((invoice as any).cashier_id ?? "Cashier"),
        payment_method: (invoice as LocalInvoice).payment_method ?? "cash",
      })),
      invoice_items: (parsed.invoice_items ?? []).map((item) => ({
        ...item,
        returned_quantity: (item as LocalInvoiceItem).returned_quantity ?? 0,
        unit_cost: Math.max(0, Number((item as Partial<LocalInvoiceItem>).unit_cost ?? 0)),
      })),
      settings: {
        return_password: parsed.settings?.return_password ?? "000",
        currency: parsed.settings?.currency === "USD" ? "USD" : "JOD",
        wholesale_min_qty: Math.max(1, parsed.settings?.wholesale_min_qty ?? 10),
        language: parsed.settings?.language === "ar" ? "ar" : "en",
        enable_credit: Boolean(parsed.settings?.enable_credit),
      },
    };
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return clone(defaultState);
  }
}

function writeState(state: LocalState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new Event(DB_EVENT));
}

function newId() {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function makePlaceholderImage(label: string, hue: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <rect width="240" height="160" rx="18" fill="hsl(${hue} 70% 88%)" />
    <rect x="10" y="10" width="220" height="140" rx="12" fill="hsl(${hue} 75% 70%)" />
    <text x="120" y="90" text-anchor="middle" font-size="18" font-family="Arial, sans-serif" font-weight="700" fill="white">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function subscribeDbChanges(callback: () => void) {
  window.addEventListener(DB_EVENT, callback);
  return () => window.removeEventListener(DB_EVENT, callback);
}

export function getProducts() {
  return readState()
    .products
    .filter((p) => !p.deleted_at)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCashiers(options?: { includeDeleted?: boolean }) {
  const state = readState();
  const list = options?.includeDeleted ? state.cashiers : state.cashiers.filter((c) => !c.deleted_at);
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function addCashier(name: string, password = "000") {
  const trimmed = name.trim();
  if (!trimmed) return;
  const state = readState();
  const now = new Date().toISOString();
  state.cashiers.push({
    id: newId(),
    name: trimmed,
    password: password.trim() || "000",
    created_at: now,
    deleted_at: null,
  });
  writeState(state);
}

export function updateCashier(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const state = readState();
  state.cashiers = state.cashiers.map((c) =>
    c.id === id ? { ...c, name: trimmed } : c,
  );
  writeState(state);
}

export function updateCashierPassword(id: string, password: string) {
  const trimmed = password.trim();
  if (!trimmed) return;
  const state = readState();
  state.cashiers = state.cashiers.map((c) =>
    c.id === id ? { ...c, password: trimmed } : c,
  );
  writeState(state);
}

export function softDeleteCashier(id: string) {
  const state = readState();
  const now = new Date().toISOString();
  state.cashiers = state.cashiers.map((c) =>
    c.id === id ? { ...c, deleted_at: now } : c,
  );
  writeState(state);
}

export function getCategories() {
  return readState()
    .categories
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function addCategory(name: string) {
  const state = readState();
  const now = new Date().toISOString();
  state.categories.push({
    id: newId(),
    name: name.trim(),
    created_at: now,
  });
  writeState(state);
}

export function renameCategory(id: string, name: string) {
  const state = readState();
  state.categories = state.categories.map((c) =>
    c.id === id ? { ...c, name: name.trim() } : c,
  );
  writeState(state);
}

export function deleteCategory(id: string) {
  const state = readState();
  // Remove category reference from products
  state.products = state.products.map((p) =>
    p.category_id === id ? { ...p, category_id: null } : p,
  );
  state.categories = state.categories.filter((c) => c.id !== id);
  writeState(state);
}

export function getTrashedProducts() {
  return readState()
    .products
    .filter((p) => Boolean(p.deleted_at))
    .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
}

export function addProduct(
  payload: Omit<LocalProduct, "id" | "created_at" | "updated_at" | "deleted_at">,
) {
  const state = readState();
  const now = new Date().toISOString();
  state.products.push({
    id: newId(),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...payload,
  });
  writeState(state);
}

export function updateProduct(id: string, payload: Partial<LocalProduct>) {
  const state = readState();
  state.products = state.products.map((p) =>
    p.id === id ? { ...p, ...payload, updated_at: new Date().toISOString() } : p,
  );
  writeState(state);
}

export function deleteProduct(id: string) {
  const state = readState();
  state.products = state.products.map((p) =>
    p.id === id ? { ...p, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() } : p,
  );
  writeState(state);
}

export function permanentlyDeleteProduct(id: string) {
  const state = readState();
  state.products = state.products.filter((p) => p.id !== id);
  writeState(state);
}

export function restoreProduct(id: string) {
  const state = readState();
  state.products = state.products.map((p) =>
    p.id === id ? { ...p, deleted_at: null, updated_at: new Date().toISOString() } : p,
  );
  writeState(state);
}

export function getInvoices() {
  return readState()
    .invoices
    .filter((i) => !i.deleted_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getTrashedInvoices() {
  return readState()
    .invoices
    .filter((i) => Boolean(i.deleted_at))
    .sort((a, b) => (b.deleted_at ?? "").localeCompare(a.deleted_at ?? ""));
}

export function getInvoiceItems(invoiceId?: string) {
  const items = readState().invoice_items;
  if (!invoiceId) return items;
  return items.filter((i) => i.invoice_id === invoiceId);
}

export function getInvoiceNetTotal(invoiceId: string) {
  const state = readState();
  const invoice = state.invoices.find((inv) => inv.id === invoiceId);
  if (!invoice) return 0;
  return Math.max(0, invoice.total - (invoice.returned_amount ?? 0));
}

export function getReturnableInvoices() {
  const state = readState();
  return state.invoices
    .filter((invoice) => invoice.total - (invoice.returned_amount ?? 0) > 0)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function createInvoice(params: {
  cashier_id: string;
  cashier_name: string;
  sale_type: SaleType;
  total: number;
  paid: number;
  change_amount: number;
  is_credit: boolean;
  customer_name?: string | null;
  payment_method: PaymentMethod;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_cost: number;
    unit_price: number;
    subtotal: number;
  }>;
}) {
  const state = readState();
  const invoiceId = newId();
  const now = new Date().toISOString();

  const invoice: LocalInvoice = {
    id: invoiceId,
    cashier_id: params.cashier_id,
    cashier_name: params.cashier_name,
    sale_type: params.sale_type,
    total: params.total,
    returned_amount: 0,
    last_returned_at: null,
    paid: params.paid,
    change_amount: params.change_amount,
    is_credit: params.is_credit,
    customer_name: params.customer_name ?? null,
    payment_method: params.payment_method,
    is_return: false,
    deleted_at: null,
    return_approved_by: null,
    notes: null,
    created_at: now,
  };

  for (const line of params.items) {
    const product = state.products.find((p) => p.id === line.product_id);
    if (!product) {
      throw new Error(`Product not found: ${line.product_name}`);
    }
    if (product.stock < line.quantity) {
      throw new Error(`Insufficient stock for product: ${line.product_name}`);
    }
  }

  state.invoices.push(invoice);
  state.invoice_items.push(
    ...params.items.map((item) => ({
      id: newId(),
      invoice_id: invoiceId,
      returned_quantity: 0,
      ...item,
    })),
  );
  state.products = state.products.map((product) => {
    const sold = params.items.find((i) => i.product_id === product.id);
    if (!sold) return product;
    return {
      ...product,
      stock: product.stock - sold.quantity,
      updated_at: now,
    };
  });

  writeState(state);
  return invoice;
}

export function processInvoiceReturn(params: {
  invoiceId: string;
  returnAll: boolean;
  lines?: Array<{ itemId: string; quantity: number }>;
}) {
  const state = readState();
  const invoice = state.invoices.find((inv) => inv.id === params.invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  const netBefore = Math.max(0, invoice.total - (invoice.returned_amount ?? 0));
  if (netBefore <= 0) throw new Error("This invoice is already fully returned");

  const invoiceItems = state.invoice_items.filter((item) => item.invoice_id === params.invoiceId);
  const linesToReturn = params.returnAll
    ? invoiceItems
        .map((item) => ({
          itemId: item.id,
          quantity: item.quantity - (item.returned_quantity ?? 0),
        }))
        .filter((line) => line.quantity > 0)
    : (params.lines ?? []).filter((line) => line.quantity > 0);

  if (linesToReturn.length === 0) {
    throw new Error("Select at least one product to return");
  }

  let totalReturnAmount = 0;
  const now = new Date().toISOString();

  for (const line of linesToReturn) {
    const item = state.invoice_items.find((i) => i.id === line.itemId && i.invoice_id === params.invoiceId);
    if (!item) throw new Error("Invoice item not found");

    const alreadyReturned = item.returned_quantity ?? 0;
    const remaining = item.quantity - alreadyReturned;
    if (line.quantity > remaining) {
      throw new Error(`Requested return quantity exceeds available amount for: ${item.product_name}`);
    }

    item.returned_quantity = alreadyReturned + line.quantity;
    totalReturnAmount += item.unit_price * line.quantity;

    state.products = state.products.map((product) => {
      if (product.id !== item.product_id) return product;
      return {
        ...product,
        stock: product.stock + line.quantity,
        updated_at: now,
      };
    });
  }

  invoice.returned_amount = Math.min(invoice.total, (invoice.returned_amount ?? 0) + totalReturnAmount);
  invoice.last_returned_at = now;
  invoice.is_return = invoice.total - invoice.returned_amount <= 0.0001;

  writeState(state);
}

export function getInvoiceReturnSummary(invoiceId: string) {
  const state = readState();
  const invoice = state.invoices.find((inv) => inv.id === invoiceId);
  if (!invoice) {
    return { returnedAmount: 0, netAmount: 0 };
  }
  const returnedAmount = invoice.returned_amount ?? 0;
  return {
    returnedAmount,
    netAmount: Math.max(0, invoice.total - returnedAmount),
  };
}

export function removeInvoice(invoiceId: string) {
  const state = readState();
  state.invoices = state.invoices.map((i) =>
    i.id === invoiceId ? { ...i, deleted_at: new Date().toISOString() } : i,
  );
  writeState(state);
}

export function permanentlyDeleteInvoice(invoiceId: string) {
  const state = readState();
  state.invoices = state.invoices.filter((i) => i.id !== invoiceId);
  state.invoice_items = state.invoice_items.filter((i) => i.invoice_id !== invoiceId);
  writeState(state);
}

export function restoreInvoice(invoiceId: string) {
  const state = readState();
  state.invoices = state.invoices.map((i) =>
    i.id === invoiceId ? { ...i, deleted_at: null } : i,
  );
  writeState(state);
}

export function getReturnPassword() {
  return readState().settings.return_password;
}

export function setReturnPassword(password: string) {
  const state = readState();
  state.settings.return_password = password;
  writeState(state);
}

export function getCurrency() {
  return readState().settings.currency;
}

export function setCurrency(currency: CurrencyCode) {
  const state = readState();
  state.settings.currency = currency;
  writeState(state);
}

export function getWholesaleMinQty() {
  return Math.max(1, readState().settings.wholesale_min_qty ?? 10);
}

export function setWholesaleMinQty(value: number) {
  const state = readState();
  state.settings.wholesale_min_qty = Math.max(1, Math.floor(value || 1));
  writeState(state);
}

export function getLanguage() {
  return readState().settings.language;
}

export function setLanguage(language: LanguageCode) {
  const state = readState();
  state.settings.language = language;
  writeState(state);
}

export function getCreditEnabled() {
  return readState().settings.enable_credit;
}

export function setCreditEnabled(enabled: boolean) {
  const state = readState();
  state.settings.enable_credit = enabled;
  writeState(state);
}

export function seedTestProducts(count = 100) {
  const state = readState();
  const now = new Date().toISOString();

  for (let i = 1; i <= count; i += 1) {
    const wholesaleMin = (i % 5) + 5;
    state.products.push({
      id: newId(),
      name: `Test Product ${i}`,
      image_url: makePlaceholderImage(`P-${i}`, (i * 29) % 360),
      retail_price: 0.5 + i * 0.35,
      cost_price: 0.3 + i * 0.18,
      wholesale_price: 0.4 + i * 0.25,
      wholesale_min_qty: wholesaleMin,
      stock: 20 + (i % 40),
      min_stock: 10,
      sell_retail: true,
      sell_wholesale: true,
      deleted_at: null,
      created_at: now,
      updated_at: now,
    });
  }

  writeState(state);
}

export function clearTestProducts() {
  const state = readState();
  state.products = state.products.filter((p) => !p.name.startsWith("Test Product "));
  writeState(state);
}
