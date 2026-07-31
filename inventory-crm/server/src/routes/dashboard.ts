import { Router } from "express";
import { prisma, getSettings } from "../db";

const router = Router();

router.get("/summary", async (_req, res) => {
  const settings = await getSettings();
  const products = await prisma.product.findMany({
    where: { status: { not: "archived" } },
    include: { brand: true, category: true, variants: true },
  });

  let activeSkuCount = 0;
  let stockValueAtCost = 0;
  let stockValueAtRetail = 0;
  let lowStockCount = 0;
  let incompleteCount = 0;
  const byBrand = new Map<string, number>();
  const byCategory = new Map<string, number>();

  for (const p of products) {
    let productIncomplete = p.variants.length === 0;
    for (const v of p.variants) {
      if (!v.isActive) continue;
      activeSkuCount++;
      if (v.costPricePreVat != null) stockValueAtCost += v.costPricePreVat * v.currentStockQty;
      if (v.retailPrice != null) stockValueAtRetail += v.retailPrice * v.currentStockQty;
      if (v.currentStockQty <= v.lowStockThreshold) lowStockCount++;
      if (v.costPricePreVat == null || v.retailPrice == null || v.supplierId == null) productIncomplete = true;
    }
    if (productIncomplete) incompleteCount++;
    byBrand.set(p.brand.name, (byBrand.get(p.brand.name) ?? 0) + p.variants.length);
    byCategory.set(p.category.name, (byCategory.get(p.category.name) ?? 0) + p.variants.length);
  }

  res.json({
    productCount: products.length,
    activeSkuCount,
    stockValueAtCost: round2(stockValueAtCost),
    stockValueAtRetail: round2(stockValueAtRetail),
    lowStockCount,
    incompleteProductCount: incompleteCount,
    vatRate: settings.vatRate,
    byBrand: Array.from(byBrand, ([name, skuCount]) => ({ name, skuCount })).sort((a, b) => b.skuCount - a.skuCount),
    byCategory: Array.from(byCategory, ([name, skuCount]) => ({ name, skuCount })).sort((a, b) => b.skuCount - a.skuCount),
  });
});

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export default router;
