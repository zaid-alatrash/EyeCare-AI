"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.name, "EyeCare AI");
assert.equal(manifest.short_name, "EyeCare");
assert.equal(manifest.display, "standalone");
assert.equal(manifest.theme_color, "#009BCB");
assert.equal(manifest.background_color, "#FFFFFF");
for (const icon of [...manifest.icons, { src: "assets/icons/apple-touch-icon.png", sizes: "180x180" }]) {
  const bytes = fs.readFileSync(path.join(root, icon.src));
  assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
}
assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
const pages = ["index.html", ...fs.readdirSync(path.join(root,"pages")).filter(p=>p.endsWith(".html")).map(p=>`pages/${p}`)];
for (const prefix of ["/", "/EyeCare-AI/"]) {
  const base = `https://example.test${prefix}`;
  assert.equal(new URL(manifest.start_url, base).pathname, prefix + "index.html");
  assert.equal(new URL(manifest.scope, base).pathname, prefix);
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root,file),"utf8");
    for (const [pattern, expected] of [
      [/rel="manifest" data-pwa-href="([^"]+)"/, "manifest.webmanifest"],
      [/rel="apple-touch-icon"[^>]*href="([^"]+)"/, "assets/icons/apple-touch-icon.png"],
      [/<script src="([^"]*js\/pwa.js)" defer/, "js/pwa.js"]
    ]) {
      const match = html.match(pattern);
      assert.ok(match, `${file}: missing PWA metadata`);
      assert.equal(new URL(match[1],new URL(file,base)).href,new URL(expected,base).href);
    }
  }
}

// Execute the actual worker against isolated Cache Storage, not production data.
async function workerTest(prefix) {
  const handlers = {};
  const stores = new Map();
  const base = `https://example.test${prefix}`;
  let offline = false;
  let privateResponse = false;
  function response(body="public", headers={}) {
    const result = new Response(body,{headers});
    Object.defineProperty(result,"type",{value:"basic"});
    return result;
  }
  const key = request => typeof request === "string" ? request : request.url;
  const caches = {
    keys: async()=>[...stores.keys()],
    delete: async name=>stores.delete(name),
    open: async name=> {
      if(!stores.has(name)) stores.set(name,new Map());
      const entries = stores.get(name);
      return { put:async(req,res)=>entries.set(key(req),res), match:async req=>entries.get(key(req))?.clone() };
    }
  };
  const context = { URL, Set, Response, caches,
    fetch:async()=>{ if(offline) throw Error("offline"); return response("public",privateResponse?{"Cache-Control":"private"}:{}); },
    self:{location:{href:base+"sw.js"},clients:{claim:async()=>{}},addEventListener:(name,fn)=>handlers[name]=fn}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,"sw.js"),"utf8"),context);
  await new Promise((resolve,reject)=>handlers.install({waitUntil:p=>p.then(resolve,reject)}));
  const current = `eyecare-pwa:${prefix}:v2`;
  const old = `eyecare-pwa:${prefix}:old`;
  stores.set(old,new Map()); stores.set("other-project",new Map());
  await new Promise((resolve,reject)=>handlers.activate({waitUntil:p=>p.then(resolve,reject)}));
  assert.equal(stores.has(old),false); assert.equal(stores.has("other-project"),true);
  for(const url of stores.get(current).keys()) assert.ok(fs.existsSync(path.join(root,new URL(url).pathname.slice(prefix.length))));
  async function dispatch(relative, mode="navigate", options={}) {
    let output;
    const pending=[];
    const request={url:new URL(relative,base).href,method:"GET",mode,headers:new Headers(),...options};
    handlers.fetch({request,respondWith:p=>output=p,waitUntil:p=>pending.push(p)});
    await Promise.all(pending);
    return output ? await output : null;
  }
  await dispatch("pages/disease-guide.html");
  assert.ok(stores.get(current).has(base+"pages/disease-guide.html"));
  for(const file of ["pages/history.html","pages/messages.html","pages/appointments.html","pages/patient-dashboard.html","pages/doctor-dashboard.html","api/predict","output/report.pdf","tmp/test.html","pages/disease-details.html?id=amd"]) {
    await dispatch(file);
    assert.equal(stores.get(current).has(base+file),false,file);
  }
  assert.equal(await dispatch("api/predict","cors",{method:"POST"}),null);
  assert.equal(await dispatch("https://cdn.example.test/model.wasm","cors"),null);
  assert.equal(await dispatch("js/main.js","cors",{headers:new Headers({Authorization:"Bearer test"})}),null);
  privateResponse=true;
  await dispatch("pages/oct-examination.html");
  assert.equal(stores.get(current).has(base+"pages/oct-examination.html"),false);
  privateResponse=false; offline=true;
  assert.equal(await (await dispatch("pages/disease-guide.html")).text(),"public");
  assert.ok(await dispatch("pages/unvisited.html"));
  assert.equal((await dispatch("assets/images/oct1.jpeg","no-cors")).type,"error");
}
(async()=>{
  await workerTest("/"); await workerTest("/EyeCare-AI/");
  console.log(`PWA checks passed: ${pages.length} entries, icons, root/subpath metadata, cache allowlist, offline fallback, scoped cleanup.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
