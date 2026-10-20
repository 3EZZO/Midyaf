# FULL-OVERHAUL-M1 change report: persistent radar controls during zoom

Date: 2026-10-19
Author: Claude Code (managed, file-only worker)
Authorization: D-025, `docs/ai/tasks/FULL-OVERHAUL.md` item 1, `docs/ai/tasks/FULL-OVERHAUL-M1.md`
Worktree: `scratch/full-overhaul/release-worktree` (branch `feat/midyaf-full-overhaul`)
State: **Ready for review**. Proposed commit message: `fix(radar): preserve map filters and satellite controls on zoom`

## Causes found (from code inspection, not a browser repro)

1. **Leaflet's focus scrolled the clipped map wrapper.** Leaflet's keyboard handler calls `container.focus()` on every mousedown on the map (drag, double-click zoom). It then restores only the *window* scroll. `RiyadhMap`'s outer wrapper is `overflow-hidden`, so it is still a programmatic scroll container. When the canvas is taller than the wrapper's visible box, focus scrolling moves the wrapper by the control bar's height. Examples are the War Room (`h-full min-h-[360px]` in a height-bounded column), short fullscreen viewports and browser zoom. The zone filter, the Tactical/Satellite/Standard switch, Geofences and Fullscreen then slid out of view. A clipped box has no scrollbar, so there was no way to bring them back. This matches the reported "controls disappear on zoom" bug most closely.
2. **Leaflet's z-index leaked out of the map.** Neither the wrapper nor the canvas formed a stacking context. Leaflet's map pane (z 400) and controls (z 1000) therefore competed in the page/War Room stacking context. They outranked the app header (35), sheets (50), dialogs (60) and toasts (70). The control bar and the stats HUD had no layer of their own: the bar was unpositioned, and the HUD used a bare `z-[500]` that only worked by accident.
3. **The zone filter was breakpoint-hidden.** It used `hidden md:flex`. Browser zoom shrinks the CSS viewport below 768 px, so the zone filter disappeared at higher browser zoom levels. In that state the map-style and Geofences controls also lost their accessible names, because only their icons remained.
4. **Tracking focus had no HUD and the selection highlight never applied.** `markers.setSelected(selectedDriverId)` passed a bare driver id. Marker ids are `driver:<id>`, so the highlight never matched. Director, Locate and marker-click focus were not shown anywhere on the map.
5. **Layout-driven size changes were not re-measured.** Wrapping chrome, fullscreen and browser zoom resize the canvas without a window resize, so Leaflet kept a stale size. The existing 260 ms fullscreen `invalidateSize` stays in place.

## Fix

- `useLeafletMap.ts`: the container's `focus()` now always uses `preventScroll: true` (`focusWithoutScroll`). The container never keeps a scroll offset (`pinScrollOrigin`). A `ResizeObserver` (`observeContainerSize`, skipped when the API is missing) calls `invalidateSize({ animate: false })`. Everything is undone on cleanup. The map instance is still created exactly once per mount.
- `RiyadhMap.tsx`:
  - The wrapper and stage are also pinned to scroll origin.
  - New layer classes: `map-shell` on the wrapper (both modes, via exported `mapShellClassName`), `map-chrome` on the control bar and `map-stage` on the canvas.
  - The zone filter is always rendered. Segmented groups wrap, icon-only buttons get `aria-label`/`title`, and Geofences gets an `aria-label`.
  - New exported `TrackingHud` shows the tracked convoy with Re-center and Stop-tracking (overview) actions in normal and fullscreen. It sits at the top inline-end, opposite Leaflet's zoom control: right in EN, left in AR. Its actions stay disabled until the map layers exist (the loading state).
  - The tracked id syncs from `selectedDriverId`, marker clicks, Locate and controller focus. The selection highlight now uses the namespaced marker id and is reapplied after each marker sync.
- `MapController.ts`: optional `onFocusChange(markerId | null)`, called on a successful `focusConvoy` and on `overview`. Existing callers are unaffected.
- `map.css`:
  - `.map-shell` and `.map-stage` use `isolation: isolate`.
  - `.map-chrome` is `position: relative; z-index: 2; flex-shrink: 0`, above `.map-stage` (z-index 1).
  - `.map-hud` is z-index 1001, so it sits above Leaflet controls, but only inside the isolated stage.
  - The passive stats strip keeps its local `z-[500]` so it never covers the required tile attribution.
  - No global z-index was inflated. Dialogs (`z-dialog`, elevated `z-map-full`) and the War Room overlays are unchanged, and now nothing in the map leaks above them.

## Files changed (worktree prefix `scratch/full-overhaul/release-worktree/client/src/components/map/`)

| File | Change |
|---|---|
| `RiyadhMap.tsx` | Layer classes, scroll pinning, always-visible zone filter, `TrackingHud`, tracked-convoy state, selection id fix |
| `useLeafletMap.ts` | `focusWithoutScroll`, `pinScrollOrigin`, `observeContainerSize` and their wiring |
| `MapController.ts` | Optional `onFocusChange` |
| `map.css` | Radar layering rules |
| `RiyadhMap.test.tsx` (new) | SSR markup regressions: chrome layer order, zone filter not hidden, named map-style buttons with pressed state, tracking HUD placement EN/AR and disabled-while-loading, `mapShellClassName` normal/fullscreen |
| `radarControls.test.ts` (new) | Scroll pinning, `preventScroll` focus, resize observation, controller focus notifications, `map.css` isolation/ordering and max local z-index ≤ 1001 |

Root: this report and `docs/ai-output/CLAUDE_COORDINATION_REPLY.md`. No other files, schema, secrets, packages or Git operations.

## Checks

| Check | Result |
|---|---|
| `npm run test` | **Not run by Claude** (file-only worker) |
| `npm run check` | **Not run by Claude** |
| `npm run build` | **Not run by Claude** |
| Lint | No lint script exists; none invented |
| Browser verification | **Not run by Claude** |

The tests follow existing patterns: `environment: "node"`, `react-dom/server` and `vi.mock` for `leaflet`, `react-i18next` and `motion/react`'s `useReducedMotion`. No new dependencies. Points for Codex to watch when running them:
- The SSR render imports `leaflet/dist/leaflet.css` and `./map.css`. Vitest normally stubs CSS.
- `RiyadhMap.test.tsx` regexes assume React's attribute order `aria-pressed`, `aria-label`, `title` on Segmented buttons, and `disabled=""` before the spread `aria-label` in `Button`.

## Manual verification instructions (browser)

1. **War Room** (`lg` width), **Logistics dashboard**, **Captain** and **Guest journey** maps. For each: click-drag the map, double-click to zoom, use wheel and +/- zoom from min to max. The control bar must stay in place, and the zone, Tactical/Satellite/Standard, Geofences and Fullscreen controls must keep working.
2. Repeat in fullscreen, with both the native Fullscreen API and the iOS `position: fixed` fallback.
3. Browser zoom at 100/150/200/300 %. The zone filter stays visible and wraps instead of disappearing.
4. Switch to Arabic. The zoom control is top-right, the tracking HUD top-left, and the attribution bottom-left.
5. Select a convoy (War Room roster, marker click, fullscreen Locate, demo director focus). The tracking HUD appears and the marker gets the gold selected ring. Re-center flies back, and Stop tracking returns to overview and hides the HUD.
6. Open a dialog or sheet over a page containing the map. The dialog must cover the map's zoom control and panes.
7. Before tiles load (offline or throttled network), the chrome and HUD render, and the HUD actions stay disabled until the map is live.

## Rollback

Revert the four source files and delete the two new tests. There is no data, schema or configuration impact.

## Notes and limitations

- The causes were found by code inspection. The reported bug was not reproduced in a browser here.
- `TrackingHud` "Stop tracking" calls `overview()`. If a parent keeps a controlled `selectedDriverId` (War Room), the parent's selection is not cleared: `onSelectDriver` has no "clear" signal, and adding one would touch consumer files outside this scope.
- `SovereignCommandBridge.tsx` keeps its `z-[1100]` briefing overlay. It is outside the write scope and still layers correctly above the now-isolated map.
