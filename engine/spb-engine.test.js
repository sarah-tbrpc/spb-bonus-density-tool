"use strict";
/* =============================================================================
 * Characterization tests for the SPB bonus-density engine.
 *
 * Run: node --test engine/spb-engine.test.js   (Node 18+, zero dependencies)
 *
 * GOAL: lock in the CURRENT numeric behavior of the extracted math so nothing
 * changes silently. Expected values are hand-computed from the documented
 * formulas (not snapshotted from the code), with the published worked
 * reconciliation (Corey Landing → value-to-developer $5,681,500) as the anchor.
 * ========================================================================== */
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./spb-engine.js");

/** assert two numbers are within eps (for ratios/fractions with FP noise). */
function near(actual, expected, eps, msg) {
  eps = eps == null ? 1e-9 : eps;
  assert.ok(Math.abs(actual - expected) <= eps,
    (msg || "near") + ": expected " + expected + " ± " + eps + ", got " + actual);
}
/** assert a dollar amount rounds to an exact integer (absorbs sub-cent FP noise). */
function dollar(actual, expected, msg) {
  assert.strictEqual(Math.round(actual), expected, msg || ("dollar: expected " + expected + ", got " + actual));
}

// Identity multiplier maps for the simplest cases.
const ID_B = { "Low-rise (1-3)": 1.0, "Mid-rise (4-7)": 1.15, "High-rise (8+)": 1.35 };
const ID_P = { surface: 1.0, podium: 1.12, structured: 1.18 };
const ID_F = { AE: 1.0, VE: 1.08, X: 0.97 };
const CATMULT = { "Workforce Housing": 1.4, "Community Development": 1.5, "Transportation": 1.7, "Environmental": 2.0, "Resilience": 2.5, "Monetary / Cash": 1.0 };
const ENFORCE = { covenant: 1.0, devagreement: 0.95, bond: 0.95, condition: 0.9, loi: 0.5, none: 0.4 };

// ---------------------------------------------------------------------------
test("residualUnit — condo, clean round numbers", () => {
  // hard = 200000; cost = 200000×1.25×1.20 + 1,000,000×0.10 = 300000 + 100000 = 400000
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  const r = E.residualUnit(1_000_000, "Condominium", 0.20, "Low-rise (1-3)", "surface", "AE", null, null, K, ID_B, ID_P, ID_F);
  dollar(r, 600_000);
});

test("residualUnit — lodging has no condo sales fee", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  // hard = 400000; cost = 400000×1.25×1.20 = 600000; residual = 400000
  const r = E.residualUnit(1_000_000, "Temporary Lodging", 0.20, "Low-rise (1-3)", "surface", "AE", null, null, K, ID_B, ID_P, ID_F);
  dollar(r, 400_000);
});

test("residualUnit — multipliers compound (mid-rise × podium × VE)", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  // hard = 200000 × 1.15 × 1.12 × 1.08 = 278208
  // cost = 278208 × 1.25 × 1.20 + 100000 = 417312 + 100000 = 517312; residual = 482688
  const r = E.residualUnit(1_000_000, "Condominium", 0.20, "Mid-rise (4-7)", "podium", "VE", null, null, K, ID_B, ID_P, ID_F);
  dollar(r, 482_688);
});

test("residualUnit — hardFinal override skips the multipliers", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  // hard = 500000 (direct); cost = 500000×1.5 + 100000 = 850000; residual = 150000
  const r = E.residualUnit(1_000_000, "Condominium", 0.20, "High-rise (8+)", "structured", "VE", null, 500_000, K, ID_B, ID_P, ID_F);
  dollar(r, 150_000);
});

test("residualUnit — baseOverride runs through the multipliers", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  // base 300000 × mid(1.15) = 345000; cost = 345000×1.5 + 100000 = 617500; residual = 382500
  const r = E.residualUnit(1_000_000, "Condominium", 0.20, "Mid-rise (4-7)", "surface", "AE", 300_000, undefined, K, ID_B, ID_P, ID_F);
  dollar(r, 382_500);
});

test("residualUnit — floored at 0 when cost exceeds market", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  const r = E.residualUnit(300_000, "Condominium", 0.20, "Low-rise (1-3)", "surface", "AE", null, 1_000_000, K, ID_B, ID_P, ID_F);
  assert.strictEqual(r, 0);
});

test("residualUnit — returns 0 when no use type selected", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  assert.strictEqual(E.residualUnit(1_000_000, "", 0.20, "Low-rise (1-3)", "surface", "AE", null, null, K, ID_B, ID_P, ID_F), 0);
});

// ---------------------------------------------------------------------------
test("scarcity — slack pool → 0", () => {
  // (300/10)/20 = 1.5 → clamp 1 → scar 0
  near(E.scarcity(300, 10, 20), 0);
});
test("scarcity — half-depleted → 0.5", () => {
  // (100/10)/20 = 0.5 → scar 0.5
  near(E.scarcity(100, 10, 20), 0.5);
});
test("scarcity — empty pool → 1", () => {
  near(E.scarcity(0, 10, 20), 1);
});
test("scarcity — over-draw clamps to 1 (no negative)", () => {
  near(E.scarcity(-10, 10, 20), 1);
});

// ---------------------------------------------------------------------------
test("pvFactor — n<=0 → 0", () => {
  assert.strictEqual(E.pvFactor(0.02, 0.05, 0), 0);
  assert.strictEqual(E.pvFactor(0.02, 0.05, -3), 0);
});
test("pvFactor — escalation equals discount uses the n/(1+r) branch", () => {
  near(E.pvFactor(0.02, 0.02, 10), 10 / 1.02, 1e-12);
});
test("pvFactor — zero escalation is a plain annuity factor", () => {
  // g=0,r=0.10,n=2 → 1/1.1 + 1/1.21 = 1.735537190...
  near(E.pvFactor(0, 0.10, 2), 1 / 1.1 + 1 / 1.21, 1e-12);
  // g=0,r=0.05,n=1 → 1/1.05
  near(E.pvFactor(0, 0.05, 1), 1 / 1.05, 1e-12);
});

// ---------------------------------------------------------------------------
test("enforceFactor — known instrument and fallback to none", () => {
  assert.strictEqual(E.enforceFactor("covenant", ENFORCE), 1.0);
  assert.strictEqual(E.enforceFactor("condition", ENFORCE), 0.9);
  assert.strictEqual(E.enforceFactor("does-not-exist", ENFORCE), 0.4);
});
test("recurringGuardOK — strict (esc must be below disc)", () => {
  assert.strictEqual(E.recurringGuardOK({ esc: 0.02, disc: 0.03 }), true);
  assert.strictEqual(E.recurringGuardOK({ esc: 0.03, disc: 0.03 }), false);
  assert.strictEqual(E.recurringGuardOK({ esc: 0.04, disc: 0.03 }), false);
});

// ---------------------------------------------------------------------------
test("benefitRow — SIMPLE mode: full credit, weighted by category", () => {
  const K_consts = { CATMULT, PVD: { esc: 0.02, disc: 0.03, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true };
  const row = E.benefitRow(
    { name: "Seawall / bulkhead", qty: 100, pct: 1, dev: 2000, city: 2000 },
    { cat: "Resilience", unit: "$/LF", dev: 0, city: 0 }, false, K_consts);
  dollar(row.devCost, 200_000);
  dollar(row.cityPlain, 200_000);     // hc = 1 in SIMPLE mode
  dollar(row.cityVal, 500_000);       // × Resilience 2.5
  near(row.gain, 2.5);
  assert.strictEqual(row.hc, 1);
  assert.strictEqual(row.unsecured, false);
});

test("benefitRow — falls back to library dev/city when not overridden", () => {
  const K_consts = { CATMULT, PVD: { esc: 0.02, disc: 0.03, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true };
  const row = E.benefitRow(
    { name: "X", qty: 2, pct: 1 },
    { cat: "Monetary / Cash", unit: "$/lump", dev: 300, city: 400 }, false, K_consts);
  assert.strictEqual(row.dev, 300);
  assert.strictEqual(row.city, 400);
  dollar(row.devCost, 600);
  dollar(row.cityPlain, 800);
});

test("benefitRow — non-SIMPLE: enforceability haircut + recurring PV apply", () => {
  const PVD = { esc: 0.02, disc: 0.05, term: 30 };
  const K_consts = { CATMULT, PVD, ENFORCE, SIMPLE_BENEFITS: false };
  const row = E.benefitRow(
    { name: "Maint", qty: 1, pct: 1, dev: 100, city: 1000, recurring: true, term: 0, instr: "condition" },
    { cat: "Resilience", unit: "$/yr", dev: 0, city: 0 }, false, K_consts);
  const pvf = E.pvFactor(0.02, 0.05, 30);
  assert.strictEqual(row.hc, 0.9);                 // condition-of-approval
  assert.strictEqual(row.term, 30);                // 0 → PVD.term
  near(row.pvf, pvf, 1e-12);
  near(row.devCost, 1 * 100 * 1 * pvf, 1e-6);      // dev cost never haircut
  near(row.cityPlain, 1 * 1000 * 1 * pvf * 0.9, 1e-6);
});

test("benefitRow — esc >= disc clamps the recurring PV to the bounded esc=disc branch, still flags escViol", () => {
  // escalation ABOVE the discount rate: the growing-annuity closed form would diverge (PV grows
  // exponentially in the term). Policy clamps esc → disc so pvFactor uses its bounded n/(1+disc) branch.
  const PVD = { esc: 0.05, disc: 0.03, term: 30 };
  const K_consts = { CATMULT, PVD, ENFORCE, SIMPLE_BENEFITS: false };
  const row = E.benefitRow(
    { name: "Maint", qty: 1, pct: 1, dev: 100, city: 1000, recurring: true, term: 0, instr: "covenant" },
    { cat: "Resilience", unit: "$/yr", dev: 0, city: 0 }, false, K_consts);
  const clamped = 30 / 1.03;                         // n/(1+disc): pvFactor's bounded linear branch
  const diverged = E.pvFactor(0.05, 0.03, 30);       // what the UNclamped growing-annuity form returns
  assert.ok(diverged > clamped, "sanity: the unclamped growing-annuity PV is larger / blows up");
  near(row.pvf, clamped, 1e-12, "pvf is clamped to the esc=disc value");
  near(row.devCost, 100 * clamped, 1e-9, "developer cost uses the bounded factor");
  near(row.cityPlain, 1000 * clamped * 1.0, 1e-9, "city value uses the bounded factor (covenant hc=1)");
  assert.strictEqual(row.escViol, true, "escViol still warns that esc is not below disc");
});

test("benefitRow — esc < disc is unaffected (normal growing-annuity PV, no escViol)", () => {
  // guard against over-clamping: when escalation is safely below discount, behavior is unchanged
  const PVD = { esc: 0.02, disc: 0.05, term: 30 };
  const K_consts = { CATMULT, PVD, ENFORCE, SIMPLE_BENEFITS: false };
  const row = E.benefitRow(
    { name: "Maint", qty: 1, pct: 1, dev: 100, city: 1000, recurring: true, term: 0, instr: "covenant" },
    { cat: "Resilience", unit: "$/yr", dev: 0, city: 0 }, false, K_consts);
  near(row.pvf, E.pvFactor(0.02, 0.05, 30), 1e-12, "unchanged when esc < disc");
  assert.strictEqual(row.escViol, false);
});

// ---------------------------------------------------------------------------
// The published worked reconciliation, with the value-to-developer bracket.
// Corey Landing: Condominium, low-rise, surface, AE, Pool Allocation,
//   market $662,500/u, bonus 25, impact $28,000/u, remaining 152.
// Original-era hard cost (hardCondo 237,500; soft 0.24; margin 0.15; sales 0.06).
// Documented outputs: value-to-developer $5,681,500; pool cost $0; impact floor
//   $700,000; baseline $700,000.
test("computeModel — worked reconciliation (Corey Landing) + value bracket", () => {
  const K = { hardCondo: 237500, hardHotel: 170000, soft: 0.24, margin: 0.15, decline: 0.80, sales: 0.06, scarExp: 1.6 };
  const m = E.computeModel({
    use: "Condominium", btype: "Low-rise (1-3)", parking: "surface", coastal: "AE",
    market: 662500, margin: 0.15, decline: 0.80, bonus: 25, byright: 108,
    hardOv: null, pathway: "Pool Allocation", acres: 0, base: 0, cap: 0,
    rem: 152, dem: 8, hor: 15, impact: 28000,
    hcLow: 175000, hcHigh: 300000, hcOverride: null,   // original-era ±placeholder bracket
    benefits: [],
    K, CATMULT, BMULT: ID_B, PMULT: ID_P, FMULT: ID_F,
    CAPTURE: { capLo: 0.25 }, PVD: { disc: 0.03, esc: 0.02, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true
  });
  dollar(m.V, 5_681_500, "value to developer (mid)");      // the published anchor
  dollar(m.Vlow, 3_899_000, "conservative ceiling (high cost)");
  dollar(m.Vhigh, 7_464_000, "target ceiling (low cost)");
  dollar(m.I, 700_000, "impact floor");
  near(m.scar, 0, 1e-12, "pool has slack");
  dollar(m.D, 0, "pool opportunity cost");
  dollar(m.cityMin, 700_000, "lawful mitigation baseline");
  assert.strictEqual(m.poolPath, true);
});

// ---------------------------------------------------------------------------
// Full-object golden: realistic inputs, slack pool, a 2-item package. Every
// returned field is asserted so an accidental change anywhere fails here.
test("computeModel — golden: slack pool, favorable-but-below-fair-share", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, margin: 0.20, decline: 0.80, sales: 0.10, scarExp: 1.6 };
  const benefits = [
    { b: { name: "Seawall / bulkhead", qty: 100, pct: 1, dev: 2000, city: 2000 }, lib: { cat: "Resilience", unit: "$/LF", dev: 0, city: 0 }, codeMin: false },
    { b: { name: "Cash (general fund)", qty: 300000, pct: 1, dev: 1, city: 1 }, lib: { cat: "Monetary / Cash", unit: "$/lump", dev: 0, city: 0 }, codeMin: false }
  ];
  const m = E.computeModel({
    use: "Condominium", btype: "Low-rise (1-3)", parking: "surface", coastal: "AE",
    market: 1_000_000, margin: 0.20, decline: 0.80, bonus: 10, byright: 100,
    hardOv: null, pathway: "Pool Allocation", acres: 2, base: 15, cap: 24,
    rem: 200, dem: 10, hor: 15, impact: 3000,
    hcLow: null, hcHigh: null, hcOverride: null,   // no bracket → V = Vlow = Vhigh
    benefits,
    K, CATMULT, BMULT: ID_B, PMULT: ID_P, FMULT: ID_F,
    CAPTURE: { capLo: 0.25 }, PVD: { disc: 0.03, esc: 0.02, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true
  });
  // value to developer
  dollar(m.r, 600_000);
  dollar(m.V, 4_800_000);
  dollar(m.Vlow, 4_800_000);
  dollar(m.Vhigh, 4_800_000);
  // sanity-check implied margin: tc = 200000×1.25 + 100000 = 350000; (1,000,000−350000)/350000
  near(m.impMargin, 650_000 / 350_000, 1e-9);
  // pool: remAfter 190 → (190/10)/15 = 1.2667 → clamp 1 → scar 0 → D 0
  near(m.scar, 0, 1e-12);
  dollar(m.D, 0);
  dollar(m.I, 30_000);
  dollar(m.cityMin, 30_000);
  // package
  dollar(m.A, 500_000);
  dollar(m.Bplain, 500_000);
  dollar(m.B, 800_000);        // 200000×2.5 + 300000×1.0
  near(m.gPlain, 1.0);
  near(m.g, 1.6);
  dollar(m.zFloor, 30_000);    // cityMin / gPlain
  dollar(m.zCeil, 4_800_000);
  dollar(m.room, 4_300_000);
  // verdict
  assert.strictEqual(m.worth, true);
  assert.strictEqual(m.feas, true);
  assert.strictEqual(m.poolPath, true);
  // density bookkeeping
  assert.strictEqual(m.total, 110);
  assert.strictEqual(m.maxUnits, 48);
  assert.strictEqual(m.byrightDerived, 30);
  assert.strictEqual(m.overCap, true);
  assert.strictEqual(m.headroom, -62);
  // flags (SIMPLE mode → all clear)
  assert.deepStrictEqual(m.flags, { nUnsecured: 0, nAboveCode: 0, nEsc: 0, unsecuredValue: 0, unsecuredShare: 0, any: false });
  // capture gate: A/Vlow = 500000/4,800,000 ≈ 0.1042 < capLo 0.25 → below fair share
  near(m.captureRate, 500_000 / 4_800_000, 1e-9);
  assert.strictEqual(m.belowCapture, true);
  assert.strictEqual(m.rows.length, 2);
});

// ---------------------------------------------------------------------------
// Deep scarcity: a nearly-depleted pool drives the floor above the offer.
test("computeModel — deep scarcity prices a non-zero pool opportunity cost", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, margin: 0.20, decline: 0.80, sales: 0.10, scarExp: 1.6 };
  const m = E.computeModel({
    use: "Condominium", btype: "Low-rise (1-3)", parking: "surface", coastal: "AE",
    market: 1_000_000, margin: 0.20, decline: 0.80, bonus: 10, byright: 100,
    hardOv: null, pathway: "Pool Allocation", acres: 0, base: 0, cap: 0,
    rem: 50, dem: 10, hor: 15, impact: 3000,
    hcLow: null, hcHigh: null, hcOverride: null,
    benefits: [],
    K, CATMULT, BMULT: ID_B, PMULT: ID_P, FMULT: ID_F,
    CAPTURE: { capLo: 0.25 }, PVD: { disc: 0.03, esc: 0.02, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true
  });
  // remAfter 40 → (40/10)/15 = 0.26667 → scar = 0.73333
  near(m.scar, 1 - (40 / 10) / 15, 1e-12);
  // vLowUnit = Vlow/bonus = 4,800,000/10 = 480000; D = 480000 × scar^1.6 × 10
  const scar = 1 - (40 / 10) / 15;
  near(m.D, 480000 * Math.pow(scar, 1.6) * 10, 1e-3);
  assert.ok(m.D > 0, "pool opportunity cost should be positive under scarcity");
  dollar(m.I, 30_000);
  near(m.cityMin, m.D + 30000, 1e-6);
});

// ---------------------------------------------------------------------------
test("computeModel — non-pool pathway zeroes the pool opportunity cost", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, margin: 0.20, decline: 0.80, sales: 0.10, scarExp: 1.6 };
  const m = E.computeModel({
    use: "Condominium", btype: "Low-rise (1-3)", parking: "surface", coastal: "AE",
    market: 1_000_000, margin: 0.20, decline: 0.80, bonus: 10, byright: 100,
    hardOv: null, pathway: "Direct (non-pool)", acres: 0, base: 0, cap: 0,
    rem: 50, dem: 10, hor: 15, impact: 3000,    // would be scarce IF it were a pool draw
    hcLow: null, hcHigh: null, hcOverride: null,
    benefits: [],
    K, CATMULT, BMULT: ID_B, PMULT: ID_P, FMULT: ID_F,
    CAPTURE: { capLo: 0.25 }, PVD: { disc: 0.03, esc: 0.02, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true
  });
  assert.strictEqual(m.poolPath, false);
  assert.strictEqual(m.scar, 0);
  assert.strictEqual(m.D, 0);
  dollar(m.cityMin, 30_000);   // impact floor only
});

// ---------------------------------------------------------------------------
// Income approach (ported from Codebase A). Expected per-unit values are A's own
// pro-forma test numbers (engine.test.ts, assumption set A: size 1000 sf, $500/sf,
// rent $2/sf/mo, vac 0.05, opex 0.30, ADR 300, occ 0.70, NOI margin 0.30, cap 0.05)
// — proving the port reproduces A's pro forma exactly at the per-unit level.
test("incomeApproach — condo = sf × $/sf (matches A's per-unit GDV)", () => {
  const v = E.incomeApproach("Condominium", { sizeSf: 1000, condoPSF: 500 });
  assert.strictEqual(v.method, "sales");
  dollar(v.valuePerUnit, 500_000);     // A: 5,000,000 / 10 units
  assert.strictEqual(v.noiPerUnit, 0);
});

test("incomeApproach — rental NOI ÷ cap (matches A's per-unit GDV)", () => {
  const v = E.incomeApproach("Multifamily Rental", { sizeSf: 1000, rentPSFmo: 2, vacancy: 0.05, opex: 0.30, rentalCap: 0.05 });
  assert.strictEqual(v.method, "income");
  // PGI 24,000 → EGI 22,800 → NOI 15,960 → value 319,200
  dollar(v.noiPerUnit, 15_960);
  dollar(v.valuePerUnit, 319_200);     // A: 3,192,000 / 10 units
});

test("incomeApproach — hotel ADR×occ → NOI ÷ cap (matches A's per-key GDV)", () => {
  // ancillary 1.0 + ebitda 0.30 reduces the tool's lodging formula to A's ADR×occ×margin form
  const v = E.incomeApproach("Temporary Lodging", { adr: 300, occ: 0.70, ancillary: 1.0, ebitda: 0.30, hotelCap: 0.05 });
  assert.strictEqual(v.method, "income");
  dollar(v.noiPerUnit, 22_995);        // 300×365×0.7×1×0.3
  dollar(v.valuePerUnit, 459_900);     // A: 4,599,000 / 10 keys
});

test("incomeApproach — lodging matches the tool's lodgeValuePerKey formula (ancillary + EBITDA)", () => {
  // ADR 410, occ 0.70, ancillary 1.25, EBITDA 0.30, cap 0.075 (the tool's Gulf-front defaults)
  const v = E.incomeApproach("Temporary Lodging", { adr: 410, occ: 0.70, ancillary: 1.25, ebitda: 0.30, hotelCap: 0.075 });
  const expected = (410 * 365 * 0.70 * 1.25 * 0.30) / 0.075;
  near(v.valuePerUnit, expected, 1e-6);
});

test("incomeApproach — zero cap rate guards against divide-by-zero", () => {
  const r = E.incomeApproach("Multifamily Rental", { sizeSf: 1000, rentPSFmo: 2, vacancy: 0.05, opex: 0.30, rentalCap: 0 });
  assert.strictEqual(r.valuePerUnit, 0);
  const h = E.incomeApproach("Temporary Lodging", { adr: 300, occ: 0.70, ancillary: 1.0, ebitda: 0.30, hotelCap: 0 });
  assert.strictEqual(h.valuePerUnit, 0);
});

// ---------------------------------------------------------------------------
// Two-tier marginal cost (ported from Codebase A): the construction step-up is
// charged only to the marginal bonus units. In B's per-bonus-unit model that is a
// multiplier on the bonus units' hard cost; default 1 leaves prior behavior intact.
test("residualUnit — bonusStep raises the marginal units' cost and lowers residual", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  // step 1.0 → 600,000 (baseline clean case); step 1.5 → hard 300,000 → cost 550,000 → residual 450,000
  const base = E.residualUnit(1_000_000, "Condominium", 0.20, "Low-rise (1-3)", "surface", "AE", null, null, K, ID_B, ID_P, ID_F, 1);
  const stepped = E.residualUnit(1_000_000, "Condominium", 0.20, "Low-rise (1-3)", "surface", "AE", null, null, K, ID_B, ID_P, ID_F, 1.5);
  dollar(base, 600_000);
  dollar(stepped, 450_000);
  assert.ok(stepped < base, "step-up should reduce residual value");
});

test("residualUnit — omitting bonusStep equals bonusStep 1 (backward compatible)", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, sales: 0.10 };
  const omitted = E.residualUnit(1_000_000, "Condominium", 0.20, "Mid-rise (4-7)", "podium", "VE", null, null, K, ID_B, ID_P, ID_F);
  const one = E.residualUnit(1_000_000, "Condominium", 0.20, "Mid-rise (4-7)", "podium", "VE", null, null, K, ID_B, ID_P, ID_F, 1);
  assert.strictEqual(omitted, one);
});

test("computeModel — bonusStep charges the step-up to bonus units (V and impMargin)", () => {
  const K = { hardCondo: 200000, hardHotel: 400000, soft: 0.25, margin: 0.20, decline: 0.80, sales: 0.10, scarExp: 1.6 };
  const inp = {
    use: "Condominium", btype: "Low-rise (1-3)", parking: "surface", coastal: "AE",
    market: 1_000_000, margin: 0.20, decline: 0.80, bonus: 10, byright: 100,
    hardOv: null, pathway: "Pool Allocation", acres: 0, base: 0, cap: 0,
    rem: 200, dem: 10, hor: 15, impact: 3000, hcLow: null, hcHigh: null, hcOverride: null,
    benefits: [],
    K, CATMULT, BMULT: ID_B, PMULT: ID_P, FMULT: ID_F,
    CAPTURE: { capLo: 0.25 }, PVD: { disc: 0.03, esc: 0.02, term: 30 }, ENFORCE, SIMPLE_BENEFITS: true
  };
  const plain = E.computeModel(inp);
  const stepped = E.computeModel(Object.assign({}, inp, { bonusStep: 1.2 }));
  dollar(plain.V, 4_800_000);
  // step 1.2 → hard 240,000 → cost 460,000 → residual 540,000 → V 540,000×10×0.8
  dollar(stepped.V, 4_320_000);
  // impMargin reflects the stepped cost: tc = 240,000×1.25 + 100,000 = 400,000
  near(stepped.impMargin, (1_000_000 - 400_000) / 400_000, 1e-9);
  // omitting bonusStep matches bonusStep 1
  dollar(E.computeModel(Object.assign({}, inp, { bonusStep: 1 })).V, 4_800_000);
});
