import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(
  readFileSync('/Users/abdul/Documents/Eastern Mills/FORMS/easternmillscom-0907945d2d73.json', 'utf8')
);

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function check() {
  const snap = await db.collection('Showroom_Products').limit(5).get();
  console.log('Showroom_Products sample size:', snap.size);
  
  if (snap.size > 0) {
    const first = snap.docs[0].data();
    console.log('\n=== First doc fields ===');
    console.log(Object.keys(first).join(', '));
    console.log('\n=== Sample values ===');
    for (const [key, val] of Object.entries(first)) {
      const preview = typeof val === 'string' ? val.substring(0, 100) : JSON.stringify(val)?.substring(0, 100);
      console.log(`${key}: ${preview}`);
    }
  }
  
  // Get total count
  const allSnap = await db.collection('Showroom_Products').count().get();
  console.log('\n=== TOTAL COUNT ===');
  console.log('Showroom_Products total:', allSnap.data().count);
}

check().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
