import { useEffect, useRef, useState } from "react";
import { Github, ArrowLeft, Usb, Check, X, Plus, Film } from "lucide-react";
import { Brand, Modal, Progress } from "./ui.jsx";
import { Library } from "./Library.jsx";
import Converter from "./Converter.jsx";
import ThumbnailPicker from "./ThumbnailPicker.jsx";
import VideoPreview from "./VideoPreview.jsx";
import {
  Calculator,
  releaseInfo,
  saveDownload,
  CAPACITY,
  RESERVE,
} from "./device.js";
import { convert, rawThumbnailURL, thumbnailFromCvid } from "./converter.js";
import { updateMetadata } from "./format.js";
function EditVideo({ video, onSave, onClose }) {
  const [title, setTitle] = useState(video.title),
    [poster, setPoster] = useState(null),
    [picker, setPicker] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const raw = new Uint8Array(
          await video.file
            .slice(video.thumbOffset, video.thumbOffset + video.thumbBytes)
            .arrayBuffer(),
        );
        setPoster(
          video.thumbBytes
            ? { raw, url: rawThumbnailURL(raw) }
            : await thumbnailFromCvid(video.file),
        );
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [video]);
  return (
    <>
      <Modal title="Editar vídeo" onClose={onClose}>
        <button
          className="cover poster-picker"
          aria-label="Cambiar miniatura"
          onClick={() => setPicker(true)}
        >
          {poster ? (
            <img src={poster.url} alt="Miniatura del vídeo" />
          ) : (
            <Film />
          )}
          <span className="poster-hover">
            <Plus />
            <span>Cambiar miniatura</span>
          </span>
        </button>
        <label className="title-input">
          Título
          <input
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {error && <p className="inline-warning">{error}</p>}
        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={!title.trim() || !poster}
            onClick={() => onSave(title.trim(), poster.raw)}
          >
            Guardar cambios
          </button>
        </div>
      </Modal>
      {picker && (
        <ThumbnailPicker
          file={video.file}
          durationSeconds={video.durationMs / 1000}
          onClose={() => setPicker(false)}
          onChoose={(p) => {
            setPoster(p);
            setPicker(false);
          }}
        />
      )}
    </>
  );
}
export default function App() {
  const [tab, setTab] = useState("library"),
    [calculator, setCalculator] = useState(null),
    [snapshot, setSnapshot] = useState(null),
    [release, setRelease] = useState(null),
    [releaseError, setReleaseError] = useState(""),
    [source, setSource] = useState(null),
    [progress, setProgress] = useState(null),
    [problem, setProblem] = useState(null),
    [editing, setEditing] = useState(null),
    [deleting, setDeleting] = useState(null),
    [preview, setPreview] = useState(null),
    [notice, setNotice] = useState("");
  const abort = useRef(),
    active = useRef(false);
  async function loadRelease() {
    setReleaseError("");
    try { setRelease(await releaseInfo()); }
    catch (e) { setReleaseError(e.message); }
  }
  useEffect(() => { loadRelease(); }, []);
  useEffect(() => {
    const guard = (e) => {
      if (active.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(t);
  }, [notice]);
  const error = (e) => {
    if (e.name !== "AbortError") setProblem(e);
  };
  async function connect() {
    try {
      const calc = await Calculator.connect();
      setCalculator(calc);
      setSnapshot(calc.snapshot);
      setNotice("Calculadora conectada. Biblioteca lista.");
    } catch (e) {
      error(e);
    }
  }
  async function work(title, label, fn) {
    if (active.current) return;
    active.current = true;
    setProgress({ title, label, percent: 0 });
    try {
      await fn((p) => setProgress({ title, label, percent: p }));
      if (calculator) setSnapshot(calculator.snapshot);
    } catch (e) {
      error(e);
    } finally {
      active.current = false;
      setProgress(null);
    }
  }
  async function upload(args) {
    if (active.current) return;
    active.current = true;
    abort.current = new AbortController();
    setProgress({
      title: "Preparando tu vídeo",
      label: "Convirtiendo vídeo en este navegador",
      percent: 0,
    });
    try {
      if (calculator) {
        await calculator.scan();
        setSnapshot(calculator.snapshot);
      }
      const free = calculator ? calculator.snapshot.free : CAPACITY - RESERVE;
      const result = await convert(
        args.source,
        args.start,
        args.end,
        args.options,
        free - 8192,
        args.title,
        args.poster,
        (p) => setProgress({ title: "Preparando tu vídeo", ...p }),
        abort.current.signal,
      );
      abort.current = null;
      if (calculator) {
        await calculator.upload(result.bytes, (p) =>
          setProgress({
            title: "Cargando vídeo",
            label: "Subiendo archivo a la calculadora",
            percent: p,
          }),
        );
        setSnapshot(calculator.snapshot);
        setTab("library");
        setNotice(
          "Vídeo copiado y verificado. Expulsa la unidad desde tu sistema antes de desconectarla.",
        );
      } else {
        saveDownload(
          new Blob([result.bytes]),
          `${args.title.normalize("NFKD").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 26) || "video"}.cvid`,
        );
        setNotice(
          "Vídeo convertido. Conecta la calculadora para cargarlo o copia el archivo a su raíz.",
        );
      }
    } catch (e) {
      error(e);
    } finally {
      active.current = false;
      abort.current = null;
      setProgress(null);
    }
  }
  async function refresh() {
    await work(
      "Conectando con tu Casio",
      "Leyendo contenido de la calculadora",
      async (p) => {
        p(20);
        setSnapshot(await calculator.scan());
        p(100);
      },
    );
  }
  async function install() {
    if (!release) return;
    await work(
      "Instalando CasioVideo",
      "Actualizando contenido en la calculadora",
      async (p) => {
        await calculator.install(release, p);
        setNotice(
          "Reproductor instalado y verificado. Expulsa la calculadora, desconecta el cable y vuelve al menú principal.",
        );
      },
    );
  }
  async function save(title, poster) {
    const item = editing;
    setEditing(null);
    await work(
      "Guardando cambios",
      "Actualizando contenido en la calculadora",
      async (p) => {
        p(4);
        const f = await item.handle.getFile(),
          bytes = new Uint8Array(await f.arrayBuffer()),
          updated = updateMetadata(bytes, title, poster);
        await calculator.update(item, updated, p);
        setNotice("Título y miniatura actualizados.");
      },
    );
  }
  async function remove() {
    const item = deleting;
    setDeleting(null);
    await work(
      "Eliminando vídeo",
      "Actualizando contenido en la calculadora",
      async (p) => {
        await calculator.remove(item, p);
        setNotice("Vídeo eliminado de la calculadora.");
      },
    );
  }
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav aria-label="Navegación principal">
          <button
            className={tab === "library" ? "active" : ""}
            onClick={() => setTab("library")}
          >
            Biblioteca
          </button>
          <button
            className={tab === "convert" ? "active" : ""}
            onClick={() => setTab("convert")}
          >
            Convertir
          </button>
        </nav>
        <a
          className="github"
          href="https://github.com/samilososami/CasioVideo"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={20} />
          <span>GitHub</span>
        </a>
      </header>
      <main className="workspace">
        {tab === "library" ? (
          <Library
            snapshot={snapshot}
            release={release}
            releaseError={releaseError}
            onRetryRelease={loadRelease}
            onConnect={connect}
            onRefresh={refresh}
            onUpload={() => setTab("convert")}
            onEdit={setEditing}
            onDelete={setDeleting}
            onPlay={setPreview}
            onInstall={install}
          />
        ) : (
          <Converter
            source={source}
            setSource={setSource}
            free={snapshot?.free ?? CAPACITY - RESERVE}
            connected={!!calculator}
            onUpload={upload}
            onError={error}
            converting={!!progress}
          />
        )}
        <footer className="site-footer">
          <a href="/tools/">
            <ArrowLeft size={14} />
            Herramientas de Sami
          </a>
          <span>Hecho para Casio fx-CG50 · samilososami.com</span>
          {tab === "convert" && !calculator && (
            <button className="text-link" onClick={connect}>
              <Usb size={15} />
              Conectar calculadora
            </button>
          )}
        </footer>
      </main>
      {notice && (
        <div role="status" className="toast">
          <Check size={19} />
          <span>{notice}</span>
          <button
            aria-label="Cerrar notificación"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {editing && (
        <EditVideo
          video={editing}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {deleting && (
        <Modal title="¿Eliminar este vídeo?" onClose={() => setDeleting(null)}>
          <p>
            «{deleting.title}» se eliminará de la calculadora. El archivo
            original de tu ordenador no cambia.
          </p>
          <div className="modal-actions">
            <button className="btn secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </button>
            <button className="btn danger" onClick={remove}>
              Eliminar vídeo
            </button>
          </div>
        </Modal>
      )}
      {preview && (
        <VideoPreview video={preview} onClose={() => setPreview(null)} />
      )}{" "}
      {progress && (
        <Progress
          state={progress}
          onCancel={abort.current ? () => abort.current.abort() : null}
        />
      )}{" "}
      {problem && (
        <Modal
          title="No se ha completado la operación"
          onClose={() => setProblem(null)}
        >
          <p>{problem.message || String(problem)}</p>
          {problem.recovery && (
            <button
              className="btn secondary"
              onClick={() => saveDownload(problem.recovery, problem.failedFile)}
            >
              Descargar copia anterior
            </button>
          )}
          <div className="modal-actions">
            <button className="btn primary" onClick={() => setProblem(null)}>
              Entendido
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
