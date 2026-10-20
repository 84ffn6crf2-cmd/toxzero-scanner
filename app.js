// Tox Zero Scanner — UI. Scoring lives in engine.js; this file only fetches, routes and renders.
// Look: light raw photo + frosted glass + navy (tox-zero-brand DEFAULT LOOK).
// A scan opens a pull-up sheet over the scanner (Yuka pattern): the peek shows the photo, the stamp and the
// four-pillar ring; pulled up, it shows the pillar bars, the swaptions and every ingredient, each with an ⓘ.
import { buildData, evaluate, fromOBF, normCode, searchPicks, swapsFor, scanIngredients, findActives, isFoodOnly, INGREDIENT_RULES, EXPLAIN, PILLARS, MECHANISMS } from "./engine.js";

const OBF = "https://world.openbeautyfacts.org";
const FIELDS = "code,product_name,product_name_en,generic_name,brands,ingredients_text,ingredients_text_en,packaging,packaging_tags,packagings,categories_tags,image_front_small_url,product_type";
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
const INTAKE_KEY = "tz-intake";
const intake = {
  all() { try { return JSON.parse(localStorage.getItem(INTAKE_KEY)) || []; } catch { return []; } },
  save(list) {
    try { localStorage.setItem(INTAKE_KEY, JSON.stringify(list.slice(0, 20))); }
    catch { try { localStorage.setItem(INTAKE_KEY, JSON.stringify(list.slice(0, 20).map(({ front, label, ...x }) => x))); } catch {} }
  },
};
const PENDING_KEY = "tz-pending";
const pending = {
  all() { try { return JSON.parse(localStorage.getItem(PENDING_KEY)) || []; } catch { return []; } },
  save(list) { try { localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(0, 50))); } catch {} },
  add(code) { const l = pending.all().filter((x) => x.code !== code); l.unshift({ code, at: new Date().toISOString().slice(0, 10) }); pending.save(l); },
};
const paintVetCount = () => { $("#vetCount").textContent = " " + (vet.all().length + intake.all().length + pending.all().filter((x) => !x.verdict).length); };

// ── data ──
async function loadData() {
  const get = (f) => fetch(`data/${f}.json`).then((r) => r.json()).catch(() => ({}));
  const [picks, barcodes, owners, wall, images, vetted, config] = await Promise.all(["picks", "barcodes", "owners", "wall", "images", "vetted", "config"].map(get));
  data = buildData({ picks, barcodes, owners, wall, images, vetted });
  data.config = config || {};
}

async function fetchJSON(url, ms = 9000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await (await fetch(url, { signal: ctl.signal })).json(); }
  finally { clearTimeout(t); }
}

// the team's live record for a barcode (vet queue Worker); merged before scoring, so a published score shows on the next scan
async function lookupVetted(code) {
  if (!data?.config?.vettedUrl) return null;
  try { const v = await fetchJSON(`${data.config.vettedUrl}${code}`, 4000); if (v && v.code) { data.vetted[normCode(v.code)] = v; return v; } } catch {}
  return null;
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

// ── camera: our own stream and frame loop; ZXing only decodes ──
// ZXing's built-in video loop flips every other frame to a negative (for white-on-black codes). With TRY_HARDER the flip
// lands on every frame it reads, so a normal barcode never decoded live (photos were fine). Frames are grabbed here,
// cropped to what the viewfinder shows, and sized fresh each time (iPhones turn the feed to portrait after it starts).
const hints = new Map();
hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E]);
hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
const reader = new ZXing.BrowserMultiFormatReader(hints);   // photos only
const zx = new ZXing.MultiFormatReader();
const grab = document.createElement("canvas");
const gctx = grab.getContext("2d", { willReadFrequently: true });
let stream = null, scanning = false, torchOn = false, scanTimer = 0, idleTimer = 0;
const camLive = () => !!stream && stream.getVideoTracks().some((t) => t.readyState === "live");

async function startCamera() {
  const msg = $("#camMsg");
  msg.hidden = true;
  closeSheet();
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
    msg.textContent = "Live camera needs the https link. Use Photo.";
    msg.hidden = false; return;
  }
  scanning = true; clearTimeout(idleTimer);
  $("#startBtn").hidden = true; $("#stopBtn").hidden = false; $("#finder").classList.add("live");
  try {
    if (!camLive()) {
      // the tip only shows if the phone is actually asking (an instant yes never flashes it)
      const tip = setTimeout(() => { msg.textContent = "Your phone's about to ask for the camera. Tap Allow."; msg.hidden = false; }, 350);
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } }); }
      finally { clearTimeout(tip); }
      if (!scanning) return stopCamera();   // Stop tapped while the phone was asking
      const v = $("#video"); v.srcObject = stream; await v.play();
      paintTorch();
    }
    msg.hidden = true;
    scanFrame();
  } catch (e) {
    stopCamera();
    msg.textContent = e && e.name === "NotAllowedError" ? "Camera is off. Allow it in Settings, or use Photo." : "Camera didn't start. Try Photo.";
    msg.hidden = false;
  }
}
function scanFrame() {
  clearTimeout(scanTimer);
  if (!scanning) return;
  const v = $("#video"), w = v.videoWidth, h = v.videoHeight, box = $("#finder").getBoundingClientRect();
  if (w && h && box.width) {
    const k = Math.max(box.width / w, box.height / h);   // object-fit: cover, so read only what's on screen
    const sw = Math.min(w, box.width / k), sh = Math.min(h, box.height / k);
    const s = Math.min(1, 1280 / Math.max(sw, sh));
    const cw = Math.round(sw * s), ch = Math.round(sh * s);
    if (grab.width !== cw || grab.height !== ch) { grab.width = cw; grab.height = ch; }
    gctx.drawImage(v, (w - sw) / 2, (h - sh) / 2, sw, sh, 0, 0, cw, ch);
    try {
      const res = zx.decode(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(grab))), hints);
      if (res) return found(res.getText());
    } catch {}   // most frames have no readable barcode; anything else, try the next frame
  }
  scanTimer = setTimeout(scanFrame, 80);
}
function found(text) {
  navigator.vibrate?.(40);
  pauseScan();
  history.replaceState(null, "", `#/p/${normCode(text)}`);   // not a hash change: iOS can drop the camera permission on those
  route();
}
// the result sheet slides over a live camera (Yuka pattern), so the next scan doesn't ask again; off after 2 idle minutes
function pauseScan() {
  scanning = false; clearTimeout(scanTimer);
  if (!camLive()) return stopCamera();
  $("#startBtn").hidden = false;
  clearTimeout(idleTimer); idleTimer = setTimeout(stopCamera, 120000);
}
function stopCamera() {
  scanning = false; clearTimeout(scanTimer); clearTimeout(idleTimer);
  stream?.getTracks().forEach((t) => t.stop());
  stream = null; torchOn = false;
  $("#video").srcObject = null;
  $("#finder").classList.remove("live");
  $("#startBtn").hidden = false; $("#stopBtn").hidden = true;
  $("#torchBtn").hidden = true; $("#torchBtn").classList.remove("on");
}
function paintTorch() {
  const t = stream?.getVideoTracks()[0], caps = t?.getCapabilities?.();   // iPhones list torch here from iOS 17.5
  $("#torchBtn").hidden = !(caps ? caps.torch : navigator.mediaDevices.getSupportedConstraints?.().torch);
}
async function toggleTorch() {
  const t = stream?.getVideoTracks()[0];
  if (!t) return;
  torchOn = !torchOn;
  try { await t.applyConstraints({ advanced: [{ torch: torchOn }] }); }
  catch { torchOn = false; $("#torchBtn").hidden = true; }   // this phone's browser can't drive the flash
  $("#torchBtn").classList.toggle("on", torchOn);
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
  if (dy > 60 || v > 0.5) return was === "full" ? setSheet("peek") : camLive() ? startCamera() : closeSheet();   // swipe away a result = scan the next one
  setSheet(was);
});
window.addEventListener("resize", () => { if (!sheet.hidden) setSheet(sheetState, false); });

// ── building blocks ──
const initial = (s) => esc((String(s || "?").trim()[0] || "?").toUpperCase());
const pic = (src, name, cls = "") => src
  ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;ph ${cls}&quot;>${initial(name)}</div>'">`
  : `<div class="ph ${cls}">${initial(name)}</div>`;

const STAMP = { pick: `${icon("check")}Tox Zero pick`, reject: `${icon("x")}Reject`, unvetted: `${icon("q")}Not vetted yet` };
const SHORT_ST = { pass: "passes", fail: "fails", warn: "⚠", clear: "no flags", unknown: "unknown" };

// four arcs, one per pillar, coloured by status — the score at a glance
function ring(r) {
  const R = 40, C = 2 * Math.PI * R, seg = C / 4, gap = 5;
  const arcs = PILLARS.map((pl, i) => {
    const st = r.card[pl.key].status;
    return `<circle class="seg ${st}" cx="50" cy="50" r="${R}" stroke-dasharray="${seg - gap} ${C - seg + gap}"
      stroke-dashoffset="${-i * seg}" transform="rotate(${-90 + (gap / 2 / C) * 360} 50 50)"><title>${pl.label}: ${st}</title></circle>`;
  }).join("");
  // minimal labels: each pillar's name in tiny caps, curved along the outside of its arc.
  // Top arcs run clockwise (text sits outside); bottom arcs run counter-clockwise so the words stay upright.
  const labels = PILLARS.map((pl, i) => {
    const bottom = i === 1 || i === 2, rr = bottom ? 56.5 : 49.5, a0 = i * 90 + 3, a1 = (i + 1) * 90 - 3;
    const pt = (deg) => [50 + rr * Math.sin(deg * Math.PI / 180), 50 - rr * Math.cos(deg * Math.PI / 180)].map((v) => v.toFixed(2)).join(" ");
    const d = bottom ? `M${pt(a1)} A${rr} ${rr} 0 0 0 ${pt(a0)}` : `M${pt(a0)} A${rr} ${rr} 0 0 1 ${pt(a1)}`;
    return `<path id="rl${i}" d="${d}" fill="none"/><text class="rlabel"><textPath href="#rl${i}" startOffset="50%" text-anchor="middle">${pl.label.toUpperCase()}</textPath></text>`;
  }).join("");
  const glyph = { pick: "✓", reject: "✕", unvetted: "?" }[r.verdict];
  const n = (s) => PILLARS.filter((pl) => r.card[pl.key].status === s).length;
  const ok = n("pass") + n("clear"), cap = [n("fail") && `${n("fail")} flagged`, ok && `${ok} cleared`, n("warn") && `${n("warn")} caution`].filter(Boolean).join(" · ") || "not checked";
  return `<div class="ringbox"><svg class="ring" viewBox="-10 -10 120 120" role="img" aria-label="Four pillars: ${PILLARS.map((pl) => `${pl.label} ${r.card[pl.key].status}`).join(", ")}">${arcs}${labels}
    <text class="glyph" x="50" y="61" text-anchor="middle">${glyph}</text></svg><div class="cap">${cap}</div></div>`;
}

function peek(r, name, brand, image) {
  return `<div class="peek">
    <div class="img">${pic(image, name && name !== "Unknown product" ? name : "?")}</div>
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
      <div class="pic">${pic(s.image, s.name)}<span class="ok">${icon("check")}Tox Zero pick</span>${s.star ? `<span class="heart"><b>❤︎</b> Andra loves</span>` : ""}</div>
      <span class="n">${esc(s.name)}</span>
      <span class="mini"><span>${icon("drop")}${icon("check")}</span>${pk}<span>${icon("search")}${icon("check")}</span><span>${icon("flask")}${icon("check")}</span></span>
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
// red = on the Nasties (hard or dotted line) · yellow = the guide's allowed compromises · green = not flagged
const COLOR = (rule) => !rule ? "green" : rule.tier === "note" ? "yellow" : "red";
const ORDER = { red: 0, yellow: 1, green: 2 };
function inciRows(p, shelf) {
  const { tokens, hits } = scanIngredients(p?.ingredients || "");
  const byToken = new Map(hits.map((h) => [h.match, h.rule]));
  const act = new Map(findActives(tokens, shelf).map((a) => [a.token, a.mech]));   // the mechanism-carrying ingredients
  return tokens.map((t) => ({ t, rule: byToken.get(t), mech: act.get(t), c: COLOR(byToken.get(t)) }))
    .sort((a, b) => ORDER[a.c] - ORDER[b.c] || (b.mech ? 1 : 0) - (a.mech ? 1 : 0));
}
const ACT = `<span class="act">${icon("flask")}active</span>`;
// one stacked bar: how much of the label is red, yellow, green
function mix(rows) {
  const n = { red: 0, yellow: 0, green: 0 };
  rows.forEach((x) => n[x.c]++);
  const seg = (c) => n[c] ? `<b class="${c}" style="flex:${n[c]}"></b>` : "";
  const key = (c, w) => n[c] ? `<span><i class="${c}"></i>${n[c]} ${w}</span>` : "";
  return `<div class="mix" role="img" aria-label="${n.red} flagged, ${n.yellow} caution, ${n.green} cleared">${seg("red")}${seg("yellow")}${seg("green")}</div>
    <div class="mixkey">${key("red", "flagged")}${key("yellow", "caution")}${key("green", "cleared")}</div>`;
}
// every ingredient on the label, flagged ones first, each flag with an ⓘ (Yuka pattern)
function ingredients(p, shelf) {
  if (!p?.ingredients) return "";
  const rows = inciRows(p, shelf);
  const row = ({ t, rule, mech, c }, hidden) => `<div class="ing-row${rule || mech ? "" : " quiet"}"${hidden ? " hidden" : ""}>
      <div><div class="nm">${esc(t)}${mech ? ACT : ""}</div><div class="lv ${c}"><i></i>${rule ? `${rule.tier === "note" ? "caution" : "flagged"} · ${esc(rule.label)}` : "cleared"}</div></div>
      ${rule ? `<button class="ibtn" type="button" data-info="rule:${rule.id}" aria-label="About ${esc(rule.label)}">${icon("info")}</button>`
        : mech ? `<button class="ibtn" type="button" data-info="mech:${mech.id}" aria-label="How ${esc(mech.label)} works">${icon("info")}</button>` : "<span></span>"}</div>`;
  const shown = Math.max(8, rows.filter((x) => x.rule || x.mech).length);
  return `<h3 class="section">ingredients.</h3><div class="ing glass">${mix(rows)}${rows.map((x, i) => row(x, i >= shown)).join("")}
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
      <div id="ingSection">${ingredients(p)}</div>
      ${p.code ? `<p class="attrib">Barcode matched to the brand's own store listing.</p>` : ""}`);
  }
  const brand = (p.brands || []).join(", ");
  const checked = p.vetted ? `<p class="checked">${icon("check")} Checked by Tox Zero${p.vetted.vetted ? ` · ${esc(p.vetted.vetted)}` : ""}${p.vetted.note ? `<span>${esc(p.vetted.note)}</span>` : ""}</p>` : "";
  if (r.verdict === "reject") {
    return openSheet(`${peek(r, p.name, brand, p.image)}${checked}
      ${r.swaps.length ? `<h3 class="section">the swaptions.</h3>${versus(p, r.swaps[0])}${swapCards(r.swaps)}`
        : `<p class="note">No Tox Zero pick for this shelf yet. It's on the vet list.</p>`}
      ${bars(r)}${ingredients(p, r.shelf)}${attrib(p)}`);
  }
  const nothing = !p.source;
  const shelfSwaps = r.shelf ? swapsFor(r.shelf, data.picks, 3) : [];
  openSheet(`${peek(r, p.name || "Unknown product", brand || (nothing ? p.code : ""), p.image)}${checked}
    <p class="note">${nothing ? "Not in Open Beauty Facts yet." : "No flags isn't a yes."}</p>
    ${submitted(p.code) ? `<div class="helpvet glass"><b>${icon("check")} Score's on the way.</b><span>You sent this one in. Once it's scored, everyone who scans it sees the result.</span></div>`
      : `<div class="helpvet glass"><b>want it vetted?</b><span>Snap the front and the ingredient list. We'll score it, and the next person who scans it sees the result.</span>
      <button class="pill navy" type="button" data-intake="${esc(p.code || "")}">${icon("camera")}Yes, vet it</button></div>`}
    ${r.lookalikes?.length ? `<ul class="list">${r.lookalikes.map((k) => `<li><button class="item glass" type="button" onclick="location.hash='#/g/${esc(k.id)}'">
      ${pic(k.image, k.name, "thumb")}<span class="txt"><span class="n">The Tox Zero pick ${esc(k.name)}?</span><span class="m">barcode not confirmed · tap</span></span></button></li>`).join("")}</ul>` : ""}
    ${bars(r)}
    ${shelfSwaps.length ? `<h3 class="section">already vetted.</h3><p class="section-sub">Tox Zero picks for ${esc(r.shelf.label.toLowerCase())}</p>${swapCards(shelfSwaps)}` : ""}
    ${ingredients(p, r.shelf)}
    ${nothing ? `<a class="pill glass cta" href="#/" onclick="setTimeout(()=>document.querySelector('#searchInput').focus(),50)">${icon("search")}Search by name</a>` : ""}
    ${attrib(p)}`);
}

// food: this version is built for beauty and personal care
function renderFood(p) {
  current = { verdict: "food", product: p };
  openSheet(`<div class="peek"><div class="img">${pic(p.image, p.name || "?")}</div>
      <div><div class="brand">${esc((p.brands || []).join(", "))}</div><div class="name">${esc(p.name || "A food product")}</div>
      <span class="stamp unvetted">Food</span></div><span></span></div>
    <div class="foodline"><p class="big">the best food has no label.</p>
      <p>Tox Zero scores health and beauty care products and advocates for eating food from your local farm.</p>
      <button class="textlink" type="button" data-intake="${esc(p.code || "")}">Not food? Have it vetted</button></div>`);
}

// ── ⓘ cards: where you learn the why ──
const TIERLINE = {
  hard: "HARD LINE · no Tox Zero pick contains it",
  dotted: "DOTTED LINE · Tox Zero picks skip it",
  note: "HEADS-UP · allowed in a couple of Tox Zero picks",
};
const STATUS_COLOR = { fail: "red", warn: "yellow", pass: "green", clear: "green", unknown: "grey" };
function showInfo(kind, key, from) {
  let html = "";
  if (kind === "rule") {
    const rule = INGREDIENT_RULES.find((x) => x.id === key), ex = EXPLAIN[key] || {};
    const seen = current && scanIngredients(current.product.ingredients || "").hits.find((h) => h.rule.id === key);
    html = `${from ? `<button class="info-back" type="button" data-info="pillar:ingredients">${icon("back")}all ingredients</button>` : ""}
      <h4>${esc(rule.label)}</h4>
      <div class="tierline"><span class="lv ${COLOR(rule)}"><i></i></span>${TIERLINE[rule.tier]}</div>
      ${seen ? `<div class="blk"><span>ON THIS LABEL</span><p>${esc(seen.match)}</p></div>` : ""}
      <div class="blk"><span>THE CONCERN</span><p>${esc(rule.why)}</p></div>
      ${ex.where ? `<div class="blk"><span>WHERE IT HIDES</span><p>${esc(ex.where)}</p></div>` : ""}
      ${ex.instead ? `<div class="blk"><span>WHAT TOX ZERO USES INSTEAD</span><p>${esc(ex.instead)}</p></div>` : ""}
      <p class="src">From the Tox Zero standard.</p>`;
  } else if (kind === "mech") {
    const m = MECHANISMS.find((x) => x.id === key);
    const a = current?.efficacy?.actives?.find((x) => x.mech.id === key);
    const low = current?.card?.efficacy?.status === "warn" && a && current.card.efficacy.detail.includes(a.token);
    html = `${from ? `<button class="info-back" type="button" data-info="pillar:${from}">${icon("back")}${from === "efficacy" ? "efficacy" : "all ingredients"}</button>` : ""}
      <h4>${esc(m.label)}</h4>
      <div class="tierline"><span class="act">${icon("flask")}active</span>THE MECHANISM</div>
      ${a ? `<div class="blk"><span>ON THIS LABEL</span><p>${esc(a.token)}</p></div>` : ""}
      <div class="blk"><span>HOW IT WORKS</span><p>${esc(m.how)}</p></div>
      <div class="blk"><span>THE DOSE</span><p>${low ? "Listed below the 1% line, so it's label decoration." : "Labels don't print the dose. Below 1%, label order is arbitrary, and a hero active there is label decoration."}</p></div>`;
  } else if (key === "efficacy") {
    const pl = PILLARS[3], x = current?.card?.efficacy, actives = current?.efficacy?.actives || [];
    html = `<h4>Efficacy</h4>
      ${x ? `<div class="tierline"><span class="lv ${STATUS_COLOR[x.status]}"><i></i></span>${esc(x.word.toUpperCase())}</div>
      <div class="blk"><span>THIS PRODUCT</span><p>${esc(current.verdict === "pick" ? x.detail : x.status === "clear" ? "Actives found. Labels don't print the dose; Tox Zero checks it." : x.detail)}</p></div>` : ""}
      ${actives.length ? `<div class="blk"><span>THE ACTIVES</span></div><div class="ilist">${actives.map((a) =>
        `<button class="irow" type="button" data-info="mech:${a.mech.id}" data-from="efficacy"><span class="act">${icon("flask")}</span><span>${esc(a.token)}<small>${esc(a.mech.how)}</small></span><em>›</em></button>`).join("")}</div>` : ""}
      <div class="blk"><span>WHAT TOX ZERO CHECKS</span><p>${esc(pl.about)}</p></div>`;
  } else if (key === "ingredients") {
    // the ingredients ⓘ IS the list: every ingredient, red / yellow / green, tap a red or yellow one for its why
    const pl = PILLARS[0], x = current?.card?.ingredients, rows = inciRows(current?.product, current?.shelf);
    const pickCell = current?.verdict === "pick" ? current.pick.ingredients : "";
    html = `<h4>Ingredients</h4>
      ${x ? `<div class="tierline"><span class="lv ${STATUS_COLOR[x.status]}"><i></i></span>${esc(x.word.toUpperCase())}${x.short ? ` · ${esc(x.short)}` : ""}</div>` : ""}
      ${rows.length ? `${mix(rows)}<div class="ilist">${rows.map(({ t, rule, mech, c }) => rule
          ? `<button class="irow" type="button" data-info="rule:${rule.id}" data-from="ingredients"><i class="${c}"></i><span>${esc(t)}</span><em>${esc(rule.label)} ›</em></button>`
          : mech ? `<button class="irow" type="button" data-info="mech:${mech.id}" data-from="ingredients"><i class="${c}"></i><span>${esc(t)}</span><em>${ACT} ›</em></button>`
          : `<div class="irow"><i class="${c}"></i><span>${esc(t)}</span></div>`).join("")}</div>`
        : pickCell ? `<div class="blk"><span>TOX ZERO VETTED</span><p>${esc(pickCell)}. Every one vetted to the Tox Zero standard.</p></div>`
        : `<div class="blk"><p>No label on file yet, so nothing could be checked.</p></div>`}
      <div class="blk"><span>WHAT TOX ZERO CHECKS</span><p>${esc(pl.about)}</p></div>`;
  } else {
    const pl = PILLARS.find((x) => x.key === key), x = current?.card?.[key];
    html = `<h4>${esc(pl.label)}</h4>
      ${x ? `<div class="tierline"><span class="lv ${STATUS_COLOR[x.status]}"><i></i></span>${esc(x.word.toUpperCase())}</div>
      <div class="blk"><span>THIS PRODUCT</span><p>${esc(x.detail)}</p></div>` : ""}
      <div class="blk"><span>WHAT TOX ZERO CHECKS</span><p>${esc(pl.about)}</p></div>`;
  }
  $("#infoBody").innerHTML = html;
  $("#info").hidden = false;
  $("#info .info-card").scrollTop = 0;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-info]");
  if (b) { e.preventDefault(); const [kind, key] = b.dataset.info.split(":"); showInfo(kind, key, b.dataset.from); return; }
  const add = e.target.closest("[data-intake]");
  if (add) { e.preventDefault(); showIntake(add.dataset.intake); return; }
  if (e.target.id === "info" || e.target.closest("#infoClose")) $("#info").hidden = true;
});

// ── offline catch-up: when signal returns, send queued photos and score saved scans ──
async function sendIntake() {
  if (!data?.config?.intakeUrl || !navigator.onLine) return;
  const list = intake.all();
  for (const x of list.filter((e) => !e.sent)) {
    try { const r = await fetch(data.config.intakeUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(x) }); if (r.ok) x.sent = true; } catch {}
  }
  intake.save(list);
}
async function scorePending() {
  if (!navigator.onLine) return;
  const list = pending.all(), waiting = list.filter((x) => !x.verdict);
  if (!waiting.length) return;
  let done = 0;
  for (const x of waiting) {
    try {
      await lookupVetted(x.code);
      const p = (await lookupOBF(x.code)) || { code: x.code, name: "", brands: [] };
      if (isFoodOnly(p)) { Object.assign(x, { verdict: "food", name: p.name || "Food product", image: p.image || "" }); done++; continue; }
      const r = evaluate(p, data);
      Object.assign(x, { verdict: r.verdict, name: r.pick?.name || p.name || "Unknown product", image: r.pick?.image || p.image || "" });
      if (r.verdict === "unvetted") vet.add(p);
      done++;
    } catch { break; }
  }
  pending.save(list);
  if (done) toast(`${done} saved scan${done > 1 ? "s" : ""} scored`, "#/vet");
}
function toast(text, href) {
  const t = Object.assign(document.createElement("a"), { className: "toast glass", href: href || "#/", textContent: text });
  document.body.append(t);
  setTimeout(() => t.remove(), 5000);
}
window.addEventListener("online", () => { sendIntake(); scorePending(); });

// ── "want it vetted?": photos + packaging, into the vet queue ──
const submitted = (code) => !!code && intake.all().some((x) => x.code === code);
async function shrink(file, max = 900) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", .72);
}
const EMAIL_KEY = "tz-email";   // remembered on this phone, so "email me" is one tap after the first time
function showIntake(code) {
  const p = current?.product || {};
  const savedEmail = (() => { try { return localStorage.getItem(EMAIL_KEY) || ""; } catch { return ""; } })();
  const chips = (name, opts) => opts.map((o) => `<label class="chip glass"><input type="radio" name="${name}" value="${o.toLowerCase()}"><span>${o}</span></label>`).join("");
  $("#infoBody").innerHTML = `<form class="intake" id="intakeForm">
    <h4>want it vetted?</h4>
    <p class="hint">Barcode ${esc(code || "not scanned")}</p>
    <div class="shots">
      <label class="shot glass"><input type="file" accept="image/*" capture="environment" data-shot="front" hidden><img alt=""><span>${icon("camera")}Front</span></label>
      <label class="shot glass"><input type="file" accept="image/*" capture="environment" data-shot="label" hidden><img alt=""><span>${icon("camera")}Ingredient list</span></label>
    </div>
    <label class="fld">Product<input name="name" value="${esc(p.name || "")}" placeholder="name on the front" required></label>
    <label class="fld">Brand<input name="brand" value="${esc((p.brands || [])[0] || "")}" placeholder="brand"></label>
    <p class="q">What's it in?</p><div class="chips">${chips("material", ["Glass", "Metal", "Cardboard", "Plastic", "Other / not sure"])}</div>
    <div id="touchQ" hidden><p class="q">Does plastic touch the product?</p><div class="chips">${chips("touch", ["Yes", "No", "Not sure"])}</div></div>
    <label class="fld">Ingredients <em>optional, the photo works</em><textarea name="ingredients" rows="3" placeholder="paste or type them"></textarea></label>
    <label class="tick"><input type="checkbox" name="notify"${savedEmail ? " checked" : ""}><span>Email me when it's scored</span></label>
    <label class="fld" id="emailFld"${savedEmail ? "" : " hidden"}>Email<input name="email" type="email" value="${esc(savedEmail)}" placeholder="you@example.com" autocomplete="email"${savedEmail ? " required" : ""}></label>
    <button class="pill navy cta" type="submit">Get it scored</button>
  </form>`;
  $("#info").hidden = false;
  const shots = {};
  const f = $("#intakeForm");
  f.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.name === "material") $("#touchQ").hidden = !["plastic", "other / not sure"].includes(t.value);
    if (t.name === "notify") { $("#emailFld").hidden = !t.checked; f.email.required = t.checked; if (t.checked && !f.email.value) f.email.focus(); }
    if (t.dataset.shot && t.files[0]) {
      try { shots[t.dataset.shot] = await shrink(t.files[0]); t.parentNode.querySelector("img").src = shots[t.dataset.shot]; t.parentNode.classList.add("has"); } catch {}
    }
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const email = d.notify ? (d.email || "").trim() : "";
    if (email) { try { localStorage.setItem(EMAIL_KEY, email); } catch {} }
    const entry = { code: code || "", name: d.name, brand: d.brand, material: d.material || "", plasticTouches: d.touch || "",
      ingredients: d.ingredients || "", email, front: shots.front || "", label: shots.label || "", at: new Date().toISOString() };
    intake.save([entry, ...intake.all().filter((x) => !x.code || x.code !== entry.code)]);
    await sendIntake();
    $("#infoBody").innerHTML = `<h4>Sweet! We'll have an answer soon.</h4><div class="blk"><p>You just helped everyone in the community who scans ${esc(entry.name || "this")} next.${email ? " We'll email you the second it's scored." : ""}${navigator.onLine ? "" : " No signal right now, so it sends itself once you're back online."}</p></div>
      <button class="pill navy cta" type="button" id="scanAgain">${icon("scan")}Scan another</button>`;
    $("#scanAgain").addEventListener("click", () => { $("#info").hidden = true; startCamera(); });
    paintVetCount();
    if (current) renderResult(current);
  });
}

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
  if (r.verdict === "pick") { renderResult(r); return enrichPick(code, r); }
  busy(true);
  let p = null, offline = false;
  const team = lookupVetted(code);
  try { p = await lookupOBF(code); } catch { offline = true; }
  if (await team) offline = false;          // the team's record is enough to score it
  busy(false);
  if (offline) {
    current = null;
    pending.add(code);
    paintVetCount();
    return openSheet(`<div class="peek"><div class="img"><div class="ph">?</div></div>
      <div><div class="brand">${esc(code)}</div><div class="name">Saved for later</div><span class="stamp unvetted">${icon("q")}No signal</span></div><span></span></div>
      <p class="note">It gets scored the moment you're back online. Tox Zero picks still work offline.</p>`);
  }
  p = p || { code, name: "", brands: [] };
  if (p.vetted === undefined && data.vetted[code]) p.vetted = data.vetted[code];
  if (isFoodOnly(p)) return renderFood(p);
  r = evaluate(p, data);
  if (r.verdict === "unvetted" || (r.verdict === "reject" && !r.swaps.length)) vet.add(p);
  renderResult(r);
}

async function enrichPick(code, r) {
  let p = null;
  try { p = await lookupOBF(code); } catch {}
  if (!p?.ingredients || current !== r) return;
  r.product = { ...r.product, ingredients: p.ingredients, source: "obf", code };
  const box = $("#ingSection");
  if (box) box.innerHTML = ingredients(r.product, r.shelf) + attrib(r.product);
}

function routePick(id) {
  const k = data.picksById[id];
  if (!k) return go("#/");
  renderResult(evaluate({ pick: k, name: "" }, data));
}

async function routeSearch(q) {
  const local = searchPicks(q, data.picks);
  show(`${back}<h1 class="title" style="font-size:40px;text-align:left;margin-top:8px">${esc(q)}.</h1>
    <p class="label">TOX ZERO PICKS</p>
    ${local.length ? `<ul class="list">${local.map((k) => `<li><button class="item glass" type="button" onclick="location.hash='#/g/${esc(k.id)}'">
      ${pic(k.image, k.name, "thumb")}<span class="txt"><span class="n">${esc(k.name)}</span><span class="m">${esc(k.category)}</span></span>
      <span class="ok">${icon("check")}</span></button></li>`).join("")}</ul>` : `<p class="empty">No Tox Zero pick by that name.</p>`}
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
    <p class="lead">Only the Tox Zero standard says yes.<br><span class="scope">Tox Zero scores health and beauty care products and advocates for eating food from your local farm.</span></p>
    <div class="legend glass">
      ${legend("pass", "check", "Tox Zero pick", "Meets the Tox Zero standard on all four pillars.")}
      ${legend("fail", "x", "Reject", "Fails a pillar. Here's the swaption.")}
      ${legend("unknown", "q", "Not vetted yet", "Everything else. No flags isn't a yes.")}
    </div>
    <p class="label">THE 4 PILLARS</p>
    <div class="legend glass">${PILLARS.map((pl) => legend("clear", pl.icon, pl.label, pl.about)).join("")}</div>
    <div class="stats">
      <div class="glass"><b>${data.picks.length}</b><span>Tox Zero picks</span></div>
      <div class="glass"><b>${Object.keys(data.barcodes).length}</b><span>barcodes confirmed with brands</span></div>
      <div class="glass"><b>${rules}</b><span>ingredient rules</span></div>
      <div class="glass"><b>${data.ownerIndex.idx.size}</b><span>brand names checked for ownership</span></div>
    </div></div>`);
}

function routeVet() {
  const list = vet.all(), subs = intake.all(), pend = pending.all();
  show(`${back}<h1 class="title">vet list.</h1><p class="sub">Not vetted yet. We're on it.</p>
    ${subs.length ? `<p class="label">SENT TO BE VETTED</p><ul class="list">${subs.map((x) => `<li><div class="item glass">${pic(x.front, x.name, "thumb")}<span class="txt"><span class="n">${esc(x.name || "Unnamed")}</span>
      <span class="m">${esc([x.brand, x.material, x.code].filter(Boolean).join(" · "))}${x.label ? " · label photo" : ""}${x.sent ? " · sent" : " · on this phone"}</span></span></div></li>`).join("")}</ul>` : ""}
    ${pend.length ? `<p class="label">SAVED WITHOUT SIGNAL</p><ul class="list">${pend.map((x) => `<li><button class="item glass" type="button" onclick="location.hash='#/p/${esc(x.code)}'">
      ${pic(x.image, x.name || "?", "thumb")}<span class="txt"><span class="n">${esc(x.name || x.code)}</span>
      <span class="m">${x.verdict ? { pick: "Tox Zero pick", reject: "Reject", unvetted: "Not vetted yet", food: "Food" }[x.verdict] : "waiting for signal"} · ${esc(x.at)}</span></span></button></li>`).join("")}</ul>` : ""}
    <p class="label">SCANNED, NOT VETTED YET</p>
    ${list.length ? `<ul class="list">${list.map((x) => `<li><div class="item glass">${pic(x.image, x.name, "thumb")}<span class="txt"><span class="n">${esc(x.name)}</span>
      <span class="m">${esc([x.brand, x.code, x.at].filter(Boolean).join(" · "))}</span></span></div></li>`).join("")}</ul>
      <div class="row"><button class="pill glass" type="button" id="copyVet">Copy list</button><button class="pill glass" type="button" id="clearVet">Clear</button></div>`
    : `<p class="empty" style="text-align:center">Empty. Scan something Tox Zero hasn't vetted yet.</p>`}`);
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
  if (kind === "p" || kind === "g") pauseScan(); else if (h !== "/") stopCamera();
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
$("#torchBtn").addEventListener("click", toggleTorch);
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
loadData().then(() => { route(); sendIntake(); scorePending(); });
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
