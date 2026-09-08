import { useEffect, useRef, useState } from "react";
import {
  FileVideo,
  Plus,
  ArrowRight,
  Film,
  Upload,
  VolumeX,
  Scissors,
} from "lucide-react";
import { Slider } from "./ui.jsx";
import ThumbnailPicker from "./ThumbnailPicker.jsx";
import {
  DEFAULTS,
  RESOLUTIONS,
  FPS,
  COLORS,
  BITRATES,
  COMPRESSION,
  sourceVideo,
  frameThumbnail,
  estimate,
  chooseSettings,
} from "./converter.js";
import { mb, duration } from "./device.js";
export default function Converter({
  source,
  setSource,
  free,
  onUpload,
  onError,
  connected,
  converting,
}) {
  const [options, setOptions] = useState(DEFAULTS),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [title, setTitle] = useState(""),
    [poster, setPoster] = useState(null),
    [picking, setPicking] = useState(false),
    [est, setEst] = useState(null),
    [estimating, setEstimating] = useState(false),
    [opening, setOpening] = useState(false);
  const picker = useRef();
  useEffect(() => {
    if (!source) return;
    setStart(0);
    setEnd(source.duration);
    setTitle(source.file.name.replace(/\.[^.]+$/, ""));
    setPoster(null);
    frameThumbnail(source, Math.min(1, source.duration / 2))
      .then(setPoster)
      .catch(onError);
  }, [source]);
  useEffect(() => {
    if (!source || !(end > start) || converting) return;
    const abort = new AbortController();
    let tmp;
    let timer = setTimeout(async () => {
      setEstimating(true);
      try {
        tmp = await sourceVideo(source.file);
        if (abort.signal.aborted) return;
        const v = await estimate(tmp, start, end, options, free, abort.signal);
        if (!abort.signal.aborted) setEst(v);
      } catch (e) {
        if (e.name !== "AbortError" && !abort.signal.aborted) onError(e);
      } finally {
        tmp?.close();
        if (!abort.signal.aborted) setEstimating(false);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [source, start, end, options, free, converting]);
  async function select(file) {
    if (!file) return;
    setOpening(true);
    try {
      const s = await sourceVideo(file);
      source?.close();
      setSource(s);
    } catch (e) {
      onError(e);
    } finally {
      setOpening(false);
    }
  }
  const s = chooseSettings(options, Math.max(0.1, end - start), free),
    estimated = est?.bytes || 0;
  const set = (key, value) => setOptions((o) => ({ ...o, [key]: value }));
  return (
    <section>
      <div className="page-title">
        <h1>Cada megabyte cuenta.</h1>
        <p>Ajusta el vídeo. Mira el resultado. Llévalo a tu Casio.</p>
      </div>
      <input
        ref={picker}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(e) => select(e.target.files[0])}
      />
      {!source ? (
        <div
          className="dropzone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            select(e.dataTransfer.files[0]);
          }}
        >
          <Film size={44} />
          <h2>
            {opening
              ? "Abriendo vídeo…"
              : "Dale una nueva pantalla a ese vídeo."}
          </h2>
          <p>Arrástralo aquí o elige un archivo de tu ordenador.</p>
          <button
            className="btn primary"
            disabled={opening}
            onClick={() => picker.current.click()}
          >
            <Upload size={18} />
            Elegir vídeo
          </button>
          <small>
            MP4 o WebM compatible con tu navegador. Sin audio, sin subirlo a un
            servidor.
          </small>
        </div>
      ) : (
        <>
          <div className="editor-grid">
            <div className="editor-controls">
              <div className="file-row">
                <FileVideo size={20} />
                <span title={source.file.name}>{source.file.name}</span>
                <button
                  className="text-link"
                  onClick={() => picker.current.click()}
                >
                  Cambiar
                </button>
              </div>
              <div className="trim">
                <div className="field-heading">
                  <label>
                    <Scissors size={15} />
                    Recortar vídeo
                  </label>
                  <button
                    className="auto"
                    onClick={() => {
                      setStart(0);
                      setEnd(source.duration);
                    }}
                  >
                    Todo
                  </button>
                </div>
                <div className="trim-track">
                  <i
                    style={{
                      left: `${(start / source.duration) * 100}%`,
                      right: `${100 - (end / source.duration) * 100}%`,
                    }}
                  />
                </div>
                <div className="trim-inputs">
                  <label>
                    Inicio <strong>{duration(start * 1000)}</strong>
                    <input
                      aria-label="Inicio del recorte"
                      type="range"
                      min={0}
                      max={source.duration}
                      step="0.1"
                      value={start}
                      onChange={(e) =>
                        setStart(Math.min(Number(e.target.value), end - 0.1))
                      }
                    />
                    <input
                      aria-label="Inicio en segundos"
                      type="number"
                      min={0}
                      max={end - 0.1}
                      step="0.1"
                      value={start}
                      onChange={(e) =>
                        setStart(
                          Math.max(
                            0,
                            Math.min(Number(e.target.value), end - 0.1),
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Fin <strong>{duration(end * 1000)}</strong>
                    <input
                      aria-label="Fin del recorte"
                      type="range"
                      min={0}
                      max={source.duration}
                      step="0.1"
                      value={end}
                      onChange={(e) =>
                        setEnd(Math.max(Number(e.target.value), start + 0.1))
                      }
                    />
                    <input
                      aria-label="Fin en segundos"
                      type="number"
                      min={start + 0.1}
                      max={source.duration}
                      step="0.1"
                      value={Number(end.toFixed(2))}
                      onChange={(e) =>
                        setEnd(
                          Math.min(
                            source.duration,
                            Math.max(Number(e.target.value), start + 0.1),
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              </div>
              <div className="controls-grid">
                <Slider
                  label="Resolución"
                  values={RESOLUTIONS.map((_, i) => i)}
                  value={options.resolution}
                  onChange={(v) => set("resolution", v)}
                  format={(i) => RESOLUTIONS[i].join(" × ")}
                />
                <Slider
                  label="Fotogramas por segundo"
                  values={FPS}
                  value={options.fps}
                  onChange={(v) => set("fps", v)}
                  format={(v) => `${v} fps`}
                />
                <Slider
                  label="Colores"
                  values={COLORS}
                  value={options.colors}
                  onChange={(v) => set("colors", v)}
                  format={(v) => `${v} colores`}
                />
                <Slider
                  label="Compresión"
                  values={COMPRESSION.map((_, i) => i)}
                  value={options.compression}
                  onChange={(v) => set("compression", v)}
                  format={(i) => COMPRESSION[i]}
                />
                <Slider
                  label="Bitrate objetivo"
                  values={BITRATES}
                  value={options.bitrate}
                  onChange={(v) => set("bitrate", v)}
                  format={(v) => `${v} kbps`}
                />
                <Slider
                  label="Dithering"
                  values={["off", "on"]}
                  value={options.dither}
                  onChange={(v) => set("dither", v)}
                  format={(v) => (v === "on" ? "Activado" : "Desactivado")}
                />
              </div>
            </div>
            <div className="editor-preview">
              <button
                className="cover poster-picker"
                onClick={() => setPicking(true)}
                aria-label="Cambiar miniatura"
              >
                {poster ? (
                  <img src={poster.url} alt="Miniatura del vídeo" />
                ) : (
                  <Film size={40} />
                )}
                <span className="poster-hover">
                  <Plus size={32} />
                  <span>Cambiar miniatura</span>
                </span>
                <span className="duration">
                  {duration((end - start) * 1000)}
                </span>
              </button>
              <label className="title-input">
                Título del vídeo
                <input
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ponle un título"
                />
              </label>
              <p className="muted no-audio">
                <VolumeX size={16} />
                Sin audio. Solo tus imágenes.
              </p>
              <div className="conversion-spec">
                <span>Preparado para tu pantalla</span>
                <strong>
                  {s.width} × {s.height} <i>·</i> {s.fps} fps <i>·</i>{" "}
                  {s.colors} colores
                </strong>
                <p>
                  Los ajustes Auto se adaptan al presupuesto. La compresión alta
                  puede simplificar detalles en movimiento.
                </p>
              </div>
              <video
                controls
                muted
                playsInline
                src={source.url}
                className="source-preview"
                aria-label="Vista previa del vídeo original"
              />
            </div>
          </div>
          <div className="upload-footer">
            <div className="estimated-size">
              <strong>{estimated ? mb(estimated) : "—"} MB</strong>
              <span>{estimating ? "calculando…" : "estimados"}</span>
            </div>
            <div className="space-impact">
              <div className="progress-track">
                <i
                  style={{
                    width: `${free > 0 ? Math.min(100, (estimated / free) * 100) : 100}%`,
                  }}
                />
              </div>
              <p>
                {estimated > free
                  ? "Auto ajustará la calidad para que quepa."
                  : `Quedarían ${mb(Math.max(0, free - estimated))} MB disponibles`}{" "}
                {!connected && "· sin calculadora conectada"}
              </p>
            </div>
            <button
              className="btn primary large"
              disabled={!poster || !title.trim() || opening || converting}
              onClick={() =>
                onUpload({
                  source,
                  start,
                  end,
                  options,
                  title: title.trim(),
                  poster,
                })
              }
            >
              {connected ? "Cargar vídeo" : "Convertir y descargar"}
              <ArrowRight size={19} />
            </button>
          </div>
        </>
      )}
      {picking && (
        <ThumbnailPicker
          source={source}
          durationSeconds={source.duration}
          start={start}
          end={end}
          onClose={() => setPicking(false)}
          onChoose={(p) => {
            setPoster(p);
            setPicking(false);
          }}
        />
      )}
    </section>
  );
}
