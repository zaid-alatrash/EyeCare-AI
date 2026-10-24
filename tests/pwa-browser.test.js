"use strict";
// Requires a dedicated Chromium/Edge --headless=new --remote-debugging-port=9223
// --user-data-dir=<new OS temporary directory>. No real microphone/camera used.
// Own HTTP server mounts this workspace at / and /EyeCare-AI/ on port 8766.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const root = path.resolve(__dirname,"..");
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
let online = true;
let version = "v2";
const server = http.createServer((req,res)=>{
  if(!online) { req.socket.destroy(); return; }
  let pathname = decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  if(pathname.startsWith("/EyeCare-AI/")) pathname=pathname.slice("/EyeCare-AI".length);
  if(pathname.endsWith("/")) pathname+="index.html";
  const file=path.resolve(root,"."+pathname);
  if(!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404);res.end();return; }
  const types={".js":"text/javascript",".css":"text/css",".html":"text/html; charset=utf-8",".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml",".ttf":"font/ttf"};
  res.setHeader("Content-Type",types[path.extname(file)]||"application/octet-stream");
  res.setHeader("Cache-Control","no-cache");
  const content=fs.readFileSync(file);
  res.end(pathname==="/sw.js"?content.toString().replace('const VERSION = "v2"',`const VERSION = "${version}"`):content);
});
class CDP {
  constructor(url){this.ws=new WebSocket(url);this.id=0;this.pending=new Map();}
  async connect(){await new Promise((resolve,reject)=>{this.ws.addEventListener("open",resolve,{once:true});this.ws.addEventListener("error",reject,{once:true});});this.ws.addEventListener("message",event=>{const msg=JSON.parse(event.data);const p=this.pending.get(msg.id);if(p){clearTimeout(p.timer);this.pending.delete(msg.id);msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}});}
  send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error("CDP timeout: "+method));},15000);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression){const r=await this.send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
  close(){for(const p of this.pending.values())clearTimeout(p.timer);this.ws.close();}
}
async function waitFor(fn){for(let i=0;i<80;i++){if(await fn())return;await sleep(150);}throw Error("Timed out waiting for browser state");}
(async()=>{
  await new Promise(resolve=>server.listen(8766,"127.0.0.1",resolve));
  const targets=await fetch("http://127.0.0.1:9223/json").then(r=>r.json());
  const target=targets.find(t=>t.type==="page");
  assert.ok(target,"Start a dedicated test browser first");
  const client=new CDP(target.webSocketDebuggerUrl);
  try {
    await client.connect();await client.send("Page.enable");
    await client.send("Page.navigate", { url: "about:blank" });
    await client.send("Storage.clearDataForOrigin", { origin: "http://127.0.0.1:8766", storageTypes: "all" });
    for(const prefix of ["/EyeCare-AI/","/"]) {
      const base="http://127.0.0.1:8766"+prefix;
      await client.send("Page.navigate",{url:base+"pages/disease-guide.html"});
      await waitFor(()=>client.evaluate("navigator.serviceWorker.controller?.scriptURL === '"+base+"sw.js'"));
      const scope=await client.evaluate("navigator.serviceWorker.ready.then(r=>r.scope)");
      assert.equal(scope,base);
      const manifest=await client.send("Page.getAppManifest");
      assert.equal(manifest.url,base+"manifest.webmanifest");
      assert.equal((manifest.errors||[]).length,0);
      assert.equal(JSON.parse(manifest.data).display,"standalone");
      const installState = await client.evaluate(`(async () => {
        let prompted = 0;
        const event = new Event('beforeinstallprompt', { cancelable: true });
        event.prompt = async () => { prompted += 1; };
        event.userChoice = Promise.resolve({ outcome: 'dismissed' });
        window.dispatchEvent(event);
        const button = document.querySelector('[data-pwa-install]');
        const visible = !button.hidden;
        button.click(); await Promise.resolve();
        button.click();
        return { visible, hiddenAfter: button.hidden, prompted };
      })()`);
      assert.deepEqual(installState, { visible: true, hiddenAfter: true, prompted: 1 });
      // Record eligibility diagnostics without assuming a physical-device install.
      console.log("Installability diagnostics",prefix,JSON.stringify(await client.send("Page.getInstallabilityErrors")));
      await client.evaluate("localStorage.setItem('eyecare_pwa_test','preserved'); caches.open('unrelated-test-cache')");
      await client.send("Page.navigate",{url:base+"pages/disease-guide.html"});
      await waitFor(()=>client.evaluate("Boolean(document.querySelector('[data-disease-grid]'))"));
      await client.evaluate("fetch('"+base+"pages/history.html'); fetch('"+base+"api/predict').catch(()=>{})");
      await sleep(300);
      const urls=await client.evaluate("caches.open('eyecare-pwa:"+prefix+":v2').then(c=>c.keys()).then(keys=>keys.map(k=>k.url))");
      assert.ok(urls.includes(base+"pages/disease-guide.html"));
      assert.ok(!urls.some(url=>/history.html|api\/predict/.test(url)));
      online=false;
      await client.send("Page.navigate",{url:base+"pages/disease-guide.html"});
      await waitFor(()=>client.evaluate("Boolean(document.querySelector('[data-disease-grid]'))"));
      await client.send("Page.navigate",{url:base+"pages/history.html"});
      await waitFor(()=>client.evaluate("Boolean(document.querySelector('#home'))"));
      assert.equal(await client.evaluate("document.querySelector('#home').href"),base+"index.html");
      await client.send("Page.navigate",{url:base+"index.html"});
      await waitFor(()=>client.evaluate("Boolean(document.querySelector('[data-nav]'))"));
      assert.equal(await client.evaluate("localStorage.getItem('eyecare_pwa_test')"),"preserved");
      online=true;
      // Change only the HTTP-served worker version, keeping repository files intact.
      version="test-v2";
      await client.evaluate("navigator.serviceWorker.ready.then(r=>r.update())");
      await waitFor(()=>client.evaluate("navigator.serviceWorker.getRegistration().then(r=>Boolean(r.waiting))"));
      assert.equal(await client.evaluate("caches.has('eyecare-pwa:"+prefix+":v2')"),true);
      // Leave the scope: the waiting update may activate without interrupting an exam.
      await client.send("Page.navigate",{url:"about:blank"});await sleep(800);
      await client.send("Page.navigate",{url:base+"index.html"});
      await waitFor(()=>client.evaluate("caches.has('eyecare-pwa:"+prefix+":test-v2')"));
      await waitFor(()=>client.evaluate("caches.has('eyecare-pwa:"+prefix+":v2').then(v=>!v)"));
      assert.equal(await client.evaluate("caches.has('unrelated-test-cache')"),true);
      assert.equal(await client.evaluate("localStorage.getItem('eyecare_pwa_test')"),"preserved");
      // Only this isolated localhost test profile is cleared between mounts.
      await client.evaluate("navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister())))");
      await client.evaluate("caches.keys().then(ks=>Promise.all(ks.map(k=>caches.delete(k))))");
      version="v2";
      await client.send("Page.navigate",{url:"about:blank"});
    }
    console.log("PWA browser tests passed: nested-first registration, root/subpath scope, manifest, offline cache/fallback, update waiting/cleanup, localStorage preserved.");
  } finally {client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.closeAllConnections();server.close();process.exitCode=1;});
