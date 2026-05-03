import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const settings = readFileSync(join(root, "ui/src/components/SettingsWorkspace.tsx"), "utf8");
const mobileToggle = readFileSync(join(root, "ui/src/components/MobileSettingsToggle.tsx"), "utf8");
const css = readFileSync(join(root, "ui/src/index.css"), "utf8");

test("settings workspace keeps mobile and desktop navigation from occupying the same grid", () => {
  assert.match(settings, /settings-nav settings-nav--mobile/);
  assert.match(settings, /settings-mobile-nav/);
  assert.match(settings, /settings-mobile-nav__item/);
  assert.match(settings, /aria-current=\{active === section \? "true" : undefined\}/);
  assert.doesNotMatch(settings, /<select[\s\S]*?settings\.navAria/);
  assert.match(settings, /<nav className="settings-nav"/);
  assert.match(css, /\.settings-nav--mobile\s*\{[\s\S]*?display:\s*none;/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?\.settings-nav--mobile\s*\{[\s\S]*?display:\s*block;/);
  assert.match(
    css,
    /@media \(max-width:\s*800px\)[\s\S]*?\.settings-layout > \.settings-nav:not\(\.settings-nav--mobile\)\s*\{[\s\S]*?display:\s*none;/,
  );
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?\.settings-mobile-nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?\.settings-workspace\s*\{[\s\S]*?padding:\s*0;/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?\.settings-row\s*\{[\s\S]*?gap:\s*12px;/);
  assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?\.settings-row__control > \*/);
  assert.match(css, /\.settings-mobile-nav__item\s*\{[\s\S]*?min-height:\s*44px;/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?\.app\.app--settings-open\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /@media \(max-width:\s*800px\)[\s\S]*?\.app\.app--settings-open \.sidebar,[\s\S]*?\.app\.app--settings-open \.history-strip\s*\{[\s\S]*?display:\s*none;/);
  assert.match(mobileToggle, /openComposeSheet\("controls"\)/);
});
