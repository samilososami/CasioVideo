const REPO = "samilososami/CasioVideo";
const allowed = new Set(["CasioVideo.g3a", "SHA256SUMS", "release.json"]);
let cache = null,
  cacheTime = 0;
async function latest() {
  if (cache && Date.now() - cacheTime < 60000) return cache;
  const r = await fetch(
    `https://api.github.com/repos/${REPO}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "CasioVideo",
      },
    },
  );
  if (!r.ok) throw new Error(`GitHub Releases: ${r.status}`);
  const release = await r.json(),
    file = release.assets.find((a) => a.name === "CasioVideo.g3a"),
    sum = release.assets.find((a) => a.name === "SHA256SUMS");
  if (!file || !sum) throw new Error("Release sin archivos de instalación.");
  const checksumResponse = await fetch(sum.browser_download_url);
  if (!checksumResponse.ok) throw new Error("No se pueden leer los checksums.");
  const checksums = await checksumResponse.text(),
    line = checksums
      .split("\n")
      .find((l) => /\s\*?CasioVideo\.g3a\s*$/.test(l));
  const hash = line?.trim().split(/\s/)[0];
  if (!/^[a-f0-9]{64}$/i.test(hash || ""))
    throw new Error("Checksum SHA-256 no válido.");
  cache = {
    version: release.tag_name.replace(/^v/, ""),
    url: release.html_url,
    sha256: hash,
    size: file.size,
    assets: release.assets,
  };
  cacheTime = Date.now();
  return cache;
}
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }
  try {
    const query = new URL(req.url, "https://casiovideo.local").searchParams,
      asset = query.get("asset");
    if (asset && !allowed.has(asset)) {
      res.statusCode = 400;
      res.end("Unknown asset");
      return;
    }
    const release = await latest();
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (asset) {
      const selected = release.assets.find((a) => a.name === asset);
      if (!selected) throw new Error("Archivo no disponible.");
      const u = new URL(selected.browser_download_url);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "github.com" ||
        !u.pathname.startsWith(`/${REPO}/releases/download/`)
      )
        throw new Error("URL de release no válida.");
      const r = await fetch(u);
      if (!r.ok) throw new Error("No se ha podido descargar la release.");
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 2 * 1024 * 1024)
        throw new Error("Add-in demasiado grande.");
      res.setHeader("Content-Type", "application/octet-stream");
      res.end(b);
    } else {
      res.setHeader("Content-Type", "application/json");
      const { assets, ...publicInfo } = release;
      res.end(JSON.stringify(publicInfo));
    }
  } catch (error) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "No se ha podido consultar GitHub Releases. Inténtalo de nuevo.",
      }),
    );
  }
}
