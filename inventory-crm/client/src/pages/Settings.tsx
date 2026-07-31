import { FormEvent, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { Button, ErrorText, inputCls } from "../components/ui";

export default function Settings() {
  const [vatRatePercent, setVatRatePercent] = useState("18");
  const [currency, setCurrency] = useState("ILS");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<{ vatRate: number; currency: string }>("/settings").then((s) => {
      setVatRatePercent(String(s.vatRate * 100));
      setCurrency(s.currency);
    });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    try {
      await api.put("/settings", { vatRate: Number(vatRatePercent) / 100, currency });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה");
    }
  }

  return (
    <div className="max-w-md">
      <h1 className="text-2xl font-bold mb-6">הגדרות מערכת</h1>
      <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4">
        <ErrorText>{error}</ErrorText>
        {saved && <p className="text-sm text-green-600 mb-3">ההגדרות נשמרו</p>}
        <label className="block mb-3">
          <span className="block text-sm text-gray-600 mb-1">שיעור מע"מ (%)</span>
          <input
            type="number"
            step="0.1"
            className={inputCls}
            value={vatRatePercent}
            onChange={(e) => setVatRatePercent(e.target.value)}
          />
        </label>
        <label className="block mb-4">
          <span className="block text-sm text-gray-600 mb-1">מטבע</span>
          <input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </label>
        <Button type="submit">שמירה</Button>
      </form>
    </div>
  );
}
