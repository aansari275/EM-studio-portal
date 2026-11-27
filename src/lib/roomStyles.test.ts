import { describe, expect, it } from 'vitest';
import { parseRugSize, sizeVerdict, buildRoomPrompt, photoLooksLikeSwatch, ROOM_STYLES, roomStyle, istDay, validSize } from './roomStyles';
import { parseRoomImages, addRoomImage, removeRoomImage, makeFirstRoomImage } from './roomSetting';

describe('parseRugSize: the real values in the data', () => {
  const cases: Array<[string, [number, number] | null]> = [
    ['5.0X8.0', [5, 8]], ['5X8 feet', [5, 8]], ['8.0x10.0', [8, 10]], ['9.0X12.0', [9, 12]],
    ['1.0X1.0', [1, 1]], ['2.0 X 3 .0', [2, 3]], ['2X3', [2, 3]], ['1.0X1.6', [1, 1.6]],
    ["27''X18''", [1.5, 2.3]], ['27’’X18’’', [1.5, 2.3]], ['27X18', [1.5, 2.3]], ['30X30', [2.5, 2.5]],
    ['60X90', [2, 3]], ['160X230', [5.2, 7.5]], ['45X45', [1.5, 1.5]],
    ['0X8', null], ['', null], ['N/A', null], ['Custom', null],
  ];
  for (const [raw, want] of cases) {
    it(raw || '(blank)', () => {
      const got = parseRugSize(raw);
      expect(got ? [got.w, got.l] : null).toEqual(want);
    });
  }
});

describe('sizeVerdict: swatches are caught', () => {
  it('sample sizes', () => {
    for (const s of ['1.0X1.0', '0.9X0.9', '2x3', '2.0X2.0', "27''X18''", '30X30', '60X90', '2.6X4.0', '1.0X1.6'])
      expect(sizeVerdict(s).kind, s).toBe('sample');
  });
  it('full rugs', () => {
    for (const s of ['3.0X5.0', '5.0X8.0', '8X10', '160X230', '2.5X8'])
      expect(sizeVerdict(s).kind, s).toBe('full');
  });
  it('blank or junk is unknown', () => {
    for (const s of ['', '0X8', 'TBC', undefined]) expect(sizeVerdict(s).kind).toBe('unknown');
  });
  it('validSize', () => {
    expect(validSize({ w: 8, l: 10 })).toBe(true);
    expect(validSize({ w: 1, l: 1 })).toBe(false);
    expect(validSize({ w: 8, l: 40 })).toBe(false);
  });
});

describe('photo hint', () => {
  it('square photos and swatch file names', () => {
    expect(photoLooksLikeSwatch('https://x.test/o/a%2Fmain.jpg', { w: 1000, h: 1010 })).toBe(true);
    expect(photoLooksLikeSwatch('https://x.test/o/a%2Fswatch-1.jpg')).toBe(true);
    expect(photoLooksLikeSwatch('https://x.test/o/a%2Fmain.jpg', { w: 1000, h: 1500 })).toBe(false);
    expect(photoLooksLikeSwatch('https://x.test/o/a%2Fmain.jpg')).toBe(false);
  });
});

describe('prompt', () => {
  const style = roomStyle('dining')!;
  const p = buildRoomPrompt({ styleNumber: 'EM-TEST', construction: 'Hand Woven', materials: 'Wool', size: { w: 8, l: 10 }, style });
  it('renders at the size given, never a sample scaled up', () => {
    expect(p).toContain('about 8 x 10 ft (2.4 x 3.0 m)');
    expect(p).toContain('The photo shows the whole rug.');
    expect(p).not.toMatch(/sample; the finished rug|scaled up/i);
    expect(p).toContain('Do not enlarge the pattern or tile it');
    expect(p).toContain('ROOM: Dining room, natural light.');
    expect(p).toContain('Use no other reference.');
  });
  it('cutout line only for a PNG cutout', () => {
    expect(p).not.toContain('transparent');
    expect(buildRoomPrompt({ styleNumber: 'X', size: { w: 5, l: 8 }, style, cutout: true })).toContain('transparent or plain background');
  });
  it('seven room types with ids and one line each, no dashes in UI text', () => {
    expect(ROOM_STYLES.map((s) => s.id)).toEqual(['scandi-living', 'gallery-living', 'golden-lounge', 'reading-corner', 'dining', 'warm-bedroom', 'courtyard-room']);
    for (const s of ROOM_STYLES) for (const t of [s.name, s.line]) expect(t).not.toMatch(/--|—|–/);
  });
  it('IST day rolls at midnight India time', () => {
    expect(istDay(new Date('2026-11-27T18:29:00Z'))).toBe('2026-11-27');
    expect(istDay(new Date('2026-11-27T18:31:00Z'))).toBe('2026-11-28');
  });
});

describe('roomImages list', () => {
  const r = (u: string) => ({ url: u, path: 'p', roomType: 'dining', size: '8 x 10 ft', at: 'a', by: 'b', sourceUrl: 's' });
  it('parse drops junk', () => {
    expect(parseRoomImages(undefined)).toBeUndefined();
    expect(parseRoomImages([null, { url: '' }, { x: 1 }])).toBeUndefined();
    expect(parseRoomImages([{ url: 'u', size: 3 }])).toEqual([{ url: 'u', path: '', roomType: '', size: '', at: '', by: '', sourceUrl: '' }]);
  });
  it('add, remove, make first', () => {
    const l = addRoomImage(addRoomImage(undefined, r('a')), r('b'));
    expect(l.map((x) => x.url)).toEqual(['a', 'b']);
    expect(addRoomImage(l, r('a')).map((x) => x.url)).toEqual(['b', 'a']);
    expect(removeRoomImage(l, 'a').map((x) => x.url)).toEqual(['b']);
    expect(makeFirstRoomImage(l, 'b').map((x) => x.url)).toEqual(['b', 'a']);
    expect(makeFirstRoomImage(l, 'zz')).toEqual(l);
  });
});
