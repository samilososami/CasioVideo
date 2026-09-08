import {
  quantize,
  encodeFrame,
  packVideo,
  parseHeader,
  decodeFrame,
  thumbnailRGBA,
  rgb332ToRgb,
  THUMB_BYTES,
} from "./format.js";
export const RESOLUTIONS = [
  [96, 54],
  [128, 72],
  [160, 90],
  [192, 108],
  [264, 148],
  [384, 216],
  [396, 224],
];
export const FPS = [2, 4, 6, 8, 10, 12, 15, 20, 24],
  COLORS = [16, 32, 64, 128, 256],
  BITRATES = [32, 64, 96, 160, 256, 384, 512, 768, 1024];
export const COMPRESSION = [
  "Fotogramas independientes",
  "Exacta entre fotogramas",
  "Equilibrada",
  "Alta",
  "Muy alta",
  "Máxima",
];
export const DEFAULTS = {
  resolution: "auto",
  fps: "auto",
  colors: "auto",
  compression: "auto",
  bitrate: "auto",
  dither: "auto",
};
const tick = () => new Promise((r) => setTimeout(r, 0));
function event(el, name, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        done(
          new Error(
            "El navegador tardó demasiado en leer este vídeo. Prueba con un MP4 H.264 o WebM.",
          ),
        ),
      timeout,
    );
    function done(err) {
      clearTimeout(timer);
      el.removeEventListener(name, ok);
      el.removeEventListener("error", fail);
      err ? reject(err) : resolve();
    }
    const ok = () => done(),
      fail = () =>
        done(
          new Error(
            "Este formato de vídeo no se puede decodificar en tu navegador. Usa MP4 H.264 o WebM.",
          ),
        );
    el.addEventListener(name, ok, { once: true });
    el.addEventListener("error", fail, { once: true });
  });
}
export async function sourceVideo(file) {
  const url = URL.createObjectURL(file),
    video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  const ready = event(video, "loadeddata");
  video.src = url;
  try {
    await ready;
    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("No se ha podido leer la duración.");
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
  return {
    file,
    url,
    video,
    duration: video.duration,
    close() {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    },
  };
}
export async function seek(video, time) {
  time = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.001)));
  if (Math.abs(video.currentTime - time) < 0.0001 && video.readyState >= 2)
    return;
  const ready = event(video, "seeked");
  video.currentTime = time;
  await ready;
}
function drawFit(ctx, image, w, h) {
  const iw = image.videoWidth || image.naturalWidth || image.width,
    ih = image.videoHeight || image.naturalHeight || image.height;
  const factor = Math.min(w / iw, h / ih),
    dw = iw * factor,
    dh = ih * factor;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
}
export function canvasFor(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
export function thumbnail(image) {
  const canvas = canvasFor(160, 90),
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  drawFit(ctx, image, 160, 90);
  const rgba = ctx.getImageData(0, 0, 160, 90).data,
    raw = new Uint8Array(THUMB_BYTES);
  for (let i = 0; i < 14400; i++) {
    const v =
      (Math.round((rgba[4 * i] * 31) / 255) << 11) |
      (Math.round((rgba[4 * i + 1] * 63) / 255) << 5) |
      Math.round((rgba[4 * i + 2] * 31) / 255);
    raw[2 * i] = v & 255;
    raw[2 * i + 1] = v >> 8;
  }
  return { raw, url: canvas.toDataURL("image/png") };
}
export async function frameThumbnail(source, time) {
  await seek(source.video, time);
  return thumbnail(source.video);
}
export async function imageThumbnail(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return thumbnail(bitmap);
  } finally {
    bitmap.close();
  }
}
export function rawThumbnailURL(raw) {
  const c = canvasFor(160, 90);
  c.getContext("2d").putImageData(
    new ImageData(thumbnailRGBA(raw), 160, 90),
    0,
    0,
  );
  return c.toDataURL();
}
export function chooseSettings(options, duration, free, degrade = 0) {
  const budget = Math.min(
    free,
    options.bitrate === "auto"
      ? free
      : ((Number(options.bitrate) * 1000) / 8) * duration,
  );
  let ri =
    options.resolution === "auto"
      ? Math.max(0, 3 - degrade)
      : Number(options.resolution);
  let fps =
    options.fps === "auto" ? Math.max(2, 8 - degrade * 2) : Number(options.fps);
  while (
    options.resolution === "auto" &&
    ri > 0 &&
    RESOLUTIONS[ri][0] * RESOLUTIONS[ri][1] * fps * duration * 0.4 > budget
  )
    ri--;
  if (options.fps === "auto")
    while (
      fps > 2 &&
      RESOLUTIONS[ri][0] * RESOLUTIONS[ri][1] * fps * duration * 0.4 > budget
    )
      fps -= 2;
  const [width, height] = RESOLUTIONS[ri];
  return {
    width,
    height,
    fps,
    colors:
      options.colors === "auto"
        ? degrade > 2
          ? 32
          : 128
        : Number(options.colors),
    compression:
      options.compression === "auto"
        ? Math.min(5, 2 + degrade)
        : Number(options.compression),
    dither: options.dither === "on",
    durationMs: Math.round(duration * 1000),
    budget,
  };
}
export async function estimate(source, start, end, options, free, signal) {
  const duration = end - start,
    s = chooseSettings(options, duration, free),
    c = canvasFor(s.width, s.height),
    ctx = c.getContext("2d", { willReadFrequently: true });
  let total = 0,
    n = 0;
  for (let i = 0; i < 4; i++) {
    let previous;
    for (let j = 0; j < 3; j++) {
      if (signal?.aborted) throw new DOMException("Cancelado", "AbortError");
      await seek(
        source.video,
        Math.min(end - 0.001, start + (duration * i) / 4 + j / s.fps),
      );
      drawFit(ctx, source.video, s.width, s.height);
      const q = quantize(
        ctx.getImageData(0, 0, s.width, s.height).data,
        s.colors,
        s.dither,
      );
      const frame = encodeFrame(q, previous, j === 0, s.compression);
      previous = frame.frame;
      total += frame.data.length;
      n++;
    }
  }
  return {
    bytes:
      Math.ceil((total / n) * Math.ceil(duration * s.fps) * 1.08) +
      28800 +
      256 +
      Math.ceil(duration * s.fps) * 12,
    settings: s,
  };
}
export async function convert(
  source,
  start,
  end,
  options,
  free,
  title,
  poster,
  progress,
  signal,
) {
  if (!(end > start) || start < 0 || end > source.duration + 0.01)
    throw new Error("El recorte no es válido.");
  if (end - start > 14400)
    throw new Error("Recorta el vídeo a menos de cuatro horas.");
  const canAdapt = ["resolution", "fps", "colors", "compression"].some(
    (k) => options[k] === "auto",
  );
  for (let attempt = 0; attempt < (canAdapt ? 5 : 1); attempt++) {
    const s = chooseSettings(options, end - start, free, attempt),
      c = canvasFor(s.width, s.height),
      ctx = c.getContext("2d", { willReadFrequently: true });
    const count = Math.ceil((end - start) * s.fps);
    if (count > 200000)
      throw new Error(
        "Demasiados fotogramas. Baja los FPS o recorta el vídeo.",
      );
    let previous,
      bytes = 28800 + 256 + 12 * count,
      over = false;
    const frames = [];
    for (let i = 0; i < count; i++) {
      if (signal?.aborted)
        throw new DOMException("Conversión cancelada", "AbortError");
      await seek(source.video, start + i / s.fps);
      drawFit(ctx, source.video, s.width, s.height);
      const pixels = quantize(
          ctx.getImageData(0, 0, s.width, s.height).data,
          s.colors,
          s.dither,
        ),
        f = encodeFrame(pixels, previous, i % s.fps === 0, s.compression);
      previous = f.frame;
      frames.push({ data: f.data, kind: f.kind });
      bytes += f.data.length;
      progress({
        percent: ((i + 1) / count) * 100,
        label: attempt
          ? `Ajustando al espacio disponible · intento ${attempt + 1}`
          : "Convirtiendo vídeo en este navegador",
      });
      if (bytes > s.budget) {
        over = true;
        break;
      }
      if (i % 8 === 0) await tick();
    }
    if (over) continue;
    return {
      bytes: packVideo(
        frames,
        s,
        poster.raw,
        title,
        crypto.randomUUID().replaceAll("-", "").slice(0, 14),
      ),
      settings: s,
    };
  }
  throw new Error(
    "Con estos ajustes el vídeo no cabe en el presupuesto. Recórtalo, baja la resolución o los FPS, o libera espacio. No se ha escrito nada en la calculadora.",
  );
}
export async function thumbnailFromCvid(file, time = 0) {
  const bytes = new Uint8Array(await file.arrayBuffer()),
    h = parseHeader(bytes, bytes.length),
    d = new DataView(bytes.buffer);
  let frame;
  const target = Math.min(h.frames - 1, Math.floor(time * h.fps));
  const first = Math.floor(target / h.keyInterval) * h.keyInterval;
  for (let i = first; i <= target; i++) {
    const p = h.indexOffset + i * 12,
      off = d.getUint32(p, true),
      n = d.getUint32(p + 4, true);
    if (off < h.dataOffset || off + n > bytes.length)
      throw new Error("Índice de vídeo dañado.");
    frame = decodeFrame(
      bytes.subarray(off, off + n),
      bytes[p + 8],
      h.width * h.height,
      frame,
    );
  }
  const c = canvasFor(h.width, h.height),
    rgba = new Uint8ClampedArray(h.width * h.height * 4);
  for (let i = 0; i < frame.length; i++)
    rgba.set([...rgb332ToRgb(frame[i]), 255], 4 * i);
  c.getContext("2d").putImageData(new ImageData(rgba, h.width, h.height), 0, 0);
  return thumbnail(c);
}
