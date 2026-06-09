# St. Pete Beach — Bonus Density Tool

A single-file, browser-based decision-support tool for **City of St. Pete Beach (SPB), FL** staff
to assess and negotiate developer **bonus-density** requests: how much extra value a density bonus
is worth to a developer, what the city should require in return, and whether a specific
public-benefit offer clears the bar.

> **This is an internal staff sketch tool — not a public-facing calculator, and not a substitute
> for formal appraisal, a developer pro forma, or legal review.** Every dollar figure is an
> order-of-magnitude estimate built on placeholder benchmarks that should be calibrated to local
> data before any single number is relied upon.

## Use it

- **Live:** open the published page (GitHub Pages) for this repository.
- **Locally:** download [`SPB-Bonus-Density-Tool.html`](SPB-Bonus-Density-Tool.html) and double-click
  it to open in any browser. Vanilla JavaScript, no build step, no install.
  - The map and address geocoding need internet (Leaflet + OpenStreetMap + Pinellas County GIS).
    Everything else works offline.
  - If your browser blocks the map on a `file://` page, serve the folder locally instead —
    e.g. `python3 -m http.server 8000`, then visit
    `http://localhost:8000/SPB-Bonus-Density-Tool.html`.

## What it does

A 4-step wizard (Project → Pool → Benefits → Results) produces four separated figures and a verdict:

- **Value to developer** — the most the requested bonus units are worth to the developer
  (their residual profit on those units), i.e. the walk-away ceiling.
- **Pool opportunity cost** — the scarcity value of giving up finite density-pool units.
- **Impact mitigation floor** — the development impact that can lawfully be required as a
  condition (the proportionate-share / Koontz floor).
- **City minimum** — opportunity cost plus impact floor: the least public value the deal should return.

It then compares the offered public-benefit package against that minimum and the developer ceiling,
defines a zone of possible agreement (ZOPA), and reports whether the deal is favorable.

## Basis and honesty

The bonus mechanism is grounded in SPB's adopted code — the finite General Residential Unit pool
(195 units, Land Development Code §39.18) and the 325-unit transient-lodging pool (Future Land Use
element), allocated case-by-case by ordinance + conditional use on a discretionary "merit basis"
(LDC §4.12(d)). **The code itself sets no contribution rate, benefit-valuation formula, or
floor/ceiling**; those are analytic overlays drawn from *A Framework for Density Bonus Valuation in
St. Pete Beach* (Tampa Bay Regional Planning Council, 2026) and the Nollan–Dolan–Koontz /
F.S. §163.3180 proportionate-share standard. See the in-tool **Method** and **Assumptions** pages
for the full caveats and the editable benchmarks.

## License

No license is set yet. Until one is added, this is shared for review by City of St. Pete Beach
staff; add a `LICENSE` file (e.g. MIT, or a public-domain dedication) if you want to set explicit
reuse terms.
