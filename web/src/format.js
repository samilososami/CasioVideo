export const HEADER = 256,
  THUMB_W = 160,
  THUMB_H = 90,
  THUMB_BYTES = 28800,
  MAX_FILE = 16800000;
const enc = new TextEncoder(),
  dec = new TextDecoder();
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
  return n >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function putText(bytes, offset, size, text) {
  bytes.fill(0, offset, offset + size);
  let str = text;
  while (enc.encode(str).length >= size) str = str.slice(0, -1);
  bytes.set(enc.encode(str), offset);
}
export function parseHeader(bytes, fileSize) {
  if (bytes.length < HEADER) throw new Error("Cabecera de vídeo incompleta.");
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (o) => d.getUint16(o, true),
    u32 = (o) => d.getUint32(o, true);
  if (
    dec.decode(bytes.subarray(0, 8)) !== "CASVID01" ||
    u16(8) !== 1 ||
    u16(10) !== 256 ||
    dec.decode(bytes.subarray(184, 194)) !== "CasioVideo"
  )
    throw new Error("Este archivo no es un vídeo de CasioVideo compatible.");
  if (crc32(bytes.subarray(0, 252)) !== u32(252))
    throw new Error("La cabecera del vídeo está dañada.");
  const h = {
    width: u16(12),
    height: u16(14),
    fps: u16(16),
    keyInterval: u16(18),
    frames: u32(20),
    durationMs: u32(24),
    thumbOffset: u32(28),
    thumbBytes: u32(32),
    indexOffset: u32(36),
    dataOffset: u32(40),
    size: u32(44),
    crc: u32(48),
    colors: u16(216),
    compression: u16(218),
    title: dec.decode(bytes.subarray(64, 184)).split("\0")[0],
    id: dec.decode(bytes.subarray(200, 216)).split("\0")[0],
  };
  if (
    !h.width ||
    h.width > 396 ||
    !h.height ||
    h.height > 224 ||
    !h.fps ||
    h.fps > 24 ||
    !h.keyInterval ||
    h.keyInterval > 24 ||
    !h.frames ||
    h.frames > 200000 ||
    !h.durationMs ||
    h.durationMs > 14400000 ||
    h.size !== fileSize ||
    h.size > MAX_FILE
  )
    throw new Error("Dimensiones o tamaño de vídeo no válidos.");
  if (
    Math.abs(h.durationMs - (h.frames * 1000) / h.fps) > 1000 ||
    h.thumbOffset !== HEADER ||
    ![0, THUMB_BYTES].includes(h.thumbBytes) ||
    (h.thumbBytes && (u16(52) !== 160 || u16(54) !== 90)) ||
    h.indexOffset !== HEADER + h.thumbBytes ||
    h.dataOffset !== h.indexOffset + 12 * h.frames ||
    h.dataOffset >= h.size
  )
    throw new Error("Estructura de vídeo no válida.");
  return h;
}
export function rleEncode(src) {
  const out = new Uint8Array(src.length + Math.ceil(src.length / 128) + 4);
  let i = 0,
    o = 0;
  while (i < src.length) {
    let run = 1;
    while (i + run < src.length && run < 128 && src[i + run] === src[i]) run++;
    if (run >= 3) {
      out[o++] = 128 | (run - 1);
      out[o++] = src[i];
      i += run;
    } else {
      const start = i;
      i += run;
      while (i < src.length && i - start < 128) {
        let n = 1;
        while (i + n < src.length && n < 3 && src[i + n] === src[i]) n++;
        if (n >= 3) break;
        i += Math.min(n, 128 - (i - start));
      }
      out[o++] = i - start - 1;
      out.set(src.subarray(start, i), o);
      o += i - start;
    }
  }
  return out.slice(0, o);
}
export function decodeFrame(src, kind, pixels, previous) {
  if (kind === 0) {
    if (src.length !== pixels) throw new Error("Frame RAW incompleto.");
    return src.slice();
  }
  if (kind !== 1 && kind !== 2) throw new Error("Códec desconocido.");
  if (kind === 2 && previous?.length !== pixels)
    throw new Error("Falta el fotograma de referencia.");
  const out = kind === 2 ? previous.slice() : new Uint8Array(pixels);
  let i = 0,
    o = 0;
  while (i < src.length) {
    const code = src[i++],
      n = (code & 127) + 1;
    if (o + n > pixels || (code & 128 ? i >= src.length : i + n > src.length))
      throw new Error("Frame RLE fuera de límites.");
    const v = src[i];
    for (let j = 0; j < n; j++, o++) {
      const b = code & 128 ? v : src[i++];
      if (kind === 2) out[o] ^= b;
      else out[o] = b;
    }
    if (code & 128) i++;
  }
  if (o !== pixels) throw new Error("Frame RLE incompleto.");
  return out;
}
export function rgb332ToRgb(v) {
  return [
    Math.round(((v >> 5) * 255) / 7),
    Math.round((((v >> 2) & 7) * 255) / 7),
    Math.round(((v & 3) * 255) / 3),
  ];
}
const colorBits = {
  16: [1, 2, 1],
  32: [2, 2, 1],
  64: [2, 2, 2],
  128: [3, 2, 2],
  256: [3, 3, 2],
};
export function quantize(rgba, colors = 256, dither = false) {
  const bits = colorBits[colors] || colorBits[256],
    out = new Uint8Array(rgba.length / 4);
  const bayer = [-8, 0, -6, 2, 4, -4, 6, -2, -5, 3, -7, 1, 7, -1, 5, -3];
  for (let i = 0; i < out.length; i++) {
    const adjustment = dither ? bayer[i % 16] * 2 : 0;
    const q = bits.map((b, c) =>
      Math.round(
        (Math.min(255, Math.max(0, rgba[4 * i + c] + adjustment)) *
          ((1 << b) - 1)) /
          255,
      ),
    );
    out[i] =
      (Math.round((q[0] * 7) / ((1 << bits[0]) - 1)) << 5) |
      (Math.round((q[1] * 7) / ((1 << bits[1]) - 1)) << 2) |
      Math.round((q[2] * 3) / ((1 << bits[2]) - 1));
  }
  return out;
}
export function encodeFrame(pixels, previous, key, compression = 2) {
  const tolerances = [0, 0, 8, 16, 24, 40];
  const frame = pixels.slice();
  if (previous && !key && tolerances[compression]) {
    const tolerance = tolerances[compression];
    for (let i = 0; i < frame.length; i++) {
      const a = rgb332ToRgb(frame[i]),
        b = rgb332ToRgb(previous[i]);
      if (Math.max(...a.map((n, j) => Math.abs(n - b[j]))) <= tolerance)
        frame[i] = previous[i];
    }
  }
  let data = rleEncode(frame),
    kind = 1;
  if (data.length >= frame.length) {
    data = frame.slice();
    kind = 0;
  }
  if (previous && !key && compression !== 0) {
    const delta = frame.map((v, i) => v ^ previous[i]),
      rle = rleEncode(delta);
    if (rle.length < data.length) {
      data = rle;
      kind = 2;
    }
  }
  return { data, kind, frame };
}
export function packVideo(frames, settings, thumbnail, title, id = "") {
  const indexOffset = HEADER + (thumbnail?.length || 0),
    dataOffset = indexOffset + frames.length * 12;
  const size = dataOffset + frames.reduce((sum, f) => sum + f.data.length, 0);
  if (size > MAX_FILE)
    throw new Error(
      "El vídeo supera el almacenamiento total de la CG50. Reduce la calidad o recórtalo.",
    );
  const out = new Uint8Array(size),
    dv = new DataView(out.buffer),
    u16 = (o, v) => dv.setUint16(o, v, true),
    u32 = (o, v) => dv.setUint32(o, v, true);
  putText(out, 0, 9, "CASVID01");
  u16(8, 1);
  u16(10, HEADER);
  u16(12, settings.width);
  u16(14, settings.height);
  u16(16, settings.fps);
  u16(18, settings.fps);
  u32(20, frames.length);
  u32(24, settings.durationMs);
  u32(28, HEADER);
  u32(32, thumbnail?.length || 0);
  u32(36, indexOffset);
  u32(40, dataOffset);
  u32(44, size);
  u16(52, 160);
  u16(54, 90);
  u32(56, Math.floor(Date.now() / 1000));
  putText(out, 64, 120, title);
  putText(out, 184, 16, "CasioVideo");
  putText(out, 200, 16, id);
  u16(216, settings.colors);
  u16(218, settings.compression);
  if (thumbnail) out.set(thumbnail, HEADER);
  let offset = dataOffset;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    u32(indexOffset + 12 * i, offset);
    u32(indexOffset + 12 * i + 4, f.data.length);
    out[indexOffset + 12 * i + 8] = f.kind;
    out.set(f.data, offset);
    offset += f.data.length;
  }
  u32(48, crc32(out.subarray(HEADER)));
  u32(252, crc32(out.subarray(0, 252)));
  return out;
}
export function validateVideo(bytes) {
  const h = parseHeader(bytes, bytes.length),
    d = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  if (crc32(bytes.subarray(HEADER)) !== h.crc)
    throw new Error("El vídeo está dañado (CRC).");
  let previous,
    expected = h.dataOffset;
  for (let i = 0; i < h.frames; i++) {
    const p = h.indexOffset + i * 12,
      offset = d.getUint32(p, true),
      n = d.getUint32(p + 4, true),
      kind = bytes[p + 8];
    if (
      offset !== expected ||
      !n ||
      n > bytes.length - offset ||
      (i % h.keyInterval === 0 && kind === 2)
    )
      throw new Error("Índice de vídeo dañado.");
    previous = decodeFrame(
      bytes.subarray(offset, offset + n),
      kind,
      h.width * h.height,
      previous,
    );
    expected = offset + n;
  }
  if (expected !== bytes.length)
    throw new Error("Longitud de vídeo inesperada.");
  return h;
}
export function updateMetadata(bytes, title, thumbnail) {
  const h = parseHeader(bytes, bytes.length);
  if (crc32(bytes.subarray(HEADER)) !== h.crc)
    throw new Error("El vídeo original está dañado.");
  if (thumbnail && h.thumbBytes !== THUMB_BYTES)
    throw new Error(
      "Este vídeo no tiene espacio para miniatura; vuelve a convertirlo.",
    );
  const out = bytes.slice(),
    d = new DataView(out.buffer);
  putText(out, 64, 120, title);
  if (thumbnail) {
    if (thumbnail.length !== THUMB_BYTES)
      throw new Error("Miniatura no válida.");
    out.set(thumbnail, HEADER);
  }
  d.setUint32(48, crc32(out.subarray(HEADER)), true);
  d.setUint32(252, crc32(out.subarray(0, 252)), true);
  return out;
}
export function thumbnailRGBA(raw) {
  const out = new Uint8ClampedArray(THUMB_W * THUMB_H * 4);
  for (let i = 0; i < THUMB_W * THUMB_H; i++) {
    const v = raw[2 * i] | (raw[2 * i + 1] << 8);
    out.set(
      [
        ((v >> 11) * 255) / 31,
        (((v >> 5) & 63) * 255) / 63,
        ((v & 31) * 255) / 31,
        255,
      ],
      4 * i,
    );
  }
  return out;
}
