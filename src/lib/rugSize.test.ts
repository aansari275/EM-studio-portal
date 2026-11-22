import { describe, it, expect } from 'vitest';
import { EMPTY_SIZE, activePreset, reconcileSize, sizeApplied, type SizeFields } from './rugSize';

describe('Rug size fields follow the shape', () => {
  // 5x8 picked on a landscape photo: width 8, length 5
  const picked: SizeFields = { a: '8', b: '5', unit: 'ft' };

  it('a picked size is applied and its preset is marked', () => {
    expect(sizeApplied(picked, 8 / 5)).toBe(true);
    expect(reconcileSize(picked, 8 / 5)).toBe(picked);
    expect(activePreset(picked, 8 / 5, true)).toBe('5x8');
  });

  it('moving Width or Length (shape cleared) clears the fields and the preset', () => {
    expect(reconcileSize(picked, null)).toEqual({ a: '', b: '', unit: 'ft' });
    expect(activePreset(picked, null, true)).toBeNull();
  });

  it('a shape that no longer matches the typed size clears it', () => {
    expect(reconcileSize(picked, 1.7)).toEqual({ a: '', b: '', unit: 'ft' });
  });

  it('a size still being typed is left alone', () => {
    const half: SizeFields = { a: '8', b: '', unit: 'ft' };
    expect(reconcileSize(half, null)).toBe(half);
    expect(reconcileSize(EMPTY_SIZE, null)).toBe(EMPTY_SIZE);
  });

  it('switching to cm keeps the size applied despite rounding', () => {
    const cm: SizeFields = { a: '243.84', b: '152.4', unit: 'cm' };
    expect(reconcileSize(cm, 8 / 5)).toBe(cm);
    expect(activePreset(cm, 8 / 5, true)).toBe('5x8');
    const odd: SizeFields = { a: '170', b: '240', unit: 'cm' };
    expect(reconcileSize(odd, 170 / 240)).toBe(odd);
    expect(activePreset(odd, 170 / 240, false)).toBeNull();
  });

  it('picking a size again re-applies it', () => {
    const cleared = reconcileSize(picked, null);
    expect(cleared.a).toBe('');
    // the panel writes the preset back and sets shape to its ratio
    expect(activePreset(picked, 8 / 5, true)).toBe('5x8');
  });
});
