import { useState, useEffect } from "react";
import {
  Plus,
  Film,
  RefreshCw,
  MoreVertical,
  Pencil,
  Download,
  Trash2,
  Calculator as CalcIcon,
  ArrowUpRight,
  Play,
  Usb,
} from "lucide-react";
import { mb, duration, saveDownload, newerVersion } from "./device.js";
import { rawThumbnailURL, thumbnailFromCvid } from "./converter.js";
export function VideoCard({ video, onEdit, onDelete, onPlay }) {
  const [url, setUrl] = useState(""),
    [menu, setMenu] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = new Uint8Array(
          await video.file
            .slice(video.thumbOffset, video.thumbOffset + video.thumbBytes)
            .arrayBuffer(),
        );
        const u = video.thumbBytes
          ? rawThumbnailURL(raw)
          : (await thumbnailFromCvid(video.file)).url;
        if (alive) setUrl(u);
      } catch {
        /* Fallback icon keeps a damaged thumbnail identifiable. */
      }
    })();
    return () => {
      alive = false;
    };
  }, [video]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);
  return (
    <article
      className="video-card"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      <button
        className="cover"
        onClick={() => onPlay(video)}
        aria-label={`Reproducir ${video.title}`}
      >
        <div className="cover-inner">
          {url ? <img src={url} alt="" /> : <Film size={38} />}
          <span className="cover-play">
            <Play size={28} fill="currentColor" />
          </span>
        </div>
        <span className="duration">{duration(video.durationMs)}</span>
      </button>
      <div className="video-title-row">
        <h3>{video.title || video.name.replace(/\.[^.]+$/, "")}</h3>
        <button
          className="icon-btn"
          aria-label={`Opciones de ${video.title}`}
          aria-expanded={menu}
          onClick={(e) => {
            e.stopPropagation();
            setMenu(!menu);
          }}
        >
          <MoreVertical size={19} />
        </button>
      </div>
      <p className="video-meta">
        {mb(video.size)} MB <span>·</span> {video.width} × {video.height}{" "}
        <span>·</span> {video.fps} fps
      </p>
      {menu && (
        <div className="context-menu" role="menu">
          <button role="menuitem" onClick={() => onEdit(video)}>
            <Pencil />
            Editar título y miniatura
          </button>
          <button
            role="menuitem"
            onClick={() => saveDownload(video.file, video.name)}
          >
            <Download />
            Descargar
          </button>
          <button
            role="menuitem"
            className="danger-text"
            onClick={() => onDelete(video)}
          >
            <Trash2 />
            Eliminar
          </button>
        </div>
      )}
    </article>
  );
}
export function Library({
  snapshot,
  release,
  releaseError,
  onRetryRelease,
  onConnect,
  onRefresh,
  onUpload,
  onEdit,
  onDelete,
  onPlay,
  onInstall,
}) {
  if (!snapshot)
    return (
      <section className="connect-screen">
        <div className="connect-copy">
          <h1>
            Tu calculadora.
            <br />
            Tu pequeño cine.
          </h1>
          <p>
            Convierte tus vídeos y llévalos a tu Casio.
            <br />
            Todo se procesa aquí, en tu navegador.
          </p>
          <button className="btn primary large" onClick={onConnect}>
            <Usb size={20} />
            Conectar calculadora
          </button>
          <button className="text-link" onClick={onUpload}>
            Convertir sin conectar <ArrowUpRight size={16} />
          </button>
          <div className="connect-help">
            <span>01</span>
            <p>Conecta tu CG50 por USB en modo almacenamiento.</p>
            <span>02</span>
            <p>Selecciona su carpeta principal y permite el acceso.</p>
            <span>03</span>
            <p>Carga un vídeo. Desconecta y dale al play.</p>
          </div>
        </div>
        <div className="connect-art" aria-hidden="true">
          <div className="screen-outline">
            <div className="screen-mosaic">
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="screen-overlay">
              <Play size={52} fill="currentColor" />
            </div>
            <div className="screen-timeline">
              <i />
            </div>
          </div>
          <p>396 × 224 píxeles de posibilidades.</p>
        </div>
      </section>
    );
  const total = snapshot.capacity,
    update =
      release &&
      snapshot.app &&
      newerVersion(release.version, snapshot.app.version) &&
      snapshot.app.sha256 !== release.sha256;
  return (
    <section>
      <div className="page-title">
        <h1>Tu biblioteca, en pequeño.</h1>
        <p>Tus vídeos. Una calculadora. Dale al play.</p>
      </div>
      <div className="device-row">
        <div className="device-name">
          <CalcIcon size={31} />
          <div>
            <strong>CASIO fx-CG50</strong>
            <p>
              {mb(snapshot.free)} MB disponibles{" "}
              <span>· estimación con reserva</span>
            </p>
          </div>
        </div>
        <button className="btn primary" onClick={onUpload}>
          <Plus size={19} />
          Cargar vídeo
        </button>
      </div>
      <div className="storage-track" aria-label="Almacenamiento estimado">
        <i
          className="storage-videos"
          style={{ width: `${(snapshot.videoBytes / total) * 100}%` }}
        />
        <i
          className="storage-other"
          style={{ width: `${(snapshot.otherBytes / total) * 100}%` }}
        />
        <i
          className="storage-reserve"
          style={{ width: `${(snapshot.reserve / total) * 100}%` }}
        />
      </div>
      <div className="storage-legend">
        <span>
          <i className="dot blue" />
          Vídeos <b>{mb(snapshot.videoBytes)} MB</b>
        </span>
        <span>
          <i className="dot gray" />
          Otros archivos <b>{mb(snapshot.otherBytes)} MB</b>
        </span>
        <span>
          <i className="dot reserve" />
          Reserva <b>{mb(snapshot.reserve)} MB</b>
        </span>
        <span>
          <i className="dot dark" />
          Disponible <b>{mb(snapshot.free)} MB</b>
        </span>
      </div>
      {!snapshot.app && (
        <div className="notice">
          <div>
            <strong>Falta el reproductor en tu calculadora.</strong>
            <p>
              Instala CasioVideo y podrás abrir los vídeos que cargues aquí.
            </p>
          </div>
          <button
            className="btn secondary"
            disabled={!release}
            onClick={onInstall}
          >
            Instalar reproductor {release?.version}
          </button>
        </div>
      )}
      {update && (
        <div className="notice">
          <div>
            <strong>Hay una nueva versión: {release.version}</strong>
            <p>Actualiza el reproductor conservando tus vídeos.</p>
          </div>
          <button className="btn secondary" onClick={onInstall}>
            Actualizar reproductor
          </button>
        </div>
      )}
      {snapshot.videos.length ? (
        <div className="library-grid">
          {snapshot.videos.map((v) => (
            <VideoCard
              key={v.name}
              video={v}
              onEdit={onEdit}
              onDelete={onDelete}
              onPlay={onPlay}
            />
          ))}
        </div>
      ) : (
        <div className="empty-library">
          <Film size={42} />
          <h2>La primera sesión es tuya.</h2>
          <p>Carga un vídeo y aparecerá aquí, con su miniatura y duración.</p>
          <button className="btn secondary" onClick={onUpload}>
            <Plus size={18} />
            Elegir vídeo
          </button>
        </div>
      )}
      {snapshot.invalid.length > 0 && (
        <p className="inline-warning">
          {snapshot.invalid.length} archivo(s) .cvid incompatible(s) o
          incompleto(s). No se han modificado.
        </p>
      )}
      <footer className="library-footer">
        <span>
          Reproductor{" "}
          {snapshot.app ? `v${snapshot.app.version}` : "no instalado"}
        </span>
        <button className="text-link" onClick={onRefresh}>
          <RefreshCw size={17} />
          Actualizar biblioteca
        </button>
      </footer>
      {releaseError && <p className="inline-warning">No se ha podido comprobar la última versión. <button className="text-link" onClick={onRetryRelease}>Reintentar</button></p>}
    </section>
  );
}
