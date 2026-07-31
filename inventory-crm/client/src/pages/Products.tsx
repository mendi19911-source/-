import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { Brand, Category, ProductListItem, SOURCE_STORE_LABELS } from "../types";
import { StockBadge } from "../components/ui";

export default function Products() {
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);

  const search = searchParams.get("search") || "";
  const brandId = searchParams.get("brandId") || "";
  const categoryId = searchParams.get("categoryId") || "";
  const sourceStore = searchParams.get("sourceStore") || "";
  const stockStatus = searchParams.get("stockStatus") || "";
  const incompleteOnly = searchParams.get("incomplete") === "1";
  const sortBy = searchParams.get("sortBy") || "";

  useEffect(() => {
    api.get<Brand[]>("/brands").then(setBrands);
    api.get<Category[]>("/categories").then(setCategories);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (brandId) params.set("brandId", brandId);
    if (categoryId) params.set("categoryId", categoryId);
    if (sourceStore) params.set("sourceStore", sourceStore);
    if (stockStatus) params.set("stockStatus", stockStatus);
    if (sortBy) params.set("sortBy", sortBy);
    const path = incompleteOnly ? "/products/incomplete" : `/products?${params.toString()}`;
    api
      .get<any[]>(path)
      .then((data) => {
        // /products/incomplete returns full product objects; normalize to list-item shape.
        if (incompleteOnly) {
          setProducts(
            data.map((p) => ({
              id: p.id,
              name: p.name,
              brand: p.brand,
              category: p.category,
              sourceStore: p.sourceStore,
              status: p.status,
              skuCount: p.variants.length,
              totalStock: p.variants.reduce((s: number, v: any) => s + v.currentStockQty, 0),
              stockStatus: "ok",
              costPriceRange: null,
              retailPriceRange: null,
              isIncomplete: true,
              imageUrl: null,
              updatedAt: p.updatedAt,
            }))
          );
        } else {
          setProducts(data);
        }
      })
      .finally(() => setLoading(false));
  }, [search, brandId, categoryId, sourceStore, stockStatus, sortBy, incompleteOnly]);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "incomplete") next.delete("incomplete");
    setSearchParams(next);
  }

  const flatCategories = useMemo(() => categories.filter((c) => true), [categories]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">מוצרים</h1>
        <Link to="/products/new" className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">
          + מוצר חדש
        </Link>
      </div>

      <div className="bg-white border rounded-lg p-3 mb-4 flex flex-wrap gap-2 items-center">
        <input
          className="border rounded-md px-3 py-1.5 text-sm flex-1 min-w-[180px]"
          placeholder="חיפוש לפי שם / SKU / ברקוד"
          defaultValue={search}
          onKeyDown={(e) => e.key === "Enter" && setParam("search", (e.target as HTMLInputElement).value)}
          onBlur={(e) => setParam("search", e.target.value)}
        />
        <select className="border rounded-md px-2 py-1.5 text-sm" value={brandId} onChange={(e) => setParam("brandId", e.target.value)}>
          <option value="">כל המותגים</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded-md px-2 py-1.5 text-sm"
          value={categoryId}
          onChange={(e) => setParam("categoryId", e.target.value)}
        >
          <option value="">כל הקטגוריות</option>
          {flatCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded-md px-2 py-1.5 text-sm"
          value={sourceStore}
          onChange={(e) => setParam("sourceStore", e.target.value)}
        >
          <option value="">כל החנויות</option>
          {Object.entries(SOURCE_STORE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="border rounded-md px-2 py-1.5 text-sm"
          value={stockStatus}
          onChange={(e) => setParam("stockStatus", e.target.value)}
        >
          <option value="">כל סטטוסי המלאי</option>
          <option value="ok">תקין</option>
          <option value="low">מלאי נמוך</option>
          <option value="out">אזל</option>
        </select>
        {incompleteOnly && (
          <span className="bg-red-100 text-red-700 text-xs px-2 py-1 rounded-full">מציג רק מוצרים לא שלמים</span>
        )}
      </div>

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="text-right p-3 font-medium"></th>
              <SortableHeader label="שם מוצר" field="name" sortBy={sortBy} setParam={setParam} />
              <th className="text-right p-3 font-medium">מותג</th>
              <th className="text-right p-3 font-medium">קטגוריה</th>
              <th className="text-right p-3 font-medium">SKUs</th>
              <th className="text-right p-3 font-medium">טווח עלות</th>
              <th className="text-right p-3 font-medium">טווח מכירה</th>
              <SortableHeader label="מלאי כולל" field="totalStock" sortBy={sortBy} setParam={setParam} />
              <th className="text-right p-3 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t hover:bg-gray-50">
                <td className="p-2">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} className="w-10 h-10 object-cover rounded" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 rounded" />
                  )}
                </td>
                <td className="p-3">
                  <Link to={`/products/${p.id}`} className="text-indigo-700 font-medium hover:underline">
                    {p.name}
                  </Link>
                  {p.isIncomplete && <span className="mr-2 text-xs text-red-600">● לא שלם</span>}
                </td>
                <td className="p-3 text-gray-500">{p.brand?.name}</td>
                <td className="p-3 text-gray-500">{p.category?.name}</td>
                <td className="p-3 text-gray-500">{p.skuCount}</td>
                <td className="p-3 text-gray-500">
                  {p.costPriceRange ? `₪${p.costPriceRange[0]}–${p.costPriceRange[1]}` : "—"}
                </td>
                <td className="p-3 text-gray-500">
                  {p.retailPriceRange ? `₪${p.retailPriceRange[0]}–${p.retailPriceRange[1]}` : "—"}
                </td>
                <td className="p-3 text-gray-500">{p.totalStock}</td>
                <td className="p-3">
                  <StockBadge status={p.stockStatus} />
                </td>
              </tr>
            ))}
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-gray-400">
                  לא נמצאו מוצרים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  field,
  sortBy,
  setParam,
}: {
  label: string;
  field: string;
  sortBy: string;
  setParam: (k: string, v: string) => void;
}) {
  return (
    <th
      className="text-right p-3 font-medium cursor-pointer select-none"
      onClick={() => setParam("sortBy", sortBy === field ? "" : field)}
    >
      {label} {sortBy === field && "▾"}
    </th>
  );
}
