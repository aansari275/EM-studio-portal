import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deliver, takeDeliveries, clearDeliveries, sentNote, type Delivery } from './sendTo';
import { appendDesignPhotos, specsAsEdited, type DesignIO } from './designAppend';
import { heroImage } from './img';
import type { ShowroomProduct } from './firebase';

describe('deliveries', () => {
  beforeEach(clearDeliveries);

  it('are taken once, by their own destination only', () => {
    const a: Delivery = { id: 'a', to: 'custom-rug', entryId: 'e1', isNew: true, slots: [] };
    const b: Delivery = { id: 'b', to: 'sample-dispatch', entryId: 'e2', isNew: false, slots: [] };
    deliver(a); deliver(b);
    expect(takeDeliveries('custom-rug')).toEqual([a]);
    expect(takeDeliveries('custom-rug')).toEqual([]);
    expect(takeDeliveries('sample-dispatch')).toEqual([b]);
  });

  it('describe where a photo went', () => {
    const d = new Date(2026, 10, 22);
    expect(sentNote('custom-rug', 'ABC ITALIA AMINI', d)).toBe('Sent to Custom Rugs, ABC ITALIA AMINI, 22 Nov');
    expect(sentNote('library', 'EM-26-MA-7420', d)).toBe('Sent to Library, EM-26-MA-7420, 22 Nov');
    expect(sentNote('sample-dispatch', '', d)).toBe('Sent to Sample Dispatch, 22 Nov');
  });
});

// A design whose stored hero is a close-up while main.jpg sits in the extras,
// the common case heroImage() exists for.
const design = (over: Partial<ShowroomProduct> = {}): ShowroomProduct => ({
  id: 'em-26-ma-7420',
  styleNumber: 'EM-26-MA-7420',
  baseStyleNumber: 'EM-26-MA-7420',
  displayName: 'EM-26-MA-7420',
  firebaseUrl: 'https://x/products/em-26-ma-7420/image-2.jpg',
  additionalImages: ['https://x/products/em-26-ma-7420/main.jpg', 'https://x/products/em-26-ma-7420/image-3.jpg'],
  construction: 'Hand Knotted', materials: 'Wool,  Silk', color: 'Ivory', size: '8x10', gsm: '',
  ...over,
} as ShowroomProduct);

const file = (n: string) => new File([new Uint8Array([1, 2, 3])], n, { type: 'image/png' });

function fakeIO(p: ShowroomProduct, failOn: string[] = []) {
  const calls: string[] = [];
  const io: DesignIO = {
    fresh: vi.fn(async () => { calls.push('fresh'); return p; }),
    upload: vi.fn(async (_p, files: File[]) => {
      calls.push(`upload ${files[0].name}`);
      if (failOn.includes(files[0].name)) throw new Error('network');
      return [`https://x/products/em-26-ma-7420/edit-${files[0].name}`];
    }),
    update: vi.fn(async (q, e) => {
      calls.push('update');
      const [hero, ...rest] = e.photos;
      return { ...q, firebaseUrl: hero, additionalImages: rest, heroPinned: true };
    }),
  };
  return { io, calls };
}

describe('appendDesignPhotos (Send to Library, existing design)', () => {
  it('writes once, the old photos in heroImage order then the new ones, specs unchanged', async () => {
    const p = design();
    const { io, calls } = fakeIO(p);
    const seen: [number, string | undefined][] = [];
    const out = await appendDesignPhotos(p, [file('a.png'), file('b.png')], io, (i, err) => seen.push([i, err]));
    expect(calls).toEqual(['fresh', 'upload a.png', 'upload b.png', 'update']);
    const edit = (io.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(edit.photos).toEqual([
      'https://x/products/em-26-ma-7420/main.jpg',
      'https://x/products/em-26-ma-7420/image-2.jpg',
      'https://x/products/em-26-ma-7420/image-3.jpg',
      'https://x/products/em-26-ma-7420/edit-a.png',
      'https://x/products/em-26-ma-7420/edit-b.png',
    ]);
    expect(edit).toMatchObject({ ...specsAsEdited(p), materials: 'Wool, Silk' });
    // the main photo is the one heroImage() chose before
    expect(heroImage(out.product)).toBe(heroImage(p));
    expect(out.failed).toEqual([]);
    expect(seen).toEqual([[0, undefined], [1, undefined]]);
  });

  it('a failed photo is reported and the rest still go through', async () => {
    const p = design();
    const { io } = fakeIO(p, ['b.png']);
    const seen: [number, string | undefined][] = [];
    const out = await appendDesignPhotos(p, [file('a.png'), file('b.png'), file('c.png')], io, (i, err) => seen.push([i, err]));
    expect(out.failed).toEqual([1]);
    const edit = (io.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(edit.photos.slice(-2)).toEqual(['https://x/products/em-26-ma-7420/edit-a.png', 'https://x/products/em-26-ma-7420/edit-c.png']);
    expect(seen).toContainEqual([1, 'network']);
  });

  it('writes nothing when no photo uploaded', async () => {
    const p = design();
    const { io } = fakeIO(p, ['a.png']);
    const out = await appendDesignPhotos(p, [file('a.png')], io);
    expect(io.update).not.toHaveBeenCalled();
    expect(out.failed).toEqual([0]);
  });

  it('keeps a pinned hero first', async () => {
    const p = design({ heroPinned: true });
    const { io } = fakeIO(p);
    await appendDesignPhotos(p, [file('a.png')], io);
    const edit = (io.update as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(edit.photos[0]).toBe('https://x/products/em-26-ma-7420/image-2.jpg');
  });
});
