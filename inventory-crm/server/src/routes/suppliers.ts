import { Router } from "express";
import { prisma } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { variants: true } } },
  });
  res.json(suppliers);
});

router.post("/", async (req, res) => {
  const { name, contactName, phone, email, notes } = req.body ?? {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "יש להזין שם ספק" });
  }
  const supplier = await prisma.supplier.create({
    data: { name: name.trim(), contactName, phone, email, notes },
  });
  res.status(201).json(supplier);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, contactName, phone, email, notes } = req.body ?? {};
  try {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { name, contactName, phone, email, notes },
    });
    res.json(supplier);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "ספק לא נמצא" });
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.productVariant.updateMany({ where: { supplierId: id }, data: { supplierId: null } });
  await prisma.supplier.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

export default router;
