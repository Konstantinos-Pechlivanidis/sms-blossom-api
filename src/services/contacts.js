import { getPrismaClient } from '../db/prismaClient.js';

export async function upsertContact({ shopId, phoneE164, data }) {
  const prisma = getPrismaClient();
  return prisma.contact.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    update: data,
    create: { shopId, phoneE164, ...data },
  });
}

export async function upsertContactByPhone({
  shopId,
  phoneE164,
  customerId,
  state,
  source: _source,
}) {
  const prisma = getPrismaClient();
  return prisma.contact.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    create: {
      shopId,
      phoneE164,
      // Map to existing schema fields: optedOut boolean
      optedOut: state !== 'SUBSCRIBED',
      customerId: customerId || null,
    },
    update: {
      optedOut: state !== 'SUBSCRIBED',
      customerId: customerId || undefined,
    },
  });
}

export async function findShopByDomain(shopDomain) {
  const prisma = getPrismaClient();
  return prisma.shop.findUnique({ where: { domain: shopDomain } });
}
