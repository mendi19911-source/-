export interface Brand {
  id: number;
  name: string;
  logoUrl: string | null;
  sourceStore: string | null;
  _count?: { products: number };
}

export interface Category {
  id: number;
  name: string;
  parentId: number | null;
  _count?: { products: number };
  children?: Category[];
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  _count?: { variants: number };
}

export interface VariantPricing {
  costPricePreVat: number | null;
  costPriceWithVat: number | null;
  retailPrice: number | null;
  retailPricePreVat: number | null;
  marginPercent: number | null;
  marginAmount: number | null;
  isLowMargin: boolean;
  isIncomplete: boolean;
}

export interface ProductVariant extends VariantPricing {
  id: number;
  productId: number;
  sku: string;
  variantName: string;
  attributeType: string | null;
  barcode: string | null;
  currentStockQty: number;
  lowStockThreshold: number;
  supplierId: number | null;
  supplier?: Supplier | null;
  imageUrl: string | null;
  isActive: boolean;
  stockStatus?: "ok" | "low" | "out";
}

export interface ProductListItem {
  id: number;
  name: string;
  brand: Brand;
  category: Category;
  sourceStore: string;
  status: string;
  skuCount: number;
  totalStock: number;
  stockStatus: "ok" | "low" | "out";
  costPriceRange: [number, number] | null;
  retailPriceRange: [number, number] | null;
  isIncomplete: boolean;
  imageUrl: string | null;
  updatedAt: string;
}

export interface ProductDetail {
  id: number;
  name: string;
  brandId: number;
  categoryId: number;
  brand: Brand;
  category: Category;
  description: string | null;
  hairTypeTags: string | null;
  sourceStore: string;
  sourceUrl: string | null;
  status: string;
  variants: ProductVariant[];
}

export interface StockMovement {
  id: number;
  variantId: number;
  movementType: "in" | "out" | "adjustment";
  quantity: number;
  reason: string | null;
  createdAt: string;
  createdBy?: { id: number; username: string } | null;
  variant?: ProductVariant & { product: { name: string } };
}

export interface DashboardSummary {
  productCount: number;
  activeSkuCount: number;
  stockValueAtCost: number;
  stockValueAtRetail: number;
  lowStockCount: number;
  incompleteProductCount: number;
  vatRate: number;
  byBrand: { name: string; skuCount: number }[];
  byCategory: { name: string; skuCount: number }[];
}

export const SOURCE_STORE_LABELS: Record<string, string> = {
  qarnette: "Qarnette",
  tiktak: "TikTak Beauty",
  other: "אחר",
};
