// Resizes and re-encodes a PNG off the main thread, so the status on the
// tile keeps moving while a 20 MP cutout is decoded and encoded.
self.onmessage = async (e: MessageEvent<{ id: number; file: Blob; width: number; height: number }>) => {
  const { id, file, width, height } = e.data;
  try {
    const bmp = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
    const c = new OffscreenCanvas(width, height);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, width, height);
    bmp.close();
    const blob = await c.convertToBlob({ type: 'image/png' });
    (self as unknown as Worker).postMessage({ id, ok: true, blob });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
