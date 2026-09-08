import { useState } from "react";
import { ImagePlus, Film } from "lucide-react";
import { Modal } from "./ui.jsx";
import {
  frameThumbnail,
  imageThumbnail,
  thumbnailFromCvid,
} from "./converter.js";
import { duration } from "./device.js";
export default function ThumbnailPicker({
  source,
  file,
  durationSeconds,
  start = 0,
  end = durationSeconds,
  onChoose,
  onClose,
}) {
  const [time, setTime] = useState(start),
    [result, setResult] = useState(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function capture(t) {
    setLoading(true);
    setError("");
    try {
      setResult(
        source
          ? await frameThumbnail(source, t)
          : await thumbnailFromCvid(file, t),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Modal title="Elegir miniatura" onClose={onClose}>
      <div className="thumbnail-preview">
        {result ? (
          <img src={result.url} alt="Miniatura seleccionada" />
        ) : (
          <Film size={38} />
        )}
      </div>
      <label className="frame-selector">
        Un fotograma del vídeo <strong>{duration(time * 1000)}</strong>
        <input
          aria-label="Momento de la miniatura"
          type="range"
          min={start}
          max={Math.max(start, end - 0.01)}
          step="0.1"
          value={time}
          onChange={(e) => setTime(Number(e.target.value))}
        />
      </label>
      <button
        className="btn secondary"
        disabled={loading}
        onClick={() => capture(time)}
      >
        {loading ? "Leyendo fotograma…" : "Usar este fotograma"}
      </button>
      <label className="btn secondary file-button">
        <ImagePlus size={17} />
        Subir una imagen
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            try {
              setResult(await imageThumbnail(f));
            } catch (err) {
              setError(err.message);
            }
          }}
        />
      </label>
      {error && <p className="inline-warning">{error}</p>}
      <div className="modal-actions">
        <button className="btn secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn primary"
          disabled={!result || loading}
          onClick={() => onChoose(result)}
        >
          Guardar miniatura
        </button>
      </div>
    </Modal>
  );
}
