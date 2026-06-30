/* =============================================================================
 * SPB Bonus-Density, core valuation engine (extracted from SPB-Bonus-Density-Tool.html)
 *
 * WHY THIS FILE EXISTS
 *   The tool ships as a single self-contained HTML file (zero build step, served
 *   from GitHub Pages). That is great for deployment but left the money math , 
 *   residualUnit() and compute(), buried in a ~2,000-line untyped <script> with
 *   no automated tests, audited only by hand. This module lifts that core math
 *   out into pure, parameterized, JSDoc-typed functions that can be unit tested
 *   under Node (`node --test`, zero dependencies) while STILL being embeddable
 *   back into the single HTML file (see engine/build-engine.js).
 *
 * SOURCE OF TRUTH
 *   This file is the source of truth for the calculation. Its contents are
 *   embedded verbatim into SPB-Bonus-Density-Tool.html between the
 *   `SPB-ENGINE (generated ...)` markers by engine/build-engine.js. The HTML's
 *   residualUnit()/compute() then DELEGATE here, so there is exactly one copy of
 *   the math and the tests guard it. Edit the math HERE, run the tests, then
 *   re-run the build to re-embed. Do not hand-edit the generated block in the HTML.
 *
 * PURITY
 *   Every function is pure: no DOM, no I/O, no module-level mutable state, and
 *   all constants (K, CATMULT, BMULT, PMULT, FMULT, CAPTURE, PVD, ENFORCE …) are
 *   passed in as explicit arguments. computeModel() returns the SAME object shape
 *   the HTML's compute() always returned, so the UI/render layer is unchanged.
 *
 * IMPORTANT: the formulas here are a faithful, behavior-preserving extraction of
 *   the v1.15.0 logic. The characterization tests (engine/spb-engine.test.js)
 *   lock in the current numeric outputs, including the documented worked
 *   reconciliation (Corey Landing → value-to-developer $5,681,500), so any
 *   accidental change to the math fails a test rather than shipping silently.
 * ========================================================================== */
;(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api; // Node / tests (CommonJS)
  else root.SPBEngine = api;                                              // browser: window/globalThis.SPBEngine
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * @typedef {Object} HardCostConstants
   * @property {number} hardCondo  base hard cost per condo/MF unit ($)
   * @property {number} hardHotel  base hard cost per lodging key ($)
   * @property {number} soft       soft-cost fraction of hard (e.g. 0.24)
   * @property {number} margin     developer margin fraction (e.g. 0.15). Note: per-deal margin is passed separately to residualUnit
   * @property {number} decline    value-decline factor on marginal bonus units (e.g. 0.80)
   * @property {number} sales      condo sales/marketing fraction of market price (e.g. 0.06)
   * @property {number} scarExp    scarcity-curve exponent (e.g. 1.6)
   */

  /**
   * @typedef {Object.<string,number>} MultiplierMap  label → multiplier (BMULT/PMULT/FMULT/CATMULT)
   */

  /**
   * Per-unit residual land value (value to developer per marginal unit), BEFORE
   * the bonus-count and decline factors. Mirrors the HTML residualUnit() exactly.
   *
   *   hard = hardFinal              (if an explicit per-unit cost override is given)
   *        | base × BMULT × PMULT × FMULT   (otherwise; base = hardFinal-free path)
   *   sales = (use === "Condominium") ? market × K.sales : 0
   *   cost  = hard × (1 + K.soft) × (1 + margin) + sales
   *   residual = max(0, market − cost)
   *
   * @param {number} market      market value per unit ($)
   * @param {string} use         use type ("Condominium" | "Multifamily Rental" | "Temporary Lodging" | "")
   * @param {number} margin      developer margin fraction for this deal
   * @param {string} btype       building type key (into BMULT)
   * @param {string} parking     parking key (into PMULT)
   * @param {string} coastal     coastal/flood key (into FMULT)
   * @param {?number} baseOverride  base hard cost to run through the multipliers (else use type default), or null
   * @param {?number} hardFinal     fully-built per-unit hard cost (skips the multipliers), or null
   * @param {HardCostConstants} K
   * @param {MultiplierMap} BMULT
   * @param {MultiplierMap} PMULT
   * @param {MultiplierMap} FMULT
   * @param {number} [bonusStep=1]  marginal-bonus-unit construction step-up (Codebase A's two-tier
   *   treatment): because B values only the bonus units here, multiplying their hard cost by this
   *   factor charges the construction step-up (taller type / structured parking the bonus forces) to
   *   the marginal units only. 1 = no step-up (preserves prior behavior).
   * @returns {number} residual value per unit ($), floored at 0
   */
  function residualUnit(market, use, margin, btype, parking, coastal, baseOverride, hardFinal, K, BMULT, PMULT, FMULT, bonusStep) {
    if (!use) return 0; // no use type selected yet, nothing to value
    var step = (bonusStep == null) ? 1 : bonusStep;
    var hard;
    if (hardFinal != null) {
      hard = hardFinal; // direct per-unit construction cost (override)
    } else {
      var base = (baseOverride != null) ? baseOverride : (use === "Temporary Lodging" ? K.hardHotel : K.hardCondo);
      hard = base * (BMULT[btype] || 1) * (PMULT[parking] || 1) * (FMULT[coastal] || 1);
    }
    hard = hard * step; // two-tier: charge the step-up to these (marginal bonus) units only
    var sales = use === "Condominium" ? market * K.sales : 0;
    var cost = hard * (1 + K.soft) * (1 + margin) + sales;
    return Math.max(0, market - cost);
  }

  /**
   * Construction cost per unit ESTIMATED from the project specs (building type,
   * parking, coastal). Mirrors the HTML estHardUnit().
   * @returns {number}
   */
  function estHardUnit(use, btype, parking, coastal, K, BMULT, PMULT, FMULT) {
    var base = use === "Temporary Lodging" ? K.hardHotel : K.hardCondo;
    return base * (BMULT[btype] || 1) * (PMULT[parking] || 1) * (FMULT[coastal] || 1);
  }

  /**
   * Construction cost per unit ACTUALLY used: the override if entered, else the
   * estimate. Mirrors the HTML effHardUnit().
   * @param {?number|string} hardOv  per-unit override ($), or null/"" for none
   * @returns {number}
   */
  function effHardUnit(hardOv, use, btype, parking, coastal, K, BMULT, PMULT, FMULT) {
    return (hardOv != null && hardOv !== "") ? +hardOv : estHardUnit(use, btype, parking, coastal, K, BMULT, PMULT, FMULT);
  }

  /**
   * Scarcity fraction of the pool given the remaining-after-this-draw balance.
   *   scar = 1 − min(1, max(0, (remAfter / demand) / horizon))
   * 0 when the pool has plenty of runway; → 1 as it nears depletion.
   * @param {number} remAfter  pool units remaining after this allocation
   * @param {number} demand    projected annual demand (units/yr)
   * @param {number} horizon   planning horizon (yrs)
   * @returns {number} scarcity in [0,1]
   */
  function scarcity(remAfter, demand, horizon) {
    return 1 - Math.min(1, Math.max(0, (remAfter / demand) / horizon));
  }

  /**
   * Present-value factor for a growing annuity (payments at year-end), n years.
   * Mirrors the HTML pvFactor(). One-time benefits use a factor of 1 (handled by
   * the caller, not here). Returns 0 for n ≤ 0.
   * @param {number} g escalation rate
   * @param {number} r discount rate
   * @param {number} n term in years
   * @returns {number}
   */
  function pvFactor(g, r, n) {
    if (!(n > 0)) return 0;
    if (Math.abs(r - g) < 1e-9) return n / (1 + r);
    return (1 - Math.pow((1 + g) / (1 + r), n)) / (r - g);
  }

  /**
   * Whether escalation stays safely below the discount rate. Mirrors the HTML
   * recurringGuardOK(): strict (esc must be < disc).
   * @param {{esc:number,disc:number}} PVD
   * @returns {boolean}
   */
  function recurringGuardOK(PVD) {
    return PVD.esc < PVD.disc;
  }

  /**
   * Enforceability credit factor for a named securing instrument; falls back to
   * ENFORCE.none. Mirrors the HTML enforceFactor().
   * @param {string} instr
   * @param {Object.<string,number>} ENFORCE
   * @returns {number}
   */
  function enforceFactor(instr, ENFORCE) {
    return ENFORCE[instr] != null ? ENFORCE[instr] : ENFORCE.none;
  }

  /**
   * @typedef {Object} BenefitInput
   * @property {string} name
   * @property {number} qty
   * @property {number} pct       fraction above code (1 = 100%)
   * @property {?number} [dev]    developer $/unit override (else lib.dev)
   * @property {?number} [city]   city $/unit override (else lib.city)
   * @property {boolean} [recurring]
   * @property {number} [term]    recurring term (yrs); 0/absent → PVD.term
   * @property {string} [instr]   securing instrument key (into ENFORCE)
   */

  /**
   * @typedef {Object} LibInfo
   * @property {string} cat   category (into CATMULT)
   * @property {string} unit
   * @property {number} dev   default developer $/unit
   * @property {number} city  default city $/unit
   */

  /**
   * Value one benefit line. Mirrors the per-benefit block of the HTML compute().
   * The returned object spreads the input benefit then adds the computed fields,
   * exactly as the HTML did.
   *
   * @param {BenefitInput} b
   * @param {LibInfo} lib            resolved library info for b.name (libInfo)
   * @param {boolean} codeMin        does code set a baseline for this benefit (libCodeMin)
   * @param {Object} K_consts        { CATMULT, PVD, ENFORCE, SIMPLE_BENEFITS }
   * @returns {Object} row
   */
  function benefitRow(b, lib, codeMin, K_consts) {
    var CATMULT = K_consts.CATMULT, PVD = K_consts.PVD, ENFORCE = K_consts.ENFORCE, SIMPLE_BENEFITS = K_consts.SIMPLE_BENEFITS;
    var devU = (b.dev != null) ? b.dev : lib.dev;
    var cityU = (b.city != null) ? b.city : lib.city;
    var mult = CATMULT[lib.cat] || 1;
    var recurring = !!b.recurring;
    var term = recurring ? ((b.term > 0) ? b.term : PVD.term) : 0;
    var pvf = recurring ? pvFactor(PVD.esc, PVD.disc, term) : 1; // one-time benefits use a factor of 1
    var annualDev = b.qty * devU * b.pct, annualCity = b.qty * cityU * b.pct; // for recurring, per-year amounts
    var instr = b.instr || "";
    var unsecured = SIMPLE_BENEFITS ? false : !instr;            // no instrument named -> unsecured
    var hc = SIMPLE_BENEFITS ? 1 : (unsecured ? ENFORCE.none : enforceFactor(instr, ENFORCE));
    var aboveCodeFlag = SIMPLE_BENEFITS ? false : ((b.pct >= 1) && codeMin);
    var escViol = SIMPLE_BENEFITS ? false : (recurring && !recurringGuardOK(PVD));
    var devCost = annualDev * pvf;                // developer cost is never haircut
    var cityPlain = annualCity * pvf * hc;        // plain-dollar city value the city can count on
    var cityVal = cityPlain * mult;              // priority-weighted value → ranking only
    return Object.assign({}, b, {
      cat: lib.cat, unit: lib.unit, dev: devU, city: cityU, mult: mult, recurring: recurring,
      term: term, pvf: pvf, instr: instr, hc: hc, unsecured: unsecured, codeMin: codeMin,
      aboveCodeFlag: aboveCodeFlag, escViol: escViol, annualDev: annualDev, annualCity: annualCity,
      devCost: devCost, cityPlain: cityPlain, cityVal: cityVal, gain: devCost ? cityVal / devCost : 0
    });
  }

  /**
   * @typedef {Object} ComputeInput
   * --- project ---
   * @property {string} use
   * @property {string} btype
   * @property {string} parking
   * @property {string} coastal
   * @property {number} market
   * @property {number} margin
   * @property {number} decline
   * @property {number} bonus
   * @property {number} byright
   * @property {?number|string} hardOv  per-unit hard-cost override, or null/""
   * @property {string} pathway         "Pool Allocation" enables pool opportunity cost
   * @property {number} acres
   * @property {number} base            by-right density (du/ac or TLU/ac), for byrightDerived
   * @property {number} cap             pool-augmented ceiling density, for maxUnits/overCap
   * --- pool/impact ---
   * @property {number} rem             pool units remaining (resolved from the ledger by the caller)
   * @property {number} dem             projected annual demand
   * @property {number} hor             planning horizon (yrs)
   * @property {number} impact          impact $/unit (mitigation floor basis)
   * --- hard-cost bracket (resolved from the Assumptions hard-cost row) ---
   * @property {?number} hcLow
   * @property {?number} hcHigh
   * @property {?number|string} hcOverride
   * --- benefits (caller resolves lib + codeMin per benefit) ---
   * @property {Array<{b:BenefitInput, lib:LibInfo, codeMin:boolean}>} benefits
   * --- constants ---
   * @property {HardCostConstants} K
   * @property {MultiplierMap} CATMULT
   * @property {MultiplierMap} BMULT
   * @property {MultiplierMap} PMULT
   * @property {MultiplierMap} FMULT
   * @property {{capLo:number}} CAPTURE
   * @property {{disc:number,esc:number,term:number}} PVD
   * @property {Object.<string,number>} ENFORCE
   * @property {boolean} SIMPLE_BENEFITS
   */

  /**
   * Full model evaluation. Faithful extraction of the HTML compute() body (after
   * S.rem is resolved). Returns the identical result object the HTML consumed.
   *
   * @param {ComputeInput} input
   * @returns {Object} the compute() result (r, V, Vlow, Vhigh, scar, D, I, cityMin,
   *   rows, A, B, Bplain, g, gPlain, zFloor, zCeil, room, worth, feas, poolPath,
   *   total, maxUnits, byrightDerived, overCap, headroom, tc, impMargin, flags,
   *   captureRate, belowCapture)
   */
  function computeModel(input) {
    var use = input.use, btype = input.btype, parking = input.parking, coastal = input.coastal;
    var market = input.market, margin = input.margin, decline = input.decline, bonus = input.bonus;
    var byright = input.byright, acres = input.acres, base = input.base, cap = input.cap;
    var rem = input.rem, dem = input.dem, hor = input.hor, impact = input.impact, pathway = input.pathway;
    var K = input.K, CATMULT = input.CATMULT, BMULT = input.BMULT, PMULT = input.PMULT, FMULT = input.FMULT;
    var CAPTURE = input.CAPTURE, PVD = input.PVD, ENFORCE = input.ENFORCE, SIMPLE_BENEFITS = input.SIMPLE_BENEFITS;
    var bonusStep = (input.bonusStep == null) ? 1 : input.bonusStep; // two-tier: marginal-bonus-unit cost step-up (A)

    var hardF = (input.hardOv != null && input.hardOv !== "") ? +input.hardOv : null; // direct construction-cost override
    var r = residualUnit(market, use, margin, btype, parking, coastal, null, hardF, K, BMULT, PMULT, FMULT, bonusStep);
    var V = r * bonus * decline;

    /* cost-driven value-to-developer range. With an entered construction cost, bracket it ±15% for
       cost uncertainty. Otherwise use the Assumptions Low/High hard-cost bracket × the project's
       multipliers. High cost → conservative low value; low cost → high (target). The bonus-unit
       step-up applies to every branch (these are all the marginal bonus units' value). */
    var Vlow = V, Vhigh = V;
    if (use && hardF != null) {
      Vlow = residualUnit(market, use, margin, btype, parking, coastal, null, hardF * 1.15, K, BMULT, PMULT, FMULT, bonusStep) * bonus * decline;
      Vhigh = residualUnit(market, use, margin, btype, parking, coastal, null, hardF * 0.85, K, BMULT, PMULT, FMULT, bonusStep) * bonus * decline;
    } else if (use && (input.hcLow != null || input.hcHigh != null || (input.hcOverride != null && input.hcOverride !== ""))) {
      var ov = (input.hcOverride != null && input.hcOverride !== "");
      var hcHi = ov ? +input.hcOverride * 1.15 : input.hcHigh, hcLo = ov ? +input.hcOverride * 0.85 : input.hcLow;
      Vlow = residualUnit(market, use, margin, btype, parking, coastal, hcHi, undefined, K, BMULT, PMULT, FMULT, bonusStep) * bonus * decline;
      Vhigh = residualUnit(market, use, margin, btype, parking, coastal, hcLo, undefined, K, BMULT, PMULT, FMULT, bonusStep) * bonus * decline;
    }

    /* implied return-on-cost the bonus units actually carry at this market price, a sanity check,
       not a model input. tc = delivered cost with no profit; the bonus units carry the step-up. */
    var hardC = effHardUnit(input.hardOv, use, btype, parking, coastal, K, BMULT, PMULT, FMULT) * bonusStep;
    var salesC = use === "Condominium" ? market * K.sales : 0;
    var tc = hardC * (1 + K.soft) + salesC;
    var impMargin = (use && tc > 0) ? (market - tc) / tc : 0;

    var remAfter = rem - bonus;
    var poolPath = pathway === "Pool Allocation";
    var scar = poolPath ? scarcity(remAfter, dem, hor) : 0;
    /* Pool opportunity cost is priced on the SAME basis as the ceiling: the conservative (declined,
       high-cost) per-unit value, not the gross mid-cost residual r. */
    var vLowUnit = bonus > 0 ? Vlow / bonus : 0;
    var D = poolPath ? Math.max(0, vLowUnit) * Math.pow(scar, K.scarExp) * bonus : 0;
    var I = use ? (impact * bonus) : 0; // no use type selected yet → no impact floor
    var cityMin = D + I;

    var K_consts = { CATMULT: CATMULT, PVD: PVD, ENFORCE: ENFORCE, SIMPLE_BENEFITS: SIMPLE_BENEFITS };
    var rows = input.benefits.map(function (item) {
      return benefitRow(item.b, item.lib, item.codeMin, K_consts);
    });
    var A = rows.reduce(function (s, x) { return s + x.devCost; }, 0);
    var Bplain = rows.reduce(function (s, x) { return s + x.cityPlain; }, 0); // PLAIN public value vs baseline
    var B = rows.reduce(function (s, x) { return s + x.cityVal; }, 0);        // WEIGHTED, ranking only
    var gPlain = A ? Bplain / A : 0, g = A ? B / A : 0;
    var zFloor = gPlain ? cityMin / gPlain : 0, zCeil = Vlow, room = Vlow - A; // ceiling = conservative (low) end
    var worth = Bplain >= cityMin, feas = A <= Vlow;                          // feasibility on the conservative end
    var total = byright + bonus;
    var maxUnits = (cap || 0) * (acres || 0);
    var byrightDerived = (base || 0) * (acres || 0);
    var overCap = (cap > 0 && acres > 0) ? (total > maxUnits + 1e-9) : false;
    var headroom = maxUnits - total;

    /* package-level open questions */
    var nUnsecured = rows.filter(function (x) { return x.unsecured; }).length;
    var nAboveCode = rows.filter(function (x) { return x.aboveCodeFlag; }).length;
    var nEsc = rows.filter(function (x) { return x.escViol; }).length;
    var unsecuredValue = rows.filter(function (x) { return x.unsecured; }).reduce(function (s, x) { return s + x.cityPlain; }, 0);
    var unsecuredShare = Bplain > 0 ? unsecuredValue / Bplain : 0;
    var flags = { nUnsecured: nUnsecured, nAboveCode: nAboveCode, nEsc: nEsc, unsecuredValue: unsecuredValue, unsecuredShare: unsecuredShare, any: (nUnsecured + nAboveCode + nEsc) > 0 };

    /* capture gate: even a feasible, floor-clearing offer below the fair-share target is left on the table */
    var captureRate = Vlow > 0 ? A / Vlow : 0;
    var belowCapture = worth && feas && Vlow > 0 && (A < CAPTURE.capLo * Vlow);

    return {
      r: r, V: V, Vlow: Vlow, Vhigh: Vhigh, scar: scar, D: D, I: I, cityMin: cityMin, rows: rows,
      A: A, B: B, Bplain: Bplain, g: g, gPlain: gPlain, zFloor: zFloor, zCeil: zCeil, room: room,
      worth: worth, feas: feas, poolPath: poolPath, total: total, maxUnits: maxUnits,
      byrightDerived: byrightDerived, overCap: overCap, headroom: headroom, tc: tc, impMargin: impMargin,
      flags: flags, captureRate: captureRate, belowCapture: belowCapture
    };
  }

  /**
   * @typedef {Object} IncomeApproachParams
   * @property {number} sizeSf      avg sellable/rentable area per unit (or gross per key)
   * @property {number} condoPSF    for-sale price per sellable sf (condo)
   * @property {number} rentPSFmo   monthly rent per rentable sf (rental)
   * @property {number} vacancy     stabilized vacancy share of potential gross income (rental)
   * @property {number} opex        operating-expense share of effective gross income (rental)
   * @property {number} rentalCap   cap rate applied to rental NOI
   * @property {number} adr         average daily rate per key (lodging)
   * @property {number} occ         stabilized occupancy share (lodging)
   * @property {number} ancillary   ancillary-revenue multiplier on room revenue (lodging)
   * @property {number} ebitda      EBITDA / NOI margin (lodging)
   * @property {number} hotelCap    cap rate applied to lodging NOI
   */

  /**
   * Income / fundamentals approach to the VALUE PER UNIT, ported from Codebase A's
   * pro forma (computeScenario GDV), expressed per unit so it can serve as an
   * alternative anchor or cross-check to B's single entered market comparable.
   *
   *   condo  : sales comparison       value = sizeSf × condoPSF
   *   rental : income capitalization  NOI = sizeSf × rent × 12 × (1−vacancy) × (1−opex); value = NOI ÷ cap
   *   hotel  : income capitalization  NOI = ADR × 365 × occ × ancillary × EBITDA; value = NOI ÷ cap
   *            (matches the tool's existing lodgeValuePerKey, a superset of A's ADR×occ×margin form)
   *
   * Pure: all inputs come from `p`. Returns the per-unit value, the per-unit NOI
   * (0 for for-sale), a human label, and an itemized breakdown for display.
   *
   * @param {string} use  "Condominium" | "Multifamily Rental" | "Temporary Lodging" | ""
   * @param {IncomeApproachParams} p
   * @returns {{use:string, method:string, label:string, valuePerUnit:number, noiPerUnit:number, detail:Object}}
   */
  function incomeApproach(use, p) {
    if (use === "Temporary Lodging") {
      var roomRev = p.adr * 365 * p.occ;          // potential room revenue per key/yr
      var hotelNoi = roomRev * p.ancillary * p.ebitda;
      var keyValue = p.hotelCap > 0 ? hotelNoi / p.hotelCap : 0;
      return { use: use, method: "income", label: "Income capitalization (lodging)", valuePerUnit: keyValue, noiPerUnit: hotelNoi,
        detail: { roomRev: roomRev, ancillary: p.ancillary, ebitda: p.ebitda, cap: p.hotelCap, adr: p.adr, occ: p.occ } };
    }
    if (use === "Multifamily Rental") {
      var pgi = p.sizeSf * p.rentPSFmo * 12;       // potential gross income per unit/yr
      var egi = pgi * (1 - p.vacancy);             // effective gross income
      var noi = egi * (1 - p.opex);                // net operating income
      var unitValue = p.rentalCap > 0 ? noi / p.rentalCap : 0;
      return { use: use, method: "income", label: "Income capitalization (rental)", valuePerUnit: unitValue, noiPerUnit: noi,
        detail: { pgi: pgi, egi: egi, noi: noi, vacancy: p.vacancy, opex: p.opex, cap: p.rentalCap, rentPSFmo: p.rentPSFmo, sizeSf: p.sizeSf } };
    }
    // Condominium / any for-sale: sales comparison (A's condo GDV = sellable sf × $/sf).
    var saleValue = p.sizeSf * p.condoPSF;
    return { use: use, method: "sales", label: "Sales comparison (SF × $/SF)", valuePerUnit: saleValue, noiPerUnit: 0,
      detail: { sizeSf: p.sizeSf, psf: p.condoPSF } };
  }

  return {
    residualUnit: residualUnit,
    estHardUnit: estHardUnit,
    effHardUnit: effHardUnit,
    scarcity: scarcity,
    pvFactor: pvFactor,
    recurringGuardOK: recurringGuardOK,
    enforceFactor: enforceFactor,
    benefitRow: benefitRow,
    computeModel: computeModel,
    incomeApproach: incomeApproach
  };
});
