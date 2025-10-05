import { getPrismaClient } from '../../db/prismaClient.js';

export async function upsertContact({ shopId, phoneE164, data }) {
  const prisma = getPrismaClient();
  return prisma.contact.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    update: data,
    create: { shopId, phoneE164, ...data },
  });
}

export async function markUnsubscribed({ shopId, phoneE164 }) {
  const prisma = getPrismaClient();
  return prisma.contact.update({
    where: { shopId_phoneE164: { shopId, phoneE164 } },
    data: { optedOut: true },
  });
}
