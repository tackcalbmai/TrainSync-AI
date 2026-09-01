import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { safeAuthenticatedAppPath, signInRedirectUrl } from "../lib/auth-redirect.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

test("protected page redirect targets are allowlisted and cannot become open redirects", () => {
  assert.equal(safeAuthenticatedAppPath("/history"), "/history");
  assert.equal(safeAuthenticatedAppPath("//evil.example"), "/");
  assert.equal(safeAuthenticatedAppPath("https://evil.example"), "/");
  assert.equal(signInRedirectUrl("/profile"), "/?auth=signin&next=%2Fprofile");
});

test("signed-out protected pages request sign-in instead of silently returning home", () => {
  for (const page of ["program", "history", "progress", "profile", "integrations"]) {
    const source = read(`${page}.js`);
    assert.match(source, /signInRedirectUrl/);
    assert.doesNotMatch(source, /location\.href\s*=\s*["']\/["']/);
  }
});

test("commercial Garmin copy exposes no mock send action or official-connectivity promise", () => {
  const home = read("index.html");
  const integrations = read("integrations.html");
  assert.doesNotMatch(home, /id="menuButton"/);
  assert.match(home, /id="publishButton"[^>]*hidden/);
  assert.doesNotMatch(home, /Provider ready/i);
  assert.match(integrations, /Official API access pending/i);
  assert.match(integrations, /Manual FIT import/i);
});

test("mobile controls, muted copy, focus, and dialogs have explicit accessibility safeguards", () => {
  const css = read("accessibility.css");
  const dialog = read("dialog-accessibility.js");
  assert.match(css, /--dim:\s*#737b82/i);
  assert.match(css, /min-height:\s*44px/i);
  assert.match(css, /focus-visible/i);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /returnFocus/);
  for (const file of ["index.html", "workout.html", "program.html", "history.html", "progress.html", "profile.html", "integrations.html", "reset-password.html", "oauth-consent.html"]) {
    assert.match(read(file), /href="\/accessibility\.css"/, `${file} must load accessibility.css`);
  }
  assert.match(read("workout.html"), /role="dialog"/);
});

test("all account creation entrypoints enforce the shared new-password policy", () => {
  for (const file of ["app.js", "oauth-consent.js", "reset-password.js"]) {
    const source = read(file);
    assert.match(source, /validateNewPassword/, `${file} must use validateNewPassword`);
  }
  assert.match(read("oauth-consent.js"), /new-password/);
});
