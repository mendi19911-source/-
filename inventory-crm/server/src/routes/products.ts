import { Router } from "express";
import { prisma, getSettings } from "../db";
import { computePricing } from "../lib/pricing";
import { SOURCE_STORES, PRODUCT_STATUSES } from "../lib/enums";

const router = Router();

function withVariantPricing(variant: any, vatRate: number) {
  const pricing = computePricing({
    costPricePreVat: variant.costPricePreVat,
    retailPrice: variant.retailPrice,
    vatRate,
  });
  const isIncomplete =
    variant.costPricePreVat == null ||
    variant.retailPrice == null ||
    variant.supplierId == null ||
    variant.currentStockQty == null;
  return { ...variant, ...pricing, isIncomplete };
}

function stockStatusOf(variant: { currentStockQty: number; lowStockThreshold: number }) {
  if (variant.currentStockQty <= 0) return "out";
  if (variant.currentStockQty <= variant.lowStockThreshold) return "low";
  return "ok";
}

// GET /api/products - list with search/filter/sort
router.get("/", async (req, res) => {
  const { search, brandId, categoryId, sourceStore, status, stockStatus, sortBy, sortDir } = req.query as Record<
    string,
    string | undefined
  >;

  const where: any = {};
  if (status) where.status = status;
  else where.status = { not: "archived" }; // default: hide archived unless explicitly requested
  if (brandId) where.brandId = Number(brandId);
  if (categoryId) where.categoryId = Number(categoryId);
  if (sourceStore) where.sourceStore = sourceStore;
  if (search && search.trim()) {
    const term = search.trim();
    where.OR = [
      { name: { contains: term } },
      { variants: { some: { sku: { contains: term } } } },
      { variants: { some: { barcode: { contains: term } } } },
    ];
  }

  const products = await prisma.product.findMany({
    where,
    include: { brand: true, category: true, variants: true },
    orderBy: { updatedAt: "desc" },
  });

  const settings = await getSettings();
  let result = products.map((p) => {
    const variants = p.variants.map((v) => withVariantPricing(v, settings.vatRate));
    const totalStock = variants.reduce((sum, v) => sum + v.currentStockQty, 0);
    const costs = variants.map((v) => v.costPricePreVat).filter((n): n is number => n != null);
    const retails = variants.map((v) => v.retailPrice).filter((n): n is number => n != null);
    const worstStockStatus = variants.some((v) => stockStatusOf(v) === "out")
      ? "out"
      : variants.some((v) => stockStatusOf(v) === "low")
      ? "low"
      : "ok";
    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      category: p.category,
      sourceStore: p.sourceStore,
      status: p.status,
      skuCount: variants.length,
      totalStock,
      stockStatus: worstStockStatus,
      costPriceRange: costs.length ? [Math.min(...costs), Math.max(...costs)] : null,
      retailPriceRange: retails.length ? [Math.min(...retails), Math.max(...retails)] : null,
      isIncomplete: variants.some((v) => v.isIncomplete),
      imageUrl: variants.find((v) => v.imageUrl)?.imageUrl ?? null,
      updatedAt: p.updatedAt,
    };
  });

  if (stockStatus) {
    result = result.filter((p) => p.stockStatus === stockStatus);
  }

  if (sortBy) {
    const dir = sortDir === "desc" ? -1 : 1;
    result.sort((a: any, b: any) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av > bv ? dir : av < bv ? -dir : 0;
    });
  }

  res.json(result);
});

router.get("/incomplete", async (_req, res) => {
  const settings = await getSettings();
  const products = await prisma.product.findMany({
    where: { status: { not: "archived" } },
    include: { brand: true, category: true, variants: true },
  });
  const incomplete = products
    .map((p) => ({ ...p, variants: p.variants.map((v) => withVariantPricing(v, settings.vatRate)) }))
    .filter((p) => p.variants.length === 0 || p.variants.some((v: any) => v.isIncomplete));
  res.json(incomplete);
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const product = await prisma.product.findUnique({
    where: { id },
    include: { brand: true, category: true, variants: { include: { supplier: true } } },
  });
  if (!product) return res.status(404).json({ error: "מוצר לא נמצא" });
  const settings = await getSettings();
  res.json({
    ...product,
    variants: product.variants.map((v) => ({ ...withVariantPricing(v, settings.vatRate), stockStatus: stockStatusOf(v) })),
  });
});

router.post("/", async (req, res) => {
  const { name, brandId, categoryId, description, hairTypeTags, sourceStore, sourceUrl, status } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "יש להזין שם מוצר" });
  if (!brandId) return res.status(400).json({ error: "יש לבחור מותג" });
  if (!categoryId) return res.status(400).json({ error: "יש לבחור קטגוריה" });
  if (sourceStore && !SOURCE_STORES.includes(sourceStore)) return res.status(400).json({ error: "מקור חנות לא תקין" });
  if (status && !PRODUCT_STATUSES.includes(status)) return res.status(400).json({ error: "סטטוס לא תקין" });

  const product = await prisma.product.create({
    data: {
      name: name.trim(),
      brandId: Number(brandId),
      categoryId: Number(categoryId),
      description: description || null,
      hairTypeTags: hairTypeTags ? JSON.stringify(hairTypeTags) : null,
      sourceStore: sourceStore || "other",
      sourceUrl: sourceUrl || null,
      status: status || "active",
    },
    include: { brand: true, category: true, variants: true },
  });
  res.status(201).json(product);
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, brandId, categoryId, description, hairTypeTags, sourceStore, sourceUrl, status } = req.body ?? {};
  if (sourceStore && !SOURCE_STORES.includes(sourceStore)) return res.status(400).json({ error: "מקור חנות לא תקין" });
  if (status && !PRODUCT_STATUSES.includes(status)) return res.status(400).json({ error: "סטטוס לא תקין" });

  try {
    const product = await prisma.product.update({
      where: { id },
      data: {
        name,
        brandId: brandId != null ? Number(brandId) : undefined,
        categoryId: categoryId != null ? Number(categoryId) : undefined,
        description,
        hairTypeTags: hairTypeTags !== undefined ? (hairTypeTags ? JSON.stringify(hairTypeTags) : null) : undefined,
        sourceStore,
        sourceUrl,
        status,
      },
      include: { brand: true, category: true, variants: true },
    });
    res.json(product);
  } catch (e: any) {
    if (e.code === "P2025") return res.status(404).json({ error: "מוצר לא נמצא" });
    throw e;
  }
});

// Soft delete / restore
router.post("/:id/archive", async (req, res) => {
  const id = Number(req.params.id);
  const product = await prisma.product.update({ where: { id }, data: { status: "archived" } }).catch(() => null);
  if (!product) return res.status(404).json({ error: "מוצר לא נמצא" });
  res.json(product);
});

router.post("/:id/unarchive", async (req, res) => {
  const id = Number(req.params.id);
  const product = await prisma.product.update({ where: { id }, data: { status: "active" } }).catch(() => null);
  if (!product) return res.status(404).json({ error: "מוצר לא נמצא" });
  res.json(product);
});

// Bulk price update: adjust retail price by +/- percent for all variants matching filters
router.post("/bulk-price-update", async (req, res) => {
  const { brandId, categoryId, percent, field } = req.body ?? {};
  if (typeof percent !== "number" || percent === 0) {
    return res.status(400).json({ error: "יש להזין אחוז שינוי תקין" });
  }
  const priceField = field === "cost" ? "costPricePreVat" : "retailPrice";
  const historyField = field === "cost" ? "cost_price" : "retail_price";

  const productWhere: any = {};
  if (brandId) productWhere.brandId = Number(brandId);
  if (categoryId) productWhere.categoryId = Number(categoryId);

  const variants = await prisma.productVariant.findMany({
    where: { product: productWhere },
  });

  let updated = 0;
  for (const v of variants) {
    const oldValue = (v as any)[priceField] as number | null;
    if (oldValue == null) continue;
    const newValue = Math.round(oldValue * (1 + percent / 100) * 100) / 100;
    await prisma.$transaction([
      prisma.productVariant.update({ where: { id: v.id }, data: { [priceField]: newValue } }),
      prisma.priceHistory.create({
        data: { variantId: v.id, fieldChanged: historyField, oldValue, newValue },
      }),
    ]);
    updated++;
  }
  res.json({ updated });
});

export default router;
