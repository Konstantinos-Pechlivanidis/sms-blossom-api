import { randomUUID } from 'crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { getPrismaClient } from '../db/prismaClient.js';

const prisma = getPrismaClient();

// ---------- tiny CLI parser ----------
function parseArgs(argv) {
  const out = {
    contacts: 50,
    messages: 100,
    events: 10,
    optinRate: 0.7,
    dry: false,
    clear: false,
    yes: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const v = argv[i + 1];
    if (a === '--shop') {
      out.shop = v;
      i++;
    } else if (a === '--contacts') {
      out.contacts = Number(v);
      i++;
    } else if (a === '--messages') {
      out.messages = Number(v);
      i++;
    } else if (a === '--events') {
      out.events = Number(v);
      i++;
    } else if (a === '--optinRate') {
      out.optinRate = Number(v);
      i++;
    } else if (a === '--dry') {
      out.dry = true;
    } else if (a === '--clear') {
      out.clear = true;
    } else if (a === '--yes') {
      out.yes = true;
    }
  }
  return out;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function sample(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// Use an obviously non-real country code block for demo (+999) to avoid accidental SMS to real MSISDNs.
function genE164DemoPhone(i) {
  // +9995550xxxxx
  const suffix = String(10000 + (i % 90000));
  return `+9995550${suffix}`;
}

const FIRST = [
  'Maria',
  'Eleni',
  'Giannis',
  'Kostas',
  'Nikos',
  'Dimitris',
  'Eirini',
  'Sofia',
  'Petros',
  'Christos',
  'Anna',
  'Katerina',
  'Vasilis',
  'Giorgos',
  'Theodora',
];
const LAST = [
  'Papadopoulos',
  'Georgiou',
  'Nikolaou',
  'Pechlivanidis',
  'Ioannou',
  'Karagiannis',
  'Konstantinou',
  'Oikonomou',
  'Papanikolaou',
  'Christodoulou',
];

function genBody() {
  const bodies = [
    'Ευχαριστούμε για την παραγγελία! ✅',
    'Το καλάθι σου σε περιμένει — ολοκλήρωσε τώρα 🛒',
    "Η αποστολή σου είναι καθ' οδόν ✈️",
    'Καλώς ήρθες στα SMS! 🎉',
    'Έκπτωση -10% με τον κωδικό WELCOME10',
  ];
  return sample(bodies);
}

async function findShopByDomain(domain) {
  return prisma.shop.findUnique({ where: { domain } });
}

async function clearShopData(shopId) {
  await prisma.$transaction(async (tx) => {
    await tx.message.deleteMany({ where: { shopId } });
    await tx.event.deleteMany({ where: { shopId } });
    await tx.contact.deleteMany({ where: { shopId } });
  });
}

async function seedContacts(shopId, n, optinRate) {
  const created = [];
  for (let i = 0; i < n; i++) {
    const phoneE164 = genE164DemoPhone(Date.now() + i);
    const firstName = sample(FIRST);
    const lastName = sample(LAST);
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}+${randInt(1000, 9999)}@example.test`;
    const optedOut = Math.random() > optinRate; // true if NOT opted-in

    // Upsert on (shopId, phoneE164)
    const contact = await prisma.contact.upsert({
      where: { shopId_phoneE164: { shopId, phoneE164 } },
      update: { firstName, lastName, email, optedOut },
      create: { shopId, phoneE164, firstName, lastName, email, optedOut },
    });
    created.push(contact);
  }
  return created;
}

async function seedMessages(shopId, contacts, n) {
  const created = [];
  for (let i = 0; i < n; i++) {
    const c = sample(contacts);
    const statusPool = ['queued', 'sent', 'delivered', 'failed'];
    const status = sample(statusPool);
    const body = genBody();
    const kindPool = ['automation', 'campaign', 'system'];
    const kind = sample(kindPool);
    const triggerKeys = ['abandoned_checkout', 'welcome', 'back_in_stock', 'order_confirmation'];
    const triggerKey = kind === 'automation' ? sample(triggerKeys) : null;

    const msg = await prisma.message.create({
      data: {
        shopId,
        contactId: c?.id ?? null,
        body,
        provider: 'mitto',
        status,
        kind,
        triggerKey,
        metadata: {
          seeded: true,
          // Add timing info to metadata since we don't have separate timestamp fields
          ...(status !== 'queued' && {
            sentAt: new Date(Date.now() - randInt(1, 7) * 3600_000).toISOString(),
          }),
          ...(status === 'delivered' && { deliveredAt: new Date().toISOString() }),
          ...(status === 'failed' && {
            failedAt: new Date().toISOString(),
            errorCode: 'SEED_FAIL',
          }),
        },
      },
    });
    created.push(msg);
  }
  return created;
}

async function seedEvents(shopId, n) {
  const topics = ['orders/paid', 'orders/create', 'checkouts/update', 'fulfillments/update'];
  const created = [];
  for (let i = 0; i < n; i++) {
    const topic = sample(topics);
    const objectId = String(randInt(1000000, 9999999));
    const dedupeKey = `${shopId}:${topic}:${randomUUID()}`;
    const raw = { seeded: true, topic, objectId, ts: new Date().toISOString() };

    const evt = await prisma.event.create({
      data: { shopId, topic, objectId, raw, dedupeKey },
    });
    created.push(evt);
  }
  return created;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.shop) {
    console.error(
      'Usage: node src/scripts/seedShop.js --shop <shop-domain> [--contacts 50] [--messages 100] [--events 10] [--optinRate 0.7] [--clear] [--yes] [--dry]',
    );
    process.exit(1);
  }

  const shop = await findShopByDomain(args.shop);
  if (!shop) {
    console.error(`✖ Shop not found in DB: ${args.shop}. Install the app on that store first.`);
    process.exit(1);
  }

  console.log(`→ Target shop: ${args.shop} (id ${shop.id})`);
  console.log(
    `   Plan: contacts=${args.contacts}, messages=${args.messages}, events=${args.events}, optinRate=${args.optinRate}${args.clear ? ' [CLEAR BEFORE]' : ''}${args.dry ? ' [DRY RUN]' : ''}`,
  );

  if (args.clear && !args.dry && !args.yes) {
    const rl = readline.createInterface({ input, output });
    const ans = await rl.question(
      'This will DELETE contacts/messages/events for this shop. Type "yes" to continue: ',
    );
    rl.close();
    if (ans.trim().toLowerCase() !== 'yes') {
      console.log('Abort.');
      process.exit(0);
    }
  }

  if (args.clear && !args.dry) {
    console.log('… clearing shop data (contacts/messages/events)');
    await clearShopData(shop.id);
  }

  if (args.dry) {
    console.log('Dry run only — no writes performed.');
    process.exit(0);
  }

  const contacts = await seedContacts(shop.id, args.contacts, args.optinRate);
  const messages = await seedMessages(shop.id, contacts, args.messages);
  const events = await seedEvents(shop.id, args.events);

  console.log(
    `✓ Seed complete: ${contacts.length} contacts, ${messages.length} messages, ${events.length} events`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
