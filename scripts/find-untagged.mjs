#!/usr/bin/env node

const BASE_URL = 'https://firestore.googleapis.com/v1/projects/easternmillscom/databases/(default)/documents';

async function fetchAll(collection) {
  const docs = [];
  let pageToken = null;

  do {
    const url = pageToken
      ? `${BASE_URL}/${collection}?pageSize=300&pageToken=${pageToken}`
      : `${BASE_URL}/${collection}?pageSize=300`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.documents) docs.push(...data.documents);
    pageToken = data.nextPageToken;
  } while (pageToken);

  return docs;
}

async function updateDoc(docPath, fields) {
  const url = `https://firestore.googleapis.com/v1/${docPath}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return response.ok;
}

async function main() {
  console.log('\n🔍 Finding untagged Heimtextil products...\n');

  const docs = await fetchAll('showroom_products');
  console.log(`Scanned ${docs.length} products\n`);

  // Find untagged heimtextil products
  const untagged = [];

  for (const doc of docs) {
    const fields = doc.fields || {};
    const json = JSON.stringify(fields).toLowerCase();

    const hasHeimtextilUrl = json.includes('heimtex');
    const hasSourceTag = fields.source && fields.source.stringValue;

    if (hasHeimtextilUrl && (hasSourceTag === undefined || hasSourceTag === null || hasSourceTag === '')) {
      const docId = doc.name.split('/').pop();
      untagged.push({ id: docId, doc, fields });
    }
  }

  console.log(`Found ${untagged.length} untagged Heimtextil products\n`);

  if (untagged.length === 0) {
    console.log('✅ All Heimtextil products are already tagged!\n');
    return;
  }

  console.log('Tagging them now...\n');

  let tagged = 0;
  let errors = 0;

  for (const { id, doc, fields } of untagged) {
    const newFields = {
      ...fields,
      source: { stringValue: 'Heimtextil 2026' },
      tags: { arrayValue: { values: [{ stringValue: 'Heimtextil 2026' }] } },
      taggedAt: { timestampValue: new Date().toISOString() },
    };

    const success = await updateDoc(doc.name, newFields);

    if (success) {
      tagged++;
      console.log(`   ✅ Tagged: ${id}`);
    } else {
      errors++;
      console.log(`   ❌ Error: ${id}`);
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`\n📋 Tagged ${tagged} products, ${errors} errors\n`);
}

main().catch(console.error);
