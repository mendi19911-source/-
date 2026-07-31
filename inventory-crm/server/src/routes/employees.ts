import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
  res.json(employees);
});

router.post("/", async (req, res) => {
  const { name, role } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "יש להזין שם עובד/ת" });
  const employee = await prisma.employee.create({ data: { name: name.trim(), role: role || null } });
  res.status(201).json(employee);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, role, isActive } = req.body ?? {};
  try {
    const employee = await prisma.employee.update({ where: { id }, data: { name, role, isActive } });
    res.json(employee);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "עובד/ת לא נמצא/ה" });
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } });
  await prisma.employee.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

export default router;
