import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { Brand, Category, ProductDetail as ProductDetailType, ProductVariant, SOURCE_STORE_LABELS, Supplier } from "../types";
import { Button, ErrorText, Field, inputCls, Modal, StockBadge } from "../components/ui";

const emptyProductForm = {
  name: "",
  brandId: "",
  categoryId: "",
  description: "",
  hairTypeTags: "",
  sourceStore: "other",
  sourceUrl: "",
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [product, setProduct] = useState<ProductDetailType | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(emptyProductForm);
  const [error, setError] = useState("");
  const [quickAdd, setQuickAdd] = useState<"brand" | "category" | null>(null);
  const [variantModal, setVariantModal] = useState<ProductVariant | "new" | null>(null);
  const [stockModal, setStockModal] = useState<ProductVariant | null>(null);

  function loadRefData() {
    api.get<Brand[]>("/brands").then(setBrands);
    api.get<Category[]>("/categories").then(setCategories);
    api.get<Supplier[]>("/suppliers").then(setSuppliers);
  }

  function loadProduct() {
    if (isNew) return;
    api.get<ProductDetailType>(`/products/${id}`).then((p) => {
      setProduct(p);
      setForm({
        name: p.name,
        brandId: String(p.brandId),
        categoryId: String(p.categoryId),
        description: p.description || "",
        hairTypeTags: p.hairTypeTags ? JSON.parse(p.hairTypeTags).join(", ") : "",
        sourceStore: p.sourceStore,
        sourceUrl: p.sourceUrl || "",
      });
    });
  }

  useEffect(loadRefData, []);
  useEffect(loadProduct, [id]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      name: form.name,
      brandId: Number(form.brandId),
      categoryId: Number(form.categoryId),
      description: form.description || null,
      hairTypeTags: form.hairTypeTags
        ? form.hairTypeTags.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      sourceStore: form.sourceStore,
      sourceUrl: form.sourceUrl || null,
    };
    try {
      if (isNew) {
        const created = await api.post<ProductDetailType>("/products", payload);
        navigate(`/products/${created.id}`, { replace: true });
      } else {
        await api.put(`/products/${id}`, payload);
        loadProduct();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    }
  }

  async function toggleArchive() {
    if (!product) return;
    const action = product.status === "archived" ? "unarchive" : "archive";
    await api.post(`/products/${product.id}/${action}`);
    loadProduct();
  }

  async function deleteVariant(v: ProductVariant) {
    if (!confirm(`למחוק את הוריאציה ${v.sku}?`)) return;
    await api.delete(`/variants/${v.id}`);
    loadProduct();
  }

  return (
    <div>
      <button onClick={() => navigate("/products")} className="text-sm text-gray-500 hover:underline mb-4">
        → חזרה לרשימת המוצרים
      </button>

      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 md:col-span-1 h-fit">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">{isNew ? "מוצר חדש" : "פרטי מוצר"}</h2>
            {product && (
              <button type="button" onClick={toggleArchive} className="text-xs text-gray-500 hover:underline">
                {product.status === "archived" ? "שחזור מארכיון" : "העברה לארכיון"}
              </button>
            )}
          </div>
          <ErrorText>{error}</ErrorText>

          <Field label="שם מוצר">
            <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>

          <Field label="מותג">
            <div className="flex gap-2">
              <select
                className={inputCls}
                value={form.brandId}
                onChange={(e) => setForm({ ...form, brandId: e.target.value })}
                required
              >
                <option value="">בחר מותג</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={() => setQuickAdd("brand")}>
                + חדש
              </Button>
            </div>
          </Field>

          <Field label="קטגוריה">
            <div className="flex gap-2">
              <select
                className={inputCls}
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                required
              >
                <option value="">בחר קטגוריה</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" onClick={() => setQuickAdd("category")}>
                + חדש
              </Button>
            </div>
          </Field>

          <Field label="תיאור">
            <textarea
              className={inputCls}
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <Field label="תגיות סוג שיער (מופרדות בפסיק)">
            <input
              className={inputCls}
              placeholder="דק, מתולתל, צבוע"
              value={form.hairTypeTags}
              onChange={(e) => setForm({ ...form, hairTypeTags: e.target.value })}
            />
          </Field>

          <Field label="מקור/חנות">
            <select className={inputCls} value={form.sourceStore} onChange={(e) => setForm({ ...form, sourceStore: e.target.value })}>
              {Object.entries(SOURCE_STORE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>

          <Field label="קישור למוצר במקור">
            <input className={inputCls} value={form.sourceUrl} onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          </Field>

          <Button type="submit">{isNew ? "יצירת מוצר" : "שמירת שינויים"}</Button>
        </form>

        <div className="md:col-span-2">
          {isNew && <p className="text-gray-500">שמור את המוצר תחילה כדי להוסיף וריאציות (SKUs).</p>}

          {product && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">וריאציות (SKUs)</h2>
                <Button onClick={() => setVariantModal("new")}>+ וריאציה חדשה</Button>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-right p-2 font-medium">SKU</th>
                    <th className="text-right p-2 font-medium">וריאציה</th>
                    <th className="text-right p-2 font-medium">עלות (לפני מע"מ)</th>
                    <th className="text-right p-2 font-medium">מכירה</th>
                    <th className="text-right p-2 font-medium">רווח %</th>
                    <th className="text-right p-2 font-medium">מלאי</th>
                    <th className="text-right p-2 font-medium">ספק</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="p-2 font-mono text-xs">{v.sku}</td>
                      <td className="p-2">{v.variantName}</td>
                      <td className="p-2">{v.costPricePreVat != null ? `₪${v.costPricePreVat}` : "—"}</td>
                      <td className="p-2">{v.retailPrice != null ? `₪${v.retailPrice}` : "—"}</td>
                      <td className="p-2">
                        {v.marginPercent != null ? (
                          <span className={v.isLowMargin ? "text-red-600 font-semibold" : "text-green-700"}>
                            {v.marginPercent.toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <button className="text-indigo-600 hover:underline" onClick={() => setStockModal(v)}>
                            {v.currentStockQty}
                          </button>
                          <StockBadge status={v.stockStatus || "ok"} />
                        </div>
                      </td>
                      <td className="p-2 text-gray-500">{v.supplier?.name || "—"}</td>
                      <td className="p-2 text-left whitespace-nowrap">
                        <button className="text-indigo-600 hover:underline text-xs" onClick={() => setVariantModal(v)}>
                          עריכה
                        </button>
                        <button className="text-red-600 hover:underline text-xs mr-2" onClick={() => deleteVariant(v)}>
                          מחיקה
                        </button>
                      </td>
                    </tr>
                  ))}
                  {product.variants.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-gray-400">
                        אין עדיין וריאציות למוצר זה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {quickAdd && (
        <QuickAddModal
          type={quickAdd}
          onClose={() => setQuickAdd(null)}
          onCreated={(id) => {
            loadRefData();
            if (quickAdd === "brand") setForm((f) => ({ ...f, brandId: String(id) }));
            else setForm((f) => ({ ...f, categoryId: String(id) }));
            setQuickAdd(null);
          }}
        />
      )}

      {variantModal && product && (
        <VariantModal
          productId={product.id}
          variant={variantModal === "new" ? null : variantModal}
          suppliers={suppliers}
          onClose={() => setVariantModal(null)}
          onSaved={() => {
            setVariantModal(null);
            loadProduct();
          }}
        />
      )}

      {stockModal && (
        <StockModal
          variant={stockModal}
          onClose={() => setStockModal(null)}
          onSaved={() => {
            setStockModal(null);
            loadProduct();
          }}
        />
      )}
    </div>
  );
}

function QuickAddModal({
  type,
  onClose,
  onCreated,
}: {
  type: "brand" | "category";
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const created = await api.post<{ id: number }>(type === "brand" ? "/brands" : "/categories", { name });
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  return (
    <Modal title={type === "brand" ? "מותג חדש" : "קטגוריה חדשה"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorText>{error}</ErrorText>
        <Field label="שם">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Button type="submit">הוספה</Button>
      </form>
    </Modal>
  );
}

const emptyVariantForm = {
  sku: "",
  variantName: "",
  attributeType: "",
  barcode: "",
  costPricePreVat: "",
  retailPrice: "",
  lowStockThreshold: "5",
  supplierId: "",
  imageUrl: "",
  initialStockQty: "0",
};

function VariantModal({
  productId,
  variant,
  suppliers,
  onClose,
  onSaved,
}: {
  productId: number;
  variant: ProductVariant | null;
  suppliers: Supplier[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(
    variant
      ? {
          sku: variant.sku,
          variantName: variant.variantName,
          attributeType: variant.attributeType || "",
          barcode: variant.barcode || "",
          costPricePreVat: variant.costPricePreVat != null ? String(variant.costPricePreVat) : "",
          retailPrice: variant.retailPrice != null ? String(variant.retailPrice) : "",
          lowStockThreshold: String(variant.lowStockThreshold),
          supplierId: variant.supplierId ? String(variant.supplierId) : "",
          imageUrl: variant.imageUrl || "",
          initialStockQty: "0",
        }
      : emptyVariantForm
  );
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload: any = {
      sku: form.sku,
      variantName: form.variantName,
      attributeType: form.attributeType || null,
      barcode: form.barcode || null,
      costPricePreVat: form.costPricePreVat ? Number(form.costPricePreVat) : null,
      retailPrice: form.retailPrice ? Number(form.retailPrice) : null,
      lowStockThreshold: Number(form.lowStockThreshold),
      supplierId: form.supplierId ? Number(form.supplierId) : null,
      imageUrl: form.imageUrl || null,
    };
    try {
      if (variant) {
        await api.put(`/variants/${variant.id}`, payload);
      } else {
        await api.post("/variants", { ...payload, productId, initialStockQty: Number(form.initialStockQty) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בשמירה");
    }
  }

  return (
    <Modal title={variant ? "עריכת וריאציה" : "וריאציה חדשה"} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorText>{error}</ErrorText>
        <div className="grid grid-cols-2 gap-x-3">
          <Field label="SKU">
            <input className={inputCls} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required />
          </Field>
          <Field label="שם וריאציה (למשל: 250 מ״ל)">
            <input
              className={inputCls}
              value={form.variantName}
              onChange={(e) => setForm({ ...form, variantName: e.target.value })}
              required
            />
          </Field>
          <Field label="סוג מאפיין">
            <input
              className={inputCls}
              placeholder="גודל / צבע / אחר"
              value={form.attributeType}
              onChange={(e) => setForm({ ...form, attributeType: e.target.value })}
            />
          </Field>
          <Field label="ברקוד">
            <input className={inputCls} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
          </Field>
          <Field label='מחיר עלות (לפני מע"מ)'>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls}
              value={form.costPricePreVat}
              onChange={(e) => setForm({ ...form, costPricePreVat: e.target.value })}
            />
          </Field>
          <Field label='מחיר מכירה (כולל מע"מ)'>
            <input
              type="number"
              step="0.01"
              min="0"
              className={inputCls}
              value={form.retailPrice}
              onChange={(e) => setForm({ ...form, retailPrice: e.target.value })}
            />
          </Field>
          <Field label="סף מלאי נמוך">
            <input
              type="number"
              min="0"
              className={inputCls}
              value={form.lowStockThreshold}
              onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            />
          </Field>
          <Field label="ספק">
            <select className={inputCls} value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
              <option value="">— ללא —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="קישור לתמונה">
            <input className={inputCls} value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
          </Field>
          {!variant && (
            <Field label="מלאי פתיחה">
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.initialStockQty}
                onChange={(e) => setForm({ ...form, initialStockQty: e.target.value })}
              />
            </Field>
          )}
        </div>
        <Button type="submit">{variant ? "שמירה" : "הוספה"}</Button>
      </form>
    </Modal>
  );
}

function StockModal({ variant, onClose, onSaved }: { variant: ProductVariant; onClose: () => void; onSaved: () => void }) {
  const [movementType, setMovementType] = useState<"in" | "out" | "adjustment">("in");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/stock/movements", { variantId: variant.id, movementType, quantity: Number(quantity), reason });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  return (
    <Modal title={`עדכון מלאי — ${variant.sku}`} onClose={onClose}>
      <form onSubmit={submit}>
        <ErrorText>{error}</ErrorText>
        <p className="text-sm text-gray-500 mb-3">מלאי נוכחי: {variant.currentStockQty}</p>
        <Field label="סוג תנועה">
          <select className={inputCls} value={movementType} onChange={(e) => setMovementType(e.target.value as any)}>
            <option value="in">קליטת סחורה (הוספה)</option>
            <option value="out">מכירה / הפחתה</option>
            <option value="adjustment">ספירת מלאי / התאמה (± לפי הצורך)</option>
          </select>
        </Field>
        <Field label={movementType === "adjustment" ? "כמות (חיובי או שלילי)" : "כמות"}>
          <input type="number" className={inputCls} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </Field>
        <Field label="סיבה">
          <input
            className={inputCls}
            placeholder="קליטת סחורה מספק, מכירה ידנית, ספירה, פגום..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button type="submit">עדכון</Button>
      </form>
    </Modal>
  );
}
