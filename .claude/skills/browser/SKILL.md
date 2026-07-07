---
description: Sets up and drives a real Chromium browser inside this project via a project-scoped Playwright MCP server, to verify web UIs by actually seeing and interacting with them rather than only typechecking or unit-testing. Use when visually verifying a UI change, clicking through a flow, taking a screenshot, or debugging a bug that only reproduces in a real browser — including canvas/WebGL rendering issues.
---

# Skill: browser

You set up and drive a real Chromium browser inside any project, via a project-scoped Playwright MCP server, so you can verify web UIs by actually seeing and interacting with them — not just typechecking or unit-testing. Follow these steps, and read §9 (Lessons learned) before your first run — those are the mistakes that have already cost real sessions.

## 1. Ensure the Playwright MCP server exists

Check for a `.mcp.json` at the repo root with a `playwright` server. If it's missing, create it (reuse the system Chrome so there's no per-session browser download):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--headless",
        "--executable-path",
        "/usr/bin/google-chrome"
      ]
    }
  }
}
```

Drop `--executable-path` if Chrome isn't at that path (or point it at the local binary: `google-chrome`, `chromium`, or on macOS `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). Then enable the server for this project in `.claude/settings.local.json`:

```json
{ "enabledMcpjsonServers": ["playwright"] }
```

Add `.playwright-mcp/` to `.gitignore` — the server writes snapshots and console logs there. The first run in a fresh repo also needs a one-time human approval of the MCP server; if the tools error with a permission/approval message, that approval is the blocker, not your config — surface it and wait, don't keep retrying.

## 2. Load the tools

The tools appear as `mcp__playwright__*` (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`, `browser_fill_form`, `browser_press_key`, `browser_evaluate`, `browser_take_screenshot`, `browser_console_messages`, `browser_network_requests`, `browser_handle_dialog`, `browser_wait_for`, `browser_tabs`). If they aren't visible, load them first: `ToolSearch({query: "select:mcp__playwright__browser_navigate"})`.

## 3. Get a dev server up without colliding with the user

Serve on port 3100 — a dedicated agent port kept clear of the project's default dev port, so you never collide with a dev server the user has open. Detect the project's dev command (`package.json` scripts, `Makefile`, framework CLI) and its port-override flag, then:

```bash
PORT=3100
curl -sf http://localhost:$PORT >/dev/null && echo "already up" \
  || (<dev command on $PORT with strict-port> > /tmp/agent-dev.log 2>&1 & echo $! > /tmp/agent-dev.pid)
timeout 30 bash -c "until curl -sf http://localhost:$PORT >/dev/null; do sleep 1; done"
```

Use a strict-port flag (e.g. Vite's `--strictPort`, Next's `-p`, `--port` with a framework's fail-on-conflict option) so the server fails loudly instead of silently relocating to another port — a silently relocated server is the most common reason `browser_navigate` lands on a blank page or connection-refused. If the app is a static build with no dev server, build it and serve the output dir on 3100. When done, stop only what you started: `kill $(cat /tmp/agent-dev.pid)` — never touch the user's default port. Tail `/tmp/agent-dev.log` if the readiness loop times out; a build error there explains an empty page faster than any browser probe.

Don't trust a tracked PID as proof a restart actually happened. `(cmd &)` captures the PID of the immediate backgrounded process via `$!`, but when `cmd` is something like `npm run ...` it spawns further child processes (a shell, then the real framework binary) — `$!` only ever holds the first link in that chain, and killing it can leave the real listener orphaned and still bound to the port. If behavior doesn't change after a "restart" (stale content, a fix that doesn't take effect), verify who actually holds the port before debugging anything else: `ss -ltnp | grep :3100` (or `lsof -i :3100`) and kill that PID directly, not the one in your pidfile.

## 4. Drive it

```
browser_navigate       → http://localhost:3100
browser_snapshot       → accessibility tree (prefer over screenshots for structure/state)
browser_click / browser_type / browser_fill_form / browser_select_option → interaction
browser_press_key      → keyboard input
browser_take_screenshot → visual check only
browser_console_messages → confirm nothing threw
browser_network_requests → inspect failed API/asset loads
browser_evaluate       → read/mutate page state directly (see §5)
```

`browser_click` and friends target elements by the `ref` IDs from the most recent `browser_snapshot`. Those refs go stale the moment the DOM changes — after a click, navigation, or re-render, take a fresh snapshot before the next interaction rather than reusing old refs. Snapshot the smallest region that answers your question; a full-page snapshot on a large app is huge and slow.

`browser_console_messages`'s `level` filter is not a pure severity cutoff for plain `console.log()` output: requesting `level: 'warning'` can return zero `[LOG]` entries even when they exist, because log-level messages sit below where the tool's inclusion order picks them up. When you've instrumented the app with `console.log()` for debugging, request `level: 'info'` or `'debug'` to actually see them.

## 5. Prefer reading state over scraping the DOM

For anything numeric or stateful, read it via `browser_evaluate` against whatever the app exposes (`window.*` handles, a store, `document.querySelector(...).value`) instead of parsing rendered text or screenshots — it's faster and exact. `browser_evaluate` runs in page context and returns only JSON-serializable values; return a plain object, not a DOM node or a class instance, or you get `{}`. Errors thrown inside it surface as a tool error — read the message, it's a real JS stack from the page.

If the project exposes no useful handles, add a small `window.__debug = { ... }` hook to the app's entry point wiring up the stores/objects you need to inspect; it pays for itself across a verification session. Read whatever the app already computed (a store selector, a memoized value) rather than re-deriving it yourself in the eval — re-derivation drifts from the app's real logic and gives you a green check on code that's actually broken.

## 6. Debugging canvas/WebGL rendering bugs

App-level `console.log()` tracing can miss the real failure when a canvas/WebGL bug is happening inside the browser's GPU upload path rather than in application logic — a buffer can look correctly sized in JS right up until the actual GL call, and the driver reports the mismatch as a console warning rather than a thrown JS error. When a rendering bug doesn't explain itself from app-level state, inject a small inline `<script>` before the app's module script (e.g. in `index.html`, ahead of the `type="module"` entry point) that monkey-patches the relevant `WebGL2RenderingContext.prototype` methods (`texImage2D`, `texSubImage2D`, `texStorage2D`, etc.) to log their arguments and `gl.getError()` immediately after calling through to the original — this surfaces the exact call, buffer size, and error code that produced the visual symptom. Revert the patch once you've captured what you need; it's debug-only instrumentation, not something to leave in the app.

## 7. Interaction fidelity

- Sustained input (holding a key, a drag, a long-press) can't come from a single `browser_press_key` — that fires down-then-up immediately. For held state, set the underlying value directly via `browser_evaluate` (e.g. the app's input/state flag), then clear it when done. A one-shot press reads as "nothing happened" for anything that needs duration.
- Native dialogs (`alert`/`confirm`/`beforeunload`) block the page and freeze every other tool until answered — pre-arm `browser_handle_dialog`, or the session hangs.
- `<iframe>`, shadow DOM, and `<canvas>` content don't appear as normal nodes in the snapshot; reach into them via `browser_evaluate` or interact by coordinates.
- Give async UI an explicit `browser_wait_for` (text/selector/state) instead of assuming the result is ready right after an action — but see §8, don't reach for a time-based wait.

## 8. Headless timing caveat

Headless Chrome treats the MCP page as occluded and throttles `requestAnimationFrame`, timers, and animation to ~1 Hz, so wall-clock waits massively under-run real time and `setInterval` samplers miss almost every tick. This is the single most expensive trap: a "wait N minutes then read the result" plan silently under-delivers and burns the whole round-trip. Reserve real-time waits and screenshots for genuinely visual checks. For anything measured or time-dependent:

- Sanity-check throughput first — read a counter, wait ~3 s, read it again — before committing to any long wait.
- If the app can be stepped deterministically (fixed timestep, an exposed `advance()`/`tick()`), pause its own loop and drive it synchronously in a single `browser_evaluate` loop; you get minutes of app-time near-instantly and exact counts.
- Instrument with a per-tick/per-event hook the app already calls, not a wall-clock sampler — throttled `setInterval`/`requestAnimationFrame` samplers miss events the hook catches.

## 9. Lessons learned (read before first run)

- **Clean up every byproduct before finishing.** Run `git status --short` and delete anything the session left behind. `browser_take_screenshot` with a relative filename writes to the **repo root**, not `.playwright-mcp/` — remove screenshots after reading them. Leaving `.playwright-mcp/` untracked or screenshots in the tree forces the user to notice and flag it; verification-tool output is a session byproduct and stays out of version control. This applies to processes too, not just files: check for and kill any dev server you started (`ps aux | grep <framework>` if your pidfile is in doubt) — a prior session's orphaned server left running on a port is exactly the kind of stale-state trap described in §3.
- **Verify your change is in the entry point that actually runs.** Projects often carry a scaffold/example file alongside the real one (an unused `main.*`, a template `index.html`, a second app root). If an edit doesn't show in the browser, confirm the file you changed is the one the running server actually loads — trace it from the served HTML — before assuming a caching or build problem.
- **A blank or stale page is usually the server, not the browser.** Connection-refused, a blank page, or old content almost always means the dev server relocated ports, crashed, or served a cached build — check `/tmp/agent-dev.log` and re-confirm the readiness curl before debugging browser-side. If the server's port and log both look right but content still doesn't match disk, see §3 — you may be talking to a stale process, not a stale build.
- **Measure exact values, judge feel visually — don't cross them.** Screenshots are for "does this look right"; numbers come from `browser_evaluate`. Eyeballing a number off a screenshot and measuring layout by scraping pixels both waste round-trips.
- **Don't over-wait.** Every real-time wait in headless is quietly discounted by the throttle (§8). Treat a long wall-clock wait as a code smell and reach for synchronous stepping or a shorter probe first.

## 10. This project

- Dev command: `npm run example` (Vite, `example/` workspace) — normally serves on port 3000. This project's `example` script (`npm run dev -w example`) does not forward extra CLI args through the nested `npm run` layer — `npm run example -- --port 3100 --strictPort` produces npm CLI warnings ("Unknown cli config") and silently falls back to an auto-selected port instead of binding 3100. Launch it directly instead, from the `example/` workspace: `npx vite --port 3100 --strictPort`.
- The example app (`example/`) is the canonical integration surface for the library (see root `CLAUDE.md`) — drive that, not `src/main.ts`, which is unused Vite boilerplate.
