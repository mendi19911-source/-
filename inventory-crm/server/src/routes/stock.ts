import { Router } from "express";
import { prisma } from "../db";
import { MOVEMENT_TYPES } from "../lib/enums";

const router = Router();

// Record a stock movement and apply it to the variant's current quantity.
// 'in' / 'out' expect a positive quantity (direction implied by type);
// 'adjustment' expects a signed delta (can be negative, e.g. for a stock count correction).
router.post("/movements", async (req, res) => {
  const { variantId, movementType, quantity, reason } = req.body ?? {};
  const userId = (req as any).session?.userId ?? null;

  if (!variantId) return res.status(400).json({ error: "חסר מזהה וריאציה" });
  if (!MOVEMENT_TYPES.includes(movementType)) return res.status(400).json({ error: "סוג תנועה לא תקין" });
  const qtyNum = Number(quantity);
  if (!Number.isFinite(qtyNum) || qtyNum === 0) return res.status(400).json({ error: "יש להזין כמות תקינה" });

  const variant = await prisma.productVariant.findUnique({ where: { id: Number(variantId) } });
  if (!variant) return res.status(404).json({ error: "וריאציה לא נמצאה" });

  let delta = qtyNum;
  if (movementType === "in") delta = Math.abs(qtyNum);
  if (movementType === "out") delta = -Math.abs(qtyNum);
  // 'adjustment' uses the signed value as given

  const newQty = variant.currentStockQty + delta;
  if (newQty < 0) {
    return res.status(400).json({ error: `הפעולה תגרום למלאי שלילי (${newQty}). מלאי נוכחי: ${variant.currentStockQty}` });
  }

  const [movement] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: { variantId: variant.id, movementType, quantity: delta, reason: reason || null, createdById: userId },
    }),
    prisma.productVariant.update({ where: { id: variant.id }, data: { currentStockQty: newQty } }),
  ]);

  res.status(201).json({ movement, newQty });
});

router.get("/movements", async (req, res) => {
  const { variantId } = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (variantId) where.variantId = Number(variantId);
  const movements = await prisma.stockMovement.findMany({
    where,
    include: {
      variant: { include: { product: true } },
      createdBy: { select: { id: true, username: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  res.json(movements);
});

router.get("/low-stock", async (_req, res) => {
  const variants = await prisma.productVariant.findMany({
    where: { isActive: true },
    include: { product: { include: { brand: true } }, supplier: true },
  });
  const low = variants
    .filter((v) => v.currentStockQty <= v.lowStockThreshold)
    .sort((a, b) => a.currentStockQty - b.currentStockQty);
  res.json(low);
});

export default router;
