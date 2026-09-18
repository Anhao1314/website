# Phase 1 migration record

- Source repository: https://github.com/jamezhuang/flowcredit-website
- Source branch: `main`
- Source commit: `d8828a29e42f59b922e8bd0439078adabda1e630`
- Target repository: https://github.com/Anhao1314/website
- Target initial state: empty repository; GitHub tree API returned HTTP 409 and `git ls-remote` returned no refs.
- Migration date: 2026-09-18 (Asia/Shanghai)
- Scope: local, unstaged migration only. No commit, push, deployment, or changes to source/backend repositories.

## Files included and integrity

The five website files were copied as bytes from the pinned source commit, preserving names, directory layout and relative URLs. No HTML, CSS, JavaScript, copy, fonts, links, video or animation was edited.

| File | Source SHA-256 | Target SHA-256 | Result |
| --- | --- | --- | --- |
| `index.html` | `2491c56454ed4d97f5b593f7c3bf561dbeb108348aab20949af4c9179006f6a6` | `2491c56454ed4d97f5b593f7c3bf561dbeb108348aab20949af4c9179006f6a6` | MATCH |
| `assets/img/flowcredit-header-logo.jpg` | `a02ab2b2db2bc77fa41a562ebb3a9b9f21f612544e911a2786cacd2ec18c33d9` | `a02ab2b2db2bc77fa41a562ebb3a9b9f21f612544e911a2786cacd2ec18c33d9` | MATCH |
| `assets/img/flowcredit-icon-logo.jpg` | `249bb6fbfc972f7e025c786853c8a4de55762475771a7af0b70453f9c26466ff` | `249bb6fbfc972f7e025c786853c8a4de55762475771a7af0b70453f9c26466ff` | MATCH |
| `assets/img/video-cover.jpg` | `eda946900a53306a608292b367194ded8b376eb27814f0c528e43444452d868a` | `eda946900a53306a608292b367194ded8b376eb27814f0c528e43444452d868a` | MATCH |
| `assets/video/flowcredit-promo.mp4` | `399db10a35a99f8a7698c7274b48412c62fbc9de14ec233a4137f2441ee9bcf3` | `399db10a35a99f8a7698c7274b48412c62fbc9de14ec233a4137f2441ee9bcf3` | MATCH |

## Files added for repository ownership

- `README.md`: website responsibilities, backend boundary and local preview instructions.
- `docs/migration.md`: this migration record.
- `.gitignore`: excludes local secrets, dependencies and platform artifacts.

## Files intentionally excluded

- `flowcredit-official website/FlowCredit-website/index.html`: byte-for-byte duplicate of root `index.html` (verified).
- `assets/img/flowcredit-logo-banner.jpg`: byte-for-byte duplicate of `assets/img/flowcredit-header-logo.jpg` and not referenced by the homepage (verified).
- Source `.git` and GitHub history/build/deployment artifacts: no source history or deployment artifacts imported. The target clone has its own empty Git metadata.
- Product backend, including `flowcredit/agent` and `flowcredit/assets/js`, and any old demo implementation: outside Phase 1 scope; none copied.

## Behavior preserved

Both `#/demo` links remain placeholders. Section IDs and existing `#how`, `#report`, `#team`, `#contact` targets, contact URLs, disclaimer, images, video and reveal animation remain byte-identical to source. No `public/` prefix, framework, API integration, BFF, new font or SEO changes were introduced.

## Rollback strategy

Before a first commit, the remote target stays empty and the existing public website stays on the source repository. To abandon Phase 1, retain the audit report as needed and remove only the eight migration-created files from this local target checkout; do not rewrite any remote history. The pinned source commit can reproduce the five website files.

After a separately authorized first commit/deployment, record the target commit and hosting configuration before any cutover. Keep the old website available during transition; if validation fails, route traffic back to the unchanged old website and revert the migration with an ordinary reviewable commit. No force push, history rewrite or deployment is part of Phase 1.

## Validation completed on 2026-09-18

- All five source/target SHA-256 pairs match, including byte-identical `index.html`.
- Python standard-library HTTP server bound to `127.0.0.1:8765`; GET `/` and all four referenced media URLs returned HTTP 200. Each HTTP response body hash matched the source file.
- Browser comparison: live source https://jamezhuang.github.io/flowcredit-website/ and local http://localhost:8765/.
- Desktop: PASS at actual CSS viewport 1440 x 1000.
- Mobile-width regression: PASS at actual CSS viewport 390 x 844. This is browser viewport testing, not physical-device certification.
- Navbar, hero, logos, CTA, video/poster, content sections, team, contact and footer were inspected. Header/section/footer dimensions and href lists matched exactly at both test sizes.
- Local browser images decoded successfully; video metadata loaded with duration 25.266667 seconds, readyState 4 and no media error. Full-length playback was not used as an acceptance criterion.
- Known inherited behavior: the two `#/demo` placeholders do not open a demo; mobile navigation links are hidden; the mobile hero has substantial left inset. Both source and target reported document scrollWidth 437 at viewport width 390. These existing behaviors were preserved, not corrected.
- Transient visual differences: reveal-animation capture timing and native video buffering controls can differ with loading timing. No stable migration-induced difference was found.
- Test-environment note: `127.0.0.1` had a pre-existing browser zoom difference; final visual comparisons used standard-scale `localhost` and the live source at identical verified CSS viewport dimensions.
