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

  const existingEmployees = await prisma.employee.count();
  if (existingEmployees === 0) {
    const [dana, yossi, michal] = await Promise.all([
      prisma.employee.create({ data: { name: "דנה כהן", role: "מוכרת" } }),
      prisma.employee.create({ data: { name: "יוסי לוי", role: "מחסנאי" } }),
      prisma.employee.create({ data: { name: "מיכל אברהם", role: "מנהלת חנות" } }),
    ]);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.task.createMany({
      data: [
        { title: "ספירת מלאי לקטגוריית עיצוב שיער", status: "todo", priority: "high", assigneeId: yossi.id, dueDate: tomorrow, position: 0 },
        { title: "לעדכן תמונות מוצר לשמפו הידרציה", status: "todo", priority: "low", assigneeId: dana.id, position: 1 },
        { title: "לבדוק הזמנה חדשה מספק Qarnette", status: "in_progress", priority: "medium", assigneeId: michal.id, dueDate: nextWeek, position: 0 },
        { title: "להשלים מחירי עלות למוצרים שיובאו", status: "in_progress", priority: "high", assigneeId: yossi.id, dueDate: yesterday, position: 1 },
        { title: "סידור מדפי תצוגה בכניסה לחנות", status: "done", priority: "medium", assigneeId: dana.id, completedAt: new Date(), position: 0 },
      ],
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
