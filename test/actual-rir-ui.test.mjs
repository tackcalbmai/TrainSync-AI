import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../workout-log.css", import.meta.url), "utf8");

test("manual session log exposes optional actual RIR without pre-filling it", () => {
  const match = app.match(/<input class="log-rir"[^>]+>/);
  assert.ok(match, "RIR input should exist");
  assert.match(match[0], /type="number"/);
  assert.match(match[0], /min="0"/);
  assert.match(match[0], /max="6"/);
  assert.match(match[0], /step="0\.5"/);
  assert.match(match[0], /placeholder="RIR"/);
  assert.doesNotMatch(match[0], /\svalue=/, "actual RIR must not be fabricated or prefilled");
});

test("manual session log keeps RIR and RPE as separate nullable signals", () => {
  assert.match(app, /rir:row\.querySelector\("\.log-rir"\)\?\.value \|\| null/);
  assert.match(app, /rpe:row\.querySelector\("\.log-rpe"\)\?\.value \|\| null/);
  assert.match(app, /<span>RIR<\/span><span>RPE<\/span>/);
});

test("UI explains actual RIR priority without claiming RPE equivalence", () => {
  assert.match(html, /RIR and RPE are optional\./);
  assert.match(html, /actual RIR takes priority for adaptation; RPE is the fallback when RIR is not reported\./);
});

test("desktop and mobile layouts reserve distinct RIR and RPE controls", () => {
  assert.match(css, /grid-template-columns:42px minmax\(100px,1fr\) 100px 100px 74px 74px/);
  assert.match(css, /\.log-set-row \.log-rir\{grid-column:2\}/);
  assert.match(css, /\.log-set-row \.log-rpe\{grid-column:3\}/);
});
