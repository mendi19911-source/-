import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export async function getSettings() {
  let settings = await prisma.settings.findFirst();
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
}
