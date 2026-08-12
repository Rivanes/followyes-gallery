/*
  Lazy AVIF encoder worker. The codec is imported only after the editor starts
  an explicit optimization operation; viewer startup never downloads it.
*/

let encoderPromise = null;

async function getEncoder(moduleUrl) {
  if (!encoderPromise) {
    encoderPromise = import(moduleUrl).then((module) => {
      if (!module || typeof module.encode !== "function") {
        throw new Error("AVIF encoder module does not export encode().");
      }
      return module.encode;
    });
  }
  return encoderPromise;
}

function normalizeEncodedBuffer(encoded) {
  if (encoded instanceof ArrayBuffer) return encoded;
  if (ArrayBuffer.isView(encoded)) {
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  }
  throw new Error("AVIF encoder returned an unsupported result.");
}

self.onmessage = async (event) => {
  const message = event && event.data ? event.data : {};
  if (message.type !== "encode") return;

  const id = message.id;

  try {
    const encode = await getEncoder(message.moduleUrl);
    const pixels = new Uint8ClampedArray(message.pixelBuffer);
    const imageData = typeof ImageData === "function"
      ? new ImageData(pixels, message.width, message.height)
      : { data: pixels, width: message.width, height: message.height };
    const encoded = await encode(imageData, message.options || {});
    const buffer = normalizeEncodedBuffer(encoded);

    self.postMessage({
      type: "encoded",
      id,
      ok: true,
      buffer,
      byteLength: buffer.byteLength
    }, [buffer]);
  } catch (error) {
    self.postMessage({
      type: "encoded",
      id,
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
};
