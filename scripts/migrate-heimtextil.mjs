#!/usr/bin/env node

/**
 * Migration Script: heimtextil_products → showroom_products
 * Uses Firestore REST API
 *
 * Run with: node scripts/migrate-heimtextil.mjs
 */

const PROJECT_ID = 'easternmillscom';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const HEIMTEXTIL_COLLECTION = 'heimtextil_products';
const SHOWROOM_COLLECTION = 'showroom_products';

// Helper to parse Firestore value
function parseFirestoreValue(value) {
  if (!value) return null;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return parseInt(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue !== undefined) {
    return (value.arrayValue.values || []).map(parseFirestoreValue);
  }
  if (value.mapValue !== undefined) {
    const obj = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      obj[k] = parseFirestoreValue(v);
    }
    return obj;
  }
  if (value.nullValue !== undefined) return null;
  return value;
}

// Helper to convert JS value to Firestore value
function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return { integerValue: String(value) };
    return { doubleValue: value };
  }
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === 'object') {
    // Check if it's a timestamp
    if (value.seconds || value._seconds) {
      const seconds = value.seconds || value._seconds;
      const date = new Date(seconds * 1000);
      return { timestampValue: date.toISOString() };
    }
    const fields = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

// Fetch all documents from a collection
async function fetchCollection(collectionName) {
  const docs = [];
  let pageToken = null;

  do {
    const url = `${BASE_URL}/${collectionName}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.documents) {
      docs.push(...data.documents);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

// Check if document exists
async function docExists(collectionName, docId) {
  const url = `${BASE_URL}/${collectionName}/${docId}`;
  const response = await fetch(url);
  return response.ok;
}

// Get document
async function getDoc(collectionName, docId) {
  const url = `${BASE_URL}/${collectionName}/${docId}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  return await response.json();
}

// Create/update document
async function setDoc(collectionName, docId, fields) {
  const url = `${BASE_URL}/${collectionName}/${docId}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return response.ok;
}

async function migrate() {
  console.log('\n🔄 Starting Heimtextil → Showroom Migration\n');
  console.log('─'.repeat(50));

  // Step 1: Get Heimtextil products
  console.log('\n📊 Fetching heimtextil_products...\n');
  const heimtextilDocs = await fetchCollection(HEIMTEXTIL_COLLECTION);
  console.log(`   Found ${heimtextilDocs.length} documents in heimtextil_products`);

  if (heimtextilDocs.length === 0) {
    console.log('\n⚠️  No documents found. Nothing to migrate.\n');
    process.exit(0);
  }

  // Step 2: Migrate
  console.log('\n' + '─'.repeat(50));
  console.log('\n🚀 Migrating products...\n');

  let migrated = 0;
  let skipped = 0;
  let updated = 0;
  const errors = [];

  for (const doc of heimtextilDocs) {
    const docPath = doc.name;
    const docId = docPath.split('/').pop();
    const fields = doc.fields || {};

    try {
      // Check if exists in showroom
      const existingDoc = await getDoc(SHOWROOM_COLLECTION, docId);

      if (existingDoc && existingDoc.fields) {
        // Already exists - check if tagged
        if (existingDoc.fields.source) {
          skipped++;
          console.log(`   ⏭️  Skipped: ${docId} (already tagged)`);
          continue;
        }

        // Update with tag
        const updateFields = {
          ...existingDoc.fields,
          source: { stringValue: 'Heimtextil 2026' },
          tags: { arrayValue: { values: [{ stringValue: 'Heimtextil 2026' }] } },
          migratedAt: { timestampValue: new Date().toISOString() },
        };

        const success = await setDoc(SHOWROOM_COLLECTION, docId, updateFields);
        if (success) {
          updated++;
          console.log(`   ✏️  Updated: ${docId}`);
        } else {
          errors.push(`Failed to update ${docId}`);
        }
        continue;
      }

      // Create new document
      const newFields = {
        ...fields,
        source: { stringValue: 'Heimtextil 2026' },
        tags: { arrayValue: { values: [{ stringValue: 'Heimtextil 2026' }] } },
        migratedAt: { timestampValue: new Date().toISOString() },
      };

      // Ensure createdAt exists
      if (!newFields.createdAt) {
        newFields.createdAt = { timestampValue: new Date().toISOString() };
      }

      const success = await setDoc(SHOWROOM_COLLECTION, docId, newFields);
      if (success) {
        migrated++;
        console.log(`   ✅ Migrated: ${docId}`);
      } else {
        errors.push(`Failed to create ${docId}`);
      }

    } catch (error) {
      errors.push(`${docId}: ${error.message}`);
      console.log(`   ❌ Error: ${docId} - ${error.message}`);
    }
  }

  // Step 3: Summary
  console.log('\n' + '─'.repeat(50));
  console.log('\n📋 Migration Summary\n');
  console.log(`   ✅ Migrated: ${migrated}`);
  console.log(`   ✏️  Updated:  ${updated}`);
  console.log(`   ⏭️  Skipped:  ${skipped}`);
  console.log(`   ❌ Errors:   ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.slice(0, 10).forEach(err => console.log(`   - ${err}`));
  }

  // Final count
  const showroomDocs = await fetchCollection(SHOWROOM_COLLECTION);
  console.log(`\n📊 Final showroom_products count: ${showroomDocs.length}`);
  console.log('\n✨ Migration complete!\n');

  process.exit(0);
}

migrate().catch(err => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
