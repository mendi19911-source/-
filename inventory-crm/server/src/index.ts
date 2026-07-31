import express from "express";
import cors from "cors";
import cookieSession from "cookie-session";
import authRoutes from "./routes/auth";
import brandRoutes from "./routes/brands";
import categoryRoutes from "./routes/categories";
import supplierRoutes from "./routes/suppliers";
import productRoutes from "./routes/products";
import variantRoutes from "./routes/variants";
import stockRoutes from "./routes/stock";
import dashboardRoutes from "./routes/dashboard";
import settingsRoutes from "./routes/settings";
import importRoutes from "./routes/importCsv";
import taskRoutes from "./routes/tasks";
import employeeRoutes from "./routes/employees";
import { requireAuth } from "./middleware/auth";

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(
  cookieSession({
    name: "session",
    keys: [SESSION_SECRET],
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: "lax",
  })
);

app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);

// Everything below requires a logged-in session (single-user auth per spec section 2).
app.use("/api", requireAuth);
app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/products", productRoutes);
app.use("/api/variants", variantRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/import", importRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/employees", employeeRoutes);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "שגיאת שרת פנימית" });
});

app.listen(PORT, () => {
  console.log(`Inventory CRM API listening on port ${PORT}`);
});
