import { PrismaClient } from '@prisma/client';

let prismaClientSingleton;

export function getPrismaClient() {
  if (!prismaClientSingleton) {
    prismaClientSingleton = new PrismaClient();
  }
  return prismaClientSingleton;
}

export async function checkDatabaseHealthy() {
  const prisma = getPrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectPrisma() {
  if (prismaClientSingleton) {
    await prismaClientSingleton.$disconnect();
  }
}
