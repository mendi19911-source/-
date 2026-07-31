import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Brand } from "../types";
import { Button, ErrorText, inputCls } from "../components/ui";

const SOURCE_OPTIONS = [
  { value: "", label: "—" },
  { value: "qarnette", label: "Qarnette" },
  { value: "tiktak", label: "TikTak Beauty" },
  { value: "other", label: "אחר" },
];

export default function Brands() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [name, setName] = useState("");
  const [sourceStore, setSourceStore] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  function load() {
    api.get<Brand[]>("/brands").then(setBrands);
  }
  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) {
        await api.put(`/brands/${editingId}`, { name, sourceStore: sourceStore || null });
      } else {
        await api.post("/brands", { name, sourceStore: sourceStore || null });
      }
      setName("");
      setSourceStore("");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  function startEdit(b: Brand) {
    setEditingId(b.id);
    setName(b.name);
    setSourceStore(b.sourceStore || "");
  }

  async function remove(id: number) {
    if (!confirm("למחוק את המותג?")) return;
    try {
      await api.delete(`/brands/${id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "שגיאה במחיקה");
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">מותגים</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 h-fit">
          <h2 className="font-semibold mb-3">{editingId ? "עריכת מותג" : "מותג חדש"}</h2>
          <ErrorText>{error}</ErrorText>
          <label className="block mb-3">
            <span className="block text-sm text-gray-600 mb-1">שם מותג</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block mb-4">
            <span className="block text-sm text-gray-600 mb-1">מקור/חנות</span>
            <select className={inputCls} value={sourceStore} onChange={(e) => setSourceStore(e.target.value)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit">{editingId ? "שמירה" : "הוספה"}</Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingId(null);
                  setName("");
                  setSourceStore("");
                }}
              >
                ביטול
              </Button>
            )}
          </div>
        </form>

        <div className="md:col-span-2 bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-right p-3 font-medium">שם</th>
                <th className="text-right p-3 font-medium">מקור</th>
                <th className="text-right p-3 font-medium"># מוצרים</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id} className="border-t">
                  <td className="p-3">{b.name}</td>
                  <td className="p-3 text-gray-500">{b.sourceStore || "—"}</td>
                  <td className="p-3 text-gray-500">{b._count?.products ?? 0}</td>
                  <td className="p-3 text-left space-x-2 space-x-reverse">
                    <button className="text-indigo-600 hover:underline text-sm" onClick={() => startEdit(b)}>
                      עריכה
                    </button>
                    <button className="text-red-600 hover:underline text-sm mr-3" onClick={() => remove(b.id)}>
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
              {brands.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-gray-400">
                    אין מותגים עדיין
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
