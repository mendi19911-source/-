import { ReactNode } from "react";

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StockBadge({ status }: { status: "ok" | "low" | "out" }) {
  const map = {
    ok: { label: "תקין", className: "bg-green-100 text-green-700" },
    low: { label: "מלאי נמוך", className: "bg-yellow-100 text-yellow-800" },
    out: { label: "אזל", className: "bg-red-100 text-red-700" },
  };
  const { label, className } = map[status];
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>{label}</span>;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
  };
  return (
    <button
      className={`px-3 py-1.5 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="block text-sm text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600 mb-3">{children}</p>;
}
