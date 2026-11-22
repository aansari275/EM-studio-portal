import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosaver, saveLabel, type SaveStatus } from './autosave';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

function setup(fail = 0) {
  const saved: string[] = [];
  const exits: string[] = [];
  const statuses: SaveStatus['state'][] = [];
  let failuresLeft = fail;
  const a = createAutosaver<string>({
    save: async (v) => {
      await Promise.resolve();
      if (failuresLeft > 0) { failuresLeft--; throw new Error('offline'); }
      saved.push(v);
    },
    saveOnExit: (v) => exits.push(v),
    onStatus: (s) => statuses.push(s.state),
  });
  return { a, saved, exits, statuses };
}

describe('createAutosaver', () => {
  it('coalesces quick changes into one save of the latest state', async () => {
    const { a, saved } = setup();
    a.set('h'); await vi.advanceTimersByTimeAsync(500);
    a.set('he'); await vi.advanceTimersByTimeAsync(500);
    a.set('hello');
    await vi.advanceTimersByTimeAsync(1400);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(saved).toEqual(['hello']);
    expect(a.dirty).toBe(false);
  });

  it('flush sends the latest state once, and the pending timer does not send it again', async () => {
    const { a, saved } = setup();
    a.set('one'); a.set('two');
    await a.flush();
    expect(saved).toEqual(['two']);
    await vi.advanceTimersByTimeAsync(5000);
    expect(saved).toEqual(['two']);
    await a.flush();
    expect(saved).toEqual(['two']);
  });

  it('a change during a write is written after it', async () => {
    let release!: () => void;
    const saved: string[] = [];
    const a = createAutosaver<string>({
      save: (v) => new Promise<void>((ok) => { release = () => { saved.push(v); ok(); }; }),
    });
    a.set('first');
    await vi.advanceTimersByTimeAsync(1500);
    a.set('second');
    release();
    await vi.advanceTimersByTimeAsync(1500);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual(['first', 'second']);
    expect(a.dirty).toBe(false);
  });

  it('retries after a failure with backoff, carrying the latest state', async () => {
    const { a, saved, statuses } = setup(2);
    a.set('v1');
    await vi.advanceTimersByTimeAsync(1500);
    expect(statuses).toContain('error');
    expect(a.dirty).toBe(true);
    a.set('v2'); // typed while offline
    await vi.advanceTimersByTimeAsync(2000); // first retry fails too
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000); // second retry succeeds
    expect(saved).toEqual(['v2']);
    expect(statuses.at(-1)).toBe('saved');
    expect(a.dirty).toBe(false);
  });

  it('flushOnExit hands only unsaved state to the exit writer', async () => {
    const { a, exits } = setup();
    a.flushOnExit();
    expect(exits).toEqual([]);
    a.set('draft');
    a.flushOnExit();
    expect(exits).toEqual(['draft']);
    await a.flush();
    a.flushOnExit();
    expect(exits).toEqual(['draft']);
  });

  it('labels the status for the page', () => {
    expect(saveLabel({ state: 'saving' })).toBe('Saving');
    expect(saveLabel({ state: 'saved', at: new Date(2026, 10, 22, 12, 4) })).toBe('Saved 12:04');
    expect(saveLabel({ state: 'error' })).toBe('Could not save. Retrying');
    expect(saveLabel({ state: 'idle' })).toBe('');
  });
});
