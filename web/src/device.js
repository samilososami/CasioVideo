import { parseHeader, crc32, HEADER, MAX_FILE } from "./format.js";
export const CAPACITY = 16801792,
  RESERVE = 524288;
// A manually copied CVID is also ours, but never accept paths or long names
// that the native BFile scanner cannot represent.
const ownedPattern = /^[A-Za-z0-9_-][A-Za-z0-9 _-]{0,25}\.cvid$/i;
const exists = async (dir, name) => {
  try {
    return await dir.getFileHandle(name);
  } catch (e) {
    if (e.name === "NotFoundError" || e.name === "TypeMismatchError")
      return null;
    throw e;
  }
};
export const mb = (bytes) =>
  (bytes / 1e6).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export async function sha256(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export class Calculator {
  constructor(root) {
    this.root = root;
    this.busy = false;
    this.snapshot = null;
  }
  static async connect() {
    if (!("showDirectoryPicker" in window))
      throw new Error(
        "La conexión requiere Chrome o Edge de escritorio. Puedes convertir y descargar vídeos desde este navegador.",
      );
    const dir = await window.showDirectoryPicker({
      mode: "readwrite",
      id: "casiovideo-device",
    });
    const calc = new Calculator(dir);
    // Read-only identity check before the first write. Do not create markers on an arbitrary folder.
    let isCasio = false;
    for await (const e of dir.values())
      if (e.name === "@MainMem" || e.name.toLowerCase().endsWith(".g3a"))
        isCasio = true;
    if (!isCasio)
      throw new Error(
        "Selecciona la raíz de la calculadora: la carpeta que contiene @MainMem o tus archivos .g3a.",
      );
    await calc.scan();
    return calc;
  }
  async scan() {
    let bytes = 0,
      allocated = 0,
      entries = 0;
    const videos = [],
      invalid = [];
    async function walk(dir, depth = 0) {
      if (depth > 16)
        throw new Error(
          "La estructura de carpetas no parece la de una calculadora.",
        );
      for await (const entry of dir.values()) {
        if (++entries > 6000)
          throw new Error(
            "Demasiados archivos. Selecciona la unidad de la calculadora.",
          );
        if (entry.kind === "directory") {
          allocated += 4096;
          await walk(entry, depth + 1);
        } else {
          const file = await entry.getFile();
          bytes += file.size;
          allocated += Math.ceil(file.size / 4096) * 4096;
          if (depth === 0 && entry.name.toLowerCase().endsWith(".cvid")) {
            try {
              const raw = new Uint8Array(
                  await file.slice(0, HEADER).arrayBuffer(),
                ),
                h = parseHeader(raw, file.size);
              videos.push({ ...h, name: entry.name, file, handle: entry });
            } catch (e) {
              invalid.push({ name: entry.name, error: e.message });
            }
          }
        }
      }
    }
    await walk(this.root);
    let app = null;
    for await (const entry of this.root.values())
      if (
        entry.kind === "file" &&
        entry.name.toLowerCase() === "casiovideo.g3a"
      ) {
        const f = await entry.getFile(),
          bytes = new Uint8Array(await f.arrayBuffer());
        const version = new TextDecoder()
          .decode(bytes.subarray(0x130, 0x13a))
          .replace(/\0/g, "")
          .trim();
        app = {
          version: version || "Desconocida",
          size: f.size,
          sha256: await sha256(bytes),
          name: entry.name,
        };
      }
    const videoBytes = videos.reduce(
      (n, v) => n + Math.ceil(v.size / 4096) * 4096,
      0,
    );
    this.snapshot = {
      videos: videos.sort((a, b) => a.title.localeCompare(b.title)),
      invalid,
      bytes,
      allocated,
      videoBytes,
      otherBytes: Math.max(0, allocated - videoBytes),
      free: Math.max(0, CAPACITY - allocated - RESERVE),
      capacity: CAPACITY,
      reserve: RESERVE,
      app,
    };
    return this.snapshot;
  }
  async transaction(action) {
    if (this.busy) throw new Error("Hay otra operación en curso.");
    const run = async () => {
      this.busy = true;
      try {
        return await action();
      } finally {
        this.busy = false;
      }
    };
    if (navigator.locks)
      return navigator.locks.request(
        "casiovideo-usb-write",
        { ifAvailable: true },
        (lock) => {
          if (!lock)
            throw new Error("CasioVideo está escribiendo desde otra pestaña.");
          return run();
        },
      );
    return run();
  }
  async writeVerified(name, bytes, onProgress = () => {}, isNew = false) {
    if (!ownedPattern.test(name) && name.toLowerCase() !== "casiovideo.g3a")
      throw new Error("Nombre de archivo no autorizado.");
    const size = bytes.byteLength;
    if (!size || size > MAX_FILE)
      throw new Error(
        "Tamaño de archivo fuera de los límites de la calculadora.",
      );
    await this.scan();
    if (size + 8192 > this.snapshot.free)
      throw new Error(
        "Falta espacio para completar la escritura sin ocupar el margen de seguridad. Libera espacio o reduce el vídeo.",
      );
    const existing = await exists(this.root, name);
    if (isNew && existing)
      throw new Error("El nombre ya existe. Vuelve a intentarlo.");
    let backup = existing
      ? new Uint8Array(await (await existing.getFile()).arrayBuffer())
      : null;
    const handle =
      existing || (await this.root.getFileHandle(name, { create: true }));
    let stream;
    try {
      // Chrome writes into its own swap file and commits on close. Updating a
      // large existing file needs free space for a full additional copy.
      stream = await handle.createWritable({ keepExistingData: false });
      const chunk = 32768;
      for (let at = 0; at < size; at += chunk) {
        await stream.write(bytes.subarray(at, Math.min(size, at + chunk)));
        onProgress(Math.min(94, ((at + chunk) / size) * 94));
      }
      await stream.close();
      stream = null;
      onProgress(96);
      const readback = new Uint8Array(
        await (await handle.getFile()).arrayBuffer(),
      );
      if (
        readback.length !== size ||
        (await sha256(readback)) !== (await sha256(bytes))
      )
        throw new Error(
          "La verificación de la copia ha fallado. No desconectes la calculadora hasta cerrar este mensaje.",
        );
      onProgress(100);
      await this.scan();
      return handle;
    } catch (error) {
      if (stream)
        try {
          await stream.abort();
        } catch {
          /* Original error remains the useful diagnostic. */
        }
      // Preserve a downloadable copy of the original; never repeatedly retry
      // writes on a device reporting I/O errors.
      if (backup) error.recovery = new Blob([backup]);
      error.failedFile = name;
      throw error;
    }
  }
  async upload(bytes, progress) {
    parseHeader(bytes, bytes.length);
    if (
      crc32(bytes.subarray(HEADER)) !==
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(48, true)
    )
      throw new Error("El vídeo convertido no supera su comprobación CRC.");
    return this.transaction(async () => {
      let name;
      do {
        name = `CV${crypto.getRandomValues(new Uint32Array(1))[0].toString(16).slice(-6).padStart(6, "0").toUpperCase()}.cvid`;
      } while (await exists(this.root, name));
      return this.writeVerified(name, bytes, progress, true);
    });
  }
  async update(video, bytes, progress) {
    if (!ownedPattern.test(video.name))
      throw new Error(
        "Este nombre de archivo no pertenece al gestor. Descárgalo y vuelve a importarlo.",
      );
    parseHeader(bytes, bytes.length);
    if (
      crc32(bytes.subarray(HEADER)) !==
      new DataView(bytes.buffer, bytes.byteOffset).getUint32(48, true)
    )
      throw new Error("El vídeo editado no supera su comprobación CRC.");
    return this.transaction(async () => {
      const current = await this.root.getFileHandle(video.name),
        file = await current.getFile();
      parseHeader(
        new Uint8Array(await file.slice(0, HEADER).arrayBuffer()),
        file.size,
      );
      return this.writeVerified(video.name, bytes, progress);
    });
  }
  async remove(video, progress) {
    if (!ownedPattern.test(video.name))
      throw new Error("Este archivo no pertenece al gestor.");
    return this.transaction(async () => {
      const current = await this.root.getFileHandle(video.name),
        file = await current.getFile();
      parseHeader(
        new Uint8Array(await file.slice(0, HEADER).arrayBuffer()),
        file.size,
      );
      progress(20);
      await this.root.removeEntry(video.name);
      progress(80);
      if (await exists(this.root, video.name))
        throw new Error("No se ha podido confirmar el borrado.");
      await this.scan();
      progress(100);
    });
  }
  async install(release, progress) {
    return this.transaction(async () => {
      const response = await fetch(
        `${import.meta.env.BASE_URL}api/release?asset=CasioVideo.g3a`,
      );
      if (!response.ok)
        throw new Error(
          "No se ha podido descargar el reproductor de GitHub Releases.",
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      if ((await sha256(bytes)) !== release.sha256)
        throw new Error(
          "El reproductor descargado no coincide con la firma de la release.",
        );
      return this.writeVerified(
        this.snapshot?.app?.name || "CasioVideo.g3a",
        bytes,
        progress,
      );
    });
  }
}
export function saveDownload(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function releaseInfo() {
  const response = await fetch(`${import.meta.env.BASE_URL}api/release`);
  if (!response.ok)
    throw new Error("No se ha podido consultar la última versión.");
  return response.json();
}
export function sameVersion(a, b) {
  const norm = (v) =>
    String(v)
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0)
      .join(".");
  return norm(a) === norm(b);
}
export function newerVersion(candidate, installed) {
  const parts = (v) =>
    String(v)
      .replace(/^v/, "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parts(candidate),
    b = parts(installed);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
}
