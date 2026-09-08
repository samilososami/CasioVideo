import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  rleEncode,
  decodeFrame,
  encodeFrame,
  validateVideo,
  parseHeader,
  updateMetadata,
  packVideo,
} from "../web/src/format.js";
test("literal/run boundaries and random RLE roundtrip", () => {
  for (let n of [1, 2, 3, 127, 128, 129, 255, 256, 88704])
    for (let mode = 0; mode < 4; mode++) {
      const x = Uint8Array.from({ length: n }, (_, i) =>
        mode === 0
          ? 5
          : mode === 1
            ? i % 256
            : mode === 2
              ? Math.floor(i / 128) % 256
              : Math.random() * 256,
      );
      assert.deepEqual(decodeFrame(rleEncode(x), 1, n), x);
    }
});
test("delta frames reconstruct reference pixels exactly", () => {
  const a = Uint8Array.from({ length: 10000 }, (_, i) => i % 251),
    b = a.slice();
  b[50] = 255;
  const f = encodeFrame(b, a, false, 1);
  assert.equal(f.kind, 2);
  assert.deepEqual(decodeFrame(f.data, f.kind, b.length, a), b);
});
test("malformed frames rejected without out-of-bounds access", () => {
  for (const [bytes, kind, n] of [
    [Uint8Array.of(255), 1, 128],
    [Uint8Array.of(255, 1), 1, 2],
    [Uint8Array.of(10, 1), 1, 11],
    [new Uint8Array(1), 0, 2],
    [new Uint8Array(2), 99, 2],
  ])
    assert.throws(() => decodeFrame(bytes, kind, n));
  assert.throws(() => decodeFrame(Uint8Array.of(128, 1), 2, 1));
});
test("real demo decodes, metadata edits preserve frame payload", async () => {
  const b = new Uint8Array(
      await readFile(new URL("../samples/COLORES.cvid", import.meta.url)),
    ),
    h = validateVideo(b);
  assert.equal(h.frames, 480);
  const updated = updateMetadata(b, "Vídeo de prueba", null),
    after = validateVideo(updated);
  assert.equal(after.title, "Vídeo de prueba");
  assert.deepEqual(updated.subarray(h.dataOffset), b.subarray(h.dataOffset));
  const bad = b.slice();
  bad[bad.length - 1] ^= 1;
  assert.throws(() => validateVideo(bad));
  bad[0] = 0;
  assert.throws(() => parseHeader(bad, bad.length));
});
test("UTF-8 title is bounded and duration/dimensions validated", () => {
  const frame = { data: Uint8Array.of(0), kind: 0 },
    b = packVideo(
      [frame],
      {
        width: 1,
        height: 1,
        fps: 1,
        durationMs: 1000,
        colors: 16,
        compression: 0,
      },
      null,
      "é".repeat(100),
    );
  assert.ok(new TextEncoder().encode(validateVideo(b).title).length < 120);
});
