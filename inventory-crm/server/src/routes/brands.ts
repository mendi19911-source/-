import { Router } from "express";
import { prisma } from "../db";
import { SOURCE_STORES } from "../lib/enums";

const router = Router();

router.get("/", async (_req, res) => {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  res.json(brands);
});

router.post("/", async (req, res) => {
  const { name, logoUrl, sourceStore } = req.body ?? {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "יש להזין שם מותג" });
  }
  if (sourceStore && !SOURCE_STORES.includes(sourceStore)) {
    return res.status(400).json({ error: "מקור חנות לא תקין" });
  }
  try {
    const brand = await prisma.brand.create({
      data: { name: name.trim(), logoUrl: logoUrl || null, sourceStore: sourceStore || null },
    });
    res.status(201).json(brand);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "מותג בשם זה כבר קיים" });
    throw e;
  }
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, logoUrl, sourceStore } = req.body ?? {};
  if (sourceStore && !SOURCE_STORES.includes(sourceStore)) {
    return res.status(400).json({ error: "מקור חנות לא תקין" });
  }
  try {
    const brand = await prisma.brand.update({
      where: { id },
      data: { name, logoUrl, sourceStore },
    });
    res.json(brand);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "מותג בשם זה כבר קיים" });
    if (e.code === "P2025") return res.status(404).json({ error: "מותג לא נמצא" });
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const productCount = await prisma.product.count({ where: { brandId: id } });
  if (productCount > 0) {
    return res.status(409).json({ error: `לא ניתן למחוק - קיימים ${productCount} מוצרים המשויכים למותג זה` });
  }
  await prisma.brand.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

export default router;
