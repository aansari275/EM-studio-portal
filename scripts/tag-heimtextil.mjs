#!/usr/bin/env node

/**
 * Tag all products with heimtextil storage URLs as "Heimtextil 2026"
 */

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
  console.log('\n🔄 Tagging untagged Heimtextil products...\n');
  console.log('─'.repeat(50));

  console.log('\nFetching showroom_products...');
  const docs = await fetchAll('showroom_products');
  console.log(`Found ${docs.length} total products\n`);

  let tagged = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of docs) {
    const fields = doc.fields || {};
    const json = JSON.stringify(fields);

    // Check if has heimtextil URL
    const hasHeimtextilUrl = json.includes('heimtextil/');
    const hasSourceTag = fields.source && fields.source.stringValue;

    if (hasHeimtextilUrl && !hasSourceTag) {
      // Tag it
      const newFields = {
        ...fields,
        source: { stringValue: 'Heimtextil 2026' },
        tags: { arrayValue: { values: [{ stringValue: 'Heimtextil 2026' }] } },
        taggedAt: { timestampValue: new Date().toISOString() },
      };

      const docId = doc.name.split('/').pop();
      const success = await updateDoc(doc.name, newFields);

      if (success) {
        tagged++;
        console.log(`   ✅ Tagged: ${docId}`);
      } else {
        errors++;
        console.log(`   ❌ Error: ${docId}`);
      }
    } else if (hasHeimtextilUrl) {
      skipped++;
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log('\n📋 Summary\n');
  console.log(`   ✅ Newly tagged: ${tagged}`);
  console.log(`   ⏭️  Already tagged: ${skipped}`);
  console.log(`   ❌ Errors: ${errors}`);
  console.log(`\n   Total Heimtextil 2026 products: ${tagged + skipped}`);
  console.log('\n✨ Done!\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
