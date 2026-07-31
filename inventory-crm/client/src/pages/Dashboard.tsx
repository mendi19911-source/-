import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { DashboardSummary } from "../types";

export default function Dashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    api.get<DashboardSummary>("/dashboard/summary").then(setData);
  }, []);

  if (!data) return <p className="text-gray-500">טוען...</p>;

  const cards = [
    { label: "מוצרים פעילים", value: data.productCount },
    { label: 'סה"כ SKUs פעילים', value: data.activeSkuCount },
    { label: 'שווי מלאי (עלות)', value: `₪${data.stockValueAtCost.toLocaleString()}` },
    { label: 'שווי מלאי (מכירה)', value: `₪${data.stockValueAtRetail.toLocaleString()}` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">דשבורד</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-lg shadow-sm border p-4">
            <p className="text-sm text-gray-500 mb-1">{c.label}</p>
            <p className="text-2xl font-bold text-gray-800">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <Link
          to="/products?stockStatus=low"
          className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 hover:bg-yellow-100 transition-colors"
        >
          <p className="text-sm text-yellow-800 mb-1">מוצרים במלאי נמוך</p>
          <p className="text-2xl font-bold text-yellow-900">{data.lowStockCount}</p>
        </Link>
        <Link
          to="/products?incomplete=1"
          className="bg-red-50 border border-red-200 rounded-lg p-4 hover:bg-red-100 transition-colors"
        >
          <p className="text-sm text-red-800 mb-1">מוצרים לא שלמים (חסר מחיר/ספק/מלאי)</p>
          <p className="text-2xl font-bold text-red-900">{data.incompleteProductCount}</p>
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <BreakdownCard title="פילוח לפי מותג" rows={data.byBrand} />
        <BreakdownCard title="פילוח לפי קטגוריה" rows={data.byCategory} />
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows }: { title: string; rows: { name: string; skuCount: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.skuCount));
  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-gray-400">אין נתונים</p>}
        {rows.map((r) => (
          <div key={r.name} className="flex items-center gap-2">
            <span className="text-sm w-28 truncate">{r.name}</span>
            <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
              <div className="bg-indigo-500 h-full" style={{ width: `${(r.skuCount / max) * 100}%` }} />
            </div>
            <span className="text-sm text-gray-500 w-8 text-left">{r.skuCount}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
