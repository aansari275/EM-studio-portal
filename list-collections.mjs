import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('/Users/abdul/Documents/Eastern Mills/FORMS/easternmillscom-0907945d2d73.json', 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function listCollections() {
  const collections = await db.listCollections();
  console.log('=== All Collections ===');
  for (const col of collections) {
    const countSnap = await col.count().get();
    const count = countSnap.data().count;
    console.log(col.id + ': ' + count + ' docs');
  }
}

listCollections().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
