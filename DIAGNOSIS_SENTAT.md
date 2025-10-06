# DIAGNOSIS: sentAt Column Mismatch

## 1. OCCURRENCES FOUND

### A) Prisma Client Queries (model.field) - **PROBLEMATIC**

**File: `src/services/reports.js`**

- Line 12: `sentAt: { gte: from, lt: to }`
- Line 13: `deliveredAt: { gte: from, lt: to }`
- Line 14: `failedAt: { gte: from, lt: to }`
- Line 21: `sentAt: { gte: from, lt: to }`
- Line 128: `sentAt: { gte: from, lt: to }`
- Line 173: `sentAt: { gte: from, lt: to }`
- Line 175: `sentAt: true`

### B) Raw SQL Queries - **CRITICAL ISSUE**

**File: `src/services/reports.js`**

- Line 201: `date_trunc('day', "sentAt") AS day`
- Line 208: `AND "sentAt" >= ${from} AND "sentAt" < ${to}`

### C) Metadata Usage (Safe)

**File: `src/scripts/seedShop.js`**

- Lines 161, 163, 165: Used in `metadata` JSON field (safe)

## 2. PRISMA SCHEMA ANALYSIS

**Model: `Message`**

```prisma
model Message {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  shopId    String
  contactId String?
  body      String
  provider  String
  status    String
  metadata  Json?
  kind      String  @default("automation")
  triggerKey String?
}
```

**CRITICAL FINDING**: The Message model has **NO** `sentAt`, `deliveredAt`, or `failedAt` fields defined!

## 3. DATABASE REALITY (from migrations)

**Initial Migration (`20251003073949_prisma_init`):**

```sql
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "shopId" TEXT NOT NULL,
    "contactId" TEXT,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "metadata" JSONB
);
```

**CRITICAL FINDING**: The database has **NO** `sentAt`, `deliveredAt`, or `failedAt` columns!

## 4. ROOT CAUSE ANALYSIS

### **PRIMARY ISSUE**: Code references non-existent fields

1. **Prisma Client queries** in `reports.js` reference `sentAt`, `deliveredAt`, `failedAt` fields that don't exist in the schema
2. **Raw SQL queries** reference `"sentAt"` column that doesn't exist in the database
3. **Schema mismatch**: The Prisma model doesn't define these timestamp fields

### **SECONDARY ISSUE**: Inconsistent data storage

- The seed script stores timing data in `metadata` JSON field
- The reports code expects dedicated timestamp columns
- No migration was created to add these columns

## 5. OFFENDING QUERIES

### **Critical Raw SQL (Line 201, 208 in reports.js):**

```sql
SELECT date_trunc('day', "sentAt") AS day
FROM "Message"
WHERE "shopId" = ${shopId}
  AND "sentAt" >= ${from} AND "sentAt" < ${to}
```

### **Critical Prisma Queries (Lines 12-14, 21, 128, 173, 175 in reports.js):**

```javascript
const whereSent = { shopId, sentAt: { gte: from, lt: to } };
const whereDelivered = { shopId, deliveredAt: { gte: from, lt: to } };
const whereFailed = { shopId, failedAt: { gte: from, lt: to } };
```

## 6. FIX PLAN

### **OPTION A: RECOMMENDED - Add Missing Fields**

#### **Step 1: Update Prisma Schema**

```prisma
model Message {
  // ... existing fields ...
  sentAt      DateTime?
  deliveredAt DateTime?
  failedAt    DateTime?
  cost        Decimal? @db.Decimal(10,4)
}
```

#### **Step 2: Create Migration**

```sql
ALTER TABLE "Message" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "deliveredAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "failedAt" TIMESTAMP(3);
ALTER TABLE "Message" ADD COLUMN "cost" DECIMAL(10,4);
```

#### **Step 3: Update Seed Script**

Move timing data from `metadata` to actual fields:

```javascript
// Instead of storing in metadata:
metadata: {
  seeded: true,
  sentAt: new Date(...).toISOString(),
  // ...
}

// Store in actual fields:
sentAt: status !== 'queued' ? new Date(...) : null,
deliveredAt: status === 'delivered' ? new Date() : null,
failedAt: status === 'failed' ? new Date() : null,
```

### **OPTION B: NOT RECOMMENDED - Remove Field References**

- Remove all `sentAt`, `deliveredAt`, `failedAt` references
- Use only `metadata` JSON field for timing data
- Modify reports to parse JSON metadata
- **Why not recommended**: Poor query performance, no indexing, complex queries

## 7. CHECKLIST FOR FIX

### **Files to Modify:**

1. **`prisma/schema.prisma`** - Add missing fields
2. **`src/services/reports.js`** - Update raw SQL to use correct column names
3. **`src/scripts/seedShop.js`** - Move timing data to actual fields
4. **Create new migration** - Add columns to database

### **Specific Changes:**

- **reports.js line 201**: Change `"sentAt"` to `"sentAt"` (after migration)
- **reports.js line 208**: Change `"sentAt"` to `"sentAt"` (after migration)
- **reports.js lines 12-14, 21, 128, 173, 175**: Keep as-is (will work after schema update)
- **seedShop.js lines 161, 163, 165**: Move from metadata to actual fields

## 8. SUMMARY

- **Offending locations**: 7 files, 15+ lines
- **Files to touch**: 4 files
- **Recommended fix**: Option A (add missing fields)
- **Root cause**: Schema and database missing timestamp fields that code expects
- **Impact**: Reports functionality completely broken due to non-existent columns
