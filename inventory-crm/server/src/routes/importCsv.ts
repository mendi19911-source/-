import { Router } from "express";
import multer from "multer";
import { parseCsv, rowsToObjects } from "../lib/csv";
import { prisma } from "../db";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// System fields the user can map CSV columns to (see spec section 4.5).
export const IMPORT_FIELDS = [
  { key: "name", label: "שם מוצר", required: true },
  { key: "brand", label: "מותג (vendor)", required: false },
  { key: "category", label: "קטגוריה (product_type)", required: false },
  { key: "sku", label: "SKU", required: true },
  { key: "variantName", label: "שם וריאציה (למשל: variant_title)", required: false },
  { key: "retailPrice", label: "מחיר מכירה (variant price)", required: false },
  { key: "costPricePreVat", label: "מחיר עלות לפני מע\"מ", required: false },
  { key: "barcode", label: "ברקוד", required: false },
  { key: "imageUrl", label: "תמונה (image src)", required: false },
  { key: "sourceUrl", label: "קישור למוצר במקור", required: false },
  { key: "description", label: "תיאור", required: false },
] as const;

router.get("/template", (_req, res) => {
  const headers = "title,vendor,product_type,variant_sku,variant_title,variant_price,cost_price,barcode,image_src,description";
  const example =
    'שמפו לשיער מתולתל 250 מ"ל,Qarnette,מוצרי שיער,QRN-CURL-250,250 מ"ל,49.9,22,7290000000001,https://example.com/img.jpg,"שמפו לחות עמוקה, מתאים לשיער מתולתל"';
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="products_import_template.csv"');
  res.send("﻿" + headers + "\n" + example + "\n");
});

router.post("/parse", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "לא נשלח קובץ" });
  const text = req.file.buffer.toString("utf-8").replace(/^﻿/, "");
  const rows = parseCsv(text);
  if (rows.length === 0) return res.status(400).json({ error: "הקובץ ריק" });
  const { headers, records } = rowsToObjects(rows);
  res.json({ headers, records, fields: IMPORT_FIELDS });
});

// Groups rows by product name so a Shopify-style export (one row per variant) collapses
// into one product with multiple variants; brand/category are taken from any row in the group.
router.post("/commit", async (req, res) => {
  const { records, mapping, sourceStore } = req.body ?? {};
  if (!Array.isArray(records) || !mapping?.name || !mapping?.sku) {
    return res.status(400).json({ error: "מיפוי שדות חסר (שם מוצר / SKU)" });
  }

  const groups = new Map<string, any[]>();
  for (const r of records as Record<string, string>[]) {
    const name = (r[mapping.name] || "").trim();
    if (!name) continue;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(r);
  }

  const brandCache = new Map<string, number>();
  const categoryCache = new Map<string, number>();
  let productsCreated = 0;
  let variantsCreated = 0;
  let variantsUpdated = 0;
  const errors: string[] = [];

  for (const [name, rows] of groups) {
    try {
      const brandName = mapping.brand ? rows.map((r) => r[mapping.brand]).find((v) => v?.trim())?.trim() : undefined;
      const categoryName = mapping.category ? rows.map((r) => r[mapping.category]).find((v) => v?.trim())?.trim() : undefined;
      const description = mapping.description ? rows.map((r) => r[mapping.description]).find((v) => v?.trim())?.trim() : undefined;
      const sourceUrl = mapping.sourceUrl ? rows.map((r) => r[mapping.sourceUrl]).find((v) => v?.trim())?.trim() : undefined;

      const brandId = await resolveBrand(brandName, brandCache);
      const categoryId = await resolveCategory(categoryName, categoryCache);

      let product = await prisma.product.findFirst({ where: { name } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            name,
            brandId,
            categoryId,
            description: description || null,
            sourceUrl: sourceUrl || null,
            sourceStore: sourceStore || "other",
            status: "active",
          },
        });
        productsCreated++;
      }

      for (const row of rows) {
        const sku = (row[mapping.sku] || "").trim();
        if (!sku) {
          errors.push(`שורה במוצר "${name}" ללא SKU - דולגה`);
          continue;
        }
        const variantName = mapping.variantName ? row[mapping.variantName]?.trim() : "";
        const retailPrice = mapping.retailPrice ? toNumber(row[mapping.retailPrice]) : null;
        const costPricePreVat = mapping.costPricePreVat ? toNumber(row[mapping.costPricePreVat]) : null;
        const barcode = mapping.barcode ? row[mapping.barcode]?.trim() : null;
        const imageUrl = mapping.imageUrl ? row[mapping.imageUrl]?.trim() : null;

        const existing = await prisma.productVariant.findUnique({ where: { sku } });
        if (existing) {
          await prisma.productVariant.update({
            where: { sku },
            data: {
              variantName: variantName || existing.variantName,
              retailPrice: retailPrice ?? undefined,
              costPricePreVat: costPricePreVat ?? undefined,
              barcode: barcode || existing.barcode,
              imageUrl: imageUrl || existing.imageUrl,
            },
          });
          variantsUpdated++;
        } else {
          await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku,
              variantName: variantName || "ברירת מחדל",
              retailPrice,
              costPricePreVat,
              barcode: barcode || null,
              imageUrl: imageUrl || null,
              currentStockQty: 0,
            },
          });
          variantsCreated++;
        }
      }
    } catch (e: any) {
      errors.push(`שגיאה במוצר "${name}": ${e.message}`);
    }
  }

  res.json({ productsCreated, variantsCreated, variantsUpdated, errors });
});

async function resolveBrand(name: string | undefined, cache: Map<string, number>): Promise<number> {
  const key = (name || "לא מוגדר").trim();
  if (cache.has(key)) return cache.get(key)!;
  let brand = await prisma.brand.findUnique({ where: { name: key } });
  if (!brand) brand = await prisma.brand.create({ data: { name: key } });
  cache.set(key, brand.id);
  return brand.id;
}

async function resolveCategory(name: string | undefined, cache: Map<string, number>): Promise<number> {
  const key = (name || "כללי").trim();
  if (cache.has(key)) return cache.get(key)!;
  let category = await prisma.category.findFirst({ where: { name: key, parentId: null } });
  if (!category) category = await prisma.category.create({ data: { name: key } });
  cache.set(key, category.id);
  return category.id;
}

function toNumber(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default router;
