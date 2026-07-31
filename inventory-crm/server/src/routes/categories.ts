import { Router } from "express";
import { prisma } from "../db";

const router = Router();

// Flat list (used for select dropdowns) plus a nested tree helper.
router.get("/", async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
  res.json(categories);
});

router.get("/tree", async (_req, res) => {
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const byId = new Map(categories.map((c) => [c.id, { ...c, children: [] as any[] }]));
  const roots: any[] = [];
  for (const c of byId.values()) {
    if (c.parentId && byId.has(c.parentId)) {
      byId.get(c.parentId)!.children.push(c);
    } else {
      roots.push(c);
    }
  }
  res.json(roots);
});

router.post("/", async (req, res) => {
  const { name, parentId } = req.body ?? {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "יש להזין שם קטגוריה" });
  }
  const category = await prisma.category.create({
    data: { name: name.trim(), parentId: parentId ? Number(parentId) : null },
  });
  res.status(201).json(category);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, parentId } = req.body ?? {};
  if (parentId != null && Number(parentId) === id) {
    return res.status(400).json({ error: "קטגוריה לא יכולה להיות ההורה של עצמה" });
  }
  try {
    const category = await prisma.category.update({
      where: { id },
      data: { name, parentId: parentId != null ? Number(parentId) : null },
    });
    res.json(category);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "קטגוריה לא נמצאה" });
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [productCount, childCount] = await Promise.all([
    prisma.product.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);
  if (productCount > 0) {
    return res.status(409).json({ error: `לא ניתן למחוק - קיימים ${productCount} מוצרים בקטגוריה זו` });
  }
  if (childCount > 0) {
    return res.status(409).json({ error: `לא ניתן למחוק - קיימות ${childCount} תתי-קטגוריות` });
  }
  await prisma.category.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

export default router;
