"use strict";
/* =============================================================================
 * build-engine.js — embed engine/spb-engine.js inline into the tool HTML.
 *
 * The tool ships as ONE self-contained file (SPB-Bonus-Density-Tool.html). To keep
 * a single tested source of truth for the math while preserving that single-file
 * deploy, the engine module is embedded verbatim between the SPB-ENGINE markers in
 * the HTML's <script>. This mirrors the existing inline-GeoJSON injection pattern.
 *
 * Run after editing engine/spb-engine.js (and after `node --test` passes):
 *     node engine/build-engine.js
 * Paths resolve from __dirname, so it works from any working directory.
 * Pass --check to verify the embed is current without writing (exit 1 if stale).
 * ========================================================================== */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ENGINE = path.join(__dirname, "spb-engine.js");
const HTML = path.join(ROOT, "SPB-Bonus-Density-Tool.html");
const START = "/* ===== SPB-ENGINE START";
const END = "/* ===== SPB-ENGINE END ===== */";
const checkOnly = process.argv.includes("--check");

const html = fs.readFileSync(HTML, "utf8");
// Match the HTML's newline style so the embedded block stays byte-consistent with the
// rest of the file (editors that normalize to CRLF won't make --check report false drift).
const NL = html.includes("\r\n") ? "\r\n" : "\n";
const engineSrc = fs.readFileSync(ENGINE, "utf8").replace(/\r\n/g, "\n").replace(/\s+$/, "").replace(/\n/g, NL);

const startIdx = html.indexOf(START);
const endIdx = html.indexOf(END);
if (startIdx < 0 || endIdx < 0 || endIdx < startIdx) {
  console.error("ERROR: SPB-ENGINE markers not found (or out of order) in " + HTML);
  process.exit(1);
}

// Preserve the START marker line (it carries the "do not edit here" note); replace
// the content between it and the END marker with the current engine source.
const startLineEnd = html.indexOf("\n", startIdx) + 1;
const startMarkerLine = html.slice(startIdx, startLineEnd); // includes trailing newline
const block = startMarkerLine + engineSrc + NL + END;
const newHtml = html.slice(0, startIdx) + block + html.slice(endIdx + END.length);

if (newHtml === html) {
  console.log("SPB-ENGINE block already up to date (" + engineSrc.split("\n").length + " lines).");
  process.exit(0);
}
if (checkOnly) {
  console.error("STALE: the embedded SPB-ENGINE block differs from engine/spb-engine.js. Run: node engine/build-engine.js");
  process.exit(1);
}
fs.writeFileSync(HTML, newHtml);
console.log("Embedded engine/spb-engine.js into the tool (" + engineSrc.split("\n").length + " lines).");
