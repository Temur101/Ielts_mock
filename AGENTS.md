# CD IELTS PLATFORM ARCHITECTURAL INVARIANTS

## 1. STRICT ZERO-TOLERANCE CONSTRAINTS
- NEVER hardcode question numbers (e.g. `qNum === 21`), passage titles, author names, topics, or static options arrays. All logic must remain 100% dynamic for any Cambridge IELTS booklet.
- NEVER run `npm run build` unless explicitly instructed by the user. Verify syntax with node/esbuild or LSP diagnostics.
- NEVER break existing platform functionality: UUID v4 student session auto-normalization, resilient Supabase operations, full-screen anti-cheat, timers, single-play audio seek lock, and map rendering.
- Modify ONLY files designated in the active task scope.

## 2. PROGRESSIVE VALIDATION PROTOCOL
After modifying code:
1. Verify JSX/JS syntax without building the entire bundle.
2. Inspect `git status` and `git diff --stat` to guarantee only requested files were touched.
