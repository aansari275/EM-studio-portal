#!/usr/bin/env node

/**
 * Delete all documents from heimtextil_products collection
 * (Data has been migrated to showroom_products)
 */

const BASE_URL = 'https://firestore.googleapis.com/v1/projects/easternmillscom/databases/(default)/documents';
const COLLECTION = 'heimtextil_products';

async function fetchAll() {
  const docs = [];
  let pageToken = null;

  do {
    const url = pageToken
      ? `${BASE_URL}/${COLLECTION}?pageSize=300&pageToken=${pageToken}`
      : `${BASE_URL}/${COLLECTION}?pageSize=300`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

async function deleteDoc(docPath) {
  // Extract collection and docId, then properly encode
  const parts = docPath.split('/');
  const docId = parts.pop();
  const encodedDocId = encodeURIComponent(docId);
  const basePath = parts.join('/');

  const url = `https://firestore.googleapis.com/v1/${basePath}/${encodedDocId}`;
  const response = await fetch(url, { method: 'DELETE' });
  return response.ok;
}

async function main() {
  console.log('\n🗑️  Deleting heimtextil_products collection...\n');
  console.log('─'.repeat(50));

  // Fetch all docs
  console.log('\nFetching documents...');
  const docs = await fetchAll();
  console.log(`Found ${docs.length} documents to delete\n`);

  if (docs.length === 0) {
    console.log('Collection is already empty!\n');
    return;
  }

  let deleted = 0;
  let errors = 0;

  for (const doc of docs) {
    const docId = doc.name.split('/').pop();
    const success = await deleteDoc(doc.name);

    if (success) {
      deleted++;
      process.stdout.write(`\r   Deleted: ${deleted}/${docs.length}`);
    } else {
      errors++;
    }
  }

  console.log('\n\n' + '─'.repeat(50));
  console.log('\n📋 Summary\n');
  console.log(`   ✅ Deleted: ${deleted}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log('\n✨ heimtextil_products collection cleared!\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
