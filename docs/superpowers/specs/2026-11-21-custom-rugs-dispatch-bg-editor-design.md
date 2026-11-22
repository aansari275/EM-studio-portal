# Custom Rugs, Sample Dispatch, Background Removal and Photo Editor

Date: 21 Nov 2026. Approved by Abdul in session. User of these screens: Nahid (studio).

## Why

Nahid removes backgrounds by hand outside the portal because she never found the
"Remove backgrounds" button that has been live since 1 Oct (it only shows inside New
design and Edit design). She also has nowhere to file photos of custom rugs or sample
dispatches by customer and date. Photos are often shot at an angle and need basic
tone correction.

## What ships

Three new header tabs next to Library: **Custom Rugs**, **Sample Dispatch**,
**Background Removal**. On mobile the header collapses into a menu.

### 1. Photo editor (shared, new)

`src/components/PhotoEditor.tsx`, a modal opened by clicking any photo tile in
`PhotoPicker` and on the Background Removal page. Pure image maths lives in
`src/lib/photoEdit.ts` with no React in it.

Tools:

- **Fix skew (perspective).** Four draggable corner handles. Apply warps that
  quadrilateral to an upright rectangle (homography, bilinear sampling). Output
  aspect ratio is taken from the average of opposite side lengths. If the photo is
  already a cutout, handles start at corners estimated from the alpha mask;
  otherwise they start inset 5% from the image edges.
- **Straighten.** Slider, minus 15 to plus 15 degrees, with a grid overlay.
- **Crop.** Free rectangle.
- **Levels.** Black point, white point, midtones (gamma). **Auto** sets black and
  white points from the 0.5 and 99.5 luminance percentiles, ignoring transparent
  pixels.
- **Brightness, contrast, saturation, warmth.** Sliders, centred at zero.
- **Reset**, and **hold to compare** with the original.

Rules:

- Live preview runs on a downscaled copy (about 1000px). Apply renders once at full
  size, capped at 2000px on the long side, matching the rest of the app.
- Transparency is preserved end to end. Output is PNG when the image has alpha,
  otherwise JPEG at 0.92.
- The tile keeps its `original` file, so Undo restores it, same as background
  removal does today.
- Keyboard: Escape closes, Enter applies. Handles and sliders are focusable and
  labelled. Handles are at least 44px touch targets.

### 2. Background Removal page

Route `/background-removal`, `src/pages/BackgroundRemoval.tsx`. Drop photos, tiles
appear in the existing `PhotoPicker` grid with **Remove backgrounds**, the "Check
this" flag, per-tile undo, and click to open the editor. **Download** per tile and
**Download all** as a zip. Nothing is saved to Firestore or Storage. Keeps the
existing line "Runs on this computer. Nothing is sent anywhere."

### 3. Custom Rugs and Sample Dispatch

Routes `/custom-rugs` and `/sample-dispatch`, both rendering one component,
`src/pages/StudioEntries.tsx`, with a `kind` prop (`'custom-rug' | 'sample-dispatch'`).
Data functions in `src/lib/studioEntries.ts`.

- **List:** entries grouped by customer, newest date first, search by customer,
  thumbnail strip and photo count per entry. Empty, loading and error states.
- **New entry:** Customer (required), Date (required, defaults to today), optional
  Note, Photos (at least one) through `PhotoPicker`, so reorder, rotate, background
  removal and the editor all work before saving.
- **Open entry:** view photos large, add photos, remove photos, edit customer, date
  and note, download all photos.
- **Delete entry:** soft delete (`deleted: true`) after a confirm. No hard deletes,
  so the Firestore delete lock is never involved and Storage files are kept.

Customers: read active docs from the Orders app `buyers` collection (`name`,
`code`, `isActive`), read only. "+ Add new" appends to `config/studio_options`
field `customers` via the existing `options.ts` arrayUnion pattern. The dropdown
merges both lists, sorted, with type to filter.

Data:

| Kind | Firestore collection | Storage folder |
|---|---|---|
| custom-rug | `studio_custom_rugs` | `studio-portal/custom-rugs/{entryId}/` |
| sample-dispatch | `studio_sample_dispatches` | `studio-portal/sample-dispatches/{entryId}/` |

Document shape: `{ customerName, customerCode|null, date: 'YYYY-MM-DD', note,
photos: [{ url, path, name, width, height, uploadedAt }], createdBy, createdAt,
updatedAt, updatedBy, deleted: false }`.

Uploads use the same compression as library uploads (`browser-image-compression`,
2000px, 2 MB), but PNG cutouts must stay PNG with their alpha, and `contentType`
must match the bytes actually uploaded.

### 4. Navigation

- Header in `Library.tsx` becomes a shared `src/components/AppHeader.tsx` used by
  Library and the three new pages: Library, Custom Rugs, Sample Dispatch,
  Background Removal, My links, More, Sign out. Active tab is marked with
  `aria-current="page"`. Under `md` it collapses into a menu button.
- New pages are lazy loaded in `App.tsx` like every page except Library.
- In `More.tsx` the old entry is renamed **Dispatch photos (Orders app)**. That
  screen and the Orders app collection `sample_dispatches_to_buyers` are not touched.

### 5. Fix included

`rotatePhoto` in `productEdit.ts` re-encodes to JPEG with no fill, which turns a
transparent cutout black. Rotate must detect alpha and save PNG in that case.

## Out of scope

- Share links or PPTs built from entries.
- Any write to Orders app collections.
- A different background removal model. Quality is being tested separately on real
  photos; a model change would be its own decision.
- The older `compressImage` path used by the legacy dispatch, Sample Bazar and
  Kapetto screens.

## Verification

- Unit tests for `photoEdit.ts`: homography maps the four source corners to the
  rectangle corners; identity settings leave pixels unchanged; alpha survives levels
  and warp; auto levels ignores transparent pixels.
- `npm run build` and lint pass.
- Manual on the dev server at desktop and 390px width: create, reopen, edit and
  soft delete an entry in each tab; background removal then skew fix then levels
  then save, and the stored file is still a transparent PNG; rotate a cutout in the
  library and confirm no black background.
- Test entries use customer name `TEST` and are soft deleted afterwards.
- Nothing is pushed to `main`. Abdul reviews on the dev server first.

## Addendum, 22 Nov 2026: sidebar with tabs, every image format, autosave drafts

Three owner requests after the first release. Branch `feat/left-sidebar`.

**Sidebar with tabs.** `components/AppShell.tsx` replaces `AppHeader`. A fixed 220px
left sidebar from `md` (brand, the six pages, Sign out at the bottom); under `md` a slim
top bar and a drawer from the left (Escape, focus moved in and kept in, backdrop).
Each sidebar item opens as a tab in a strip above the content, like ERP Desk: an open
item focuses its tab, every opened page stays mounted and is hidden (`hidden`) when not
in front, so dropped photos, half-filled dialogs, searches, ticked trays and scroll
positions (each panel is its own scroll container) survive switching. Library cannot
be closed. The URL follows the active tab; refresh opens Library plus the tab in the
URL; back and forward switch tabs; nothing is stored in the browser. Dialog key
handlers are quiet in hidden tabs (`useTabActive`). Modals cover the sidebar and the
strip. Legacy routes (`/dispatches`, `/sample-bazar`, `/kapetto`, `/rug-gallery`,
`/upload/...`, `/admin/migrate`) stay plain full pages outside the shell.

**Every image format.** `lib/imageIntake.ts` `normaliseImage()` on every file added
through `PhotoPicker` or `PhotoDrop`: format by signature (`lib/imageFormat.ts`), out
as an upright full-resolution JPEG, or PNG with alpha. JPG, PNG, WebP, GIF (first
frame), BMP, AVIF natively; HEIC/HEIF via `heic-to` (LGPL-3.0, lazy); TIFF via
`utif2` (MIT, lazy); camera RAW via the embedded camera JPEG preview when it is at
least 1500px, else a clear per-file message. A file that cannot be opened never
stops the rest of the drop.

**Autosave drafts.** Cloud only (Firestore, ~1.5 s debounce, keepalive REST write on
pagehide and hidden tab, retry with backoff), the same approach as `saveSlideLayout`.
New entries become `status: 'draft'` docs in the same collections as soon as they
have content; Save entry sets `status: 'saved'`; Discard sets `deleted: true`. Photos
upload in the background per tile, with the pre-edit original kept (`originalUrl`,
`originalPath`). A Drafts group shows the signed-in user's own drafts. Saved entries
autosave edits. Background Removal keeps one draft per person in
`studio_bg_drafts/{uid}`, files under `studio-portal/bg-drafts/{uid}/`. Closing a tab
or the page while something is unsaved asks first. Not covered: Library New design
and Edit design.
