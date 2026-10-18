// Tox Zero Scanner — UI. Scoring lives in engine.js; this file only fetches, routes and renders.
import { buildData, evaluate, fromOBF, normCode, searchPicks, swapsFor, scanIngredients, INGREDIENT_RULES } from "./engine.js";

const OBF = "https://world.openbeautyfacts.org";
const FIELDS = "code,product_name,product_name_en,generic_name,brands,ingredients_text,ingredients_text_en,packaging,packaging_tags,categories_tags,image_front_small_url";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cache = new Map();   // code -> normalized product (from search results or earlier lookups)
let data;

// ── vet list (per-device convenience; the real queue is Andra's research list) ──
const VET_KEY = "tz-vet-list";
const vet = {
  all() { try { return JSON.parse(localStorage.getItem(VET_KEY)) || []; } catch { return []; } },
  add(p) {
    const list = vet.all().filter((x) => x.code !== p.code || !p.code);
    list.unshift({ code: p.code || "", name: p.name || "Unknown product", brand: (p.brands || [])[0] || "", at: new Date().toISOString().slice(0, 10) });
    try { localStorage.setItem(VET_KEY, JSON.stringify(list.slice(0, 200))); } catch {}
    paintVetCount();
  },
  clear() { try { localStorage.removeItem(VET_KEY); } catch {} paintVetCount(); },
};
const paintVetCount = () => { $("#vetCount").textContent = vet.all().length; };

// ── data ──
async function loadData() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => r.json());
  const [picks, barcodes, owners, wall] = await Promise.all(["picks", "barcodes", "owners", "wall"].map(get));
  data = buildData({ picks, barcodes, owners, wall });
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
    msg.textContent = "The live camera needs the https link. Use “Photo of a barcode” instead.";
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
    msg.textContent = e && e.name === "NotAllowedError" ? "Camera access is off. Allow it in Settings, or use a photo." : "Couldn't start the camera. Try a photo of the barcode.";
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
    msg.textContent = "No barcode found in that photo. Get closer, keep it flat, or type the number.";
    msg.hidden = false;
  }
}

// ── rendering ──
const panel = () => $("#panel");
function show(html) {
  $("#home").hidden = true;
  const p = panel(); p.hidden = false; p.innerHTML = html;
  p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
  window.scrollTo(0, 0);
}
const back = `<button class="back" type="button" onclick="history.length > 1 ? history.back() : (location.hash = '#/')">← scan another</button>`;

function productHead(p) {
  return `<div class="product">
    ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : ""}
    <div><div class="brand">${esc((p.brands || []).join(", "))}</div>
    <div class="name">${esc(p.name || "Unknown product")}</div>
    ${p.code ? `<div class="code">${esc(p.code)}</div>` : ""}</div></div>`;
}

const TIER = { hard: "HARD LINE", dotted: "DOTTED LINE" };
const TYPE = { owner: "OWNERSHIP", packaging: "PACKAGING" };

function reasonsList(reasons) {
  return `<ul class="reasons">${reasons.map((r) => `<li>
    <div class="what"><b class="accent">${esc(r.label)}</b><span class="tier">${TYPE[r.type] || TIER[r.tier] || ""}</span></div>
    ${r.match ? `<span class="on">On the label: ${esc(r.match)}</span>` : ""}
    <p>${esc(r.detail)}</p></li>`).join("")}</ul>`;
}
const notesList = (notes) => notes.length
  ? `<ul class="notes">${notes.map((n) => `<li><b>${esc(n.label)}</b>${esc(n.detail)}</li>`).join("")}</ul>` : "";

function swapCards(swaps) {
  return `<div class="swaps">${swaps.map((s) => `<a class="swap" href="${esc(s.link)}" target="_blank" rel="noopener">
    <span class="n">${s.star ? `<span class="badge">❤︎ ANDRA'S PICK</span>` : ""}${esc(s.name)}</span>
    <span class="m">${esc(s.category)} · ${esc((s.packaging || "").replace(/⟡\s*/g, ""))} · ${esc(s.price || "")}</span>
    ${s.why ? `<span class="w">${esc(clip(s.why, 150))}</span>` : ""}
    <span class="go">Shop it → ${esc(s.link.replace("https://", ""))}</span></a>`).join("")}</div>`;
}
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

function inciBlock(p, reasons) {
  if (!p.ingredients) return "";
  const bad = new Set(reasons.filter((r) => r.match).map((r) => r.match));
  const { tokens } = scanIngredients(p.ingredients);
  return `<details class="inci"><summary>Ingredients on file (${tokens.length})</summary>
    <p>${tokens.map((t) => (bad.has(t) ? `<mark>${esc(t)}</mark>` : esc(t))).join(", ")}</p></details>`;
}
const attrib = (p) => p.source === "obf"
  ? `<p class="attrib">Product record: <a href="${OBF}/product/${esc(p.code)}" target="_blank" rel="noopener">Open Beauty Facts</a> contributors, ODbL. Images CC BY-SA. Labels change; the bottle in your hand wins.</p>` : "";

function renderResult(r) {
  const p = r.product;
  if (r.verdict === "pick") {
    const k = r.pick;
    return show(`${back}${p.name ? productHead(p) : ""}
      <div class="verdict pick">
        <span class="heart">❤︎</span><h2>Tox Zero pick.</h2>
        <p class="lede">${esc(k.name)}. In Andra's guide: ${esc(k.section)} · ${esc(k.category)}.</p>
        <dl class="facts">
          ${k.why ? `<dt>WHY</dt><dd>${esc(k.why)}</dd>` : ""}
          ${k.packaging ? `<dt>PACKAGING</dt><dd>${esc(k.packaging)}</dd>` : ""}
          ${r.variant ? `<dt>VARIANT</dt><dd>${esc(r.variant)}</dd>` : ""}
          ${k.price ? `<dt>PRICE</dt><dd>${esc(k.price)}</dd>` : ""}
        </dl>
        ${notesList(r.notes)}
        <a class="pill solid cta" href="${esc(k.link)}" target="_blank" rel="noopener">Shop it →</a>
      </div>
      ${p.code ? `<p class="attrib">Barcode matched to the brand's own store listing.</p>` : ""}`);
  }

  if (r.verdict === "flagged") {
    const n = r.reasons.length;
    return show(`${back}${productHead(p)}
      <div class="verdict flagged">
        <h2>Flagged.</h2>
        <p class="lede">Fails the Tox Zero standard on ${n} count${n > 1 ? "s" : ""}.</p>
        ${reasonsList(r.reasons)}${notesList(r.notes)}
      </div>
      ${lookalikeBlock(r)}
      ${r.swaps.length ? `<h3 class="section">The swap.</h3>
        <p class="section-sub">Vetted picks for ${esc(r.shelf.label.toLowerCase())}, straight from the guide.</p>${swapCards(r.swaps)}`
      : `<p class="section-sub">${r.shelf ? "No guide pick on this shelf yet." : "The guide doesn't cover this shelf yet."} It's on the vet list.</p>`}
      ${inciBlock(p, r.reasons)}${attrib(p)}`);
  }

  // unvetted
  const nothing = !p.source;
  const shelfSwaps = r.shelf ? swapsFor(r.shelf, data.picks, 2) : [];
  return show(`${back}${productHead(p)}
    <div class="verdict">
      <h2>Not vetted yet.</h2>
      <p class="lede">${nothing
        ? "This barcode isn't in Open Beauty Facts yet, so there's nothing to check."
        : "Andra hasn't vetted this one. Nothing on file tripped a flag, and that's not a pass: only the guide approves."}</p>
      ${notesList(r.notes)}
      <p class="lede" style="margin-top:12px"><b>Added to the vet list.</b></p>
    </div>
    ${lookalikeBlock(r)}
    ${nothing ? `<a class="pill ghost cta" href="#/" onclick="setTimeout(()=>document.querySelector('#searchInput').focus(),50)">Search by name instead</a>` : ""}
    ${shelfSwaps.length ? `<h3 class="section">Already in the guide.</h3>
      <p class="section-sub">Vetted picks for ${esc(r.shelf.label.toLowerCase())}.</p>${swapCards(shelfSwaps)}` : ""}
    ${inciBlock(p, [])}${attrib(p)}`);
}

function lookalikeBlock(r) {
  if (!r.lookalikes || !r.lookalikes.length) return "";
  return `<ul class="list">${r.lookalikes.map((k) => `<li><button type="button" onclick="location.hash='#/g/${esc(k.id)}'">
    <span class="n">Looks like the guide's ${esc(k.name)}</span>
    <span class="m">This barcode isn't confirmed yet. Tap for the guide entry.</span></button></li>`).join("")}</ul>`;
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
    return show(`${back}<div class="verdict"><h2>No signal.</h2>
      <p class="lede">Couldn't reach Open Beauty Facts for ${esc(code)}. Guide picks still work offline; search by name or try again.</p></div>`);
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
  const head = `${back}<h1 class="title" style="font-size:40px;text-align:left">${esc(q)}.</h1>`;
  const guide = `<p class="label">IN THE GUIDE</p>${local.length ? `<ul class="list">${local.map((k) => `<li><button type="button" onclick="location.hash='#/g/${esc(k.id)}'">
      <span class="n">${esc(k.name)}</span><span class="m">${esc(k.section)} · ${esc(k.category)}</span></button></li>`).join("")}</ul>`
    : `<p class="empty">No guide pick by that name.</p>`}`;
  show(`${head}${guide}<p class="label">OPEN BEAUTY FACTS</p><div id="obfResults"><p class="empty">Searching…</p></div>`);
  let items = [];
  try {
    const j = await fetchJSON(`${OBF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=12&fields=${FIELDS}`, 12000);
    items = (j.products || []).map((x) => fromOBF({ product: x })).filter((x) => x.code && x.name);
  } catch {}
  const box = $("#obfResults");
  if (!box) return;
  items.forEach((x) => cache.set(x.code, x));
  box.innerHTML = items.length
    ? `<ul class="list">${items.map((x) => `<li><button type="button" onclick="location.hash='#/p/${esc(x.code)}'">
        <span class="n">${esc(x.name)}</span><span class="m">${esc(x.brands.join(", "))} · ${esc(x.code)}</span></button></li>`).join("")}</ul>`
    : `<p class="empty">Nothing there either. It's a gap worth vetting.</p>`;
}

function routeStandard() {
  const rules = INGREDIENT_RULES.filter((r) => r.tier !== "note").length;
  const ownerBrands = data.ownerIndex.idx.size;
  show(`${back}<div class="std"><h1 class="title" style="text-align:left">the standard.</h1>
    <p class="sub" style="text-align:left">Three verdicts. Only one is a yes, and it only comes from the guide.</p>
    <ol>
      <li><b>Tox Zero pick.</b> In Andra's guide, vetted by a human. The barcode is matched to the brand's own store listing.</li>
      <li><b>Flagged.</b> Fails one test, and the app names the exact ingredient, owner or packaging problem. Then it hands over the swap.</li>
      <li><b>Not vetted yet.</b> Everything else. No flags is not a pass. It goes on the vet list.</li>
    </ol>
    <p class="label">A FLAG MEANS IT FAILED ONE OF THESE</p>
    <ol>
      <li><b>Ingredients.</b> Anything on the guide's Nasties pages: parfum and "natural fragrance", PEGs, phenoxyethanol, silicones, petrolatum, aluminum salts, parabens and more.</li>
      <li><b>Who gets the money.</b> Owned by a conglomerate that profits from the products the guide replaces, or on the guide's Wall of Claim. Good owners pass.</li>
      <li><b>Packaging.</b> A fatty formula in plastic pulls the plastic's additives into the product. Plastic on a consumable flags when the guide has a plastic-free pick for that shelf. Buy-it-for-life tools never get a plastic flag.</li>
    </ol>
    <p class="label">WHAT AN INGREDIENT SCORE MISSES</p>
    <p class="sub" style="text-align:left">Who owns the brand. Whether the packaging leaches into the formula. Whether it's zero waste. Tox Zero checks all three, and every yes is a human call.</p>
    <div class="stats">
      <div><b>${data.picks.length}</b><span>guide picks</span></div>
      <div><b>${Object.keys(data.barcodes).length}</b><span>barcodes confirmed with brands</span></div>
      <div><b>${rules}</b><span>ingredient rules</span></div>
      <div><b>${ownerBrands}</b><span>brand names checked for ownership</span></div>
    </div></div>`);
}

function routeVet() {
  const list = vet.all();
  show(`${back}<h1 class="title" style="text-align:left">vet list.</h1>
    <p class="sub" style="text-align:left">Every scan that isn't in the guide yet lands here. It's the research queue.</p>
    ${list.length ? `<ul class="list">${list.map((x) => `<li><div class="item"><span class="n">${esc(x.name)}</span>
      <span class="m">${esc(x.brand)}${x.brand ? " · " : ""}${esc(x.code)} · ${esc(x.at)}</span></div></li>`).join("")}</ul>
      <div class="row"><button class="pill ghost" type="button" id="copyVet">Copy list</button><button class="pill ghost" type="button" id="clearVet">Clear</button></div>`
    : `<p class="empty">Empty. Scan something the guide hasn't covered.</p>`}`);
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
