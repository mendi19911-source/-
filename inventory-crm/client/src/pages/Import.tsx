import { useState } from "react";
import { api, ApiError } from "../api/client";
import { Button, ErrorText, inputCls } from "../components/ui";

interface ImportField {
  key: string;
  label: string;
  required: boolean;
}

interface ParseResult {
  headers: string[];
  records: Record<string, string>[];
  fields: ImportField[];
}

interface CommitResult {
  productsCreated: number;
  variantsCreated: number;
  variantsUpdated: number;
  errors: string[];
}

export default function Import() {
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sourceStore, setSourceStore] = useState("other");
  const [error, setError] = useState("");
  const [result, setResult] = useState<CommitResult | null>(null);
  const [committing, setCommitting] = useState(false);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const data = await api.postForm<ParseResult>("/import/parse", form);
      setParsed(data);
      // best-effort auto-mapping by common Shopify header names
      const guess: Record<string, string> = {};
      const auto: Record<string, string[]> = {
        name: ["title", "name", "שם מוצר"],
        brand: ["vendor", "brand", "מותג"],
        category: ["product_type", "collection", "category", "קטגוריה"],
        sku: ["variant sku", "variant_sku", "sku"],
        variantName: ["variant title", "variant_title", "option1 value"],
        retailPrice: ["variant price", "variant_price", "price"],
        costPricePreVat: ["cost_price", "cost"],
        barcode: ["variant barcode", "barcode", "variant_sku"],
        imageUrl: ["image src", "image_src", "images"],
        sourceUrl: ["url", "handle"],
        description: ["body (html)", "body_html", "description"],
      };
      for (const field of data.fields) {
        const match = data.headers.find((h) => auto[field.key]?.includes(h.trim().toLowerCase()));
        if (match) guess[field.key] = match;
      }
      setMapping(guess);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בקריאת הקובץ");
    }
  }

  async function commit() {
    if (!parsed) return;
    setCommitting(true);
    setError("");
    try {
      const res = await api.post<CommitResult>("/import/commit", { records: parsed.records, mapping, sourceStore });
      setResult(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בייבוא");
    } finally {
      setCommitting(false);
    }
  }

  const requiredMapped = parsed?.fields.filter((f) => f.required).every((f) => mapping[f.key]) ?? false;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">ייבוא מוצרים מ-CSV</h1>
      <p className="text-gray-500 mb-6">
        ייבוא קובץ CSV (למשל ייצוא מ-Shopify), עם מיפוי עמודות לשדות המערכת.{" "}
        <a href="/api/import/template" className="text-indigo-600 hover:underline">
          הורדת תבנית לדוגמה
        </a>
      </p>

      <div className="bg-white border rounded-lg p-4 mb-4">
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center gap-3">
          <input type="file" accept=".csv" onChange={onFileChange} />
          <select className={inputCls + " max-w-xs"} value={sourceStore} onChange={(e) => setSourceStore(e.target.value)}>
            <option value="other">מקור: אחר</option>
            <option value="qarnette">מקור: Qarnette</option>
            <option value="tiktak">מקור: TikTak Beauty</option>
          </select>
        </div>
      </div>

      {parsed && (
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h2 className="font-semibold mb-3">מיפוי שדות ({parsed.records.length} שורות נמצאו)</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {parsed.fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <span className="w-48 shrink-0">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </span>
                <select
                  className={inputCls}
                  value={mapping[f.key] || ""}
                  onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}
                >
                  <option value="">— לא ממופה —</option>
                  {parsed.headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="text-gray-500">
                  {parsed.headers.map((h) => (
                    <th key={h} className="text-right p-1 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.records.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-t">
                    {parsed.headers.map((h) => (
                      <td key={h} className="p-1 whitespace-nowrap max-w-[160px] truncate">
                        {r[h]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <Button onClick={commit} disabled={!requiredMapped || committing}>
              {committing ? "מייבא..." : `ייבוא ${parsed.records.length} שורות`}
            </Button>
            {!requiredMapped && <span className="text-xs text-red-500 mr-3">יש למפות את כל השדות המסומנים ב-*</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-semibold mb-2">תוצאות ייבוא</h2>
          <ul className="text-sm text-gray-700 space-y-1 mb-3">
            <li>מוצרים חדשים שנוצרו: {result.productsCreated}</li>
            <li>וריאציות (SKUs) חדשות: {result.variantsCreated}</li>
            <li>וריאציות שעודכנו: {result.variantsUpdated}</li>
          </ul>
          {result.errors.length > 0 && (
            <div>
              <p className="text-sm font-medium text-red-600 mb-1">שגיאות ({result.errors.length}):</p>
              <ul className="text-xs text-red-600 list-disc pr-5">
                {result.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-3">
            מוצרים עם שדות חסרים (מחיר עלות, ספק, מלאי) יופיעו ב"דשבורד → מוצרים לא שלמים" עד שיושלמו.
          </p>
        </div>
      )}
    </div>
  );
}
