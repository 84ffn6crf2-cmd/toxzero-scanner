// Tox Zero Scanner — UI. Scoring lives in engine.js; this file only fetches, routes and renders.
// Look: light raw photo + frosted glass + navy (tox-zero-brand DEFAULT LOOK). Pictures first, few words:
// photo + verdict stamp → three tiles (ingredients · packaging · owner) → swaptions as photo cards → tap-to-open why.
import { buildData, evaluate, fromOBF, normCode, searchPicks, swapsFor, scanIngredients, INGREDIENT_RULES } from "./engine.js";

const OBF = "https://world.openbeautyfacts.org";
const FIELDS = "code,product_name,product_name_en,generic_name,brands,ingredients_text,ingredients_text_en,packaging,packaging_tags,packagings,categories_tags,image_front_small_url";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const cache = new Map();   // code -> normalized product (from search results or earlier lookups)
let data;

// ── vet list (per-device convenience) ──
const VET_KEY = "tz-vet-list";
const vet = {
  all() { try { return JSON.parse(localStorage.getItem(VET_KEY)) || []; } catch { return []; } },
  add(p) {
    const list = vet.all().filter((x) => x.code !== p.code || !p.code);
    list.unshift({ code: p.code || "", name: p.name || "Unknown product", brand: (p.brands || [])[0] || "", image: p.image || "", at: new Date().toISOString().slice(0, 10) });
    try { localStorage.setItem(VET_KEY, JSON.stringify(list.slice(0, 200))); } catch {}
    paintVetCount();
  },
  clear() { try { localStorage.removeItem(VET_KEY); } catch {} paintVetCount(); },
};
const paintVetCount = () => { $("#vetCount").textContent = " " + vet.all().length; };

// ── data ──
async function loadData() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => r.json()).catch(() => ({}));
  const [picks, barcodes, owners, wall, images] = await Promise.all(["picks", "barcodes", "owners", "wall", "images"].map(get));
  data = buildData({ picks, barcodes, owners, wall, images });
}

async function fetchJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await (await fetch(url, { signal: ctl.signal })).json(); }
  finally { clearTimeout(t); }
}

async function lookupOBF(code) {
  if (cache.has(code)) return cache.get(code);
  const tries = [code];
  if (code.length === 13 && code.startsWith("0")) tries.push(code.slice(1));
  for (const c of tries) {
    const j = await fetchJSON(`${OBF}/api/v2/product/${c}.json?product_type=all&fields=${FIELDS}`);
    if (j && j.status === 1 && j.product) { const p = fromOBF(j); p.code = code; cache.set(code, p); return p; }
  }
  return null;
}

// ── camera (ZXing; works in iOS Safari and Android Chrome) ──
const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
const reader = new ZXing.BrowserMultiFormatReader(hints, 250);
let scanning = false;

async function startCamera() {
  const finder = $("#finder"), msg = $("#camMsg");
  msg.hidden = true;
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    msg.textContent = "Live camera needs the https link. Use Photo.";
    msg.hidden = false; return;
  }
  try {
    scanning = true;
    $("#startBtn").hidden = true; $("#stopBtn").hidden = false; finder.classList.add("live");
    await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      $("#video"),
      (result) => { if (result && scanning) { navigator.vibrate?.(40); stopCamera(); go(`#/p/${normCode(result.getText())}`); } },
    );
  } catch (e) {
    stopCamera();
    msg.textContent = e && e.name === "NotAllowedError" ? "Camera is off. Allow it in Settings, or use Photo." : "Camera didn't start. Try Photo.";
    msg.hidden = false;
  }
}
function stopCamera() {
  scanning = false;
  try { reader.reset(); } catch {}
  $("#finder").classList.remove("live");
  $("#startBtn").hidden = false; $("#stopBtn").hidden = true;
}

async function decodePhoto(file) {
  if (!file) return;
  busy(true);
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = Object.assign(document.createElement("canvas"), { width: img.width * scale, height: img.height * scale });
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const result = await reader.decodeFromImageUrl(c.toDataURL("image/jpeg", .92));
    go(`#/p/${normCode(result.getText())}`);
  } catch {
    busy(false);
    const msg = $("#camMsg");
    msg.textContent = "No barcode in that photo. Closer, flat, or Type it.";
    msg.hidden = false;
  }
}

// ── building blocks ──
const panel = () => $("#panel");
function show(html) {
  $("#home").hidden = true;
  const p = panel(); p.hidden = false; p.innerHTML = html;
  p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
  window.scrollTo(0, 0);
}
const back = `<button class="back" type="button" onclick="history.length > 1 ? history.back() : (location.hash = '#/')">${icon("back")}scan another</button>`;
const initial = (s) => esc((String(s || "?").trim()[0] || "?").toUpperCase());
// photo with a graceful letter fallback (some brand images won't load)
const pic = (src, name, cls = "") => src
  ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;ph ${cls}&quot;>${initial(name)}</div>'">`
  : `<div class="ph ${cls}">${initial(name)}</div>`;

const STATUS_ICON = { fail: "x", pass: "check", warn: "warn", clear: "dash", unknown: "q" };
const STAMP = {
  pick: `${icon("check")}Tox Zero pick`,
  flagged: `${icon("x")}Flagged`,
  unvetted: `${icon("q")}Not vetted yet`,
};

function hero(r, name, brand, image) {
  return `<div class="hero">
    <div class="photo glass">${pic(image, name || brand)}</div>
    <span class="stamp ${r.verdict}">${STAMP[r.verdict]}</span>
    ${brand ? `<div class="brand">${esc(brand)}</div>` : ""}
    <div class="name">${esc(name || "Unknown product")}</div></div>`;
}

// The core of Tox Zero: what's in it AND what it's in (and who gets the money), side by side.
function tiles(card) {
  const t = (key, ico, label) => {
    const x = card[key];
    return `<div class="tile glass"><span class="k">${icon(ico)}${label}</span>
      <span class="dot ${x.status}">${icon(STATUS_ICON[x.status])}</span><span class="s">${esc(x.short)}</span></div>`;
  };
  return `<div class="tiles">${t("ingredients", "drop", "INGREDIENTS")}${t("packaging", "bottle", "PACKAGING")}${t("owner", "owner", "OWNER")}</div>`;
}

// each swaption shows the same three checks, so the difference reads at a glance
function swapCards(swaps) {
  return `<div class="swaps">${swaps.map((s) => {
    const pk = s.plastic || s.plastic_part ? `<span class="w">${icon("bottle")}${icon("warn")}</span>` : `<span>${icon("bottle")}${icon("check")}</span>`;
    return `<a class="swap glass" href="${esc(s.link)}" target="_blank" rel="noopener">
      <div class="pic">${pic(s.image, s.name)}<span class="ok">${icon("check")}Tox Zero pick</span>${s.star ? `<span class="heart"><b>❤︎</b> Andra's</span>` : ""}</div>
      <span class="n">${esc(s.name)}</span>
      <span class="mini"><span>${icon("drop")}${icon("check")}</span>${pk}<span>${icon("owner")}${icon("check")}</span></span>
      <span class="sfoot"><span>${esc(s.price || "")}</span><span class="go">shop ${icon("arrow")}</span></span></a>`;
  }).join("")}</div>`;
}

function versus(p, best) {
  return `<div class="versus" aria-hidden="true">
    <div class="v glass">${pic(p.image, p.name || (p.brands || [])[0])}<span class="badge x">${icon("x")}</span></div>
    <span class="arrow">${icon("arrow")}</span>
    <div class="v glass">${pic(best.image, best.name)}<span class="badge ok">${icon("check")}</span></div></div>`;
}

const TAG = { owner: "owner", packaging: "packaging" };
function whyList(reasons, notes = []) {
  const rows = [
    ...reasons.map((r) => ({ cls: "", what: r.match || r.label.replace(/^Owned by /, ""), tag: TAG[r.type] || r.label, detail: r.type === "ingredient" ? r.detail : `${r.label}. ${r.detail}` })),
    ...notes.filter((n) => n.type === "ingredient").map((n) => ({ cls: "note", what: n.label, tag: "heads-up", detail: n.detail })),
  ];
  if (!rows.length) return "";
  return `<div class="why glass">${rows.map((x) => `<details><summary><span class="d ${x.cls}"></span>
    <span class="what">${esc(x.what)}</span><span class="tag">${esc(x.tag)}</span></summary><p>${esc(x.detail)}</p></details>`).join("")}</div>`;
}

function inciBlock(p, reasons) {
  if (!p.ingredients) return "";
  const bad = new Set(reasons.filter((r) => r.match).map((r) => r.match));
  const { tokens } = scanIngredients(p.ingredients);
  return `<details class="inci glass"><summary>All ingredients (${tokens.length})</summary>
    <p>${tokens.map((t) => (bad.has(t) ? `<mark>${esc(t)}</mark>` : esc(t))).join(", ")}</p></details>`;
}
const attrib = (p) => p.source === "obf"
  ? `<p class="attrib">Data: <a href="${OBF}/product/${esc(p.code)}" target="_blank" rel="noopener">Open Beauty Facts</a> (ODbL), images CC BY-SA. Labels change; the bottle in your hand wins.</p>` : "";

// ── screens ──
function renderResult(r) {
  const p = r.product;
  if (r.verdict === "pick") {
    const k = r.pick;
    return show(`${back}${hero(r, k.name, `${k.section} · ${k.category}`, k.image || p.image)}
      ${tiles(r.card)}
      <div class="pickbox glass">${k.why ? `<p>${esc(k.why)}</p>` : ""}
        <span class="meta">${esc([r.card.packaging.detail, k.price, r.variant].filter(Boolean).join(" · "))}</span></div>
      <a class="pill navy cta" href="${esc(k.link)}" target="_blank" rel="noopener">Shop it ${icon("arrow")}</a>
      ${p.code ? `<p class="attrib">Barcode matched to the brand's own store listing.</p>` : ""}`);
  }

  const brand = (p.brands || []).join(", ");
  if (r.verdict === "flagged") {
    return show(`${back}${hero(r, p.name, brand, p.image)}
      ${tiles(r.card)}
      ${r.swaps.length ? `<h3 class="section">the swaptions.</h3>
        ${versus(p, r.swaps[0])}${swapCards(r.swaps)}`
      : `<p class="note">No guide pick for this shelf yet. It's on the vet list.</p>`}
      <h3 class="section">why.</h3>${whyList(r.reasons, r.notes)}
      ${inciBlock(p, r.reasons)}${attrib(p)}`);
  }

  const nothing = !p.source;
  const shelfSwaps = r.shelf ? swapsFor(r.shelf, data.picks, 3) : [];
  return show(`${back}${hero(r, p.name || "Unknown product", brand || (nothing ? p.code : ""), p.image)}
    ${tiles(r.card)}
    <p class="note">${nothing ? "Not in Open Beauty Facts yet." : "No flags isn't a yes."} Added to the vet list.</p>
    ${r.lookalikes?.length ? `<ul class="list">${r.lookalikes.map((k) => `<li><button class="item glass" type="button" onclick="location.hash='#/g/${esc(k.id)}'">
      ${pic(k.image, k.name, "thumb")}<span class="txt"><span class="n">The guide's ${esc(k.name)}?</span><span class="m">barcode not confirmed · tap</span></span></button></li>`).join("")}</ul>` : ""}
    ${nothing ? `<a class="pill glass cta" href="#/" onclick="setTimeout(()=>document.querySelector('#searchInput').focus(),50)">${icon("search")}Search by name</a>` : ""}
    ${shelfSwaps.length ? `<h3 class="section">already vetted.</h3><p class="section-sub">${esc(r.shelf.label.toLowerCase())} picks from the guide</p>${swapCards(shelfSwaps)}` : ""}
    ${whyList([], r.notes)}${inciBlock(p, [])}${attrib(p)}`);
}

async function routeBarcode(code) {
  code = normCode(code);
  let r = evaluate({ code }, data);
  if (r.verdict === "pick") return renderResult(r);
  busy(true);
  let p = null, offline = false;
  try { p = await lookupOBF(code); } catch { offline = true; }
  busy(false);
  if (offline) {
    return show(`${back}<div class="hero"><div class="photo glass"><div class="ph">?</div></div>
      <span class="stamp unvetted">${icon("q")}No signal</span><div class="name">Couldn't reach Open Beauty Facts</div></div>
      <p class="note">Guide picks still work offline. Try search, or again in a sec.</p>`);
  }
  p = p || { code, name: "", brands: [] };
  r = evaluate(p, data);
  if (r.verdict === "unvetted" || (r.verdict === "flagged" && !r.swaps.length)) vet.add(p);
  renderResult(r);
}

function routePick(id) {
  const k = data.picksById[id];
  if (!k) return go("#/");
  renderResult(evaluate({ pick: k, name: "" }, data));
}

async function routeSearch(q) {
  const local = searchPicks(q, data.picks);
  show(`${back}<h1 class="title" style="font-size:40px;text-align:left;margin-top:8px">${esc(q)}.</h1>
    <p class="label">IN THE GUIDE</p>
    ${local.length ? `<ul class="list">${local.map((k) => `<li><button class="item glass" type="button" onclick="location.hash='#/g/${esc(k.id)}'">
      ${pic(k.image, k.name, "thumb")}<span class="txt"><span class="n">${esc(k.name)}</span><span class="m">${esc(k.category)}</span></span>
      <span class="ok">${icon("check")}</span></button></li>`).join("")}</ul>` : `<p class="empty">No guide pick by that name.</p>`}
    <p class="label">EVERYTHING ELSE</p><div id="obfResults"><p class="empty">Searching…</p></div>`);
  let items = [];
  try {
    const j = await fetchJSON(`${OBF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=12&fields=${FIELDS}`, 12000);
    items = (j.products || []).map((x) => fromOBF({ product: x })).filter((x) => x.code && x.name);
  } catch {}
  const box = $("#obfResults");
  if (!box) return;
  items.forEach((x) => cache.set(x.code, x));
  box.innerHTML = items.length
    ? `<ul class="list">${items.map((x) => `<li><button class="item glass" type="button" onclick="location.hash='#/p/${esc(x.code)}'">
        ${pic(x.image, x.name, "thumb")}<span class="txt"><span class="n">${esc(x.name)}</span><span class="m">${esc(x.brands.join(", "))}</span></span></button></li>`).join("")}</ul>`
    : `<p class="empty">Nothing there either. Worth vetting.</p>`;
}

function routeStandard() {
  const rules = INGREDIENT_RULES.filter((r) => r.tier !== "note").length;
  const legend = (cls, ico, title, text) => `<div><span class="dot ${cls}">${icon(ico)}</span><span><b>${title}</b><span>${text}</span></span></div>`;
  show(`${back}<div class="std"><h1 class="title">the standard.</h1>
    <p class="lead">Only Andra's guide says yes.</p>
    <div class="legend glass">
      ${legend("pass", "check", "Tox Zero pick", "In the guide. Human-vetted.")}
      ${legend("fail", "x", "Flagged", "Fails one test. Here's the swaption.")}
      ${legend("unknown", "q", "Not vetted yet", "Everything else. No flags isn't a yes.")}
    </div>
    <p class="label">EVERY SCAN, THREE TESTS</p>
    <div class="legend glass">
      ${legend("clear", "drop", "Ingredients", "The guide's Nasties: parfum, PEGs, silicones, petrochemicals…")}
      ${legend("clear", "bottle", "Packaging", "Part of the formula. Plastic + oil = leaching.")}
      ${legend("clear", "owner", "Owner", "Conglomerates fail. Good owners pass.")}
    </div>
    <div class="stats">
      <div class="glass"><b>${data.picks.length}</b><span>guide picks</span></div>
      <div class="glass"><b>${Object.keys(data.barcodes).length}</b><span>barcodes confirmed with brands</span></div>
      <div class="glass"><b>${rules}</b><span>ingredient rules</span></div>
      <div class="glass"><b>${data.ownerIndex.idx.size}</b><span>brand names checked for ownership</span></div>
    </div></div>`);
}

function routeVet() {
  const list = vet.all();
  show(`${back}<h1 class="title">vet list.</h1><p class="sub">Not in the guide yet. The research queue.</p>
    ${list.length ? `<ul class="list">${list.map((x) => `<li><div class="item glass">${pic(x.image, x.name, "thumb")}<span class="txt"><span class="n">${esc(x.name)}</span>
      <span class="m">${esc([x.brand, x.code, x.at].filter(Boolean).join(" · "))}</span></span></div></li>`).join("")}</ul>
      <div class="row"><button class="pill glass" type="button" id="copyVet">Copy list</button><button class="pill glass" type="button" id="clearVet">Clear</button></div>`
    : `<p class="empty" style="text-align:center">Empty. Scan something the guide hasn't covered.</p>`}`);
  $("#copyVet")?.addEventListener("click", async (e) => {
    const text = list.map((x) => [x.name, x.brand, x.code, x.at].filter(Boolean).join(" · ")).join("\n");
    try { await navigator.clipboard.writeText(text); e.target.textContent = "Copied"; } catch { e.target.textContent = "Copy failed"; }
  });
  $("#clearVet")?.addEventListener("click", () => { vet.clear(); routeVet(); });
}

// ── router ──
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function route() {
  busy(false);
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  if (h !== "/") stopCamera();
  const [, kind, arg] = h.split("/");
  if (kind === "p" && arg) return routeBarcode(arg);
  if (kind === "g" && arg) return routePick(arg);
  if (kind === "q" && arg) return routeSearch(arg);
  if (kind === "standard") return routeStandard();
  if (kind === "vet") return routeVet();
  panel().hidden = true; $("#home").hidden = false; $("#camMsg").hidden = true;
}
const busy = (on) => { $("#busy").hidden = !on; };

// ── wiring ──
$("#startBtn").addEventListener("click", startCamera);
$("#stopBtn").addEventListener("click", stopCamera);
$("#photoInput").addEventListener("change", (e) => { decodePhoto(e.target.files[0]); e.target.value = ""; });
$("#typeBtn").addEventListener("click", () => { $("#codeForm").hidden = false; $("#codeInput").focus(); });
$("#codeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const c = normCode($("#codeInput").value);
  if (c.length >= 8) go(`#/p/${c}`);
});
$("#searchForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("#searchInput").value.trim();
  if (q) { $("#searchInput").blur(); go(`#/q/${encodeURIComponent(q)}`); }
});
document.querySelectorAll(".demo [data-code]").forEach((b) => b.addEventListener("click", () => go(`#/p/${b.dataset.code}`)));
document.addEventListener("visibilitychange", () => { if (document.hidden) stopCamera(); });
window.addEventListener("hashchange", route);

paintVetCount();
loadData().then(route);
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
