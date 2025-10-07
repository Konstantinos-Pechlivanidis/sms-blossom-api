// scripts/migrate-pii-encryption.js
// Idempotent backfill script for PII encryption migration

import { prisma } from '../src/db/prismaClient.js';
import { encryptPII, decryptPII } from '../src/lib/encryption.js';
import { normalizePhone, normalizeEmail } from '../src/lib/normalization.js';
import { logger } from '../src/lib/logger.js';

const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');

async function migrateContacts() {
  let processed = 0;
  let encrypted = 0;
  let errors = 0;

  logger.info({ dryRun: DRY_RUN }, 'Starting PII encryption migration');

  try {
    while (true) {
      // Find contacts that need encryption (have plaintext but no ciphertext)
      const contacts = await prisma.contact.findMany({
        where: {
          AND: [{ phoneE164: { not: null } }, { phone_ciphertext: null }],
        },
        select: {
          id: true,
          shopId: true,
          phoneE164: true,
          email: true,
          phone_hash: true,
          phone_ciphertext: true,
          email_hash: true,
          email_ciphertext: true,
        },
        take: BATCH_SIZE,
      });

      if (contacts.length === 0) {
        break;
      }

      logger.info({ batchSize: contacts.length }, 'Processing batch');

      for (const contact of contacts) {
        try {
          const phoneE164 = contact.phoneE164;
          const email = contact.email;

          if (!phoneE164) {
            logger.warn({ contactId: contact.id }, 'Contact has no phone number');
            continue;
          }

          // Normalize data
          const normalizedPhone = normalizePhone(phoneE164);
          const normalizedEmail = email ? normalizeEmail(email) : null;

          if (!normalizedPhone) {
            logger.warn({ contactId: contact.id, phoneE164 }, 'Invalid phone number format');
            continue;
          }

          // Encrypt PII data
          const encryptedData = encryptPII(normalizedPhone, normalizedEmail);

          if (!DRY_RUN) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                phone_hash: encryptedData.phone_hash,
                phone_ciphertext: encryptedData.phone_ciphertext,
                phone_last4: encryptedData.phone_last4,
                email_hash: encryptedData.email_hash,
                email_ciphertext: encryptedData.email_ciphertext,
              },
            });
          }

          encrypted++;
          logger.debug(
            {
              contactId: contact.id,
              phoneLast4: encryptedData.phone_last4,
              hasEmail: !!normalizedEmail,
            },
            'Contact encrypted',
          );
        } catch (error) {
          errors++;
          logger.error(
            {
              error,
              contactId: contact.id,
              phoneE164: contact.phoneE164,
            },
            'Failed to encrypt contact',
          );
        }
      }

      processed += contacts.length;
      logger.info(
        {
          processed,
          encrypted,
          errors,
          dryRun: DRY_RUN,
        },
        'Migration progress',
      );
    }

    logger.info(
      {
        totalProcessed: processed,
        totalEncrypted: encrypted,
        totalErrors: errors,
        dryRun: DRY_RUN,
      },
      'PII encryption migration completed',
    );
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    throw error;
  }
}

async function verifyEncryption() {
  logger.info('Verifying encryption integrity');

  try {
    // Test decrypt a few records
    const testContacts = await prisma.contact.findMany({
      where: {
        phone_ciphertext: { not: null },
      },
      select: {
        id: true,
        phoneE164: true,
        phone_ciphertext: true,
        email: true,
        email_ciphertext: true,
      },
      take: 5,
    });

    for (const contact of testContacts) {
      try {
        if (contact.phone_ciphertext) {
          const decrypted = decryptPII({ phone_ciphertext: contact.phone_ciphertext });
          if (decrypted.phoneE164 !== contact.phoneE164) {
            logger.error(
              {
                contactId: contact.id,
                original: contact.phoneE164,
                decrypted: decrypted.phoneE164,
              },
              'Phone decryption mismatch',
            );
          } else {
            logger.debug({ contactId: contact.id }, 'Phone decryption verified');
          }
        }

        if (contact.email_ciphertext) {
          const decrypted = decryptPII({ email_ciphertext: contact.email_ciphertext });
          if (decrypted.email !== contact.email) {
            logger.error(
              {
                contactId: contact.id,
                original: contact.email,
                decrypted: decrypted.email,
              },
              'Email decryption mismatch',
            );
          } else {
            logger.debug({ contactId: contact.id }, 'Email decryption verified');
          }
        }
      } catch (error) {
        logger.error({ error, contactId: contact.id }, 'Decryption verification failed');
      }
    }

    logger.info('Encryption verification completed');
  } catch (error) {
    logger.error({ error }, 'Encryption verification failed');
    throw error;
  }
}

async function main() {
  try {
    if (DRY_RUN) {
      logger.info('DRY RUN MODE - No data will be modified');
    }

    await migrateContacts();

    if (!DRY_RUN) {
      await verifyEncryption();
    }

    logger.info('Migration script completed successfully');
  } catch (error) {
    logger.error({ error }, 'Migration script failed');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
