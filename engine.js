// Tox Zero Scanner — scoring engine. No DOM; runs in the browser and in Node tests.
//
// Three verdicts, nothing else:
//   pick      — in Andra's guide (barcode confirmed against the brand's own store). Only the guide approves.
//   reject    — fails one of the Fake-Clean Reject tests; every reason names the exact ingredient, owner or packaging.
//   unvetted  — everything else. No flags found is NOT an approval.
//
// Rules: the guide's Nasties pages (hard + dotted lines), .claude/rules/brand-values.md
// (Fake-Clean Reject Rule, NOT ZW rule), the butyloctyl-salicylate reject. Approved by Andra 2026-10-18.

// ── ingredients ──────────────────────────────────────────────────────────────
// tier: "hard" = hard line (no pick contains it) · "dotted" = dotted line (picks skip it)
//       "note" = the guide's two allowed compromises: heads-up only, never a flag
export const INGREDIENT_RULES = [
  { id: "fragrance", tier: "hard", label: "Fragrance / parfum",
    re: /\b(parfum|fragrance|perfume|parfüm|profumo)\b/, unless: /\bfree\b/,
    why: "A legal black box: 50–100+ undisclosed chemicals, often phthalates and synthetic musks." },
  { id: "flavor", tier: "hard", label: "Flavor / aroma (undisclosed blend)",
    re: /\b(flavou?rs?|aroma)\b/, unless: /\b(oil|extract|free)\b/,
    why: "Same loophole as parfum: an umbrella term with the real ingredients hidden behind it." },
  { id: "parabens", tier: "hard", label: "Parabens", re: /paraben/,
    why: "Estrogen-mimicking preservatives, found intact in breast-tumor tissue (Darbre 2004)." },
  { id: "phthalates", tier: "hard", label: "Phthalates", re: /phthalate/,
    why: "Endocrine disruptors linked to reduced sperm count (Swan 2015)." },
  { id: "formaldehyde", tier: "hard", label: "Formaldehyde releaser",
    re: /formaldehyde|dmdm hydantoin|quaternium-15|imidazolidinyl urea|diazolidinyl urea|bronopol|2-bromo-2-nitropropane|hydroxymethylglycinate|methenamine|glyoxylic acid|methylene glycol/,
    why: "Releases formaldehyde, an IARC Group 1 carcinogen, slowly inside the bottle." },
  { id: "oxybenzone", tier: "hard", label: "Oxybenzone / octinoxate",
    re: /oxybenzone|benzophenone-3|octinoxate|(ethylhexyl|octyl) methoxycinnamate/,
    why: "Hormone disruption in lab models; absorbed through skin within hours. Mineral SPF works." },
  { id: "pfas", tier: "hard", label: "PFAS (forever chemicals)",
    re: /\bptfe\b|polytetrafluoroethylene|perfluor|polyperfluoro|fluoroalcohol phosphate|\bpfas\b/,
    why: "Persist in the body indefinitely. Linked to thyroid disease and immune suppression." },
  { id: "dyes", tier: "hard", label: "Coal tar dye",
    re: /\b(fd&c|d&c)\b|\b(red|yellow|blue|green|orange|violet) (no\.? ?)?\d{1,2}\b|\bbasic (blue|red|brown|yellow|violet) \d+|phenylenediamine|toluene-2,5-diamine|\bppd\b|coal tar/,
    why: "Petroleum-derived colorant. Several are probable human carcinogens." },
  { id: "triclosan", tier: "hard", label: "Triclosan / triclocarban", re: /triclosan|triclocarban/,
    why: "Endocrine disruptor that drives antibiotic resistance. The FDA pulled it from hand soap in 2016." },
  { id: "microplastic", tier: "hard", label: "Plastic film-former (microplastic)",
    re: /\bpolyethylene\b(?! glycol)|polyethylene terephthalate|\bpet\b|nylon-?\d+|acrylates?[ /](co|cross)?polymer|acrylates\/|polyacrylate|polymethyl methacrylate|polymethylsilsesquioxane|polypropylene|polystyrene/,
    why: "Plastic in the formula. Leave-on versions are still legal, and they shed into you and the waterways." },
  { id: "aluminum", tier: "hard", label: "Aluminum salts",
    re: /alumin(i)?um (chlorohydrate|sesquichlorohydrate|chloride|zirconium)|alumin(i)?um[\w ]*zirconium/,
    why: "Plugs the sweat duct, right by the lymph chain. Deodorant doesn't need it." },
  { id: "musks", tier: "hard", label: "Synthetic musk",
    re: /galaxolide|tonalide|musk (ketone|xylene|ambrette)|hexamethylindanopyran|celestolide|phantolide|traseolide|ethylene brassylate|habanolide/,
    why: "Bioaccumulative: found in breast milk, blood and umbilical cord." },
  { id: "solvents", tier: "hard", label: "Toluene / acetone", re: /\btoluene\b(?!-)|\bacetone\b/,
    why: "Toluene is a developmental toxicant; acetone strips the nail plate." },
  { id: "bisphenols", tier: "hard", label: "Bisphenols", re: /bisphenol|\bbpa\b/,
    why: "Hormone-mimicking plasticizers." },
  { id: "isothiazolinones", tier: "hard", label: "Isothiazolinones (MIT/MCI)", re: /isothiazolinone/,
    why: "Aggressive sensitizer: MIT was Allergen of the Year in 2013." },
  { id: "phenoxyethanol", tier: "hard", label: "Phenoxyethanol", re: /phenoxyethanol/,
    why: "Capped at 1% in the EU. Skin irritant. Cleaner preservative systems exist." },
  { id: "sulfates", tier: "hard", label: "Sulfates (SLS / SLES)",
    re: /(sodium|ammonium|magnesium|tea-) ?(lauryl|laureth|myreth) sulfate|\bsl(e)?s\b/,
    why: "SLES can carry 1,4-dioxane; both strip the barrier. Glucosides clean just as well." },
  { id: "peg", tier: "hard", label: "PEG compound (ethoxylated)",
    re: /\bpeg-?\d*\b|\bppg-?\d*\b|polyethylene glycol|\b[a-z]+eth-\d+\b|laureth|myreth|pareth/,
    why: "Can arrive contaminated with 1,4-dioxane or ethylene oxide. Petroleum-derived." },
  { id: "polysorbates", tier: "hard", label: "Polysorbates", re: /polysorbate/,
    why: "Ethoxylated, same 1,4-dioxane pathway as PEGs." },
  { id: "butyloctyl", tier: "hard", label: "Butyloctyl salicylate", re: /butyloctyl salicylate/,
    why: "A Tox Zero hard no." },
  { id: "petro", tier: "hard", label: "Petrochemical",
    re: /petrolatum|mineral oil|paraffinum liquidum|\bparaffin\b|ozokerite|ceresin|microcrystalline wax|cera microcristallina|isododecane|isohexadecane|hydrogenated polyisobutene|\bpolybutene\b|\bpolyisobutene\b|petroleum/,
    why: "Petroleum-derived. Cosmetic grade can carry MOAH contamination, and it seals without healing." },
  { id: "silicones", tier: "dotted", label: "Silicone",
    re: /dimethicone|methicone|siloxane|silsesquioxane|dimethiconol|cyclomethicone|trimethylsiloxysilicate/,
    why: "Cyclic silicones are EU Substances of Very High Concern; linear ones persist in the environment." },
  { id: "bht", tier: "dotted", label: "BHA / BHT", re: /butylated hydroxy(anisole|toluene)|\bbht\b/,
    why: "Synthetic antioxidant with hormone-disruption signals in animal studies." },
  { id: "ethanolamines", tier: "dotted", label: "Ethanolamine (DEA / TEA / MEA)",
    re: /\b(tri|di|mono)?ethanolamine\b|\b(tea|dea|mea)-|^(tea|dea|mea)$|(amide|amine) (dea|mea)\b/,
    why: "Can form nitrosamines, probable carcinogens." },
  { id: "talc", tier: "dotted", label: "Talc", re: /\btalc\b/,
    why: "Can co-occur with asbestos, and the brand doesn't have to prove it doesn't." },
  { id: "propellant", tier: "dotted", label: "Aerosol propellant",
    re: /\b(butane|isobutane|propane|hydrofluorocarbon|hfc-?152a|dimethyl ether)\b/,
    why: "Aerosols put VOCs right in your breathing zone. No aerosol made the guide." },
  { id: "hexanediol", tier: "note", label: "1,2-Hexanediol", re: /1,2-hexanediol/,
    why: "A compromise the guide allows in two picks. Long-term data is thin." },
  { id: "tocoacetate", tier: "note", label: "Tocopheryl acetate", re: /tocopheryl acetate/,
    why: "Synthetic vitamin E. A compromise the guide allows in two picks." },
];

// ⓘ explainers. "where" = the PRODUCTS column of the guide's Nasties pages (pp. 122–124 of the live PDF);
// "instead" only where the guide itself names the cleaner route. Never invent either.
export const EXPLAIN = {
  fragrance: { where: "Almost everything scented, including \"unscented\" (masking)", instead: "Brands that list every essential oil by name" },
  flavor: { where: "Toothpaste, lip balm, mouthwash", instead: "Brands that list every flavor oil by name" },
  parabens: { where: "Shampoo, lotion, makeup, deodorant", instead: "The class is easy to replace, so the guide replaces it" },
  phthalates: { where: "Synthetic fragrance, nail polish, vinyl packaging" },
  formaldehyde: { where: "Nail polish, hair treatments, eyelash glue, some preservatives" },
  oxybenzone: { where: "Chemical sunscreens, SPF lip balms, SPF foundations", instead: "Mineral SPF" },
  pfas: { where: "Long-wear makeup, waterproof mascara, dental floss" },
  dyes: { where: "Permanent hair dye, dandruff shampoo, darker makeup pigments" },
  triclosan: { where: "Antibacterial soap, some toothpaste, deodorant" },
  microplastic: { where: "Scrubs, long-wear makeup, gels, primers" },
  aluminum: { where: "Antiperspirants, some toothpaste", instead: "A deodorant, which only has to cover smell" },
  musks: { where: "Perfume, body lotion, laundry detergent, \"clean\" fragrances" },
  solvents: { where: "Nail polish, nail polish remover, hair smoothing treatments", instead: "Water-based polish" },
  bisphenols: { where: "Plastic packaging, can linings, thermal-paper receipts", instead: "Glass or aluminum" },
  isothiazolinones: { where: "Shampoo, conditioner, baby wipes, \"clean\" preservative systems" },
  phenoxyethanol: { where: "Lotions, serums, baby products, \"clean\" brands", instead: "Rosemary extract, leuconostoc ferment, sodium benzoate" },
  sulfates: { where: "Shampoo, body wash, cleansers, toothpaste", instead: "SCI, SLSA, decyl or coco glucoside" },
  peg: { where: "Creams, cleansers, hair conditioner" },
  polysorbates: { where: "Cleansers, moisturizers, serums, \"natural\" emulsifiers" },
  butyloctyl: { where: "Sunscreens and creamy textures (a UV-filter solvent and emollient)" },
  petro: { where: "Lip balm (Vaseline, Carmex), lotion, baby oil, ointments, waxy sticks" },
  silicones: { where: "Primers, serums, hair smoothing products" },
  bht: { where: "Lipstick, sunscreen, moisturizer", instead: "Vitamin E or rosemary extract" },
  ethanolamines: { where: "Foaming cleansers, \"plant-based\" surfactant blends" },
  talc: { where: "Powder, eyeshadow, blush, baby powder" },
  propellant: { where: "Hairspray, dry shampoo, spray sunscreen, aerosol formats" },
  hexanediol: { where: "Serums and toners" },
  tocoacetate: { where: "Lotions, serums, \"vitamin E\" claims", instead: "Natural mixed tocopherols" },
};

// The four pillars of the Tox Zero Standard (the guide's own page), in display order.
export const PILLARS = [
  { key: "ingredients", label: "Ingredients", icon: "drop",
    about: "Checked against the guide's Nasties. Hard lines: no pick contains them. Dotted lines: picks skip them. Every flag names the exact ingredient on the label." },
  { key: "packaging", label: "Packaging", icon: "bottle",
    about: "Packaging is part of the formula. Oils pull plastic additives out of the container and into the product. A consumable in plastic is never zero waste. End of life shows only when it's on record." },
  { key: "owner", label: "Transparency", icon: "owner",
    about: "Who gets the money. Brands owned by conglomerates that profit from the products the guide replaces fail, and so do the brands on the guide's Wall of Claim. Good owners pass." },
  { key: "efficacy", label: "Efficacy", icon: "flask",
    about: "Does it actually work? Clean isn't enough. Only a human can test this, and every Tox Zero pick passed. A scanner can't." },
];

// Split an INCI list on top-level commas/semicolons, keeping "1,2-hexanediol" and (parenthesised, parts) whole.
export function splitIngredients(text) {
  const out = [];
  let depth = 0, cur = "";
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++;
    if ((c === ")" || c === "]") && depth > 0) depth--;
    const digitComma = c === "," && /\d/.test(s[i - 1] || "") && /\d/.test(s[i + 1] || "");
    if (depth === 0 && (c === ";" || c === "•" || (c === "," && !digitComma))) {
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out
    .map((t) => t.replace(/[*†‡°]+/g, "").replace(/\s+/g, " ").replace(/^[\s.:_-]+|[\s.:_-]+$/g, "").trim())
    .filter((t) => t && t.length < 160);
}

export function scanIngredients(text) {
  const tokens = splitIngredients(text);
  const hits = new Map();
  for (const token of tokens) {
    const t = token.toLowerCase();
    // coal tar dyes by color index: CI 1xxxx–74xxx are synthetic (75xxx natural, 77xxx minerals)
    for (const m of t.matchAll(/\bci ?(\d{5})\b/g)) {
      if (+m[1] < 75000 && !hits.has("dyes")) hits.set("dyes", { rule: rule("dyes"), match: token });
    }
    for (const r of INGREDIENT_RULES) {
      if (hits.has(r.id) || !r.re.test(t) || (r.unless && r.unless.test(t))) continue;
      hits.set(r.id, { rule: r, match: token });
    }
  }
  return { tokens, hits: [...hits.values()] };
}
const rule = (id) => INGREDIENT_RULES.find((r) => r.id === id);

// ── ownership ────────────────────────────────────────────────────────────────
export const normBrand = (s) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

// Wall of Claim names that are a brand plus a word, matched on the brand alone.
const WALL_ALIASES = { "Wild Deodorant": ["wild"], "ILIA Beauty": ["ilia"], "Earthling Co.": ["earthling"],
  "Pai Skincare": ["pai"], "Ao Skincare": ["aoskincare"] };

export function buildOwnerIndex(owners, wall) {
  const idx = new Map();
  for (const [oid, brands] of Object.entries(owners.brands)) {
    for (const [brand, since] of Object.entries(brands)) {
      idx.set(normBrand(brand), { kind: "owner", brand, owner: owners.owners[oid], since });
    }
    idx.set(normBrand(owners.owners[oid].replace(/\(.*\)/, "")), { kind: "owner", brand: owners.owners[oid], owner: owners.owners[oid] });
  }
  for (const w of wall || []) {
    for (const key of [normBrand(w.brand), ...(WALL_ALIASES[w.brand] || [])]) {
      idx.set(key, { kind: "wall", brand: w.brand, reason: w.reason });
    }
  }
  const pass = new Map(Object.entries(owners.pass || {}).map(([b, v]) => [normBrand(b), { kind: "pass", brand: b, ...v }]));
  return { idx, pass };
}

// Exact brand match, or a prefix match for long, distinctive names ("Dove Men+Care" → Dove is too short; "Burt's Bees Baby" → Burt's Bees).
export function findOwner(product, index) {
  const cands = (product.brands || []).map(normBrand).filter(Boolean);
  const nameKey = normBrand(product.name);
  const look = (key) => {
    if (index.pass.has(key)) return index.pass.get(key);
    if (index.idx.has(key)) return index.idx.get(key);
    for (const [k, v] of index.idx) if (k.length >= 7 && key.startsWith(k)) return v;
    for (const [k, v] of index.pass) if (k.length >= 5 && key.startsWith(k)) return v;
    return null;
  };
  let best = null;
  for (const key of cands) {
    const hit = look(key) || look(key + nameKey);
    if (hit && (!best || rank(hit) > rank(best))) best = hit;
  }
  if (!best && !cands.length && nameKey) best = look(nameKey); // no brand on file: try the name's start
  return best;
}
const rank = (h) => ({ wall: 3, owner: 2, pass: 1 }[h.kind] || 0);

// ── shelves (what kind of product is this, and which guide picks swap for it) ──
const RX = (s) => new RegExp(s, "i");
export const SHELVES = [
  { id: "lipbalm", label: "Lip balm", re: RX("lip.?balm|lip.?butter|lip salve|baume.{0,6}l[eè]vres|chapstick|lippenpflege"), cats: ["Lip balm & liner"], filter: /balm|butter/i },
  { id: "lipliner", label: "Lip liner", re: RX("lip ?liner|lip pencil"), cats: ["Lip balm & liner"], filter: /liner|pencil/i },
  { id: "lipstick", label: "Lipstick", re: RX("lipstick|rouge.{0,4}l[eè]vres|lip colou?r|lip tint|lip stain|lip.?gloss|lip-gloss"), cats: ["Lipstick"] },
  { id: "mascara", label: "Mascara", re: RX("mascara"), cats: ["Mascara & eyeliner"], filter: /mascara/i },
  { id: "eyeliner", label: "Eyeliner", re: RX("eye ?liner|eye pencil|kohl|khol|eye-liner"), cats: ["Eyeliner", "Mascara & eyeliner"], filter: /liner|pencil/i },
  { id: "eyecolor", label: "Eyeshadow, brows & concealer", re: RX("eye ?shadow|ombre|concealer|correct|brow"), cats: ["Concealer, brows & eyeshadow"] },
  { id: "foundation", label: "Foundation & primer", re: RX("foundation|fond de teint|primer|bb cream|cc cream|tinted moisturi"), cats: ["Foundation & primer"] },
  { id: "cheeks", label: "Blush, bronzer & highlighter", re: RX("blush|bronzer|highlight|contour"), cats: ["Blush, bronzer & highlighter"] },
  { id: "powder", label: "Setting powder", re: RX("setting powder|loose powder|pressed powder|face powder|poudre"), cats: ["Setting powder"] },
  { id: "settingspray", label: "Setting spray", re: RX("setting spray|fixing spray|makeup spray"), cats: ["Setting spray"] },
  { id: "deodorant", label: "Deodorant", re: RX("deodorant|d[ée]odorant|antiperspirant|anti-?transpirant|deodorants"), cats: ["Deodorant"] },
  { id: "toothpaste", label: "Toothpaste", re: RX("toothpaste|dentifrice|tooth ?powder|tooth tab|zahnpasta|pasta de dientes"), cats: ["Toothpaste & floss"], filter: /tooth|paste|powder|tab|crush/i },
  { id: "floss", label: "Floss", re: RX("floss|fil dentaire"), cats: ["Toothpaste & floss"], filter: /floss/i },
  { id: "mouthwash", label: "Mouthwash", re: RX("mouth ?wash|mouth rinse|bain de bouche"), cats: ["Mouthwash & tongue scraper"], filter: /mouthwash|rinse/i },
  { id: "toothbrush", label: "Toothbrush", re: RX("tooth ?brush|brosse [àa] dents"), cats: ["Toothbrush"] },
  { id: "selftan", label: "Self-tan", re: RX("self.?tan|autobronz|sunless|tanning (mousse|lotion|drops|water)"), cats: ["Self-tan"] },
  { id: "sunscreen", label: "Sunscreen", re: RX("sunscreen|sun ?cream|sun ?block|sun protection|\\bspf\\b|solaire|sun-screen"), cats: ["Sunscreen"] },
  { id: "conditioner", label: "Conditioner", re: RX("conditioner|apr[eè]s-shampo|detangl"), cats: ["Conditioner"] },
  { id: "shampoo", label: "Shampoo", re: RX("shampoo|shampooing|champ[uú]"), cats: ["Shampoo"] },
  { id: "hairdye", label: "Hair color", re: RX("hair colou?r|hair dye|coloration|henna"), cats: ["Hair dye & styling"], filter: /colou?r|henna|dye/i },
  { id: "hairstyling", label: "Hair styling", re: RX("hair ?spray|laque|hair gel|styling|mousse|pomade|hair wax|curl cream|edge control"), cats: ["Hair styling", "Hair dye & styling", "Protective styling"] },
  { id: "hairtreat", label: "Hair & scalp treatment", re: RX("hair oil|hair mask|scalp|hair serum|leave-in"), cats: ["Hair treatment", "Scalp care"] },
  { id: "eyecream", label: "Eye cream", re: RX("eye cream|eye serum|eye gel|contour des yeux|under.?eye"), cats: ["Eye cream"] },
  { id: "cleanser", label: "Face cleanser", re: RX("face wash|facial cleanser|cleanser|cleansing (gel|foam|milk|oil|balm)|nettoyant|micellar|makeup remover|d[ée]maquillant"), cats: ["Face cleanser"] },
  { id: "handcare", label: "Hand care", re: RX("hand (cream|lotion|balm|salve)|cr[eè]me (pour les )?mains"), cats: ["Hand care"] },
  { id: "bodylotion", label: "Body lotion", re: RX("body (lotion|cream|butter|milk|oil)|lait (pour le )?corps|cr[eè]me (pour le )?corps|bodylotion|body-lotion"), cats: ["Body lotion"] },
  { id: "serum", label: "Face serum", re: RX("serum|s[ée]rum"), cats: ["Face serum", "Anti-aging serum"] },
  { id: "moisturizer", label: "Face moisturizer", re: RX("moisturi[sz]|face cream|day cream|night cream|cr[eè]me (de jour|de nuit|visage|hydratante)|face lotion|facial lotion|gel cream"), cats: ["Face moisturizer"] },
  { id: "scrub", label: "Scrub", re: RX("scrub|gommage|exfoliat"), cats: ["Body scrub", "Exfoliant"] },
  { id: "bath", label: "Bath", re: RX("bath bomb|bubble bath|bath salt|bain moussant|bath soak|shower steamer"), cats: ["Bath"] },
  { id: "soap", label: "Soap & body wash", re: RX("body wash|shower gel|gel douche|douchegel|duschgel|\\bsoap\\b|savon|hand wash"), cats: ["Soap & body wash"] },
  { id: "shaving", label: "Shaving & hair removal", re: RX("shav|razor|rasoir|depilat|wax strip|epilat|dermaplan"), cats: ["Shaving & hair removal"] },
  { id: "beard", label: "Men's grooming", re: RX("beard|after ?shave"), cats: ["Men's grooming"] },
  { id: "nails", label: "Nails", re: RX("nail|vernis|ongles|cuticle"), cats: ["Nails"] },
  { id: "tampons", label: "Tampons", re: RX("tampon"), cats: ["Tampons"] },
  { id: "pads", label: "Pads", re: RX("sanitary|menstrual|period|maxi ?pad|panty ?liner|serviettes? hygi"), cats: ["Pads & period underwear"] },
  { id: "hairbrush", label: "Brushes & combs", re: RX("hair ?brush|\\bcomb\\b|peigne|brosse [àa] cheveux"), cats: ["Brushes & combs"], bifl: true },
  { id: "makeupbrush", label: "Makeup brushes", re: RX("makeup brush|foundation brush|kabuki|makeup sponge|beauty blender"), cats: ["Makeup brushes"], bifl: true },
  { id: "perfume", label: "Perfume", re: RX("perfume|eau de (parfum|toilette)|cologne|body mist|body spray|\\bparfum\\b"), cats: ["Perfume", "Men's fragrance"] },
];

// Buy-it-for-life tools never get a plastic flag (NOT ZW rule).
const BIFL_NAME = /razor|rasoir|clipper|shears|scissors|tweezer|tongue scraper|dermaplan|\bcomb\b|hair ?brush|makeup brush|kabuki|gua sha|roller|curler|pillowcase|pumice|nail file|device|\bbag\b/i;

export function detectShelf(product) {
  const hay = `${product.name || ""} ${product.categories || ""}`.replace(/en:|fr:|-/g, " ");
  return SHELVES.find((s) => s.re.test(hay)) || null;
}

// ── packaging ────────────────────────────────────────────────────────────────
const PLASTIC = /plastic|plastique|kunststoff|\bpp\b|\bpe\b|hdpe|ldpe|\bpet\b|polypropylene|polyethylene|\bpvc\b|\bps\b/i;
const FATTY = /oil|butter|\bwax\b|\bcera\b|beeswax|triglyceride|tallow|lanolin|squalane|petrolatum|ozokerite|paraffin|butyrospermum|theobroma|cocos nucifera|ricinus|simmondsia|olea europaea|helianthus|isopropyl myristate|stearate|cetearyl alcohol|cetyl alcohol|stearyl alcohol/i;
const FATTY_FORMAT = /\b(balm|stick|salve|butter|oil|wax|pomade|ointment|baume|beurre|huile)\b/i;

export function packagingReasons(product, tokens, shelf, picks) {
  const pkg = String(product.packaging || "").replace(/en:|fr:/g, " ");
  const bifl = (shelf && shelf.bifl) || BIFL_NAME.test(product.name || "");
  const out = [];
  if (/aerosol/i.test(pkg)) out.push({ type: "packaging", label: "Aerosol format", tier: "dotted",
    detail: "Aerosols put VOCs right in your breathing zone. No aerosol made the guide." });
  if (bifl || !PLASTIC.test(pkg)) return { reasons: out, plastic: PLASTIC.test(pkg), bifl };
  const fatty = tokens.slice(0, 3).some((t) => FATTY.test(t)) || FATTY_FORMAT.test(product.name || "");
  if (fatty) {
    out.push({ type: "packaging", label: "Plastic holding an oily formula", tier: "hard",
      detail: "Packaging is part of the formula. Oils and waxes pull plastic additives (2,4-DTBP, benzophenone) out of the container and into the product." });
  } else if (shelf && shelfPicks(shelf, picks).some((p) => !p.plastic && !p.plastic_part)) {
    out.push({ type: "packaging", label: "Plastic packaging", tier: "hard",
      detail: `The guide has plastic-free picks for ${shelf.label.toLowerCase()}.` });
  }
  return { reasons: out, plastic: true, bifl };
}

// ── scorecard: every result rates BOTH what's in it and what it's in ──────────
// Packaging is part of the formula: plastic holding an oily formula is a health problem (leaching),
// not only a waste problem. End-of-life wording follows the guide's Packaging Cell Format Rule, and
// is shown only when a source records it. Missing data says "not verified"; it never guesses.
// status: "pass" (guide-vetted) · "fail" · "warn" (⚠ PLASTIC, not zero waste) · "clear" (no flags, not a pass) · "unknown"
const MATERIALS = [
  ["Aerosol", /aerosol/i],
  ["Plastic", PLASTIC],
  ["Glass", /glass|verre|\bglas\b|vidrio/i],
  ["Metal", /alumin|metal|steel|\btin\b|acier/i],
  ["Paper", /paper|cardboard|carton|papier/i],
];
const SHAPE = /\b(tube|bottle|jar|stick|pump|can|box|pot|pouch|tin|dropper|bouteille|flacon|tube)\b/i;
const EOL = { "en:recycle": "recyclable", "en:reuse": "reusable", "en:return-to-store": "return program",
  "en:compost": "compostable", "en:discard": "trash" };

function ingredientsLine(r, tokens) {
  if (r.verdict === "pick") {
    const cell = r.pick.ingredients || "";
    const n = (cell.match(/^\d+/) || [])[0];
    const made = n ? `${n} ingredients${cell.replace(/^\d+/, "").trim() ? ` · ${cell.replace(/^\d+\s*/, "")}` : ""}` : cell;
    return { title: n || !cell ? "INGREDIENTS" : "MADE OF", status: "pass", word: "Vetted",
      short: n ? `${n} ingredients` : "vetted", detail: made ? `${made}. In Andra's guide.` : "In Andra's guide." };
  }
  const bad = r.reasons.filter((x) => x.type === "ingredient");
  if (bad.length) {
    const names = bad.map((x) => x.match);
    return { title: "INGREDIENTS", status: "fail", word: "Fails", short: `${bad.length} flag${bad.length > 1 ? "s" : ""}`,
      detail: names.slice(0, 2).join(", ") + (names.length > 2 ? ` + ${names.length - 2} more` : "") };
  }
  if (!tokens.length) return { title: "INGREDIENTS", status: "unknown", word: "Not verified", short: "no label", detail: "No label on file." };
  const heads = r.notes.filter((x) => x.type === "ingredient").map((x) => x.label);
  return { title: "INGREDIENTS", status: "clear", word: "No flags", short: "no flags",
    detail: `${tokens.length} checked. Not a pass.${heads.length ? ` Heads-up: ${heads.join(", ")}.` : ""}` };
}

const MATERIAL_WORD = /\b(glass|tin|aluminum|aluminium|metal|steel|paper|cardboard|paperboard|compostable|refill(able)?|wood|bamboo|cotton|beeswax)\b/i;

function packagingLine(r, product, bifl) {
  if (r.verdict === "pick") {
    const k = r.pick, text = String(k.packaging || "").replace(/⟡\s*/g, "");
    const mat = ((text.match(MATERIAL_WORD) || [])[0] || "vetted").toLowerCase();
    if (/bifl/i.test(text) || bifl) return { title: "PACKAGING", status: "pass", word: "BIFL", short: "buy it for life", detail: text || "Buy it for life." };
    if (k.plastic) return { title: "PACKAGING", status: "warn", word: "⚠ PLASTIC", short: "plastic part", detail: `${text}. The formula earned the spot; the packaging didn't.` };
    return { title: "PACKAGING", status: "pass", word: "Vetted", short: mat, detail: text || "Vetted with the product." };
  }
  const parts = product.packagings || [];
  const hay = `${product.packaging || ""} ${parts.map((x) => `${x.material || ""} ${x.shape || ""}`).join(" ")}`.replace(/en:|fr:|-/g, " ");
  const material = (MATERIALS.find(([, re]) => re.test(hay)) || [])[0];
  const shape = (hay.match(SHAPE) || [])[1];
  const eol = [...new Set(parts.map((x) => EOL[x.recycling]).filter(Boolean))].join(" / ");
  const what = [material, shape && shape.toLowerCase().replace("bouteille", "bottle").replace("flacon", "bottle")].filter(Boolean).join(" ");
  const pkgReason = r.reasons.find((x) => x.type === "packaging");
  if (pkgReason) return { title: "PACKAGING", status: "fail", word: "Fails",
    short: /oily/.test(pkgReason.label) ? "leaches" : /Aerosol/.test(pkgReason.label) ? "aerosol" : "plastic", detail: pkgReason.label };
  if (!material) return { title: "PACKAGING", status: "unknown", word: "Not verified", short: "not verified",
    detail: shape ? `On file: ${what}. Material not recorded.` : "Nothing on file." };
  const end = eol ? `End of life: ${eol}.` : "End of life not verified.";
  if (material === "Plastic") return bifl
    ? { title: "PACKAGING", status: "clear", word: "BIFL", short: "buy it for life", detail: "Plastic on a buy-it-for-life tool is a one-time cost." }
    : { title: "PACKAGING", status: "warn", word: "⚠ PLASTIC", short: "plastic", detail: `${what}. A consumable in plastic: not zero waste. ${end}` };
  return { title: "PACKAGING", status: "clear", word: "No flags", short: material.toLowerCase(), detail: `${what}. ${end}` };
}

function efficacyLine(r) {
  return r.verdict === "pick"
    ? { title: "EFFICACY", status: "pass", word: "Tested", short: "tested", detail: "Andra tested it. It does what it claims." }
    : { title: "EFFICACY", status: "unknown", word: "Untested", short: "untested", detail: "Only a human can test this. It isn't in the guide yet." };
}

function ownerLine(r) {
  if (r.verdict === "pick") return { title: "TRANSPARENCY", status: "pass", word: "Vetted", short: "vetted", detail: "Checked when Andra vetted it." };
  const o = r.reasons.find((x) => x.type === "owner");
  if (o) {
    const wall = /Wall of Claim/.test(o.label);
    const who = wall ? "Wall of Claim" : o.label.replace(/^Owned by /, "").replace(/ since \d{4}$/, "");
    return { title: "TRANSPARENCY", status: "fail", word: "Fails", short: who, detail: o.label };
  }
  const passNote = r.notes.find((x) => x.type === "owner");
  if (passNote) return { title: "TRANSPARENCY", status: "clear", word: "Good owner", short: "good owner", detail: passNote.label };
  return { title: "TRANSPARENCY", status: "unknown", word: "Not on file", short: "not on file", detail: "No owner on record." };
}

// ── picks + swaps ────────────────────────────────────────────────────────────
export function shelfPicks(shelf, picks) {
  const inShelf = picks.filter((p) => shelf.cats.includes(p.category));
  const filtered = shelf.filter ? inShelf.filter((p) => shelf.filter.test(p.name)) : inShelf;
  return filtered.length ? filtered : inShelf;
}

export function swapsFor(shelf, picks, n = 3) {
  if (!shelf) return [];
  const score = (p) => (p.star ? 4 : 0) + (!p.plastic && !p.plastic_part ? 2 : 0) - (p.pending_review ? 3 : 0);
  return shelfPicks(shelf, picks)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => score(b.p) - score(a.p) || a.i - b.i)
    .slice(0, n).map((x) => x.p);
}

const STOP = new Set(["the", "and", "for", "with", "organic", "natural", "set", "oz", "ml", "mini", "only", "by", "co"]);
const words = (s) => (String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]+/g) || [])
  .filter((w) => w.length > 2 && !STOP.has(w));

// A guide pick whose every distinctive word appears in this product's brand + name. Suggestion only, never a verdict.
export function lookalikePicks(product, picks) {
  const have = new Set(words(`${(product.brands || []).join(" ")} ${product.name}`));
  return picks.filter((p) => {
    const w = words(p.name);
    return w.length >= 2 && w.every((x) => have.has(x));
  }).slice(0, 2);
}

// Name search across the guide (for products with no barcode in public databases).
export function searchPicks(query, picks, n = 8) {
  const q = words(query);
  if (!q.length) return [];
  return picks
    .map((p) => {
      const w = words(`${p.name} ${p.category} ${p.section}`);
      const s = q.reduce((acc, t) => acc + (w.some((x) => x === t) ? 2 : w.some((x) => x.startsWith(t)) ? 1 : 0), 0);
      return { p, s };
    })
    .filter((x) => x.s >= Math.max(1, q.length))
    .sort((a, b) => b.s - a.s)
    .slice(0, n).map((x) => x.p);
}

// ── barcodes + Open Beauty Facts ─────────────────────────────────────────────
export function normCode(code) {
  let c = String(code || "").replace(/\D/g, "");
  if (c.length === 12) c = "0" + c;      // UPC-A → EAN-13
  return c;
}

export function fromOBF(json) {
  const p = (json && json.product) || {};
  return {
    code: normCode(p.code || json.code),
    name: p.product_name || p.product_name_en || p.generic_name || "",
    brands: String(p.brands || "").split(",").map((s) => s.trim()).filter(Boolean),
    ingredients: p.ingredients_text_en || p.ingredients_text || "",
    packaging: [...(p.packaging_tags || []), p.packaging || ""].join(" "),
    packagings: (p.packagings || []).map((x) => ({ material: x.material, shape: x.shape, recycling: x.recycling })),
    categories: (p.categories_tags || []).join(" "),
    image: p.image_front_small_url || null,
    source: "obf",
  };
}

// ── the verdict ──────────────────────────────────────────────────────────────
// data = { picks, picksById, barcodes, ownerIndex }
export function evaluate(product, data) {
  const code = normCode(product.code);
  const hit = code && data.barcodes[code];
  if (hit && data.picksById[hit.pick]) {
    const pick = data.picksById[hit.pick];
    return withCard({ verdict: "pick", product, pick, variant: hit.variant, reasons: [], notes: pickNotes(pick), swaps: [] });
  }
  if (product.pick) {  // chosen from guide search
    return withCard({ verdict: "pick", product, pick: product.pick, reasons: [], notes: pickNotes(product.pick), swaps: [] });
  }

  const { tokens, hits } = scanIngredients(product.ingredients);
  const shelf = detectShelf(product);
  const reasons = [], notes = [];

  for (const h of hits) {
    const r = { type: "ingredient", label: h.rule.label, tier: h.rule.tier, match: h.match, detail: h.rule.why };
    (h.rule.tier === "note" ? notes : reasons).push(r);
  }
  const owner = findOwner(product, data.ownerIndex);
  if (owner && owner.kind === "owner") {
    reasons.unshift({ type: "owner", label: `Owned by ${owner.owner}${owner.since ? ` since ${owner.since}` : ""}`, tier: "hard",
      detail: "A conglomerate that profits from the products the guide replaces." });
  } else if (owner && owner.kind === "wall") {
    reasons.unshift({ type: "owner", label: `${owner.brand}: on the guide's Wall of Claim`, tier: "hard", detail: owner.reason });
  } else if (owner && owner.kind === "pass") {
    notes.push({ type: "owner", label: `Owned by ${owner.owner}`, detail: owner.note });
  }
  const pk = packagingReasons(product, tokens, shelf, data.picks);
  reasons.push(...pk.reasons);

  const lookalikes = lookalikePicks(product, data.picks);
  if (reasons.length) {
    return withCard({ verdict: "reject", product, shelf, reasons, notes, swaps: swapsFor(shelf, data.picks), lookalikes }, tokens, pk.bifl);
  }
  return withCard({ verdict: "unvetted", product, shelf, reasons: [], notes, swaps: [], lookalikes }, tokens, pk.bifl);
}

function withCard(r, tokens = [], bifl = false) {
  r.card = { ingredients: ingredientsLine(r, tokens), packaging: packagingLine(r, r.product, bifl), owner: ownerLine(r), efficacy: efficacyLine(r) };
  return r;
}

function pickNotes(pick) {
  const n = [];
  if (pick.plastic) n.push({ type: "packaging", label: "⚠ PLASTIC", detail: "The formula earned the spot; the packaging didn't. Decant into glass or metal." });
  if (pick.scent) n.push({ type: "scent", label: "❀ Scented", detail: "Contains essential oils or other scent, all disclosed." });
  return n;
}

export function buildData({ picks, barcodes, owners, wall, images = {} }) {
  const list = (picks.picks || picks).map((p) => ({ ...p, image: images[p.id] || null }));
  return {
    picks: list,
    picksById: Object.fromEntries(list.map((p) => [p.id, p])),
    barcodes,
    ownerIndex: buildOwnerIndex(owners, wall),
  };
}
