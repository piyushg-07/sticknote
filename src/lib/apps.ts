// App catalog for "show this note only while using…": the desktop tools each
// kind of professional relies on, grouped by role. (Only desktop apps — a
// note is matched to the app in front by its executable.)
//
// Icons, best first:
//   1. the app's real icon, read from this PC when it's installed
//   2. its brand logo (full-colour where available, else a one-colour glyph on
//      a brand tile) — see scripts/gen-app-logos.mjs
//   3. a brand-colour tile with the app's initial
import { api } from "./api";
import type { IconName } from "./icons";

export interface CatalogApp {
  /** lower-case executable name — what a note stores */
  exe: string;
  name: string;
  /** brand colour (tile background) */
  color: string;
}

export interface Category {
  id: string;
  name: string;
  icon: IconName;
  apps: CatalogApp[];
}

/** app without a logo in the library: brand colour + initial (real icon if installed) */
const C = (exe: string, name: string, color: string): CatalogApp => ({ exe, name, color });

export const CATEGORIES: Category[] = [
  {
    id: "dev",
    name: "Developers",
    icon: "code",
    apps: [
      C("code.exe", "VS Code", "#2f80ed"),
      C("cursor.exe", "Cursor", "#111111"),
      C("antigravity.exe", "Antigravity", "#4285f4"),
      C("windsurf.exe", "Windsurf", "#0b7a6f"),
      C("zed.exe", "Zed", "#084ccf"),
      C("devenv.exe", "Visual Studio", "#865fc5"),
      C("idea64.exe", "IntelliJ IDEA", "#000000"),
      C("pycharm64.exe", "PyCharm", "#000000"),
      C("webstorm64.exe", "WebStorm", "#000000"),
      C("phpstorm64.exe", "PhpStorm", "#000000"),
      C("rider64.exe", "Rider", "#000000"),
      C("goland64.exe", "GoLand", "#000000"),
      C("clion64.exe", "CLion", "#000000"),
      C("studio64.exe", "Android Studio", "#3ddc84"),
      C("sublime_text.exe", "Sublime Text", "#ff9800"),
      C("notepad++.exe", "Notepad++", "#90e59a"),
      C("windowsterminal.exe", "Terminal", "#2d2d2d"),
      C("warp.exe", "Warp", "#01a4ff"),
      C("hyper.exe", "Hyper", "#000000"),
      C("mintty.exe", "Git Bash", "#f05032"),
      C("githubdesktop.exe", "GitHub Desktop", "#181717"),
      C("gitkraken.exe", "GitKraken", "#179287"),
      C("sourcetree.exe", "Sourcetree", "#0052cc"),
      C("postman.exe", "Postman", "#ff6c37"),
      C("insomnia.exe", "Insomnia", "#4000bf"),
      C("bruno.exe", "Bruno", "#f4aa41"),
      C("httpie.exe", "HTTPie", "#73dc8c"),
      C("docker desktop.exe", "Docker", "#2496ed"),
    ],
  },
  {
    id: "ai",
    name: "AI assistants",
    icon: "sparkles",
    apps: [
      C("chatgpt.exe", "ChatGPT", "#412991"),
      C("claude.exe", "Claude", "#d97757"),
      C("perplexity.exe", "Perplexity", "#1fb8cd"),
      C("poe.exe", "Poe", "#5d5cde"),
      C("ollama app.exe", "Ollama", "#000000"),
      C("lm studio.exe", "LM Studio", "#4338ca"),
      C("jan.exe", "Jan", "#1d4ed8"),
      C("cursor.exe", "Cursor", "#111111"),
      C("antigravity.exe", "Antigravity", "#4285f4"),
      C("windsurf.exe", "Windsurf", "#0b7a6f"),
    ],
  },
  {
    id: "design",
    name: "Designers",
    icon: "palette",
    apps: [
      C("figma.exe", "Figma", "#f24e1e"),
      C("photoshop.exe", "Photoshop", "#31a8ff"),
      C("illustrator.exe", "Illustrator", "#ff9a00"),
      C("indesign.exe", "InDesign", "#ff3366"),
      C("xd.exe", "Adobe XD", "#ff61f6"),
      C("lightroom.exe", "Lightroom", "#31a8ff"),
      C("canva.exe", "Canva", "#00c4cc"),
      C("designer.exe", "Affinity Designer", "#134881"),
      C("photo.exe", "Affinity Photo", "#4e3188"),
      C("publisher.exe", "Affinity Publisher", "#891b26"),
      C("framer.exe", "Framer", "#0055ff"),
      C("lunacy.exe", "Lunacy", "#179de3"),
      C("draw.io.exe", "draw.io", "#f08705"),
      C("blender.exe", "Blender", "#e87d0d"),
      C("cinema 4d.exe", "Cinema 4D", "#011a6a"),
      C("maya.exe", "Maya", "#37a5cc"),
      C("3dsmax.exe", "3ds Max", "#37a5cc"),
      C("krita.exe", "Krita", "#3babff"),
      C("gimp-2.10.exe", "GIMP", "#5c5543"),
      C("inkscape.exe", "Inkscape", "#000000"),
      C("coreldrw.exe", "CorelDRAW", "#000000"),
    ],
  },
  {
    id: "video",
    name: "Video & audio",
    icon: "film",
    apps: [
      C("adobe premiere pro.exe", "Premiere Pro", "#9999ff"),
      C("afterfx.exe", "After Effects", "#9999ff"),
      C("adobe media encoder.exe", "Media Encoder", "#9999ff"),
      C("resolve.exe", "DaVinci Resolve", "#233a51"),
      C("capcut.exe", "CapCut", "#111111"),
      C("filmora.exe", "Filmora", "#07273d"),
      C("camtasia.exe", "Camtasia", "#2bb44a"),
      C("vegas.exe", "Vegas Pro", "#0f1f2e"),
      C("kdenlive.exe", "Kdenlive", "#527eb2"),
      C("shotcut.exe", "Shotcut", "#115c8f"),
      C("handbrake.exe", "HandBrake", "#d29e00"),
      C("obs64.exe", "OBS Studio", "#302e31"),
      C("loom.exe", "Loom", "#625df5"),
      C("descript.exe", "Descript", "#6b4fff"),
      C("adobe audition.exe", "Audition", "#9999ff"),
      C("audacity.exe", "Audacity", "#0000cc"),
      C("fl64.exe", "FL Studio", "#ff7f00"),
      C("reaper.exe", "REAPER", "#4a4a4a"),
      C("ableton live 12 suite.exe", "Ableton Live", "#111111"),
    ],
  },
  {
    id: "docs",
    name: "Writing & docs",
    icon: "fileText",
    apps: [
      C("winword.exe", "Word", "#185abd"),
      C("excel.exe", "Excel", "#107c41"),
      C("powerpnt.exe", "PowerPoint", "#c43e1c"),
      C("onenote.exe", "OneNote", "#7719aa"),
      C("acrobat.exe", "Acrobat", "#ec1c24"),
      C("foxitpdfeditor.exe", "Foxit PDF", "#e1251b"),
      C("notion.exe", "Notion", "#000000"),
      C("obsidian.exe", "Obsidian", "#7c3aed"),
      C("evernote.exe", "Evernote", "#00a82d"),
      C("logseq.exe", "Logseq", "#85c8c8"),
      C("anytype.exe", "Anytype", "#ff6a7b"),
      C("affine.exe", "AFFiNE", "#1e96eb"),
      C("joplin.exe", "Joplin", "#1071d3"),
      C("typora.exe", "Typora", "#333333"),
      C("grammarly.desktop.exe", "Grammarly", "#027e6f"),
      C("zotero.exe", "Zotero", "#cc2936"),
      C("soffice.exe", "LibreOffice", "#18a303"),
      C("wps.exe", "WPS Office", "#d7342e"),
      C("notepad.exe", "Notepad", "#4a90d9"),
      C("googledrivefs.exe", "Google Drive", "#4285f4"),
      C("dropbox.exe", "Dropbox", "#0061ff"),
    ],
  },
  {
    id: "pm",
    name: "Project & team",
    icon: "users",
    apps: [
      C("notion.exe", "Notion", "#000000"),
      C("notion calendar.exe", "Notion Calendar", "#111111"),
      C("clickup.exe", "ClickUp", "#7b68ee"),
      C("asana.exe", "Asana", "#f06a6a"),
      C("linear.exe", "Linear", "#5e6ad2"),
      C("trello.exe", "Trello", "#0052cc"),
      C("miro.exe", "Miro", "#050038"),
      C("airtable.exe", "Airtable", "#18bfff"),
      C("basecamp 3.exe", "Basecamp", "#1d2d35"),
      C("todoist.exe", "Todoist", "#e44332"),
      C("ticktick.exe", "TickTick", "#4772fa"),
      C("winproj.exe", "MS Project", "#31752f"),
      C("lark.exe", "Lark", "#3370ff"),
      C("excel.exe", "Excel", "#107c41"),
      C("ms-teams.exe", "Teams", "#5b5fc7"),
      C("slack.exe", "Slack", "#4a154b"),
      C("zoom.exe", "Zoom", "#0b5cff"),
      C("olk.exe", "Outlook", "#0f78d4"),
    ],
  },
  {
    id: "comms",
    name: "Communication",
    icon: "chat",
    apps: [
      C("ms-teams.exe", "Teams", "#5b5fc7"),
      C("slack.exe", "Slack", "#4a154b"),
      C("zoom.exe", "Zoom", "#0b5cff"),
      C("ciscocollabhost.exe", "Webex", "#000000"),
      C("olk.exe", "Outlook", "#0f78d4"),
      C("outlook.exe", "Outlook (classic)", "#0f78d4"),
      C("thunderbird.exe", "Thunderbird", "#0a84ff"),
      C("proton mail.exe", "Proton Mail", "#6d4aff"),
      C("mailbird.exe", "Mailbird", "#2e8de6"),
      C("mailclient.exe", "eM Client", "#3f7fe0"),
      C("discord.exe", "Discord", "#5865f2"),
      C("whatsapp.exe", "WhatsApp", "#25d366"),
      C("telegram.exe", "Telegram", "#26a5e4"),
      C("signal.exe", "Signal", "#3b45fd"),
      C("mattermost.exe", "Mattermost", "#0058cc"),
      C("element.exe", "Element", "#0dbd8b"),
      C("rocket.chat.exe", "Rocket.Chat", "#f5455c"),
      C("zulip.exe", "Zulip", "#6492fe"),
      C("wire.exe", "Wire", "#000000"),
      C("lark.exe", "Lark", "#3370ff"),
    ],
  },
  {
    id: "data",
    name: "Data & analytics",
    icon: "chart",
    apps: [
      C("excel.exe", "Excel", "#107c41"),
      C("pbidesktop.exe", "Power BI", "#f2c811"),
      C("tableau.exe", "Tableau", "#e97627"),
      C("rstudio.exe", "RStudio", "#75aadb"),
      C("matlab.exe", "MATLAB", "#e16737"),
      C("stats.exe", "SPSS", "#052fad"),
      C("statamp-64.exe", "Stata", "#1a5f91"),
      C("knime.exe", "KNIME", "#fdd800"),
      C("datagrip64.exe", "DataGrip", "#000000"),
      C("dbeaver.exe", "DBeaver", "#382923"),
      C("ssms.exe", "SQL Server Studio", "#cc2927"),
      C("azuredatastudio.exe", "Azure Data Studio", "#0078d4"),
      C("mysqlworkbench.exe", "MySQL Workbench", "#4479a1"),
      C("pgadmin4.exe", "pgAdmin", "#4169e1"),
      C("tableplus.exe", "TablePlus", "#ffb400"),
      C("pycharm64.exe", "PyCharm", "#000000"),
      C("code.exe", "VS Code", "#2f80ed"),
    ],
  },
  {
    id: "web",
    name: "Browsers",
    icon: "globe",
    apps: [
      C("chrome.exe", "Chrome", "#4285f4"),
      C("msedge.exe", "Edge", "#0c59a4"),
      C("firefox.exe", "Firefox", "#ff7139"),
      C("brave.exe", "Brave", "#fb542b"),
      C("arc.exe", "Arc", "#fcbfbd"),
      C("opera.exe", "Opera", "#ff1b2d"),
      C("vivaldi.exe", "Vivaldi", "#ef3939"),
      C("zen.exe", "Zen", "#f76f53"),
      C("floorp.exe", "Floorp", "#0a84ff"),
      C("waterfox.exe", "Waterfox", "#00a1e0"),
      C("thorium.exe", "Thorium", "#3d7bff"),
      C("duckduckgo.exe", "DuckDuckGo", "#de5833"),
    ],
  },
  {
    id: "system",
    name: "System & utilities",
    icon: "wrench",
    apps: [
      C("explorer.exe", "File Explorer", "#f5b800"),
      C("windowsterminal.exe", "Terminal", "#2d2d2d"),
      C("powershell.exe", "PowerShell", "#2671be"),
      C("pwsh.exe", "PowerShell 7", "#2671be"),
      C("cmd.exe", "Command Prompt", "#2d2d2d"),
      C("taskmgr.exe", "Task Manager", "#3a7bd5"),
      C("powertoys.exe", "PowerToys", "#6c4bd8"),
      C("snippingtool.exe", "Snipping Tool", "#0063b1"),
      C("sharex.exe", "ShareX", "#2885f1"),
      C("everything.exe", "Everything", "#ff8000"),
      C("7zfm.exe", "7-Zip", "#000000"),
      C("winrar.exe", "WinRAR", "#7e3f98"),
      C("mstsc.exe", "Remote Desktop", "#0078d4"),
      C("anydesk.exe", "AnyDesk", "#ef443b"),
      C("teamviewer.exe", "TeamViewer", "#050a52"),
      C("virtualbox.exe", "VirtualBox", "#2f61b4"),
      C("vmware.exe", "VMware", "#607078"),
      C("bitwarden.exe", "Bitwarden", "#175ddc"),
      C("1password.exe", "1Password", "#3b66bc"),
      C("keepassxc.exe", "KeePassXC", "#6cac4d"),
    ],
  },
];

const BY_EXE = new Map<string, CatalogApp>();
for (const c of CATEGORIES) for (const app of c.apps) if (!BY_EXE.has(app.exe)) BY_EXE.set(app.exe, app);

export function catalogApp(exe: string): CatalogApp | undefined {
  return BY_EXE.get(exe.toLowerCase());
}

/** Display name: the catalog name, else a tidy file name ("my-app.exe" → "My app"). */
export function appName(exe: string): string {
  const known = BY_EXE.get(exe.toLowerCase());
  if (known) return known.name;
  const base = exe.replace(/\.exe$/i, "").replace(/[_-]+/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function appColor(exe: string): string {
  return BY_EXE.get(exe.toLowerCase())?.color ?? "#6b7887";
}

// ---- brand logos (generated file, loaded lazily) ---------------------------------------

type Logo = { svg: string; mono?: boolean };
let logos: Record<string, Logo> | null = null;
let logosLoading: Promise<void> | null = null;

export function loadLogos(): Promise<void> {
  logosLoading ??= import("./app-logos").then((m) => {
    logos = m.APP_LOGOS;
  });
  return logosLoading;
}

/** The app's brand logo SVG (full-colour, or `mono` = one-colour glyph). */
export function appLogo(exe: string): Logo | null {
  return logos?.[exe.toLowerCase()] ?? null;
}

// ---- real icons (from installed apps), fetched once per window -----------------------

const icons = new Map<string, string | null>();
let pending: Promise<void> | null = null;

/** Load real icons for every catalog app (plus any extra exes). Cached. */
export function loadIcons(extra: string[] = []): Promise<void> {
  void loadLogos();
  const missing = [...new Set([...BY_EXE.keys(), ...extra.map((e) => e.toLowerCase())])].filter((e) => !icons.has(e));
  if (!missing.length) return pending ?? Promise.resolve();
  for (const e of missing) icons.set(e, null); // mark as requested
  const run = api.appIcons(missing).then((pairs) => {
    for (const [exe, icon] of pairs) icons.set(exe, icon);
  });
  pending = Promise.all([pending, run, loadLogos()]).then(() => {});
  return pending;
}

export function appIcon(exe: string): string | null {
  return icons.get(exe.toLowerCase()) ?? null;
}
