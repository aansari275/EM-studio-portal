import { describe, expect, it } from 'vitest';
import {
  BOTTOM, CONTENT_W, HERO_DOMINANCE, MARGIN, MIN_PHOTO, PAGE, TOP, arrange, fitInside, pdfText, planTearsheet,
  tearsheetFileName, tearsheetSpec, type Box,
} from './tearsheetLayout';

const inPage = (b: Box) =>
  b.x >= MARGIN - 1e-6 && b.x + b.w <= MARGIN + CONTENT_W + 1e-6 && b.y >= TOP - 1e-6 && b.y + b.h <= BOTTOM + 1e-6;
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
const ratio = (b: Box) => b.w / b.h;

describe('fitInside', () => {
  it('keeps the photo shape and stays inside', () => {
    const b = fitInside({ x: 0, y: 0, w: 100, h: 50 }, { w: 400, h: 400 }, 'center');
    expect(b).toEqual({ x: 25, y: 0, w: 50, h: 50 });
  });
});

describe('arrange', () => {
  it('lays a row at one height, keeping each shape', () => {
    const r = arrange({ x: 0, y: 0, w: 105, h: 200 }, [{ w: 1, h: 1 }, { w: 1, h: 1 }], 'row');
    expect(r).toHaveLength(2);
    expect(r[0].h).toBeCloseTo(50);
    expect(r[1].x).toBeCloseTo(55);
  });
  it('gives up rather than drawing a postage stamp', () => {
    expect(arrange({ x: 0, y: 0, w: 200, h: MIN_PHOTO - 1 }, [{ w: 1, h: 1 }], 'row')).toEqual([]);
  });
});

describe('planTearsheet', () => {
  const shapes = {
    room: { w: 1920, h: 1080 },
    portrait: { w: 1000, h: 1500 },
    square: { w: 1200, h: 1200 },
    landscapeRug: { w: 1500, h: 1000 },
  };

  for (const [name, hero] of Object.entries(shapes)) {
    for (const textH of [40, 95]) {
      it(`${name} hero, text ${textH}mm: everything on the page, no overlaps, shapes kept`, () => {
        const extras = [shapes.portrait, shapes.square];
        const p = planTearsheet(hero, extras, textH);
        expect(p.hero).not.toBeNull();
        const all = [p.hero!, ...p.photos];
        all.forEach((b) => expect(inPage(b)).toBe(true));
        expect(ratio(p.hero!)).toBeCloseTo(hero.w / hero.h, 6);
        p.photos.forEach((b, i) => expect(ratio(b)).toBeCloseTo(extras[i].w / extras[i].h, 6));
        const text = { ...p.text, h: textH };
        expect(inPage(text)).toBe(true);
        for (let i = 0; i < all.length; i++) {
          expect(overlap(all[i], text)).toBe(false);
          for (let j = i + 1; j < all.length; j++) expect(overlap(all[i], all[j])).toBe(false);
        }
        expect(p.photos.length).toBeGreaterThan(0);
      });
    }
  }

  it('a 16:9 room setting runs the full width', () => {
    const p = planTearsheet(shapes.room, [], 60);
    expect(p.mode).toBe('wide');
    expect(p.hero!.w).toBeCloseTo(CONTENT_W);
    expect(p.hero!.x).toBeCloseTo(MARGIN);
  });

  it('a portrait rug sits on the left with the text beside it', () => {
    const p = planTearsheet(shapes.portrait, [], 60);
    expect(p.mode).toBe('tall');
    expect(p.hero!.x).toBe(MARGIN);
    expect(p.text.x).toBeGreaterThan(p.hero!.x + p.hero!.w);
    expect(p.text.w).toBeGreaterThanOrEqual(60);
  });

  it('with no photo at all it still lays out the text', () => {
    const p = planTearsheet(null, [], 50);
    expect(p.mode).toBe('none');
    expect(p.hero).toBeNull();
    expect(p.photos).toEqual([]);
    expect(p.text.x + p.text.w).toBeLessThanOrEqual(PAGE.w - MARGIN);
  });

  it('the hero stays the main picture: no other photo near its size', () => {
    for (const hero of Object.values(shapes)) {
      for (const extra of [[shapes.landscapeRug], [shapes.square, shapes.landscapeRug], [shapes.room]]) {
        const p = planTearsheet(hero, extra, 70);
        const heroArea = p.hero!.w * p.hero!.h;
        p.photos.forEach((b) => expect(heroArea).toBeGreaterThanOrEqual(HERO_DOMINANCE * b.w * b.h - 1e-6));
      }
    }
  });

  it('only ever places two more photos', () => {
    const p = planTearsheet(shapes.room, [shapes.square, shapes.square, shapes.square], 40);
    expect(p.photos.length).toBeLessThanOrEqual(2);
  });
});

describe('tearsheetSpec', () => {
  it('skips empty fields and never invents one', () => {
    const rows = tearsheetSpec({ styleNumber: 'EM-17-AM-418', baseStyleNumber: 'EM-17-AM-418', color: ' ', size: '5x8', gsm: '' });
    expect(rows).toEqual([{ label: 'Size', value: '5x8' }]);
  });
  it('shows the design when the style is a colourway', () => {
    const rows = tearsheetSpec({ styleNumber: 'EM-17-AM-418-GREY', baseStyleNumber: 'EM-17-AM-418', color: 'Grey' });
    expect(rows.map((r) => r.label)).toEqual(['Design', 'Colour']);
  });
  it('has no price field even if one is on the record', () => {
    const rows = tearsheetSpec({ styleNumber: 'X', price: '100', profitINR: 5 } as never);
    expect(rows).toEqual([]);
  });
});

describe('text and file name', () => {
  it('pdfText keeps Latin 1 and drops long dashes', () => {
    expect(pdfText('Wool — Silk  ½')).toBe('Wool Silk ½');
  });
  it('file name', () => {
    expect(tearsheetFileName('EM-17-AM-418 / Grey')).toBe('Eastern_Mills_EM-17-AM-418_Grey_tearsheet.pdf');
    expect(tearsheetFileName('')).toBe('Eastern_Mills_rug_tearsheet.pdf');
  });
});
