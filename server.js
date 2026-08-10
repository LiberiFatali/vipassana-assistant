/**
 * Local dev server — zero-dependency alternative to `vercel dev`.
 *
 * Serves the static `public/` frontend and routes `POST /api/chat` to the
 * Vercel-style function in `api/chat.js`. The handler speaks standard Web
 * Request/Response, so we bridge node's http request to a Request object.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { POST } from "./api/chat.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = join(ROOT, "public");
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function serveStatic(req, res, pathname) {
  let filePath = normalize(join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  let stat;
  try {
    stat = await readFile(filePath);
  } catch {
    res.writeHead(404).end("Not Found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
  });
  res.end(stat);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/chat" && req.method === "POST") {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const headers = {};
    for (const [key, value] of Object.entries(req.headers)) {
      headers[key] = String(value);
    }
    if (body.length > 0 && !("content-length" in headers)) {
      headers["content-length"] = String(body.length);
    }

    try {
      const request = new Request(url, {
        method: req.method,
        headers,
        body,
      });
      const response = await POST(request);
      res.writeHead(response.status, {
        "Content-Type": response.headers.get("content-type") || "application/json",
      });
      // Pipe the web Response body through so SSE flows incrementally in dev.
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* already released */
          }
        }
        res.end();
      } else {
        res.end(await response.text());
      }
    } catch (err) {
      console.error("api/chat failed:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal server error" }));
    }
    return;
  }

  await serveStatic(req, res, url.pathname === "/" ? "/index.html" : url.pathname);
});

server.listen(PORT, () => {
  console.log(`Vipassana UCENLIST chatbot running at http://localhost:${PORT}`);
});
