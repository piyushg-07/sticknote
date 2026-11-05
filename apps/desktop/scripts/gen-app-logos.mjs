// Generates src/lib/app-logos.ts: one logo per catalog app (src/lib/apps.ts).
//
//   node scripts/gen-app-logos.mjs
//
// For each app, candidates are tried in order; the first that exists and is
// roughly square (wordmarks are skipped) wins:
//   1. full-colour logos from Iconify sets: logos (CC0), devicon, skill-icons,
//      vscode-icons (MIT)
//   2. the app's one-colour Simple Icons glyph (CC0), drawn on a brand tile
// Apps with neither get a letter tile at runtime. Installed apps always show
// their real icon first (read from the PC).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

/** exe → full-colour candidates, best first */
const FULL = {
  "code.exe": ["logos:visual-studio-code", "devicon:vscode"],
  "cursor.exe": ["logos:cursor-icon", "logos:cursor", "devicon:cursor"],
  "antigravity.exe": ["logos:antigravity", "devicon:antigravity"],
  "zed.exe": ["devicon:zed"],
  "devenv.exe": ["logos:visual-studio", "devicon:visualstudio"],
  "idea64.exe": ["logos:intellij-idea", "devicon:intellij"],
  "pycharm64.exe": ["logos:pycharm", "devicon:pycharm"],
  "webstorm64.exe": ["logos:webstorm", "devicon:webstorm"],
  "phpstorm64.exe": ["logos:phpstorm", "devicon:phpstorm"],
  "rider64.exe": ["logos:rider", "devicon:rider"],
  "goland64.exe": ["logos:goland", "devicon:goland"],
  "clion64.exe": ["logos:clion", "devicon:clion"],
  "studio64.exe": ["devicon:androidstudio"],
  "sublime_text.exe": ["logos:sublimetext-icon"],
  "hyper.exe": ["logos:hyper"],
  "mintty.exe": ["logos:git-icon", "devicon:git"],
  "githubdesktop.exe": ["logos:github-icon", "devicon:github"],
  "gitkraken.exe": ["logos:gitkraken", "devicon:gitkraken"],
  "sourcetree.exe": ["logos:sourcetree", "devicon:sourcetree"],
  "postman.exe": ["logos:postman-icon", "devicon:postman"],
  "insomnia.exe": ["logos:insomnia", "devicon:insomnia"],
  "bruno.exe": ["devicon:bruno"],
  "httpie.exe": ["logos:httpie-icon"],
  "docker desktop.exe": ["logos:docker-icon", "devicon:docker"],
  "chatgpt.exe": ["logos:openai-icon"],
  "claude.exe": ["logos:claude-icon", "devicon:claude"],
  "perplexity.exe": ["logos:perplexity-icon"],
  "ollama app.exe": ["logos:ollama", "devicon:ollama"],
  "figma.exe": ["logos:figma", "devicon:figma"],
  "photoshop.exe": ["logos:adobe-photoshop", "devicon:photoshop"],
  "illustrator.exe": ["logos:adobe-illustrator", "devicon:illustrator"],
  "indesign.exe": ["logos:adobe-indesign"],
  "xd.exe": ["logos:adobe-xd"],
  "lightroom.exe": ["logos:adobe-lightroom"],
  "canva.exe": ["devicon:canva"],
  "designer.exe": ["vscode-icons:file-type-affinitydesigner"],
  "photo.exe": ["vscode-icons:file-type-affinityphoto"],
  "publisher.exe": ["vscode-icons:file-type-affinitypublisher"],
  "framer.exe": ["logos:framer"],
  "draw.io.exe": ["vscode-icons:file-type-drawio"],
  "blender.exe": ["logos:blender", "devicon:blender"],
  "maya.exe": ["devicon:maya"],
  "krita.exe": ["vscode-icons:file-type-krita"],
  "gimp-2.10.exe": ["devicon:gimp"],
  "inkscape.exe": ["devicon:inkscape"],
  "adobe premiere pro.exe": ["devicon:premierepro"],
  "afterfx.exe": ["logos:adobe-after-effects", "devicon:aftereffects"],
  "adobe audition.exe": ["skill-icons:audition"],
  "loom.exe": ["logos:loom-icon"],
  "descript.exe": ["logos:descript-icon"],
  "ableton live 12 suite.exe": ["skill-icons:ableton-light"],
  "winword.exe": ["vscode-icons:file-type-word"],
  "excel.exe": ["vscode-icons:file-type-excel"],
  "powerpnt.exe": ["vscode-icons:file-type-powerpoint"],
  "onenote.exe": ["vscode-icons:file-type-onenote"],
  "notion.exe": ["logos:notion-icon", "devicon:notion"],
  "obsidian.exe": ["logos:obsidian-icon"],
  "grammarly.desktop.exe": ["logos:grammarly-icon"],
  "soffice.exe": ["vscode-icons:file-type-libreoffice-writer"],
  "googledrivefs.exe": ["logos:google-drive"],
  "dropbox.exe": ["logos:dropbox"],
  "clickup.exe": ["logos:clickup-icon"],
  "asana.exe": ["logos:asana-icon"],
  "linear.exe": ["logos:linear-icon", "devicon:linear"],
  "trello.exe": ["logos:trello", "devicon:trello"],
  "miro.exe": ["logos:miro-icon"],
  "airtable.exe": ["logos:airtable"],
  "basecamp 3.exe": ["logos:basecamp-icon"],
  "todoist.exe": ["logos:todoist-icon"],
  "ms-teams.exe": ["logos:microsoft-teams"],
  "slack.exe": ["logos:slack-icon", "devicon:slack"],
  "zoom.exe": ["logos:zoom-icon"],
  "olk.exe": ["vscode-icons:file-type-outlook"],
  "outlook.exe": ["vscode-icons:file-type-outlook"],
  "discord.exe": ["logos:discord-icon"],
  "whatsapp.exe": ["logos:whatsapp-icon"],
  "telegram.exe": ["logos:telegram"],
  "signal.exe": ["logos:signal"],
  "mattermost.exe": ["logos:mattermost-icon"],
  "element.exe": ["logos:element"],
  "rocket.chat.exe": ["logos:rocket-chat-icon"],
  "zulip.exe": ["logos:zulip-icon"],
  "wire.exe": ["logos:wire"],
  "pbidesktop.exe": ["logos:microsoft-power-bi", "devicon:powerbi"],
  "tableau.exe": ["logos:tableau-icon"],
  "rstudio.exe": ["devicon:rstudio"],
  "matlab.exe": ["devicon:matlab"],
  "stats.exe": ["devicon:spss"],
  "statamp-64.exe": ["vscode-icons:file-type-stata"],
  "datagrip64.exe": ["logos:datagrip", "devicon:datagrip"],
  "dbeaver.exe": ["devicon:dbeaver"],
  "ssms.exe": ["devicon:microsoftsqlserver"],
  "mysqlworkbench.exe": ["devicon:mysqlworkbench"],
  "pgadmin4.exe": ["logos:postgresql", "devicon:postgresql"],
  "chrome.exe": ["logos:chrome", "devicon:chrome"],
  "msedge.exe": ["logos:microsoft-edge"],
  "firefox.exe": ["logos:firefox", "devicon:firefox"],
  "brave.exe": ["logos:brave"],
  "arc.exe": ["logos:arc"],
  "opera.exe": ["logos:opera", "devicon:opera"],
  "vivaldi.exe": ["logos:vivaldi-icon"],
  "duckduckgo.exe": ["logos:duckduckgo"],
  "explorer.exe": ["vscode-icons:default-folder"],
  "powershell.exe": ["devicon:powershell"],
  "pwsh.exe": ["devicon:powershell"],
};

const MAX_RATIO = 1.35; // wider than this = a wordmark, skip it

const sets = {};
function iconSet(prefix) {
  if (!sets[prefix]) sets[prefix] = require(`@iconify-json/${prefix}/icons.json`);
  return sets[prefix];
}

/** Resolve an Iconify id to a standalone SVG string, or null. */
function iconify(id) {
  const [prefix, name] = id.split(":");
  const set = iconSet(prefix);
  let icon = set.icons[name];
  let alias = set.aliases?.[name];
  if (!icon && alias) icon = { ...set.icons[alias.parent], ...alias };
  if (!icon) return null;
  const w = icon.width ?? set.width ?? 16;
  const h = icon.height ?? set.height ?? 16;
  if (w / h > MAX_RATIO || h / w > MAX_RATIO) return null;
  if (/<script|on\w+=/i.test(icon.body)) return null; // static logos only
  const box = `${icon.left ?? 0} ${icon.top ?? 0} ${w} ${h}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}">${icon.body}</svg>`;
}

// Resolved through Node, so it works with workspace hoisting (node_modules at the repo root).
const si = await import("simple-icons");
const bySlug = new Map(Object.values(si).filter((x) => x?.slug).map((x) => [x.slug, x]));
const slugs = JSON.parse(fs.readFileSync(path.join(root, "scripts/simple-icon-slugs.json"), "utf8"));

const catalog = fs.readFileSync(path.join(root, "src/lib/apps.ts"), "utf8");
const exes = [...new Set([...catalog.matchAll(/C\("([^"]+)", "[^"]+", "#[0-9a-f]{6}"\)/g)].map((m) => m[1]))];

const out = {};
let full = 0;
let mono = 0;
const missing = [];
for (const exe of exes) {
  const svg = (FULL[exe] ?? []).map(iconify).find(Boolean);
  if (svg) {
    out[exe] = { svg };
    full++;
    continue;
  }
  const glyph = slugs[exe] && bySlug.get(slugs[exe]);
  if (glyph) {
    out[exe] = {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="${glyph.path}"/></svg>`,
      mono: true,
    };
    mono++;
    continue;
  }
  missing.push(exe);
}

const header = `// GENERATED by scripts/gen-app-logos.mjs — do not edit by hand.
// Logos: Iconify "logos" (CC0), devicon / skill-icons / vscode-icons (MIT),
// Simple Icons (CC0). Brand marks belong to their owners and are used only to
// identify each app.
// Loaded lazily (dynamic import) so windows only pay for it when needed.
`;
const body = `export const APP_LOGOS: Record<string, { svg: string; mono?: boolean }> = ${JSON.stringify(out, null, 0)};\n`;
fs.writeFileSync(path.join(root, "src/lib/app-logos.ts"), header + body);
console.log(`apps: ${exes.length}  full-colour: ${full}  one-colour: ${mono}  letter tile: ${missing.length}`);
console.log(`letter tiles: ${missing.join(", ")}`);
console.log(`size: ${(Buffer.byteLength(body) / 1024).toFixed(0)} KB`);
