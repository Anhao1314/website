# FlowCredit Website

Official website repository for FlowCredit.

## Responsibilities

- marketing website
- product documentation entry
- Web Agent Demo (future)
- website BFF (future)

Phase 1 contains only the existing static marketing website. Documentation entry ownership does not imply new documentation pages in this phase. The existing `#/demo` links remain unchanged; no demo or BFF is implemented.

## Not responsible for

- FlowCredit Risk Engine
- Agent Runtime
- `/api/v1/chat`
- `/api/v1/assess`

Backend repository: https://github.com/Anhao1314/flowcredit

Migration source: https://github.com/jamezhuang/flowcredit-website

## Local preview

No build step or npm dependencies are required. From this repository root:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/ in a browser. The site keeps its original root `index.html` and relative `assets/` URLs for GitHub Pages compatibility.

See [the migration record](docs/migration.md) for the pinned source, included files, SHA-256 hashes, exclusions and rollback strategy. Hosting has not been configured or deployed by this migration.
