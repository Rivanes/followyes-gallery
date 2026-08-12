/* Local AVIF encoder entrypoint.
   Uses a native browser ImageEncoder when available and falls back to the pinned C6B codec only inside the editor worker. */
const FALLBACK = "https://esm.sh/@jsquash/avif@2.1.1?bundle";
let fallbackPromise = null;
async function encodeNative(imageData, options = {}) {
  if (typeof ImageEncoder !== "function") return null;
  const encoder = new ImageEncoder({ type: "image/avif", quality: Math.max(0, Math.min(1, Number(options.quality || 82) / 100)) });
  const result = await encoder.encode(imageData);
  if (encoder.close) encoder.close();
  const chunk = result && (result.image || result);
  if (!chunk) return null;
  if (chunk instanceof ArrayBuffer) return chunk;
  if (ArrayBuffer.isView(chunk)) return chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
  if (chunk.data && ArrayBuffer.isView(chunk.data)) return chunk.data.buffer.slice(chunk.data.byteOffset, chunk.data.byteOffset + chunk.data.byteLength);
  return null;
}
export async function encode(imageData, options = {}) {
  try {
    const native = await encodeNative(imageData, options);
    if (native && native.byteLength) return native;
  } catch (_) {}
  if (!fallbackPromise) fallbackPromise = import(FALLBACK);
  const module = await fallbackPromise;
  if (!module || typeof module.encode !== "function") throw new Error("AVIF encoder is unavailable.");
  return module.encode(imageData, options);
}
