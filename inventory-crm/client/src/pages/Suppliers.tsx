import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Supplier } from "../types";
import { Button, ErrorText, inputCls } from "../components/ui";

const empty = { name: "", contactName: "", phone: "", email: "", notes: "" };

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function load() {
    api.get<Supplier[]>("/suppliers").then(setSuppliers);
  }
  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (editingId) await api.put(`/suppliers/${editingId}`, form);
      else await api.post("/suppliers", form);
      setForm(empty);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setForm({ name: s.name, contactName: s.contactName || "", phone: s.phone || "", email: s.email || "", notes: s.notes || "" });
  }

  async function remove(id: number) {
    if (!confirm("למחוק את הספק?")) return;
    await api.delete(`/suppliers/${id}`);
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ספקים</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 h-fit">
          <h2 className="font-semibold mb-3">{editingId ? "עריכת ספק" : "ספק חדש"}</h2>
          <ErrorText>{error}</ErrorText>
          {[
            { key: "name", label: "שם ספק", required: true },
            { key: "contactName", label: "איש קשר" },
            { key: "phone", label: "טלפון" },
            { key: "email", label: "אימייל" },
          ].map((f) => (
            <label className="block mb-3" key={f.key}>
              <span className="block text-sm text-gray-600 mb-1">{f.label}</span>
              <input
                className={inputCls}
                required={f.required}
                value={(form as any)[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </label>
          ))}
          <label className="block mb-4">
            <span className="block text-sm text-gray-600 mb-1">הערות</span>
            <textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <div className="flex gap-2">
            <Button type="submit">{editingId ? "שמירה" : "הוספה"}</Button>
            {editingId && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setEditingId(null);
                  setForm(empty);
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
                <th className="text-right p-3 font-medium">איש קשר</th>
                <th className="text-right p-3 font-medium">טלפון</th>
                <th className="text-right p-3 font-medium"># SKUs</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-3">{s.name}</td>
                  <td className="p-3 text-gray-500">{s.contactName || "—"}</td>
                  <td className="p-3 text-gray-500">{s.phone || "—"}</td>
                  <td className="p-3 text-gray-500">{s._count?.variants ?? 0}</td>
                  <td className="p-3 text-left">
                    <button className="text-indigo-600 hover:underline text-sm" onClick={() => startEdit(s)}>
                      עריכה
                    </button>
                    <button className="text-red-600 hover:underline text-sm mr-3" onClick={() => remove(s.id)}>
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-gray-400">
                    אין ספקים עדיין
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
