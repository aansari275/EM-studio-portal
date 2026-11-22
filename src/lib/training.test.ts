import { describe, expect, it } from 'vitest';
import { currentChapter, formatDuration, pickVideo, shouldAutoOpen, walkthroughLength, type TrainingVideo } from './training';

const video: TrainingVideo = {
  title: 'How to use Library', src: 'https://x/v.mp4', poster: 'https://x/p.jpg',
  durationSec: 120, version: 2, updatedAt: '2026-11-22', chapters: [],
};
const base = { video, videoId: 'library', seen: {}, active: true, otherDialogOpen: false };

describe('shouldAutoOpen', () => {
  it('opens on first visit', () => expect(shouldAutoOpen(base)).toBe(true));
  it('stays shut once seen at this version', () => expect(shouldAutoOpen({ ...base, seen: { library: 2 } })).toBe(false));
  it('stays shut when seen at a later version', () => expect(shouldAutoOpen({ ...base, seen: { library: 3 } })).toBe(false));
  it('opens again when the version goes up', () => expect(shouldAutoOpen({ ...base, seen: { library: 1 } })).toBe(true));
  it('ignores other videos in the seen map', () => expect(shouldAutoOpen({ ...base, seen: { 'custom-rugs': 9 } })).toBe(true));
  it('never opens without a video', () => expect(shouldAutoOpen({ ...base, video: null })).toBe(false));
  it('never opens on a hidden tab', () => expect(shouldAutoOpen({ ...base, active: false })).toBe(false));
  it('never opens when the seen doc could not be read', () => expect(shouldAutoOpen({ ...base, seen: null })).toBe(false));
  it('never opens over another dialog', () => expect(shouldAutoOpen({ ...base, otherDialogOpen: true })).toBe(false));
  it('opens only once per session', () => expect(shouldAutoOpen({ ...base, alreadyAutoOpened: true })).toBe(false));
  it('treats a junk seen value as unseen', () =>
    expect(shouldAutoOpen({ ...base, seen: { library: 'x' as unknown as number } })).toBe(true));
});

describe('currentChapter', () => {
  const ch = [{ t: 0, label: 'a' }, { t: 10, label: 'b' }, { t: 25, label: 'c' }];
  it('first chapter at 0', () => expect(currentChapter(ch, 0)).toBe(0));
  it('inside a chapter', () => expect(currentChapter(ch, 12.3)).toBe(1));
  it('exactly on a boundary', () => expect(currentChapter(ch, 10)).toBe(1));
  it('just before a boundary after a seek lands slightly early', () => expect(currentChapter(ch, 9.97)).toBe(1));
  it('last chapter', () => expect(currentChapter(ch, 999)).toBe(2));
  it('before the first chapter', () => expect(currentChapter([{ t: 5, label: 'a' }], 2)).toBe(-1));
  it('no chapters', () => expect(currentChapter([], 3)).toBe(-1));
});

describe('pickVideo', () => {
  it('missing doc, missing id, empty src all give null', () => {
    expect(pickVideo(undefined, 'library')).toBeNull();
    expect(pickVideo({}, 'library')).toBeNull();
    expect(pickVideo({ videos: {} }, 'library')).toBeNull();
    expect(pickVideo({ videos: { library: { title: 'x', src: '' } } }, 'library')).toBeNull();
  });
  it('cleans and sorts chapters, defaults version', () => {
    const v = pickVideo({ videos: { library: { src: 'a.mp4', chapters: [{ t: 9, label: 'b' }, { t: 1, label: 'a' }, { t: 'x', label: 'bad' }, { t: 3, label: ' ' }] } } }, 'library');
    expect(v?.chapters).toEqual([{ t: 1, label: 'a' }, { t: 9, label: 'b' }]);
    expect(v?.version).toBe(1);
    expect(v?.captions).toBeUndefined();
  });
});

describe('copy helpers', () => {
  it('formats durations', () => { expect(formatDuration(95)).toBe('1:35'); expect(formatDuration(8)).toBe('0:08'); });
  it('names the length', () => {
    expect(walkthroughLength(118)).toBe('Two minute walkthrough');
    expect(walkthroughLength(20)).toBe('One minute walkthrough');
  });
});
