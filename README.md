# Peekin

Sticky notes for Windows that live on the edge of your screen, plus the
website that shows them off. One [Turborepo](https://turborepo.com), pnpm
workspaces.

```
apps/
  desktop/    Tauri 2 app (Rust + dependency-free TypeScript)
  web/        single-page website with a live, playable demo (Vite + TypeScript)
packages/
  tsconfig/   shared TypeScript settings
branding/     logo sources
```

## Run

```bash
pnpm install

pnpm dev:desktop      # the desktop app (tauri dev, hot reload)
pnpm dev:web          # the website on http://127.0.0.1:1431

pnpm typecheck        # every workspace
pnpm build:web        # website → apps/web/dist
pnpm build:desktop    # release build + installers → apps/desktop/src-tauri/target/release/bundle
```

Run a script in one workspace directly with
`pnpm --filter @peekin/desktop <script>` (or `@peekin/web`).

See [apps/desktop/README.md](apps/desktop/README.md) for the app's features,
shortcuts and data location.
