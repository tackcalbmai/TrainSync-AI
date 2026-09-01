import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");

const HTML_FILES = [
  "index.html",
  "workout.html",
  "program.html",
  "history.html",
  "progress.html",
  "profile.html",
  "integrations.html",
  "reset-password.html",
  "oauth-consent.html",
];

test("feature UI entrypoints are wired into their production pages", () => {
  const index = read("index.html");
  const program = read("program.html");

  assert.match(index, /src="\/next-session-insight-ui\.js"/);
  assert.match(index, /id="lastPublish"/);
  assert.match(program, /src="\/program-missed-session-ui\.js"/);
  assert.match(program, /src="\/program-adjustment-explain-ui\.js"/);
});

test("all local static assets referenced by HTML exist", () => {
  for (const htmlFile of HTML_FILES) {
    const html = read(htmlFile);
    const references = [...html.matchAll(/(?:src|href)="(\/[^"?#]+)"/g)].map((match) => match[1]);
    for (const reference of references) {
      if (!/\.(?:js|css|svg|webmanifest|png|jpg|jpeg|webp)$/i.test(reference)) continue;
      const localPath = path.join(ROOT, reference.replace(/^\//, ""));
      assert.equal(existsSync(localPath), true, `${htmlFile} references missing asset ${reference}`);
    }
  }
});

test("PWA cache version and repaired feature assets stay in the offline bundle", () => {
  const serviceWorker = read("sw.js");
  assert.match(serviceWorker, /trainsync-v21/);
  for (const asset of [
    "/next-session-insight-ui.js",
    "/program-missed-session-ui.js",
    "/program-adjustment-explain-ui.js",
  ]) {
    assert.ok(serviceWorker.includes(`"${asset}"`), `service worker is missing ${asset}`);
  }
});

test("syntax gate covers every Vercel API function and stays within Hobby limit", () => {
  const pkg = JSON.parse(read("package.json"));
  const check = String(pkg?.scripts?.check || "");
  const apiFiles = readdirSync(path.join(ROOT, "api")).filter((file) => file.endsWith(".js")).sort();

  assert.ok(apiFiles.length <= 12, `Vercel Hobby function limit exceeded: ${apiFiles.length}/12`);
  for (const file of apiFiles) {
    assert.ok(check.includes(`api/${file}`), `npm run check does not cover api/${file}`);
  }
  for (const file of ["sw.js", "oauth-consent.js"]) {
    assert.ok(check.includes(file), `npm run check does not cover ${file}`);
  }
});

test("production headers enforce a constrained browser security policy", () => {
  const config = JSON.parse(read("vercel.json"));
  const globalHeaders = config.headers?.find((entry) => entry.source === "/(.*)")?.headers || [];
  const headers = Object.fromEntries(globalHeaders.map((entry) => [String(entry.key).toLowerCase(), String(entry.value)]));
  const csp = headers["content-security-policy"] || "";

  assert.equal(headers["x-frame-options"], "DENY");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /connect-src 'self' https:\/\/sjihbrpbhfttuyzmbfku\.supabase\.co/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
});
