import { doc, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Dropdown choices for the New design form.
 *
 * The defaults are the values that actually recur in the em_products archive,
 * tidied. Anything the studio adds with "+ Add new" is saved to
 * config/studio_options so it is offered to everyone from then on.
 */
export type OptionKind = 'constructions' | 'materials' | 'sizes';

export const DEFAULT_OPTIONS: Record<OptionKind, string[]> = {
  constructions: [
    'Hand Knotted', 'Hand Tufted', 'Hand Woven', 'Handloom', 'Handloom Tuft',
    'Loom Knotted', 'Indo Nepali', 'Nepali', 'Pitloom', 'Broadloom', 'Jacquard', 'Machine Made',
  ],
  materials: [
    'Wool', 'NZ Wool', 'Merino Wool', 'Afghan Wool', 'Hand Carded Wool', 'Cashmere',
    'Real Silk', 'Bamboo Silk', 'Viscose', 'Tencel', 'Cotton', 'Cotton Chindi', 'Jute',
    'Hemp', 'Linen', 'Mohair', 'Alpaca', 'PET',
  ],
  sizes: [
    '2x3 ft', '3x5 ft', '4x6 ft', '5x8 ft', '6x9 ft', '8x10 ft', '9x12 ft', '10x14 ft',
    '27x18 in', '60x90 cm', '160x230 cm', '200x300 cm',
  ],
};

const REF = () => doc(db, 'config', 'studio_options');

export async function getStudioOptions(): Promise<Record<OptionKind, string[]>> {
  let saved: Partial<Record<OptionKind, string[]>> = {};
  try {
    saved = ((await getDoc(REF())).data() as any) || {};
  } catch {
    /* offline or blocked: the defaults are still a usable form */
  }
  const merge = (k: OptionKind) => {
    const seen = new Set<string>();
    return [...DEFAULT_OPTIONS[k], ...(saved[k] || [])].filter((v) => {
      const key = v.trim().toLowerCase();
      return key && !seen.has(key) && (seen.add(key), true);
    });
  };
  return { constructions: merge('constructions'), materials: merge('materials'), sizes: merge('sizes') };
}

export async function addStudioOption(kind: OptionKind, value: string): Promise<void> {
  const v = value.trim();
  if (!v) return;
  await setDoc(REF(), { [kind]: arrayUnion(v) }, { merge: true });
}
