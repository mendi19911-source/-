import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Category } from "../types";
import { Button, ErrorText, inputCls } from "../components/ui";

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [tree, setTree] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  function load() {
    api.get<Category[]>("/categories").then(setCategories);
    api.get<Category[]>("/categories/tree").then(setTree);
  }
  useEffect(load, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = { name, parentId: parentId ? Number(parentId) : null };
      if (editingId) await api.put(`/categories/${editingId}`, data);
      else await api.post("/categories", data);
      setName("");
      setParentId("");
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setName(c.name);
    setParentId(c.parentId ? String(c.parentId) : "");
  }

  async function remove(id: number) {
    if (!confirm("למחוק את הקטגוריה?")) return;
    try {
      await api.delete(`/categories/${id}`);
      load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "שגיאה במחיקה");
    }
  }

  function renderNode(c: Category, depth: number) {
    return (
      <div key={c.id}>
        <div className="flex items-center justify-between py-1.5 border-b last:border-0" style={{ paddingRight: depth * 20 }}>
          <span className="text-sm">
            {depth > 0 && "└ "}
            {c.name} <span className="text-gray-400">({c._count?.products ?? 0})</span>
          </span>
          <div className="text-sm">
            <button className="text-indigo-600 hover:underline" onClick={() => startEdit(c)}>
              עריכה
            </button>
            <button className="text-red-600 hover:underline mr-3" onClick={() => remove(c.id)}>
              מחיקה
            </button>
          </div>
        </div>
        {c.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">קטגוריות</h1>
      <div className="grid md:grid-cols-3 gap-6">
        <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 h-fit">
          <h2 className="font-semibold mb-3">{editingId ? "עריכת קטגוריה" : "קטגוריה חדשה"}</h2>
          <ErrorText>{error}</ErrorText>
          <label className="block mb-3">
            <span className="block text-sm text-gray-600 mb-1">שם קטגוריה</span>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block mb-4">
            <span className="block text-sm text-gray-600 mb-1">קטגוריית-אב (אופציונלי)</span>
            <select className={inputCls} value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— קטגוריה ראשית —</option>
              {categories
                .filter((c) => c.id !== editingId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
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
                  setParentId("");
                }}
              >
                ביטול
              </Button>
            )}
          </div>
        </form>

        <div className="md:col-span-2 bg-white border rounded-lg p-4">{tree.map((c) => renderNode(c, 0))}</div>
      </div>
    </div>
  );
}
