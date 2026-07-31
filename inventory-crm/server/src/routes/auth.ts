import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../db";

const router = Router();

router.post("/login", async (req, res) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    return res.status(400).json({ error: "יש להזין שם משתמש וסיסמה" });
  }
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "שם משתמש או סיסמה שגויים" });
  }
  (req as any).session.userId = user.id;
  res.json({ id: user.id, username: user.username, role: user.role });
});

router.post("/logout", (req, res) => {
  (req as any).session = null;
  res.json({ ok: true });
});

router.get("/me", async (req, res) => {
  const userId = (req as any).session?.userId;
  if (!userId) return res.status(401).json({ error: "לא מחובר" });
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return res.status(401).json({ error: "לא מחובר" });
  res.json({ id: user.id, username: user.username, role: user.role });
});

export default router;
