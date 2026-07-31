import { Router } from "express";
import { getSettings, prisma } from "../db";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await getSettings());
});

router.put("/", async (req, res) => {
  const { vatRate, currency } = req.body ?? {};
  if (vatRate != null && (Number(vatRate) < 0 || Number(vatRate) > 1)) {
    return res.status(400).json({ error: "שיעור מע\"מ חייב להיות בין 0 ל-1 (למשל 0.18)" });
  }
  const current = await getSettings();
  const updated = await prisma.settings.update({
    where: { id: current.id },
    data: { vatRate: vatRate != null ? Number(vatRate) : undefined, currency },
  });
  res.json(updated);
});

export default router;
