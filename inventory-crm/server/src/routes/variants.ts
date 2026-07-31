import { Router } from "express";
import { prisma, getSettings } from "../db";
import { computePricing } from "../lib/pricing";

const router = Router();

function withPricing(variant: any, vatRate: number) {
  return { ...variant, ...computePricing({ costPricePreVat: variant.costPricePreVat, retailPrice: variant.retailPrice, vatRate }) };
}

// Create a variant under a product. An initial stock quantity (if given) is recorded
// as a stock movement so the audit log always explains every unit on hand.
router.post("/", async (req, res) => {
  const {
    productId,
    sku,
    variantName,
    attributeType,
    barcode,
    costPricePreVat,
    retailPrice,
    lowStockThreshold,
    supplierId,
    imageUrl,
    initialStockQty,
  } = req.body ?? {};

  if (!productId) return res.status(400).json({ error: "חסר מזהה מוצר" });
  if (!sku || !String(sku).trim()) return res.status(400).json({ error: "יש להזין SKU" });
  if (!variantName || !String(variantName).trim()) return res.status(400).json({ error: "יש להזין שם וריאציה" });
  if (costPricePreVat != null && Number(costPricePreVat) < 0) return res.status(400).json({ error: "מחיר עלות לא יכול להיות שלילי" });
  if (retailPrice != null && Number(retailPrice) < 0) return res.status(400).json({ error: "מחיר מכירה לא יכול להיות שלילי" });

  try {
    const variant = await prisma.productVariant.create({
      data: {
        productId: Number(productId),
        sku: String(sku).trim(),
        variantName: String(variantName).trim(),
        attributeType: attributeType || null,
        barcode: barcode || null,
        costPricePreVat: costPricePreVat != null ? Number(costPricePreVat) : null,
        retailPrice: retailPrice != null ? Number(retailPrice) : null,
        lowStockThreshold: lowStockThreshold != null ? Number(lowStockThreshold) : 5,
        supplierId: supplierId ? Number(supplierId) : null,
        imageUrl: imageUrl || null,
        currentStockQty: 0,
      },
    });

    const qty = Number(initialStockQty) || 0;
    if (qty > 0) {
      await prisma.$transaction([
        prisma.stockMovement.create({
          data: { variantId: variant.id, movementType: "in", quantity: qty, reason: "מלאי פתיחה" },
        }),
        prisma.productVariant.update({ where: { id: variant.id }, data: { currentStockQty: qty } }),
      ]);
    }

    const settings = await getSettings();
    const fresh = await prisma.productVariant.findUnique({ where: { id: variant.id } });
    res.status(201).json(withPricing(fresh, settings.vatRate));
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "קיים כבר SKU זהה" });
    throw e;
  }
});

// Update variant fields. Stock quantity is intentionally NOT editable here —
// use POST /api/stock/movements so every change is logged with a reason.
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { sku, variantName, attributeType, barcode, costPricePreVat, retailPrice, lowStockThreshold, supplierId, imageUrl, isActive } =
    req.body ?? {};

  const existing = await prisma.productVariant.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: "וריאציה לא נמצאה" });

  const historyEntries: { fieldChanged: string; oldValue: number | null; newValue: number | null }[] = [];
  if (costPricePreVat !== undefined && Number(costPricePreVat) !== existing.costPricePreVat) {
    historyEntries.push({ fieldChanged: "cost_price", oldValue: existing.costPricePreVat, newValue: costPricePreVat });
  }
  if (retailPrice !== undefined && Number(retailPrice) !== existing.retailPrice) {
    historyEntries.push({ fieldChanged: "retail_price", oldValue: existing.retailPrice, newValue: retailPrice });
  }

  try {
    const [variant] = await prisma.$transaction([
      prisma.productVariant.update({
        where: { id },
        data: {
          sku,
          variantName,
          attributeType,
          barcode,
          costPricePreVat: costPricePreVat != null ? Number(costPricePreVat) : costPricePreVat,
          retailPrice: retailPrice != null ? Number(retailPrice) : retailPrice,
          lowStockThreshold: lowStockThreshold != null ? Number(lowStockThreshold) : undefined,
          supplierId: supplierId !== undefined ? (supplierId ? Number(supplierId) : null) : undefined,
          imageUrl,
          isActive,
        },
      }),
      ...historyEntries.map((h) => prisma.priceHistory.create({ data: { variantId: id, ...h } })),
    ]);
    const settings = await getSettings();
    res.json(withPricing(variant, settings.vatRate));
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "קיים כבר SKU זהה" });
    if (e.code === "P2025") return res.status(404).json({ error: "וריאציה לא נמצאה" });
    throw e;
  }
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await prisma.productVariant.delete({ where: { id } }).catch(() => {});
  res.json({ ok: true });
});

export default router;
