import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, ApiError } from "../AuthContext";
import { Button, ErrorText, inputCls } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "שגיאה בהתחברות");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
      <form onSubmit={onSubmit} className="bg-white shadow-md rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-bold mb-6 text-center text-indigo-700">ניהול מלאי — התחברות</h1>
        <ErrorText>{error}</ErrorText>
        <label className="block mb-3">
          <span className="block text-sm text-gray-600 mb-1">שם משתמש</span>
          <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="block mb-5">
          <span className="block text-sm text-gray-600 mb-1">סיסמה</span>
          <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <Button type="submit" disabled={loading} className="w-full justify-center">
          {loading ? "מתחבר..." : "התחברות"}
        </Button>
      </form>
    </div>
  );
}
