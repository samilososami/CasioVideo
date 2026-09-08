import { useEffect, useRef, useState } from "react";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";
import { Modal } from "./ui.jsx";
import {
  parseHeader,
  decodeFrame,
  rgb332ToRgb,
  crc32,
  HEADER,
} from "./format.js";
import { duration } from "./device.js";
export default function VideoPreview({ video, onClose }) {
  const canvas = useRef(),
    state = useRef({
      bytes: null,
      h: null,
      time: 0,
      paused: false,
      last: -1,
      frame: null,
    });
  const [time, setTime] = useState(0),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      raf,
      last = performance.now();
    (async () => {
      try {
        const bytes = new Uint8Array(await video.file.arrayBuffer()),
          h = parseHeader(bytes, bytes.length);
        if (crc32(bytes.subarray(HEADER)) !== h.crc)
          throw new Error("El vídeo no supera la comprobación CRC.");
        if (!alive) return;
        Object.assign(state.current, {
          bytes,
          h,
          d: new DataView(bytes.buffer),
        });
        canvas.current.width = h.width;
        canvas.current.height = h.height;
        const render = (now) => {
          const st = state.current;
          if (!st.paused)
            st.time = Math.min(
              h.durationMs / 1000,
              st.time + (now - last) / 1000,
            );
          last = now;
          const target = Math.min(h.frames - 1, Math.floor(st.time * h.fps));
          try {
            if (target !== st.last) {
              let start = st.last + 1;
              if (
                target < st.last ||
                target - st.last > h.keyInterval ||
                st.last < 0
              ) {
                start = Math.floor(target / h.keyInterval) * h.keyInterval;
                st.frame = null;
              }
              for (let i = start; i <= target; i++) {
                const p = h.indexOffset + i * 12,
                  off = st.d.getUint32(p, true),
                  n = st.d.getUint32(p + 4, true);
                if (off < h.dataOffset || n > bytes.length - off)
                  throw new Error("Fotograma incompleto.");
                st.frame = decodeFrame(
                  bytes.subarray(off, off + n),
                  bytes[p + 8],
                  h.width * h.height,
                  st.frame,
                );
              }
              st.last = target;
              const rgba = new Uint8ClampedArray(h.width * h.height * 4);
              for (let i = 0; i < st.frame.length; i++)
                rgba.set([...rgb332ToRgb(st.frame[i]), 255], i * 4);
              canvas.current
                .getContext("2d")
                .putImageData(new ImageData(rgba, h.width, h.height), 0, 0);
            }
            setTime(st.time);
            if (st.time >= h.durationMs / 1000) {
              st.paused = true;
              setPaused(true);
            }
            if (alive) raf = requestAnimationFrame(render);
          } catch (e) {
            setError(e.message);
          }
        };
        raf = requestAnimationFrame(render);
      } catch (e) {
        setError(e.message);
      }
    })();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [video]);
  const seek = (seconds) => {
    state.current.time = Math.max(
      0,
      Math.min(video.durationMs / 1000, seconds),
    );
    setTime(state.current.time);
  };
  return (
    <Modal title={video.title} onClose={onClose} wide>
      <canvas className="cvid-preview" ref={canvas} />
      {error && <p className="inline-warning">{error}</p>}
      <div className="preview-controls">
        <button
          className="icon-btn"
          aria-label="Retroceder 5 segundos"
          onClick={() => seek(time - 5)}
        >
          <SkipBack />
        </button>
        <button
          className="icon-btn"
          aria-label={paused ? "Reproducir" : "Pausar"}
          onClick={() => {
            if (time >= video.durationMs / 1000) seek(0);
            state.current.paused = !paused;
            setPaused(!paused);
          }}
        >
          {paused ? <Play /> : <Pause />}
        </button>
        <button
          className="icon-btn"
          aria-label="Avanzar 5 segundos"
          onClick={() => seek(time + 5)}
        >
          <SkipForward />
        </button>
        <input
          aria-label="Posición de reproducción"
          type="range"
          min={0}
          max={video.durationMs / 1000}
          step=".1"
          value={time}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span>
          {duration(time * 1000)}/{duration(video.durationMs)}
        </span>
      </div>
      <p className="muted">
        Previsualización del archivo convertido, con los mismos colores y
        fotogramas que reproduce la calculadora.
      </p>
    </Modal>
  );
}
