import { describe, expect, it } from 'vitest';
import { busySummary, jobLine, position, stepJob, tileJob } from './jobStatus';

describe('stepJob', () => {
  it('says what each upload step is doing', () => {
    expect(stepJob({ stage: 'reducing' })).toEqual({ label: 'Reducing file size' });
    expect(stepJob({ stage: 'uploading', pct: 0.4, note: '5.1 MB to 2.8 MB' }))
      .toEqual({ label: 'Uploading', pct: 0.4, detail: '5.1 MB to 2.8 MB' });
    expect(stepJob({ stage: 'done' })).toBeUndefined();
  });
});

describe('tileJob', () => {
  it('follows the photo first, then its original', () => {
    expect(tileJob({ stage: 'reducing' }, { stage: 'uploading', pct: 0.9 })?.label).toBe('Reducing file size');
    expect(tileJob({ stage: 'done' }, { stage: 'reducing' })?.label).toBe('Original: Reducing file size');
    expect(tileJob({ stage: 'done' }, { stage: 'done' })).toBeUndefined();
    expect(tileJob({ stage: 'done' }, undefined)).toBeUndefined();
  });
  it('a photo already within 3 MB goes straight to Uploading', () => {
    expect(tileJob({ stage: 'uploading', pct: 0 }, undefined)?.label).toBe('Uploading');
  });
  it('adds the position only when several photos are queued', () => {
    expect(tileJob({ stage: 'reducing' }, undefined, { n: 2, of: 5 })).toMatchObject({ n: 2, of: 5 });
    expect(tileJob({ stage: 'reducing' }, undefined, { n: 1, of: 1 })).toEqual({ label: 'Reducing file size' });
  });
});

describe('wording', () => {
  it('position and progress line', () => {
    expect(position({ label: 'x', n: 2, of: 5 })).toBe('Photo 2 of 5');
    expect(position({ label: 'x', n: 1, of: 1 })).toBe('');
    expect(jobLine({ label: 'Uploading', pct: 0.404 })).toBe('Uploading 40%');
    expect(jobLine({ label: 'Original: Uploading', pct: 1 })).toBe('Original: Uploading 100%');
    expect(jobLine({ label: 'Finding the rug' })).toBe('Finding the rug');
  });
  it('no dashes in any user facing text', () => {
    const all = [
      busySummary([{ label: 'Reducing file size', n: 2, of: 5 }, { label: 'Waiting', n: 3, of: 5 }]),
      jobLine({ label: 'Uploading', pct: 0.5 }),
    ].join(' ');
    expect(all).not.toMatch(/--|—|–/);
  });
});

describe('busySummary', () => {
  it('reads one busy photo with its place in the queue', () => {
    expect(busySummary([{ label: 'Finding the rug', n: 2, of: 5 }, { label: 'Waiting' }, { label: 'Waiting' }]))
      .toBe('Photo 2 of 5: Finding the rug, 2 waiting.');
  });
  it('groups several busy photos', () => {
    expect(busySummary([{ label: 'Uploading', pct: 0.2 }, { label: 'Reducing file size' }, { label: 'Uploading', pct: 0.9 }]))
      .toBe('3 photos: Uploading, Reducing file size.');
  });
  it('is empty when nothing runs', () => {
    expect(busySummary([])).toBe('');
    expect(busySummary([{ label: 'Waiting' }])).toBe('');
  });
});
