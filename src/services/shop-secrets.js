import { getPrismaClient } from '../db/prismaClient.js';
import { decryptFromString } from '../lib/crypto.js';

export async function getOfflineToken(shopDomain) {
  const prisma = getPrismaClient();
  const shop = await prisma.shop.findUnique({ where: { domain: shopDomain } });
  if (!shop?.tokenOffline) throw new Error('offline_token_missing');
  return decryptFromString(shop.tokenOffline);
}
