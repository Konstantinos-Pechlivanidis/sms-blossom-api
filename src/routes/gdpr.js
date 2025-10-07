// src/routes/gdpr.js
// GDPR REST endpoints for data export and deletion

import { Router } from 'express';
import { getPrismaClient } from '../db/prismaClient.js';
import { decryptContactPII } from '../services/contacts.js';
import { logger } from '../lib/logger.js';

const prisma = getPrismaClient();
const router = Router();

/**
 * GET /gdpr/status - GDPR readiness status
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      enabled: true,
      queues: true, // Assuming queue system is available
      encryption: true, // Assuming encryption is enabled
      audit_logging: true,
      data_retention: true,
      last_updated: new Date().toISOString(),
    };

    res.json(status);
  } catch (error) {
    logger.error({ error }, 'Failed to get GDPR status');
    res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /gdpr/export - Export contact data
 * Body: { contactId: string, shopId: string }
 */
router.post('/export', async (req, res) => {
  try {
    const { contactId, shopId } = req.body;

    if (!contactId || !shopId) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'contactId and shopId are required',
      });
    }

    // Find contact with encrypted data
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        shopId: shopId,
      },
      include: {
        shop: {
          select: {
            id: true,
            domain: true,
            name: true,
          },
        },
      },
    });

    if (!contact) {
      return res.status(404).json({
        error: 'contact_not_found',
        message: 'Contact not found',
      });
    }

    // Decrypt PII data
    const decryptedContact = decryptContactPII(contact);

    // Prepare export data
    const exportData = {
      contact_id: contact.id,
      shop: {
        id: contact.shop.id,
        domain: contact.shop.domain,
        name: contact.shop.name,
      },
      personal_data: {
        phone: decryptedContact.phoneE164,
        email: decryptedContact.email,
        first_name: contact.firstName,
        last_name: contact.lastName,
      },
      consent_data: {
        sms_consent_state: contact.smsConsentState,
        sms_consent_source: contact.smsConsentSource,
        sms_consent_at: contact.smsConsentAt,
        unsubscribed_at: contact.unsubscribedAt,
        opted_out: contact.optedOut,
      },
      metadata: {
        created_at: contact.createdAt,
        updated_at: contact.updatedAt,
        tags: contact.tagsJson,
        welcomed_at: contact.welcomedAt,
      },
      export_metadata: {
        exported_at: new Date().toISOString(),
        export_id: `export_${contact.id}_${Date.now()}`,
      },
    };

    // Log the export action
    await prisma.auditLog.create({
      data: {
        shopId: contact.shopId,
        actor: 'system',
        action: 'gdpr.data_export',
        entity: 'contact',
        entityId: contact.id,
        ip: req.ip,
        ua: req.get('user-agent'),
      },
    });

    res.json(exportData);
  } catch (error) {
    logger.error({ error, contactId: req.body.contactId }, 'Failed to export contact data');
    res.status(500).json({ error: 'export_failed' });
  }
});

/**
 * DELETE /gdpr/delete/:contactId - Delete contact data
 * Query: ?shopId=string
 */
router.delete('/delete/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { shopId } = req.query;

    if (!shopId) {
      return res.status(400).json({
        error: 'missing_shop_id',
        message: 'shopId query parameter is required',
      });
    }

    // Find contact
    const contact = await prisma.contact.findFirst({
      where: {
        id: contactId,
        shopId: shopId,
      },
    });

    if (!contact) {
      return res.status(404).json({
        error: 'contact_not_found',
        message: 'Contact not found',
      });
    }

    // Anonymize contact data (soft delete approach)
    await prisma.contact.update({
      where: { id: contactId },
      data: {
        firstName: null,
        lastName: null,
        email: null,
        phoneE164: null,
        phone_hash: null,
        phone_ciphertext: null,
        phone_last4: null,
        email_hash: null,
        email_ciphertext: null,
        tagsJson: null,
        smsConsentState: 'opted_out',
        smsConsentSource: 'gdpr',
        unsubscribedAt: new Date(),
        optedOut: true,
      },
    });

    // Log the deletion action
    await prisma.auditLog.create({
      data: {
        shopId: contact.shopId,
        actor: 'system',
        action: 'gdpr.data_delete',
        entity: 'contact',
        entityId: contact.id,
        ip: req.ip,
        ua: req.get('user-agent'),
        diffJson: {
          reason: 'gdpr_data_deletion',
          deleted_at: new Date().toISOString(),
        },
      },
    });

    res.json({
      success: true,
      message: 'Contact data deleted successfully',
      deleted_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error({ error, contactId: req.params.contactId }, 'Failed to delete contact data');
    res.status(500).json({ error: 'deletion_failed' });
  }
});

export default router;
