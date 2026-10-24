"use strict";
// Existing localhost:8765 smoke suites, each in a fresh tab of the dedicated
// CDP test browser. PDF output is redirected without changing the original test.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const port = 8767;
const server = http.createServer((request, response) => {
  let pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const types = {
    ".css": "text/css",
    ".html": "text/html; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".webmanifest": "application/manifest+json"
  };
  response.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.end(fs.readFileSync(file));
});
async function freshTab() {
  const targets = await fetch("http://127.0.0.1:9223/json").then(r=>r.json());
  await fetch("http://127.0.0.1:9223/json/new?about:blank",{method:"PUT"});
  for(const target of targets.filter(t=>t.type==="page")) await fetch("http://127.0.0.1:9223/json/close/"+target.id);
}
(async()=>{
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  try {
    for(const name of ["browser-smoke.js","interactive-exams-smoke.js","pdf-report-smoke.js"]) {
      await freshTab();
      const file=path.join(__dirname,name);
      const source=fs.readFileSync(file,"utf8")
        .replaceAll("127.0.0.1:8765", `127.0.0.1:${port}`)
        .replace('path.join(__dirname, "..", "output", "pdf")','path.join(__dirname, "..", "tmp", "pwa-pdf-smoke")');
      const code=`const Module=require('node:module'); const path=require('node:path'); const file=${JSON.stringify(file)}; const mod=new Module(file); mod.filename=file; mod.paths=Module._nodeModulePaths(path.dirname(file)); mod._compile(${JSON.stringify(source)},file);`;
      await new Promise((resolve,reject)=>{
        const child=spawn(process.execPath,["-e",code],{stdio:"inherit"});
        const timer=setTimeout(()=>{child.kill();reject(Error(name+" timed out"));},60000);
        child.on("error",error=>{clearTimeout(timer);reject(error);});
        child.on("exit",code=>{clearTimeout(timer);code===0?resolve():reject(Error(name+" failed: "+code));});
      });
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
