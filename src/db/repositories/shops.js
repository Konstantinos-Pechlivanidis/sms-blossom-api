import { getPrismaClient } from '../../db/prismaClient.js';
import { encryptToString } from '../../lib/crypto.js';

export async function findShopByDomain(domain) {
  const prisma = getPrismaClient();
  return prisma.shop.findUnique({ where: { domain } });
}

export async function upsertShopByDomain(domain, data) {
  const prisma = getPrismaClient();
  return prisma.shop.upsert({
    where: { domain },
    update: data,
    create: { domain, ...data },
  });
}

export async function saveOfflineToken(shopDomain, token) {
  const prisma = getPrismaClient();
  const encrypted = encryptToString(token);
  return prisma.shop.upsert({
    where: { domain: shopDomain },
    update: { tokenOffline: encrypted },
    create: { domain: shopDomain, tokenOffline: encrypted },
  });
}
