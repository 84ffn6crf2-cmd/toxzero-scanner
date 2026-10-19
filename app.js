// Tox Zero Scanner — UI. Scoring lives in engine.js; this file only fetches, routes and renders.
// Look: light raw photo + frosted glass + navy (tox-zero-brand DEFAULT LOOK).
// A scan opens a pull-up sheet over the scanner (Yuka pattern): the peek shows the photo, the stamp and the
// four-pillar ring; pulled up, it shows the pillar bars, the swaptions and every ingredient, each with an ⓘ.
import { buildData, evaluate, fromOBF, normCode, searchPicks, swapsFor, scanIngredients, INGREDIENT_RULES, EXPLAIN, PILLARS } from "./engine.js";

const OBF = "https://world.openbeautyfacts.org";
const FIELDS = "code,product_name,product_name_en,generic_name,brands,ingredients_text,ingredients_text_en,packaging,packaging_tags,packagings,categories_tags,image_front_small_url";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const cache = new Map();   // code -> normalized product (from search results or earlier lookups)
let data, current = null;  // current = the result on screen (for ⓘ cards)

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
  closeSheet(false);
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

// ── pull-up sheet ──
const sheet = $("#sheet");
let sheetState = "closed", drag = null;
const peekH = () => (sheet.querySelector(".peek")?.offsetHeight || 150) + 34;
const sheetY = (st) => st === "full" ? 0 : st === "peek" ? Math.max(0, sheet.offsetHeight - peekH()) : sheet.offsetHeight + 24;
function setSheet(st, animate = true) {
  sheetState = st;
  sheet.style.transition = animate ? "" : "none";
  sheet.style.transform = `translateY(${sheetY(st)}px)`;
  sheet.classList.toggle("full", st === "full");
  if (st !== "full") $("#sheetBody").scrollTop = 0;
  if (st === "closed") setTimeout(() => { if (sheetState === "closed") sheet.hidden = true; }, 360);
}
function openSheet(html) {
  $("#sheetBody").innerHTML = html;
  const wasClosed = sheet.hidden || sheetState === "closed";
  sheet.hidden = false;
  if (wasClosed) { setSheet("closed", false); void sheet.offsetHeight; }
  setSheet("peek");
}
function closeSheet(updateHash = true) {
  if (sheet.hidden) return;
  setSheet("closed");
  if (updateHash && /^#\/(p|g)\//.test(location.hash)) history.replaceState(null, "", "#/");
}
sheet.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("[data-drag], .peek")) return;
  drag = { y0: e.clientY, t0: sheetY(sheetState), at: performance.now(), moved: false, id: e.pointerId };
  sheet.setPointerCapture(e.pointerId);
});
sheet.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0;
  if (Math.abs(dy) > 5) drag.moved = true;
  if (!drag.moved) return;
  sheet.style.transition = "none";
  sheet.style.transform = `translateY(${Math.max(0, drag.t0 + dy)}px)`;
});
sheet.addEventListener("pointerup", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dy = e.clientY - drag.y0, v = dy / Math.max(1, performance.now() - drag.at);
  const was = sheetState; drag = null;
  if (Math.abs(dy) <= 5) return setSheet(was === "full" ? "peek" : "full");          // tap toggles
  if (dy < -60 || v < -0.5) return setSheet("full");
  if (dy > 60 || v > 0.5) return was === "full" ? setSheet("peek") : closeSheet();
  setSheet(was);
});
window.addEventListener("resize", () => { if (!sheet.hidden) setSheet(sheetState, false); });

// ── building blocks ──
const initial = (s) => esc((String(s || "?").trim()[0] || "?").toUpperCase());
const pic = (src, name, cls = "") => src
  ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;ph ${cls}&quot;>${initial(name)}</div>'">`
  : `<div class="ph ${cls}">${initial(name)}</div>`;

const STAMP = { pick: `${icon("check")}Tox Zero pick`, flagged: `${icon("x")}Flagged`, unvetted: `${icon("q")}Not vetted yet` };
const SHORT_ST = { pass: "passes", fail: "fails", warn: "⚠", clear: "no flags", unknown: "unknown" };

// four arcs, one per pillar, coloured by status — the score at a glance
function ring(r) {
  const R = 40, C = 2 * Math.PI * R, seg = C / 4, gap = 5;
  const arcs = PILLARS.map((pl, i) => {
    const st = r.card[pl.key].status;
    return `<circle class="seg ${st}" cx="50" cy="50" r="${R}" stroke-dasharray="${seg - gap} ${C - seg + gap}"
      stroke-dashoffset="${-i * seg}" transform="rotate(${-90 + (gap / 2 / C) * 360} 50 50)"><title>${pl.label}: ${st}</title></circle>`;
  }).join("");
  // minimal labels: each arc's pillar icon sits in the corner beside it (same icons as the bars)
  const labels = PILLARS.map((pl, i) => {
    const th = (45 + i * 90) * Math.PI / 180, rr = 57, sz = 13;
    const x = 50 + rr * Math.sin(th) - sz / 2, y = 50 - rr * Math.cos(th) - sz / 2;
    return `<use class="ricon" href="#i-${pl.icon}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${sz}" height="${sz}"><title>${pl.label}</title></use>`;
  }).join("");
  const glyph = { pick: "✓", flagged: "✕", unvetted: "?" }[r.verdict];
  const n = (s) => PILLARS.filter((pl) => r.card[pl.key].status === s).length;
  const cap = r.verdict === "pick" ? `${n("pass")}/4 pillars${n("warn") ? " · ⚠" : ""}` : r.verdict === "flagged" ? `fails ${n("fail")} of 4` : `${n("clear")}/4 checked`;
  return `<div class="ringbox"><svg class="ring" viewBox="0 0 100 100" role="img" aria-label="Four pillars: ${PILLARS.map((pl) => `${pl.label} ${r.card[pl.key].status}`).join(", ")}">${arcs}${labels}
    <text class="glyph" x="50" y="61" text-anchor="middle">${glyph}</text></svg><div class="cap">${cap}</div></div>`;
}

function peek(r, name, brand, image) {
  return `<div class="peek">
    <div class="img">${pic(image, name || brand)}</div>
    <div><div class="brand">${esc(brand || "")}</div><div class="name">${esc(name || "Unknown product")}</div>
      <span class="stamp ${r.verdict}">${STAMP[r.verdict]}</span></div>
    ${ring(r)}</div>`;
}

function bars(r) {
  return `<h3 class="section">the 4 pillars.</h3><div class="bars glass">${PILLARS.map((pl) => {
    const x = r.card[pl.key];
    return `<div class="bar-row">${icon(pl.icon)}
      <div><div class="lbl">${pl.label}</div><div class="track ${x.status}"><b></b></div></div>
      <span class="st">${esc(x.short)}</span>
      <button class="ibtn" type="button" data-info="pillar:${pl.key}" aria-label="About ${pl.label}">${icon("info")}</button></div>`;
  }).join("")}</div>`;
}

// each swaption shows the same checks, so the difference reads at a glance
function swapCards(swaps) {
  return `<div class="swaps">${swaps.map((s) => {
    const pk = s.plastic || s.plastic_part ? `<span class="w">${icon("bottle")}${icon("warn")}</span>` : `<span>${icon("bottle")}${icon("check")}</span>`;
    return `<a class="swap glass" href="${esc(s.link)}" target="_blank" rel="noopener">
      <div class="pic">${pic(s.image, s.name)}<span class="ok">${icon("check")}Tox Zero pick</span>${s.star ? `<span class="heart"><b>❤︎</b> Andra's</span>` : ""}</div>
      <span class="n">${esc(s.name)}</span>
      <span class="mini"><span>${icon("drop")}${icon("check")}</span>${pk}<span>${icon("owner")}${icon("check")}</span><span>${icon("flask")}${icon("check")}</span></span>
      <span class="sfoot"><span>${esc(s.price || "")}</span><span class="go">shop ${icon("arrow")}</span></span></a>`;
  }).join("")}</div>`;
}

function versus(p, best) {
  return `<div class="versus" aria-hidden="true">
    <div class="v glass">${pic(p.image, p.name || (p.brands || [])[0])}<span class="badge x">${icon("x")}</span></div>
    <span class="arrow">${icon("arrow")}</span>
    <div class="v glass">${pic(best.image, best.name)}<span class="badge ok">${icon("check")}</span></div></div>`;
}

const LV = { hard: "hard line", dotted: "dotted line", note: "heads-up" };
// every ingredient on the label, flagged ones first, each flag with an ⓘ (Yuka pattern)
function ingredients(p) {
  if (!p.ingredients) return "";
  const { tokens, hits } = scanIngredients(p.ingredients);
  const byToken = new Map(hits.map((h) => [h.match, h.rule]));
  const rows = tokens.map((t) => ({ t, rule: byToken.get(t) }))
    .sort((a, b) => (a.rule ? (a.rule.tier === "note" ? 1 : 0) : 2) - (b.rule ? (b.rule.tier === "note" ? 1 : 0) : 2));
  const row = ({ t, rule }, hidden) => `<div class="ing-row${rule ? "" : " quiet"}"${hidden ? " hidden" : ""}>
      <div><div class="nm">${esc(t)}</div><div class="lv ${rule ? rule.tier : "none"}"><i></i>${rule ? `${esc(rule.label)} · ${LV[rule.tier]}` : "not flagged"}</div></div>
      ${rule ? `<button class="ibtn" type="button" data-info="rule:${rule.id}" aria-label="About ${esc(rule.label)}">${icon("info")}</button>` : "<span></span>"}</div>`;
  const shown = Math.max(8, rows.filter((x) => x.rule).length);
  return `<h3 class="section">ingredients.</h3><div class="ing glass">${rows.map((x, i) => row(x, i >= shown)).join("")}
    ${rows.length > shown ? `<button class="more-btn" type="button" onclick="this.parentNode.querySelectorAll('.ing-row[hidden]').forEach(e=>e.hidden=false);this.remove()">show all ${rows.length}</button>` : ""}</div>`;
}

const attrib = (p) => p.source === "obf"
  ? `<p class="attrib">Data: <a href="${OBF}/product/${esc(p.code)}" target="_blank" rel="noopener">Open Beauty Facts</a> (ODbL), images CC BY-SA. Labels change; the bottle in your hand wins.</p>` : "";

// ── result sheet ──
function renderResult(r) {
  current = r;
  const p = r.product;
  if (r.verdict === "pick") {
    const k = r.pick;
    return openSheet(`${peek(r, k.name, `${k.section} · ${k.category}`, k.image || p.image)}
      ${bars(r)}
      <div class="pickbox glass">${k.why ? `<p>${esc(k.why)}</p>` : ""}
        <span class="meta">${esc([r.card.ingredients.short, k.price, r.variant].filter(Boolean).join(" · "))}</span></div>
      <a class="pill navy cta" href="${esc(k.link)}" target="_blank" rel="noopener">Shop it ${icon("arrow")}</a>
      ${p.code ? `<p class="attrib">Barcode matched to the brand's own store listing.</p>` : ""}`);
  }
  const brand = (p.brands || []).join(", ");
  if (r.verdict === "flagged") {
    return openSheet(`${peek(r, p.name, brand, p.image)}
      ${r.swaps.length ? `<h3 class="section">the swaptions.</h3>${versus(p, r.swaps[0])}${swapCards(r.swaps)}`
        : `<p class="note">No guide pick for this shelf yet. It's on the vet list.</p>`}
      ${bars(r)}${ingredients(p)}${attrib(p)}`);
  }
  const nothing = !p.source;
  const shelfSwaps = r.shelf ? swapsFor(r.shelf, data.picks, 3) : [];
  openSheet(`${peek(r, p.name || "Unknown product", brand || (nothing ? p.code : ""), p.image)}
    <p class="note">${nothing ? "Not in Open Beauty Facts yet." : "No flags isn't a yes."} Added to the vet list.</p>
    ${r.lookalikes?.length ? `<ul class="list">${r.lookalikes.map((k) => `<li><button class="item glass" type="button" onclick="location.hash='#/g/${esc(k.id)}'">
      ${pic(k.image, k.name, "thumb")}<span class="txt"><span class="n">The guide's ${esc(k.name)}?</span><span class="m">barcode not confirmed · tap</span></span></button></li>`).join("")}</ul>` : ""}
    ${bars(r)}
    ${shelfSwaps.length ? `<h3 class="section">already vetted.</h3><p class="section-sub">${esc(r.shelf.label.toLowerCase())} picks from the guide</p>${swapCards(shelfSwaps)}` : ""}
    ${ingredients(p)}
    ${nothing ? `<a class="pill glass cta" href="#/" onclick="setTimeout(()=>document.querySelector('#searchInput').focus(),50)">${icon("search")}Search by name</a>` : ""}
    ${attrib(p)}`);
}

// ── ⓘ cards: where you learn the why ──
const TIERLINE = {
  hard: "HARD LINE · no pick in the guide contains it",
  dotted: "DOTTED LINE · the guide's picks skip it",
  note: "HEADS-UP · allowed in a couple of guide picks",
};
function showInfo(kind, key) {
  let html = "";
  if (kind === "rule") {
    const rule = INGREDIENT_RULES.find((x) => x.id === key), ex = EXPLAIN[key] || {};
    const seen = current && scanIngredients(current.product.ingredients || "").hits.find((h) => h.rule.id === key);
    html = `<h4>${esc(rule.label)}</h4>
      <div class="tierline"><span class="lv ${rule.tier}"><i></i></span>${TIERLINE[rule.tier]}</div>
      ${seen ? `<div class="blk"><span>ON THIS LABEL</span><p>${esc(seen.match)}</p></div>` : ""}
      <div class="blk"><span>THE CONCERN</span><p>${esc(rule.why)}</p></div>
      ${ex.where ? `<div class="blk"><span>WHERE IT HIDES</span><p>${esc(ex.where)}</p></div>` : ""}
      ${ex.instead ? `<div class="blk"><span>WHAT THE GUIDE USES INSTEAD</span><p>${esc(ex.instead)}</p></div>` : ""}
      <p class="src">From the Tox Zero guide's Nasties pages.</p>`;
  } else {
    const pl = PILLARS.find((x) => x.key === key), x = current?.card?.[key];
    html = `<h4>${esc(pl.label)}</h4>
      ${x ? `<div class="tierline"><span class="lv ${x.status === "fail" ? "hard" : x.status === "warn" ? "dotted" : x.status === "pass" ? "none" : "note"}"><i></i></span>${esc(x.word.toUpperCase())}</div>
      <div class="blk"><span>THIS PRODUCT</span><p>${esc(x.detail)}</p></div>` : ""}
      <div class="blk"><span>WHAT TOX ZERO CHECKS</span><p>${esc(pl.about)}</p></div>`;
  }
  $("#infoBody").innerHTML = html;
  $("#info").hidden = false;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-info]");
  if (b) { e.preventDefault(); const [kind, key] = b.dataset.info.split(":"); showInfo(kind, key); return; }
  if (e.target.id === "info" || e.target.closest("#infoClose")) $("#info").hidden = true;
});

// ── screens that still use the page panel (search, standard, vet list) ──
const panel = () => $("#panel");
function show(html) {
  closeSheet(false);
  $("#home").hidden = true;
  const p = panel(); p.hidden = false; p.innerHTML = html;
  p.style.animation = "none"; void p.offsetWidth; p.style.animation = "";
  window.scrollTo(0, 0);
}
const back = `<button class="back" type="button" onclick="history.length > 1 ? history.back() : (location.hash = '#/')">${icon("back")}scan</button>`;

async function routeBarcode(code) {
  code = normCode(code);
  let r = evaluate({ code }, data);
  if (r.verdict === "pick") return renderResult(r);
  busy(true);
  let p = null, offline = false;
  try { p = await lookupOBF(code); } catch { offline = true; }
  busy(false);
  if (offline) {
    current = null;
    return openSheet(`<div class="peek"><div class="img"><div class="ph">?</div></div>
      <div><div class="name">Couldn't reach Open Beauty Facts</div><span class="stamp unvetted">${icon("q")}No signal</span></div><span></span></div>
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
      ${legend("pass", "check", "Tox Zero pick", "In the guide. Passed all four pillars.")}
      ${legend("fail", "x", "Flagged", "Fails a pillar. Here's the swaption.")}
      ${legend("unknown", "q", "Not vetted yet", "Everything else. No flags isn't a yes.")}
    </div>
    <p class="label">THE 4 PILLARS</p>
    <div class="legend glass">${PILLARS.map((pl) => legend("clear", pl.icon, pl.label, pl.about)).join("")}</div>
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
function showHome() { panel().hidden = true; $("#home").hidden = false; $("#camMsg").hidden = true; }
function route() {
  busy(false);
  $("#info").hidden = true;
  const h = decodeURIComponent(location.hash.slice(1) || "/");
  const [, kind, arg, view, info] = h.split("/");
  if (h !== "/") stopCamera();
  // deep links: #/p/<code>/full opens the details; #/p/<code>/full/rule:fragrance also opens that ⓘ card
  const expand = () => { if (view === "full") setSheet("full"); if (info && info.includes(":")) showInfo(...info.split(":")); };
  if (kind === "p" && arg) { showHome(); return routeBarcode(arg).then(expand); }
  if (kind === "g" && arg) { showHome(); routePick(arg); return expand(); }
  if (kind === "q" && arg) return routeSearch(arg);
  if (kind === "standard") return routeStandard();
  if (kind === "vet") return routeVet();
  closeSheet(false);
  showHome();
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
