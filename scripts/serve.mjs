import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] || join(process.cwd(), "dist"));
const port = Number(process.env.PORT || 3000);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
  [".ttf", "font/ttf"],
  [".wasm", "application/wasm"],
  [".glb", "model/gltf-binary"],
  [".gltf", "model/gltf+json"],
  [".vrm", "application/octet-stream"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".txt", "text/plain; charset=utf-8"]
]);

function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const target = normalize(join(root, decoded));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

async function readStatic(requestPath) {
  const target = resolvePath(requestPath);
  if (!target) return null;
  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      return { file: join(target, "index.html"), info: await stat(join(target, "index.html")) };
    }
    return { file: target, info };
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  let found = await readStatic(url.pathname);

  if (!found && !extname(url.pathname)) {
    found = await readStatic("/index.html");
  }

  if (!found) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("Not found");
    return;
  }

  try {
    const body = await readFile(found.file);
    res.writeHead(200, {
      "content-type": mime.get(extname(found.file).toLowerCase()) || "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    res.end("Internal error");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`[serve] LunaTz listening on http://0.0.0.0:${port}`);
  console.log(`[serve] root=${root}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
