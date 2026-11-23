import { finishCutout } from './maskRefine';

// The mask clean-up off the main thread: at 2000px it is a second or two of
// arithmetic, and the page should stay usable while it runs.
self.onmessage = (e: MessageEvent<{ rgba: Uint8ClampedArray; mask: Uint8Array; w: number; h: number; first?: Uint8Array }>) => {
  const { rgba, mask, w, h, first } = e.data;
  const out = finishCutout(rgba, mask, w, h, first);
  (self as unknown as Worker).postMessage(out, [out.rgba.buffer]);
};
