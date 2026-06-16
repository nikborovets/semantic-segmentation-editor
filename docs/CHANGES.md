# Changes summary

Base commit: `ead980c` — everything before this was untouched.

## Recent commits

### `fdd0ecb` — Background visibility shortcut and solo/mute behavior

- Added a 3D shortcut `E` to toggle background (`classIndex === 0`) visibility.
- Routed the shortcut through `SseClassChooser` so the EyeOff button state and editor filtering stay in sync.
- Updated 3D class filtering so a class in solo mode can still be hidden with mute (`visible = solo && !mute`).
- Added a `.gitignore` entry for local future 3D undo/redo planning notes.

### `b797d1a` — Save status tooltip cleanup

- Moved save-status tooltip content into `SseTooltips3d` using the existing hidden help block pattern.
- Updated `SseBottomBar` to initialize tippy from `data-tippy-html="#saveStatusHelp"`.
- Simplified save status labels in `SseEditor3d` so detailed explanations live in the tooltip.

### `983ffa9` — Selection click and tooltip copy

- Removed the automatic `displayAll()` / fit-view behavior from empty canvas clicks; centering now stays tied to the explicit Center View action.
- Updated the Center View tooltip text to match the new behavior.

### `88fac1c` — Counter refresh after delete shortcut

- Added `invalidateCounters()` after the 3D `D` / `Delete` shortcut resets selected points to background.

### `c77e49d` — 3D save status and reliable save tracking

- Made `SseDataManager.saveBinaryFile()` return a Promise with HTTP success/error/timeout handling.
- Updated 3D `saveAll()` to track binary label save, binary object save, and metadata save results together.
- Added save status publishing (`Saving...`, `Saved`, `Unsaved changes`, `Connection lost`) and throttled failure alerts.
- Added a centered save-status badge in `SseBottomBar` with styles in `client/main.less`.
- Added DDP connection hints without treating DDP status as a replacement for binary POST results.

## What was done

### Feature: mandatory label set selection + persistence

When a user opens a PCD cloud for the first time (no MongoDB record), a modal dialog appears and forces them to choose a label set before the editor loads. The chosen set is immediately saved to MongoDB so subsequent page reloads restore it automatically without showing the modal again.

### Bug fixes

- **Server crash on EPERM** (`server/files.js`): writing `.labels`/`.objects` files via `createWriteStream` had no error handler — an unhandled error event crashed the Node process. Fixed with `wstream.on('error', ...)`. Also fixed a double-slash in the file path (`string +` replaced with `path.join()`).
- **`updateClassFilter` crash** (`SseEditor3d`): when `displayRgb = true`, `display()` built RGB color buffer but skipped assigning `classIndex` on `cloudData` points. Then `updateClassFilter` did `classesData[pt.classIndex].visible` where `classIndex` was `undefined` → TypeError. Fixed by always assigning `classIndex` from `labelArray` first, separately from color building.
- **`labelForIndex` crash on hover** (`SseEditor3d`): `setHighlightFeedback` called `activeSoc.labelForIndex(classIndex)` without checking bounds — crashed if `classIndex` was outside the set's range. Fixed with `classIndex < activeSoc.classesCount` guard.
- **`paintScene` null crash** (`SseEditor3d`): `this.rgbArray.length` was accessed without a null check. Fixed to `this.rgbArray && this.rgbArray.length > 0`.
- **API null crash** (`server/api.js`): `soc.objects[classIndex].label` crashed if `soc` was not found or index was out of range. Added null-safety.

---

## Files changed

### `imports/common/SseClassChooser.jsx`

- Initial `soc: null` instead of auto-selecting `classesSets[0]`
- Added `mode: null` to state
- Replaced `editor-ready` handler: if `socName` is present in the message → resolve and send `active-soc` immediately (no modal); if absent → show `required-set-chooser` modal
- Added `_renderRequiredSetChooser()` — a mandatory modal that lists all available sets
- `active-soc` handler now also calls `setState({soc: arg.value})` so the label list renders after selection
- Removed `currentSample` and `active-soc-name` handlers (no longer needed)
- Guarded `soc.descriptors` and the "Classes Sets" button renders against `soc === null`
- Fixed `renderDialog()` null guard: `soc && cset.name === soc.name`
- Fixed `getIcon` null guard: `objDesc &&` before accessing `objDesc.icon`

### `imports/editor/3d/SseEditor3d.jsx`

- `messages()`: reads `SseSamples.findOne` before sending `editor-ready`, passes `socName` in the message payload
- `start()`: uses already-read `pendingServerMeta` (no second DB read); calls `saveMeta()` immediately after setting `meta.socName` so the set is persisted even if the user reloads before making any annotations; removed `sendMsg("active-soc-name", ...)` (chooser now handles restore via `editor-ready`)
- `display()`: separated `classIndex` assignment from color building — `classIndex` is now always set from `labelArray` regardless of `displayRgb`; color building uses `try/catch` around `activeSoc.colorForIndexAsRGBArray`
- `paintScene()`: added `this.rgbArray &&` null guard
- `setHighlightFeedback()`: added `data.classIndex < this.activeSoc.classesCount` bounds check

### `server/files.js`

- `path.join(pointcloudsFolder, relPath)` instead of string concatenation (fixes double-slash)
- Added `wstream.on('error', ...)` handler to prevent server crash on EPERM

### `server/api.js`

- `obj.label = soc && soc.objects[obj.classIndex] ? ... : String(obj.classIndex)` — null-safe label resolution

### `settings.json`

- Added `{"label": "background", "color": "#000000"}` and `{"label": "orphan", "color": "#FF00FF"}` to all three sets (Cityscapes, AD20, 33 Classes)

### `room_labels_new.json`

- Added `{"label": "orphan", "color": "#FF00FF"}` to RoomLabels set
- Added new set "Location02-E-R1-1023" (subset of RoomLabels objects with the same colors)

### `sse-docker-stack.dev.yml`

- Added comments explaining restart workflow
- Added `SSE_FORCE_REBUILD` and `SSE_HOT_RELOAD` env vars with defaults
- Switched default `SSE_IMAGES` path to `./pcd_samples` for local dev

### `CLAUDE.md`

- Created project documentation file for Claude Code with architecture overview, running instructions, and Docker dev workflow
