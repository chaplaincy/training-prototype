import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mimeTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json"
};

const server = createServer(async (request, response) => {
  try {
    const requestPath = new URL(request.url, "http://localhost").pathname;
    const relativePath = requestPath === "/" ? "index.html" : normalize(requestPath).replace(/^[/\\]+/, "");
    const absolutePath = resolve(root, relativePath);
    if (!absolutePath.startsWith(root)) throw new Error("Invalid path");
    const body = await readFile(absolutePath);
    response.writeHead(200, { "content-type": mimeTypes[extname(absolutePath)] || "application/octet-stream" });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

try {
  const indexResponse = await fetch(`${base}/`);
  assert.equal(indexResponse.status, 200);
  const index = await indexResponse.text();
  assert.match(index, /<title>Chaplaincy Volunteer Preparation<\/title>/);
  assert.match(index, /src="app\.js"/);
  assert.match(index, /href="styles\.css"/);

  for (const asset of ["app.js", "styles.css", "content/course.json"]) {
    const response = await fetch(`${base}/${asset}`);
    assert.equal(response.status, 200, `${asset} should be served`);
  }

  const courseResponse = await fetch(`${base}/content/course.json`);
  const course = await courseResponse.json();
  assert.equal(course.modules.length, 8);

  for (const module of course.modules) {
    const response = await fetch(`${base}/${module.file}`);
    assert.equal(response.status, 200, `${module.file} should be served`);
    const content = await response.json();
    assert.equal(content.id, module.id);
  }

  console.log("Smoke test passed: the course shell and all 8 modules are served successfully.");
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}
