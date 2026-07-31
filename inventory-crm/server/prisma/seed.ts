import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminUsername = process.env.SEED_ADMIN_USERNAME || "admin";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";

  const existingUser = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existingUser) {
    await prisma.user.create({
      data: { username: adminUsername, passwordHash: await bcrypt.hash(adminPassword, 10), role: "admin" },
    });
    console.log(`Created admin user "${adminUsername}" (change the password after first login).`);
  }

  const existingSettings = await prisma.settings.findFirst();
  if (!existingSettings) {
    await prisma.settings.create({ data: { vatRate: 0.18, currency: "ILS" } });
  }

  const brand = await upsertBrand("Qarnette", "qarnette");
  const category = await upsertCategory("מוצרי שיער");
  const subCategory = await upsertCategory("עיצוב השיער", category.id);

  const existingProduct = await prisma.product.findFirst({ where: { name: "שמפו הידרציה עמוקה" } });
  if (!existingProduct) {
    const product = await prisma.product.create({
      data: {
        name: "שמפו הידרציה עמוקה",
        brandId: brand.id,
        categoryId: subCategory.id,
        description: "שמפו לחות עמוקה, מתאים לשיער יבש ומתולתל",
        hairTypeTags: JSON.stringify(["יבש", "מתולתל"]),
        sourceStore: "qarnette",
        status: "active",
      },
    });
    await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: "QRN-HYDRA-250",
        variantName: '250 מ"ל',
        attributeType: "גודל",
        costPricePreVat: 22,
        retailPrice: 49.9,
        currentStockQty: 40,
        lowStockThreshold: 10,
      },
    });
  }

  console.log("Seed complete.");
}

async function upsertBrand(name: string, sourceStore?: string) {
  const existing = await prisma.brand.findUnique({ where: { name } });
  if (existing) return existing;
  return prisma.brand.create({ data: { name, sourceStore } });
}

async function upsertCategory(name: string, parentId: number | null = null) {
  const existing = await prisma.category.findFirst({ where: { name, parentId } });
  if (existing) return existing;
  return prisma.category.create({ data: { name, parentId } });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
