import { writeFile, mkdir } from "node:fs/promises";
import {
  packVideo,
  encodeFrame,
  validateVideo,
  rgb332ToRgb,
} from "../web/src/format.js";
const width = 192,
  height = 108,
  fps = 8,
  durationMs = 60000;
const colors = [224, 252, 28, 31, 3, 227, 255, 73];
const frames = [];
let previous, poster;
for (let n = 0; n < (fps * durationMs) / 1000; n++) {
  const data = new Uint8Array(width * height),
    phase = Math.floor(n / (fps * 5));
  const cx = 18 + Math.floor((width - 36) * (0.5 + 0.5 * Math.sin(n / 17))),
    cy = 45 + Math.floor(16 * Math.sin(n / 25));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let c = colors[(Math.floor(x / 24) + phase) % colors.length];
      if (y > 85) c = y < 92 ? 0 : 73;
      if (y >= 96 && y < 102 && x < Math.floor((width * n) / (fps * 60)))
        c = 255;
      if ((x - cx) ** 2 + (y - cy) ** 2 < 14 ** 2) c = 0;
      if ((x - cx) ** 2 + (y - cy) ** 2 < 10 ** 2) c = 255;
      data[y * width + x] = c;
    }
  if (!poster) poster = data.slice();
  const f = encodeFrame(data, previous, n % fps === 0, 1);
  previous = f.frame;
  frames.push({ kind: f.kind, data: f.data });
}
const thumb = new Uint8Array(28800);
for (let y = 0; y < 90; y++)
  for (let x = 0; x < 160; x++) {
    const [r, g, b] = rgb332ToRgb(
      poster[
        Math.floor((y * height) / 90) * width + Math.floor((x * width) / 160)
      ],
    );
    const v =
        (Math.round((r * 31) / 255) << 11) |
        (Math.round((g * 63) / 255) << 5) |
        Math.round((b * 31) / 255),
      p = 2 * (y * 160 + x);
    thumb[p] = v & 255;
    thumb[p + 1] = v >> 8;
  }
const bytes = packVideo(
  frames,
  { width, height, fps, durationMs, colors: 256, compression: 1 },
  thumb,
  "Colores en movimiento",
  "demo-colores",
);
validateVideo(bytes);
await mkdir(new URL("../samples/", import.meta.url), { recursive: true });
await writeFile(new URL("../samples/COLORES.cvid", import.meta.url), bytes);
console.log(
  `Demo: ${durationMs / 1000}s, ${fps}fps, ${bytes.length / 1e6} MB. CRC y todos los fotogramas verificados.`,
);
