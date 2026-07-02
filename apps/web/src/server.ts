import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const port = Number.parseInt(process.env.WEB_PORT ?? "3000", 10);
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(moduleDirectory, "../public");

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

  if (request.method !== "GET") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ code: "method_not_allowed", message: "Method not allowed" }));
    return;
  }

  const fileName = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const safeFileName = path.normalize(fileName).replace(/^(\.\.[/\\])+/, "");

  try {
    const file = await readFile(path.join(publicDirectory, safeFileName));
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": contentTypeFor(safeFileName),
    });
    response.end(file);
  } catch {
    response.writeHead(404, {
      "cache-control": "no-store",
      "content-type": "text/html; charset=utf-8",
    });
    response.end(await readFile(path.join(publicDirectory, "index.html"), "utf8"));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(JSON.stringify({ event: "web_started", port }));
});

function contentTypeFor(fileName: string): string {
  if (fileName.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }

  if (fileName.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }

  if (fileName.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }

  return "application/octet-stream";
}
