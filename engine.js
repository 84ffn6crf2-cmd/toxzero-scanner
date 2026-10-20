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
    why: "Aerosols put VOCs right in your breathing zone. No aerosol is a Tox Zero pick." },
  { id: "hexanediol", tier: "note", label: "1,2-Hexanediol", re: /1,2-hexanediol/,
    why: "A compromise Tox Zero allows in two picks. Long-term data is thin." },
  { id: "tocoacetate", tier: "note", label: "Tocopheryl acetate", re: /tocopheryl acetate/,
    why: "Synthetic vitamin E. A compromise Tox Zero allows in two picks." },
];

// ⓘ explainers. "where" = the PRODUCTS column of the guide's Nasties pages (pp. 122–124 of the live PDF);
// "instead" only where the guide itself names the cleaner route. Never invent either.
export const EXPLAIN = {
  fragrance: { where: "Almost everything scented, including \"unscented\" (masking)", instead: "Brands that list every essential oil by name" },
  flavor: { where: "Toothpaste, lip balm, mouthwash", instead: "Brands that list every flavor oil by name" },
  parabens: { where: "Shampoo, lotion, makeup, deodorant", instead: "The class is easy to replace, so Tox Zero replaces it" },
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

// ── Efficacy = the science of the mechanism ──────────────────────────────────
// The guide's Efficacy page: "Below 1%, label order is arbitrary. A hero active listed below that threshold
// is label decoration." Mechanism lines use the guide's own wording where it has one (deodorant: Andra's
// 5-mechanism notes; toothpaste p102; self-tan p93; urea p60; scalp p44; AHAs p19).
export const MECHANISMS = [
  { id: "uv-mineral", label: "Mineral UV filter", re: /zinc oxide|titanium dioxide|ci 77947|ci 77891/, how: "Minerals that block UVA and UVB." },
  { id: "uv-chemical", label: "Chemical UV filter", re: /avobenzone|homosalate|octocrylene|octisalate|oxybenzone|octinoxate|ensulizole|bemotrizinol|bisoctrizole|ethylhexyl triazone|methoxycinnamate|butyl methoxydibenzoylmethane/, how: "Absorbs UV in the skin." },
  { id: "mg-hydroxide", label: "Magnesium hydroxide", shelf: "deodorant", re: /magnesium hydroxide/, how: "Shifts underarm pH alkaline, slow-release, so odor bacteria can't thrive." },
  { id: "baking-soda", label: "Baking soda", shelf: "deodorant", re: /sodium bicarbonate/, how: "Shifts underarm pH alkaline against odor bacteria (and can irritate)." },
  { id: "aluminum", label: "Aluminum salt", shelf: "deodorant", re: /alumin(i)?um (chlorohydrate|sesquichlorohydrate|zirconium|chloride)/, how: "Plugs the sweat duct. It works; that's the problem." },
  { id: "absorbent", label: "Absorbent powder", shelf: "deodorant", re: /arrowroot|maranta arundinacea|tapioca|zea mays.*starch|corn ?starch|kaolin/, how: "Absorbs moisture." },
  { id: "lauric", label: "Coconut oil (lauric acid)", shelf: "deodorant", re: /cocos nucifera.*oil|coconut oil/, how: "Lauric acid turns into monolaurin: directly antibacterial." },
  { id: "inulin", label: "Inulin (prebiotic)", shelf: "deodorant", re: /\binulin\b/, how: "Prebiotic: steers the underarm microbiome." },
  { id: "zinc-ric", label: "Zinc ricinoleate", shelf: "deodorant", re: /zinc ricinoleate/, how: "Traps odor molecules." },
  { id: "ha-tooth", label: "Hydroxyapatite", re: /hydroxyapatite/, how: "Remineralizes enamel." },
  { id: "fluoride", label: "Fluoride", re: /fluoride|monofluorophosphate/, how: "Strengthens enamel." },
  { id: "peroxide", label: "Hydrogen peroxide", shelf: "toothpaste", re: /hydrogen peroxide|carbamide peroxide/, how: "Oxidizes surface stain." },
  { id: "dha", label: "DHA", re: /dihydroxyacetone/, how: "A sugar that browns dead skin cells." },
  { id: "erythrulose", label: "Erythrulose", re: /erythrulose/, how: "A slower sugar tan that evens out DHA." },
  { id: "niacinamide", label: "Niacinamide", re: /niacinamide/, how: "Vitamin B3: supports the barrier and evens tone." },
  { id: "vitc", label: "Vitamin C", re: /ascorbic acid|ascorbyl|ascorbate|3-o-ethyl ascorbic/, how: "Antioxidant: brightens and supports collagen." },
  { id: "retinoid", label: "Retinoid", re: /retinol|retinal\b|retinaldehyde|retinyl|hydroxypinacolone retinoate|tretinoin|adapalene/, how: "Vitamin A: speeds cell turnover." },
  { id: "bakuchiol", label: "Bakuchiol", re: /bakuchiol/, how: "Plant active studied as a gentler retinol alternative." },
  { id: "ha", label: "Hyaluronic acid", re: /hyaluron/, how: "Humectant: pulls water into the skin." },
  { id: "bha", label: "BHA (salicylic)", re: /salicylic acid|betaine salicylate|salix (alba|nigra)|willow bark/, how: "Oil-soluble: exfoliates inside the pore." },
  { id: "aha", label: "AHA / PHA", re: /glycolic acid|lactic acid|mandelic acid|gluconolactone|lactobionic acid/, how: "Loosens the bonds holding dead cells together." },
  { id: "sulfur", label: "Sulfur", re: /\bsulfur\b|\bsulphur\b/, how: "Dries blemishes and fights acne bacteria." },
  { id: "bpo", label: "Benzoyl peroxide", re: /benzoyl peroxide/, how: "Kills acne bacteria." },
  { id: "oat", label: "Colloidal oatmeal", re: /colloidal oat|avena sativa.*(kernel|meal|flour)/, how: "Soothes itch and protects the barrier." },
  { id: "urea", label: "Urea", re: /\burea\b/, how: "Keratolytic: softens callus from the inside." },
  { id: "copper", label: "Copper peptide", re: /copper tripeptide|ghk-cu|copper peptide/, how: "Signals repair and collagen." },
  { id: "caffeine", label: "Caffeine", re: /\bcaffeine\b/, how: "Tightens blood vessels: less puffiness and shadow." },
  { id: "centella", label: "Centella", re: /centella asiatica|madecassoside|asiaticoside/, how: "Soothes and supports barrier repair." },
  { id: "azelaic", label: "Azelaic acid", re: /azelaic acid/, how: "Calms redness and evens tone." },
  { id: "antifungal", label: "Antifungal", re: /ketoconazole|zinc pyrithione|piroctone olamine|selenium sulfide|melaleuca alternifolia/, how: "Targets the Malassezia yeast behind flaky, itchy scalp." },
  { id: "ceramide", label: "Ceramides", re: /ceramide/, how: "Barrier lipids that hold moisture in." },
];
// What the product's NAME promises → which mechanisms can back it. Missing = the formula can't keep the promise.
const NAME_CLAIMS = [
  { re: /niacinamide|vitamin b3|\bb3\b/, ids: ["niacinamide"], label: "niacinamide" },
  { re: /vitamin c|\bvit\.? c\b|ascorbic/, ids: ["vitc"], label: "vitamin C" },
  { re: /retinol|retinal|retinoid/, ids: ["retinoid"], label: "a retinoid" },
  { re: /bakuchiol/, ids: ["bakuchiol"], label: "bakuchiol" },
  { re: /hyaluronic/, ids: ["ha"], label: "hyaluronic acid" },
  { re: /salicylic|\bbha\b/, ids: ["bha"], label: "BHA" },
  { re: /glycolic|\baha\b|mandelic|lactic acid/, ids: ["aha"], label: "an AHA" },
  { re: /\bsulfur\b|\bsulphur\b/, ids: ["sulfur"], label: "sulfur" },
  { re: /colloidal oat|oatmeal/, ids: ["oat"], label: "colloidal oatmeal" },
  { re: /\burea\b/, ids: ["urea"], label: "urea" },
  { re: /copper peptide|ghk/, ids: ["copper"], label: "copper peptides" },
  { re: /caffeine/, ids: ["caffeine"], label: "caffeine" },
  { re: /centella|\bcica\b/, ids: ["centella"], label: "centella" },
  { re: /azelaic/, ids: ["azelaic"], label: "azelaic acid" },
  { re: /anti-?dandruff/, ids: ["antifungal"], label: "an antifungal" },
  { re: /ceramide/, ids: ["ceramide"], label: "ceramides" },
  { re: /\bspf\b|sunscreen|sun ?cream|sunblock|sun protection/, ids: ["uv-mineral", "uv-chemical"], label: "a UV filter" },
  { re: /self.?tan|sunless|tanning (mousse|lotion|drops|water)/, ids: ["dha", "erythrulose"], label: "a tanning active" },
  { re: /hydroxyapatite|nano.?ha\b/, ids: ["ha-tooth"], label: "hydroxyapatite" },
  { re: /fluoride/, ids: ["fluoride"], label: "fluoride" },
];
// anything listed after one of these is under 1% (phenoxyethanol is capped at 1%; fragrance sits near the end)
const ONE_PERCENT = /phenoxyethanol|\bparfum\b|\bfragrance\b|\baroma\b/;

export function findActives(tokens, shelf) {
  const out = [];
  tokens.forEach((token, index) => {
    const t = token.toLowerCase();
    const m = MECHANISMS.find((x) => x.re.test(t) && (!x.shelf || x.shelf === shelf?.id));
    if (m && !out.some((o) => o.mech.id === m.id)) out.push({ mech: m, token, index });
  });
  return out;
}

export function efficacyCheck(product, tokens, shelf) {
  if (!tokens.length) return { status: "unknown", short: "no label", detail: "No label on file, so the mechanism can't be read.", actives: [] };
  const actives = findActives(tokens, shelf);
  const name = String(product.name || "").toLowerCase();
  const claims = NAME_CLAIMS.filter((c) => c.re.test(name));
  const missing = claims.filter((c) => !actives.some((a) => c.ids.includes(a.mech.id)));
  if (missing.length) {
    const what = missing.map((c) => c.label).join(" and ");
    return { status: "fail", short: "claim not in formula", actives,
      detail: `The name promises ${what}. The ingredient list doesn't have it.`,
      reason: { type: "efficacy", label: `Claims ${what}; the formula doesn't have it`, tier: "hard",
        detail: "Efficacy: the name promises an active the ingredient list can't back." } };
  }
  const marker = tokens.findIndex((t) => ONE_PERCENT.test(t.toLowerCase()));
  const hero = actives.filter((a) => claims.some((c) => c.ids.includes(a.mech.id)));
  const low = marker >= 0 ? hero.filter((a) => a.index > marker) : [];
  if (low.length) {
    return { status: "warn", short: "under 1%", actives,
      detail: `${low.map((a) => a.token).join(", ")} is listed after ${tokens[marker]}, so it's under 1%. Below 1%, a hero active is label decoration.` };
  }
  if (actives.length) {
    return { status: "clear", short: actives.slice(0, 2).map((a) => a.mech.label.toLowerCase()).join(" + "), actives,
      detail: actives.map((a) => `${a.token}: ${a.mech.how}`).join(" ") + " Labels don't print the dose; Tox Zero checks it." };
  }
  return { status: "unknown", short: "no active claim", actives, detail: "No hero active on this label for the scanner to check." };
}

// The four pillars of the Tox Zero Standard (the guide's own page), in display order.
export const PILLARS = [
  { key: "ingredients", label: "Ingredients", icon: "drop",
    about: "Checked against the Tox Zero Nasties. Hard lines: no Tox Zero pick contains them. Dotted lines: picks skip them. Every flag names the exact ingredient on the label." },
  { key: "packaging", label: "Packaging", icon: "bottle",
    about: "Packaging is part of the formula. Oils pull plastic additives out of the container and into the product. A consumable in plastic is never zero waste. End of life shows only when it's on record." },
  { key: "owner", label: "Transparency", icon: "search",
    about: "Who gets the money. Brands owned by conglomerates that profit from the products Tox Zero replaces fail, and so do the brands on the Tox Zero Wall of Claim. Good owners pass." },
  { key: "efficacy", label: "Efficacy", icon: "flask",
    about: "Clean isn't the finish line; function is. Efficacy is the science of the mechanism: does what's in it do what the label claims, at a dose that works? Below 1%, label order is arbitrary, and a hero active listed there is label decoration. The scanner names each active and how it works, and catches a claim the formula can't back. Tox Zero checks the dose." },
];

// Label name → the key the EU CosIng lookup uses ("Olea Europaea (Olive) Fruit Oil" → "OLEA EUROPAEA FRUIT OIL").
// Must match vet-queue/src/index.js cleanInci.
export const cleanInci = (t) => String(t || "").replace(/\([^)]*\)/g, " ").replace(/[*†‡°]/g, "").replace(/\b\d+(\.\d+)?\s*%/g, " ")
  .replace(/[.;:]+$/, "").replace(/\s+/g, " ").trim().toUpperCase();

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

// One read of the packaging from BOTH Open Beauty Facts fields: the free-text tags and the structured parts
// list (Tom's: paperboard box + plastic tube + plastic cap lives only in the parts list).
const CONTAINER = /\b(tube|bottle|jar|pot|tub|stick|pouch|sachet|can|dispenser|roll ?on|bouteille|flacon|container)\b/i;
const MINOR = /\b(lid|cap|closure|pump|dropper|wrapper|film|seal|spoon|spatula|applicator|label)\b/i;
const tidy = (x) => String(x || "").replace(/en:|fr:/g, "").replace(/-/g, " ").trim();
const shapeWord = (x) => ((String(x || "").match(SHAPE) || [])[1] || "").toLowerCase().replace("bouteille", "bottle").replace("flacon", "bottle");
export function analyzePackaging(product) {
  const parts = (product.packagings || []).map((x) => ({ material: tidy(x.material), shape: tidy(x.shape), recycling: x.recycling }));
  const tags = tidy(product.packaging);
  const hay = `${tags} ${parts.map((x) => `${x.material} ${x.shape}`).join(" ")}`;
  const plasticParts = parts.filter((x) => PLASTIC.test(x.material));
  // the plastic that HOLDS the product (tube, bottle, jar…), as opposed to only a cap or pump
  let container = plasticParts.find((x) => CONTAINER.test(x.shape) || !MINOR.test(x.shape)) || null;
  if (!container && !plasticParts.length && PLASTIC.test(tags) && !(MINOR.test(tags) && !CONTAINER.test(tags))) container = { material: "plastic", shape: tags };
  const plastic = plasticParts.length > 0 || PLASTIC.test(tags);
  const material = (MATERIALS.find(([, re]) => re.test(hay)) || [])[0];
  return {
    parts, hay, plastic, container, material,
    aerosol: /aerosol/i.test(hay),
    containerLabel: container ? `Plastic ${shapeWord(container.shape) || "container"}` : "",
    minor: plastic && !container ? (plasticParts[0]?.shape || (tags.match(MINOR) || ["part"])[0]).replace(/lid or cap/, "cap") : "",
    shape: shapeWord(hay),
    eol: [...new Set(parts.map((x) => EOL[x.recycling]).filter(Boolean))].join(" / "),
  };
}

export function packagingReasons(product, tokens, shelf, picks) {
  const a = analyzePackaging(product);
  const bifl = (shelf && shelf.bifl) || BIFL_NAME.test(product.name || "");
  const out = [];
  if (a.aerosol) out.push({ type: "packaging", label: "Aerosol format", tier: "dotted",
    detail: "Aerosols put VOCs right in your breathing zone. No aerosol is a Tox Zero pick." });
  if (bifl || !a.container) return { reasons: out, plastic: a.plastic, bifl, pack: a };
  const fatty = tokens.slice(0, 3).some((t) => FATTY.test(t)) || FATTY_FORMAT.test(product.name || "");
  if (fatty) {
    out.push({ type: "packaging", label: "Plastic holding an oily formula", tier: "hard",
      detail: "Packaging is part of the formula. Oils and waxes pull plastic additives (2,4-DTBP, benzophenone) out of the container and into the product." });
  } else if (shelf && shelfPicks(shelf, picks).some((p) => !p.plastic && !p.plastic_part)) {
    out.push({ type: "packaging", label: `${a.containerLabel} touching the product`, tier: "hard",
      detail: `Packaging is part of the formula. Tox Zero has plastic-free picks for ${shelf.label.toLowerCase()}.` });
  }
  return { reasons: out, plastic: true, bifl, pack: a };
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
      short: n ? `${n} ingredients` : "vetted", detail: made ? `${made}. Meets the Tox Zero standard.` : "Meets the Tox Zero standard." };
  }
  const bad = r.reasons.filter((x) => x.type === "ingredient");
  if (bad.length) {
    const names = bad.map((x) => x.match);
    return { title: "INGREDIENTS", status: "fail", word: "Flagged", short: `${bad.length} flagged`,
      detail: names.slice(0, 2).join(", ") + (names.length > 2 ? ` + ${names.length - 2} more` : "") };
  }
  if (!tokens.length) return { title: "INGREDIENTS", status: "unknown", word: "Not verified", short: "no label", detail: "No label on file." };
  const heads = r.notes.filter((x) => x.type === "ingredient").map((x) => x.label);
  return { title: "INGREDIENTS", status: "clear", word: "Cleared", short: "all cleared",
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
  const a = analyzePackaging(product);
  const what = [a.material, a.shape].filter(Boolean).join(" ");
  const pkgReason = r.reasons.find((x) => x.type === "packaging");
  if (pkgReason) return { title: "PACKAGING", status: "fail", word: "Fails",
    short: /oily/.test(pkgReason.label) ? "leaches" : /Aerosol/.test(pkgReason.label) ? "aerosol" : a.containerLabel.toLowerCase() || "plastic",
    detail: `${pkgReason.label}. ${pkgReason.detail}` };
  if (!a.material) return { title: "PACKAGING", status: "unknown", word: "Not verified", short: "not verified",
    detail: a.shape ? `On file: ${a.shape}. Material not recorded.` : "Nothing on file." };
  const end = a.eol ? `End of life: ${a.eol}.` : "End of life not verified.";
  if (a.plastic) {
    if (bifl) return { title: "PACKAGING", status: "clear", word: "BIFL", short: "buy it for life", detail: "Plastic on a buy-it-for-life tool is a one-time cost." };
    return a.container
      ? { title: "PACKAGING", status: "warn", word: "⚠ PLASTIC", short: a.containerLabel.toLowerCase(), detail: `${a.containerLabel}. A consumable in plastic: not zero waste. ${end}` }
      : { title: "PACKAGING", status: "warn", word: "⚠ PLASTIC", short: `plastic ${a.minor}`, detail: `Plastic ${a.minor} only; the plastic doesn't hold the formula. Still not zero waste. ${end}` };
  }
  return { title: "PACKAGING", status: "clear", word: "No flags", short: a.material.toLowerCase(), detail: `${what}. ${end}` };
}

function efficacyLine(r) {
  if (r.verdict === "pick") {
    const hi = String(r.pick.ingredients || "").replace(/^\d+\s*/, "").trim();
    return { title: "EFFICACY", status: "pass", word: "Mechanism checked", short: "mechanism checked",
      detail: `Vetted for mechanism and dose${hi ? `: ${hi}` : ""}.` };
  }
  const e = r.efficacy || { status: "unknown", short: "no label", detail: "No label on file." };
  const word = { fail: "Fails", warn: "Under 1%", clear: "Actives found", unknown: "Not checked" }[e.status];
  return { title: "EFFICACY", status: e.status, word, short: e.short, detail: e.detail };
}

function ownerLine(r) {
  if (r.verdict === "pick") return { title: "TRANSPARENCY", status: "pass", word: "Vetted", short: "vetted", detail: "Checked when it was vetted to the Tox Zero standard." };
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

const unescapeHTML = (t) => String(t || "").replace(/&gt;?/g, ">").replace(/&lt;?/g, "<").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

export function fromOBF(json) {
  const p = (json && json.product) || {};
  return {
    code: normCode(p.code || json.code),
    name: p.product_name || p.product_name_en || p.generic_name || "",
    brands: String(p.brands || "").split(",").map((s) => s.trim()).filter(Boolean),
    ingredients: unescapeHTML(p.ingredients_text_en || p.ingredients_text),
    packaging: [...(p.packaging_tags || []), p.packaging || ""].join(" "),
    packagings: (p.packagings || []).map((x) => ({ material: x.material, shape: x.shape, recycling: x.recycling })),
    categories: (p.categories_tags || []).join(" "),
    image: p.image_front_small_url || null,
    productType: p.product_type || "",
    source: "obf",
  };
}

// ── food: not what Tox Zero scans (the guide champions label-free local food) ──
// Open Food Facts records come back too (product_type "food"). Some beauty products are misfiled there,
// so it only counts as food when nothing about it reads as beauty: no beauty shelf, no INCI-style label.
const INCI_SIGNAL = /\b(aqua|cera alba|parfum|butyrospermum|olea europaea|ricinus communis|simmondsia|cetearyl|glyceryl stearate|caprylic\/capric|sodium lauryl|tocopheryl|phenoxyethanol|ci \d{5})\b|[a-z]+ [a-z]+ \([a-z ]+\) (seed|fruit|leaf|flower|kernel|root|peel|bark)/i;
export function isFoodOnly(product) {
  if (!product || product.productType !== "food" || product.vetted) return false;
  return !detectShelf(product) && !INCI_SIGNAL.test(product.ingredients || "");
}

// ── the verdict ──────────────────────────────────────────────────────────────
// data = { picks, picksById, barcodes, ownerIndex }
export function evaluate(product, data) {
  const code = normCode(product.code);
  const v = code && data.vetted && data.vetted[code];
  if (v) {
    product = { ...product, code, name: v.name || product.name, brands: v.brand ? [v.brand] : product.brands || [],
      ingredients: v.ingredients || product.ingredients || "", packaging: [v.packaging, product.packaging].filter(Boolean).join(" "),
      image: product.image || v.image || null, source: product.source || "toxzero", vetted: v };
  }
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
      detail: "A conglomerate that profits from the products Tox Zero replaces." });
  } else if (owner && owner.kind === "wall") {
    reasons.unshift({ type: "owner", label: `${owner.brand}: on the Tox Zero Wall of Claim`, tier: "hard", detail: owner.reason });
  } else if (owner && owner.kind === "pass") {
    notes.push({ type: "owner", label: `Owned by ${owner.owner}`, detail: owner.note });
  }
  const pk = packagingReasons(product, tokens, shelf, data.picks);
  reasons.push(...pk.reasons);
  const efficacy = efficacyCheck(product, tokens, shelf);
  if (efficacy.reason) reasons.push(efficacy.reason);
  if (v && v.verdict === "reject") reasons.unshift({ type: "vetted", label: "Rejected by Tox Zero", tier: "hard", detail: v.note || "Vetted by the Tox Zero team." });

  const lookalikes = lookalikePicks(product, data.picks);
  if (reasons.length) {
    return withCard({ verdict: "reject", product, shelf, reasons, notes, efficacy, swaps: swapsFor(shelf, data.picks), lookalikes }, tokens, pk.bifl);
  }
  return withCard({ verdict: "unvetted", product, shelf, reasons: [], notes, efficacy, swaps: [], lookalikes }, tokens, pk.bifl);
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

export function buildData({ picks, barcodes, owners, wall, images = {}, vetted = {} }) {
  const list = (picks.picks || picks).map((p) => ({ ...p, image: images[p.id] || null }));
  return {
    picks: list,
    picksById: Object.fromEntries(list.map((p) => [p.id, p])),
    barcodes,
    vetted: Object.fromEntries(Object.entries(vetted).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [normCode(k), v])),
    ownerIndex: buildOwnerIndex(owners, wall),
  };
}
