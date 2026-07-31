import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../AuthContext";

const links = [
  { to: "/", label: "דשבורד", end: true },
  { to: "/products", label: "מוצרים" },
  { to: "/brands", label: "מותגים" },
  { to: "/categories", label: "קטגוריות" },
  { to: "/suppliers", label: "ספקים" },
  { to: "/import", label: "ייבוא CSV" },
  { to: "/settings", label: "הגדרות" },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900" dir="rtl">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="font-bold text-lg text-indigo-700">ניהול מלאי</span>
            <nav className="flex gap-1">
              {links.map((l) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.end}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive ? "bg-indigo-100 text-indigo-700" : "text-gray-600 hover:bg-gray-100"
                    }`
                  }
                >
                  {l.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>{user?.username}</span>
            <button onClick={() => logout()} className="text-indigo-600 hover:underline">
              התנתקות
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
