# EM Studio Portal - Photography Upload System

## Overview
Simple photography portal for the studio team at Eastern Mills. Upload photos for:
1. **Sample Dispatches** - Photos for buyer presentations (shows in Orders app)
2. **Sample Bazar** - Product thumbnails (shows across all apps)
3. **Rug Gallery** - Browse all showroom products and upload additional photos

## Deploy rule for this repo (owner, 27 Nov 2026)

Abdul, 27 Nov 2026: "yes push that. dont ask me. push whatever we build from now on for studi portal". So for this repo only, finished and tested work is pushed to `main` (live) without asking first. Still required: fetch and rebase, `npm test`, `npm run build`, no sign-in bypass in the commit, then check the deploy on the live site and report what went out. This does not cover deleting data, Firestore or Storage rule changes, or anything outside this repo.

## Links
- **Live URL:** https://em-studio-portal.netlify.app
- **GitHub:** https://github.com/aansari275/EM-studio-portal
- **Netlify:** https://app.netlify.com/projects/em-studio-portal
- **Site ID:** fec3a32b-60bc-4ad6-acab-2e915f5dafb3

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS
- TanStack Query
- Firebase Firestore & Storage
- Netlify hosting (continuous deployment from GitHub)

## How It Works

### For the Photographer:
1. Open https://em-studio-portal.netlify.app
2. See three tabs: **Sample Dispatches**, **Sample Bazar**, and **Rug Gallery**
3. Click on any dispatch marked "Pending"
4. Upload PPT file (optional, for entire dispatch)
5. See **product list** with status indicators (Pending/Done)
6. Click on a product → upload photos (Main photo required)
7. Back to list → see updated status
8. Done when all products have main photos!

### Rug Gallery:
1. Click **Rug Gallery** tab on dashboard
2. Browse all designs from Showroom_Products
3. Search by design name, materials, or construction
4. Click a design → see all color variants and photos
5. Upload additional photos directly to `empl_designs` collection

### Photo Types
| Type | Required | Purpose |
|------|----------|---------|
| Main Photo | ✅ Yes | Primary product image |
| Detail Shot | No | Close-up of texture/pattern |
| Lifestyle | No | Styled/room setting |
| Close-up | No | Material/weave detail |

## What the product data actually contains — read before building any filter

Measured 2026-09-25 over a 1,500-2,000 product sample of `showroom_products`.
The TypeScript interface promises far more than the data delivers.

| Field | Actually filled |
|---|---|
| `styleNumber`, `source`, `createdAt` | 100% |
| `baseStyleNumber`, `displayName`, `firebaseUrl`, `category` | 99.9% |
| `additionalImages` | 88.9% |
| `color` | 8.9%, and the values are `V1`, `V2`, `B`, `OPT-1` — variant codes, not colours |
| **`construction`** | **0%** |
| **`materials`** | **0%** |
| `gsm`, `size`, `tags` | ~0.1% |

`category` is filled on 99.9% of products and reads `Area Rug` on every single
one, so it is useless as a filter.

The first version of the library shipped with Hand Knotted / Hand Tufted / Silk
/ Wool filters built from the interface. None of them could ever match. Filters
now derive the **year** from the style number (`EM-23-MA-6255` → 2023), which is
the only fact the data reliably carries, and only years actually present in the
loaded set are offered.

### The hero image is wrong on ~68% of products

`products_migration` set `firebaseUrl` to a numbered detail frame
(`image-2.jpg`, `image-10.jpg`) and pushed the file actually named `main.jpg`
into `additionalImages`. Over a 2,000-product sample:

- 8.3% — hero already is `main.*`
- **68.5% — `main.*` buried in `additionalImages`, hero is a close-up**
- 23.1% — no `main.*` anywhere

The visible symptom was a PPT slide leading with a corner close-up while the
full rug sat in a small thumbnail slot.

**Fixed in code, deliberately not in the data.** `heroImage()` / `orderedImages()`
in `src/lib/img.ts` prefer `main.*` and fall back to the old behaviour. A bulk
rewrite of 9,600 documents is not reversible and other apps read this
collection. If the data is ever corrected at source, these helpers become
no-ops rather than needing removal.

Anything that picks a product photo must go through `heroImage()`. Four places
do: the library card, the detail dialog, `catalogs.ts` (buyer links) and
`pptGenerator.ts`.

### Images are full studio originals

3500-4000px, 0.6-11 MB each. A six-rug buyer link was 19.2 MB before
thumbnails. `thumb()` routes through Netlify Image CDN (`/.netlify/images`),
which needs `[images] remote_images` in `netlify.toml` and only exists on the
deployed site — dev serves originals. Measured: 2.4 MB → 163 KB, a 93% cut.

### getShowroomProductsByDesign is broken

It pulls the 50 newest products and filters in memory, so any design outside
that window returns nothing. Use `getDesignVariants()` instead, which queries
by `baseStyleNumber`. The old function is left alone because RugGallery uses it.

## Security: this project's Firestore and Storage are wide open

As of 2026-09-25 both rulesets are literally:

```
allow read, write: if true;
```

Anyone who knows the project id (`easternmillscom`, which is in
`src/lib/firebase.ts`) can read `costings` including `profitINR`, and can write
or delete any document. Verified from an unauthenticated shell.

**Not fixed, on purpose.** Every Eastern Mills app currently depends on open
rules, so a global lockdown breaks all of them at once. Suggested order when it
is tackled: make the repos private, close writes before reads, then reads
collection by collection starting with `costings` (the MCP reads it through a
service account, which bypasses rules, so little should break).

## Firebase Collections
- **`sample_dispatches_to_buyers`** - Dispatch documents with photos array
- **`sample_bazar`** - Product documents with two photo fields:
  - `images` - Raw factory photos (frontPhoto, backWithRuler, etc.)
  - `studioImages` - Professional studio photos array (uploaded via this portal)
- **`showroom_products`** - Main product gallery (9,600+ products)
  - `styleNumber`: Full product ID (e.g., "EM-17-AM-418-GREY-YELLOW")
  - `baseStyleNumber`: Design identifier (e.g., "EM-17-AM-418")
  - `displayName`: Human-readable name
  - `firebaseUrl`: Main image URL
  - `additionalImages`: Array of additional photo URLs
  - `color`, `materials`, `construction`, `category`, `size`
  - `source`: "Heimtextil 2026" for tagged products
  - `tags`: ["Heimtextil 2026"] for filtering
- **`empl_designs`** - Master design library for additional uploaded photos
  - `designName`: Unique key (matches `baseStyleNumber`)
  - `photos`: Array of { url, type, uploadedAt }
  - `linkedShowroomProducts`: Array of styleNumbers

### Heimtextil 2026 Products
- 328 products tagged with `source: "Heimtextil 2026"`
- Display "HT26" badge in Rug Gallery
- Migrated from `heimtextil_products` collection (now deleted)

Photos are stored in Firebase Storage:
- Dispatches: `studio-photos/dispatches/{dispatchId}/{filename}`
- Sample Bazar (studio): `sample-bazar/{productId}/studio/{filename}`
- Sample Bazar (factory): `sample-bazar/{productId}/{filename}`
- EMPL Designs: `empl-designs/{designName}/{filename}`
- Showroom: `showroom/` and `heimtextil/` folders

### Sample Bazar Image Architecture

Studio Portal writes professional photos to `studioImages[]` array (NOT the old `images` object):

```typescript
// What Studio Portal writes to:
studioImages: [
  {
    url: string;           // Firebase Storage URL
    uploadedAt: string;    // ISO timestamp
    uploadedBy: "Studio Team";
    type: "main" | "gallery" | "detail" | "lifestyle";
  }
]

// What factory team writes to (via Sample Bazar app):
images: {
  rugPhoto?: string;
  frontPhoto?: string;
  backWithRuler?: string;
  // etc.
}
```

**Key Functions in `firebase.ts`:**
- `uploadSampleBazarStudioPhoto(productId, file, photoType)` - Uploads to `studioImages[]`
- `getSampleBazarNeedingStudioPhotos()` - Lists items without studio photos

## Project Structure
```
src/
├── pages/
│   ├── StudioDashboard.tsx   # Main page with three tabs
│   ├── UploadPhotos.tsx      # Photo upload interface
│   ├── RugGallery.tsx        # Rug Gallery grid + detail views
│   └── AdminMigrate.tsx      # Admin migration tools
├── lib/
│   ├── firebase.ts           # Firebase operations
│   ├── utils.ts              # Utilities (image compression, etc.)
│   └── pptGenerator.ts       # PPT generation for product exports
├── App.tsx                   # Routes
└── main.tsx                  # Entry point

scripts/
├── migrate-heimtextil.mjs    # Migration script (heimtextil → showroom)
├── tag-heimtextil.mjs        # Tag products with Heimtextil 2026
└── delete-heimtextil-collection.mjs  # Cleanup script
```

## Development
```bash
npm install
npm run dev      # Port 3001
npm run build
```

## Deployment
Continuous deployment from GitHub - just push to `main`:
```bash
git add . && git commit -m "message" && git push
```

Manual deploy (if needed):
```bash
netlify deploy --prod
```

## Routes
| Path | Purpose |
|------|---------|
| `/` | Dashboard with Sample Dispatches, Sample Bazar & Rug Gallery tabs |
| `/upload/dispatch/:id` | Upload photos for a dispatch |
| `/upload/sample-bazar/:id` | Upload photos for a Sample Bazar product |
| `/rug-gallery` | Browse all designs from showroom_products |
| `/rug-gallery/:designName` | View design details, color variants, and upload photos |
| `/admin/migrate` | Admin page for data migrations (internal use) |

## Features
- Mobile-friendly design (works great on phones)
- Camera capture support (can take photos directly)
- Auto image compression (max 1920px width)
- Shows pending vs completed items clearly
- Photos update instantly after upload
- **Product list view** for multi-product dispatches
- Status indicators (Pending/Done) with photo counts
- PPT upload support for dispatches
- Reference photos from dispatch visible during upload

### Rug Gallery Features
- Grid view of 9,600+ products with infinite scroll
- Search by design name, color, materials, or construction
- Detail view with all color variants
- Combined photos from showroom_products + uploaded photos
- Upload additional photos (saved to `empl_designs` collection)
- Lightbox for full-size image viewing
- Design details panel (construction, materials, category, size, GSM)
- Select mode for multi-product PPT generation
- "HT26" badge for Heimtextil 2026 products

### PPT Generation
- **Intro slide**: New Eastern logo (transparent background)
- **Product slides**: Logo icon in corner, product image, details table (GSM included)
- **Outro slides**: 3 slides matching EMPL template (gallery, factory info, closing)
- Assets stored in `public/ppt-assets/`

## PPT photo sizing and the 25 MB check (2 Oct 2026)

- **Library uploads are compressed** (`addProductPhotos`: `browser-image-compression`, 2000px, 2 MB), so the stored files are not the studio originals. (This line used to say nothing was compressed; that stopped being true.) Each deck fetches its own copies through the Netlify Image CDN (`src/lib/deckImages.ts`), sized **per slot** at 300 pixels per inch (`deckPhotoSlots` in `pptGenerator.ts`), with `fit=contain` so the whole rug is kept.
- Measured on real products: 6 rugs with all 101 photos was **65 MB** at a flat 1600px, **19.6 MB** per slot. 24 rugs on grid slides 5.3 MB. 3 rugs, 4 photos 5.1 MB (was 67 MB with originals).
- **`em-logo-icon.png` was 6300px, 312 KB, and pptxgenjs embeds it once per slide**: 6.5 MB of a 26 MB deck. Cut to 800x300, 7 KB. Keep every asset that goes on every slide small.
- Photos are fitted inside their slot from their real pixel size, no stretching. The house slot positions are unchanged.
- `PptDialog` builds the deck in memory first. Over 25 MB it offers an email-friendly copy, stepping down 220/180/144/110 ppi until it fits.
- Layouts: one rug per slide (optionally with photos past the fourth on 8-up slides after it), or eight rugs per slide (colourway grid from slides 7-9 of the Zara deck, caption = colour + size, falling back to style no.).
- Some stored `.jpg` files are really HTML (e.g. `products/EM-206/image-5.jpg`). They are skipped and the slot stays empty, the deck still builds.
- The server-side generator still calls `buildPptx(products, title)` with no options, so it keeps the old URL behaviour.

## Edit, delete and the 403 Heimtextil photos (4 Nov 2026)

- **Heimtextil photos were blank.** Those `showroom_products` docs store `imageUrl` / `additionalImageUrls` as public `storage.googleapis.com/<bucket>/heimtextil/...` links, and those objects are not public: 403. The same path loads through the Firebase endpoint. `fixStorageUrl()` in `src/lib/img.ts` rewrites on read: in `mapShowroomData`, inside `thumb()` (so old frozen buyer links heal) and in the deck loader. Data untouched.
- **Edit design** (`components/EditProduct.tsx`, `lib/productEdit.ts`): number, specs, photos (remove, make main, add). Works on `showroom_products` and on archive `em_products` (`em:` ids; construction is stored in `category` there). The doc id never changes. Removed photos are unlinked, files stay in Storage. Saving sets `heroPinned: true` so `heroImage()` trusts `firebaseUrl` over any `main.*`.
- **Delete is soft**: `deletedAt` + `deletedBy`, Undo toast restores. Filtered in `library.ts` `dedupe()`, in `netlify/functions/search.mts` and (22 Nov 2026) in the MCP connector (`netlify/lib/em.mts`: dropped before the archive/showroom dedupe, like `library.ts`; `get_product` on a deleted style says so; `create_catalog` and `build_ppt` name the styles they left out). Firestore delete rules were not touched. The server-side `build_deck.py` (outside this repo) still does not filter it, but the connector no longer queues deleted styles.

## Colourways (5 Nov 2026)

- A colourway is its own `showroom_products` doc: `styleNumber` = design + colour slug (`EM-17-AM-418` + "Grey Yellow" -> `EM-17-AM-418-GREY-YELLOW`, `variantStyleNumber()` in `firebase.ts`), `baseStyleNumber` set explicitly to the design, `color` = the name she typed, `displayName` = `<design> · <colour>`. Same shape as the older showroom variants, so `getLibraryVariants()` groups it with no other change.
- UI says **colourway**, never "variant" (Abdul's wording). Detail panel: big dashed **Add colourway** card, then colourway photo tiles (click opens, tick adds to selection). `NewProduct` takes `variantOf` for this mode; typing an existing number in New design offers "Add a colourway to it".
- **Duplicates are allowed** (Abdul, 5 Nov 2026), both style numbers and colourways. The form only warns. The first record keeps the plain slug as its doc id, later ones get `<slug>--2`, `--3` (styleSlug never emits `--`, so no clash with a real number). `addProductPhotos` files photos under the **doc id**, not the style slug, so a duplicate never overwrites the first record's `main.jpg`.
- `library.ts` `dedupe()` / `joinPages()` keep every showroom record (by id) and only drop an archive copy of a style+colour the showroom already has. Before this, a duplicate was silently hidden from the grid.

## Photo order and the slot diagram (5 Nov 2026)

- **Reorder in the preview** (`components/PhotoOrder.tsx`): drag a thumbnail onto another, or right-click for Make main / Make 2nd... Saves at once via `reorderPhotos()` in `productEdit.ts` (sets `heroPinned: true`, also on `em_products`, which `mapEm` now reads).
- **Slot geometry lives in `lib/deckSlots.ts`**, shared by `pptGenerator.ts` and the diagram (`components/SlidePreview.tsx`). `PHOTO_SLOTS` is photo 1..4 in order; to move a number, reorder that list. Numbering per Abdul's reference slide: 1 left tall, 2 bottom middle, 3 top wide, 4 bottom right (before this, 2 was the top slot). Box sizes unchanged (Zara house deck). `SLOT_HINTS` are the shot names shown to the studio.
- Local `vite dev` freezes the tab on the library grid: `thumb()` serves 3500-4000px originals in dev. Verify on the deployed site.

## Removing and turning photos

- **Red cross on a thumbnail** (or "Remove photo" in the right-click menu) takes a photo
  off the design via `reorderPhotos` with a shorter list. The Storage file is kept, and
  "Photo removed. Undo" restores the old list.
- **Rotate** (`rotatePhoto` in `productEdit.ts`, `useRotate` in `components/Rotate.tsx`):
  ↻ on each grid card (main photo), ↻ on the big photo in the preview (the photo being
  viewed), and "Rotate main photo" in the tray for every ticked design. The pixels are
  turned in a canvas and saved as a NEW file `<name>-r<timestamp>.jpg` in the same folder,
  then the record points at it, so decks, buyer links and other apps need no change and
  the old file stays. Clicks within 0.9 s are batched into one save.

## Per-record slide layout (11 Nov 2026)

- In the preview's "On the deck slide" diagram each photo box can be dragged (move), pulled by a corner (resize), nudged with arrow keys (Shift = 0.5in, corners are focusable handles), trimmed with "Fit box N to its photo" (or double-click), and put back with "Reset to default layout".
- Saved on **that record only** as `slideLayout` `{ v: 1, slots: [{x,y,w,h}] x4, updatedAt, updatedBy }`, fractions of the slide. A colourway is its own record, so it gets its own layout; there is no fallback from colourway to design (the boxes are tuned to that record's photo shapes, and a fallback would silently change colourway decks). No field = `PHOTO_SLOTS`, so untouched records export exactly as before (verified: identical slide XML and media).
- One geometry path: `photoSlotsFor()` and `fitContain()` in `deckSlots.ts`, used by `SlidePreview.tsx` and `pptGenerator.ts`. Photos are contained (whole, centred) in both. `constrainBox()` keeps boxes on the slide, at least 0.6in, and out of `RESERVED` (logo + spec text, top right). Overlap between photo boxes is allowed; stacking order is photo 1..4 in both.
- Writes go through `productEdit.ts` (`saveSlideLayout`, same doc as the other edits, only the `slideLayout` field, top-level `updatedAt` untouched). 1.5 s debounce. On pagehide / hidden tab, `saveSlideLayoutOnExit` PATCHes the Firestore REST API with `keepalive` and the user's ID token, because an SDK write is dropped when the page unloads (measured).
- `PptDialog` re-reads each rug's `slideLayout` before building (`withFreshSlideLayouts`), because tray copies are snapshots. The grid deck, buyer links (`/c/<id>`, hero only) and the server-side `build_deck.py` (outside this repo) do not use the slide layout.

## Custom Rugs, Sample Dispatch, Background Removal, photo editor (21 Nov 2026)

Spec: `docs/superpowers/specs/2026-11-21-custom-rugs-dispatch-bg-editor-design.md`.

- **Sidebar and tabs** (`components/AppShell.tsx`, 22 Nov 2026; replaced `AppHeader`): fixed 220px left sidebar from `md` (brand, Library, Custom Rugs, Sample Dispatch, Background Removal, My links, More, Sign out at the bottom); under `md` a slim top bar whose menu opens the same list as a drawer (Escape, focus trap, backdrop). Each item opens as a tab in a strip above the content, like ERP Desk: an open item focuses its tab, every tab stays mounted and is only `hidden`, so its state survives switching; each panel is its own scroll container and its scrollTop is restored. Library cannot be closed. URL follows the active tab (refresh opens Library plus that tab only, nothing in storage). `App.tsx` renders the shell outside `<Routes>` for the six tab paths; legacy routes (`/dispatches`, `/sample-bazar`, `/kapetto`, `/rug-gallery`, `/upload/...`, `/admin/migrate`, reached from More) are plain full pages outside it. `lib/tabContext.ts`: `useTabActive()` gates window key handlers in dialogs of hidden tabs; `useTabGuard(message)` makes closing a tab ask first (in-page dialog).
- **Photo editor** (`components/PhotoEditor.tsx`, UI only; maths in `lib/photoEdit.ts`, pure, unit tested with `npm test`; canvas glue in `lib/canvasImage.ts`). Opens from any `PhotoPicker` tile. Touch up (cutouts, see Touch up brush below), fix skew (homography + bilinear on premultiplied alpha), straighten, crop, levels with Auto, brightness, contrast, saturation, warmth. All geometry is one output-to-source matrix, so every pixel is sampled once. Preview ~1000px, Apply up to 2000px, PNG if any pixel is transparent, else JPEG 0.92. The tile keeps `original`, so undo restores it.
- **Background Removal** (`/background-removal`): processing runs in the browser; the photos are kept as one draft per person (`lib/bgDraft.ts`: `studio_bg_drafts/{uid}` with `photos: [{ name, url, path, originalUrl, originalPath, cut, updatedAt }]`, files uncompressed under `studio-portal/bg-drafts/{uid}/`), restored on open. Clear all (in-page confirm) empties the list; files stay. Per tile download and a zip (`lib/download.ts`, `fflate`, lazy).
- **Autosave drafts** (22 Nov 2026, cloud only, never browser storage): `lib/autosave.ts` (`createAutosaver`: ~1.5 s debounce, coalescing, retry 2/5/15/30 s, `flush`, `flushOnExit`; unit tested with fake timers), `lib/useAutosave.ts` (JSON compare, baseline for opened drafts, keepalive REST write on pagehide and hidden tab via `lib/exitSave.ts`, flush on unmount), `lib/usePhotoSync.ts` (tiles upload as they are added and after every cutout/edit/undo, 3 at a time; a tile is uploaded when `remoteFor === file`, the original likewise, so Undo works after a reload). New entry: nothing is written until customer, note or a photo exists, then the doc is created in the same collection with `status: 'draft'`, `createdBy`, `createdByUid`. No `status` = saved. Save entry = `promoteEntry` (status saved). Discard = `deleted: true`. Drafts group on top of the list shows only the signed-in user's drafts (filtered in memory; listing is still one equality filter). Saved entries autosave details (when customer and date are set) and added/removed photos. `SaveStatus` shows Saving / Saved hh:mm / Could not save. Retrying (`aria-live`). While anything is unsaved or uploading, closing the tab (strip) and the browser page (`beforeunload`) ask first (`useUnsavedWork` in `lib/tabContext.ts`). In-page confirms: `components/ConfirmDialog.tsx`. Library New design / Edit design are NOT autosaved.
- **Custom Rugs / Sample Dispatch** (`/custom-rugs`, `/sample-dispatch`, one page `pages/StudioEntries.tsx`): collections `studio_custom_rugs` / `studio_sample_dispatches`, files under `studio-portal/custom-rugs|sample-dispatches/{entryId}/`. All calls in `lib/studioEntries.ts`. Soft delete only (`deleted: true`). Listing uses one equality filter (`deleted == false`) and sorts in memory, so no composite index. Customers = Orders app `buyers` (read only; only an explicit `isActive: false` hides one) plus `config/studio_options.customers`. Not related to the Orders app `sample_dispatches_to_buyers`, which More now labels Dispatch photos (Orders app).
- **Photo intake, every format** (22 Nov 2026): every file added through `PhotoPicker` (Background Removal, Custom Rugs, Sample Dispatch, New design, Edit design) or `PhotoDrop` goes through `normaliseImage()` in `lib/imageIntake.ts` first, and comes out as an upright full-resolution JPEG, or PNG when it has transparency. Format is detected by signature (`lib/imageFormat.ts`, unit tested), never by extension or MIME. JPG/PNG pass through (a JPG turned by EXIF is redrawn upright); WebP, GIF (first frame), BMP, AVIF via the browser; HEIC/HEIF via the browser if it can, else `heic-to` (libheif wasm, **LGPL-3.0**, ~3.2 MB, lazy); TIFF via `utif2` (MIT, lazy); camera RAW = the embedded camera JPEG preview if one is at least 1500px (orientation from the RAW's TIFF header), no RAW development. Anything else becomes a red tile "Could not open <name>" plus the full message under the grid; the rest of the drop still loads. Tiles convert two at a time with an "Opening..." state. Slots now have an `id` and updates go through functional setState (`lib/photoSlots.ts`), because conversions and cutouts finish at different times. Background removal errors now show on the tile and under the grid. Legacy uploaders (`UploadPhotos`, `RugGallery`, `KapettoKitUpload`) are not on this path.
- **Fix skew proportions, Size step, resolution** (22 Nov 2026, spec addendum 2): the skew rectangle's shape comes from `estimateAspect()` (Zhang and He; focal length from vanishing points, else EXIF `jpegFocal35`, else a 28mm guess), only trustworthy on the camera's own frame (`Slot.cutOfOriginal` marks a cutout of the photo as it came in). Size step (`components/PhotoEditorSize.tsx`, `lib/rugSize.ts`): `stretch` {x,y} and `shape` (rug size, exact) in the edit settings, after straighten, before crop. Apply samples the full-resolution original for a cutout of it (mask via `takeAlpha` + `decontaminate`), working copy up to 6000px, supersampled; DSC04675 5x8 now 1250x2000 (was 1366x1195).
- **Send to** (Background Removal, 22 Nov 2026): tick tiles, Send to Custom Rugs / Sample Dispatch (new or her entry) or Library (new design, or existing via the library search). In-memory hand-over in `lib/sendTo.ts` (`deliver`, `useDeliveries`); entries get pre-uploaded tiles (`EntryDialog` `incoming`/`presetId`), or `appendEntryPhotos` / `createDraftWithPhotos` when another entry is open. Existing design goes through `appendDesignPhotos` (`lib/designAppend.ts`, same upload + `updateProduct` as Edit design; real calls in `lib/designIO.ts`, which a test page can stub). Remove after sending defaults on; otherwise the tile shows "Sent to ...".
- **Cutout clean-up** (22 Nov 2026): `lib/maskRefine.ts` (pure, tested; `maskRefine.worker.ts`): crop re-run unless the rug runs into the frame edge, colour guided filter, edge colour fix. `cutoutWarning()` drives Check this (edge of frame, see-through, kept share). About 5.8 s per photo on a build (was 2.3 s).
- **Rotate keeps transparency**: `rotatePhoto` saves PNG when the turned image has alpha (it used to save a black-backed JPEG).
- **Background removal does not work under `vite dev`**: onnxruntime-web's wasm is answered with index.html (MIME error). It works in a production build (`vite build && vite preview`) and on the live site. Pre-existing, unrelated to the editor.

## Tone Auto, Size fields, Send to timing (22 Nov 2026)

- **Tone Auto corrects the photo, not the rug** (`autoTone`, `paperReference` in `lib/photoEdit.ts`, tested). The old Auto stretched the rug's own 0.5/99.5 percentiles to full range and turned the dark brown DSC04675 orange-tan. Now, on a cutout with its original (`full`), the white paper floor the cutout removed is the reference: background pixels away from the rug edge, near-grey, unclipped, not dark; per-channel median of the brightest third. Warmth and Tint make it neutral, the white point puts it at 238, black 0, midtones 1, so the rug gets one global gain. Guards: floor lum >= 120 and cast <= 1.15, at least 2% of the frame; gain <= 1.7; never darkens; eased off before the rug's top 0.5% passes 250. No usable floor: white >= 230, black <= 8, no midtone or hue change. One line under Levels says which ("Balanced against the white floor." / "Small correction only. ...").
- **Warmth and the new Tint are gains before levels** (`wbGains`, 0.2 stop at 100), not the old additive offset, so a dark colour moves in proportion and shadows keep their hue. Edit settings are not stored, so no saved data changed.
- Real photos, production build: DSC04675 and DSC04668 (dark brown on bright paper) Auto barely moves them (white 255, warmth 9 / 3); DSC04648 and DSC04664 (pale, floor at 149 / 133, underexposed) get white 165 / 150 (the 1.7 cap), warmth 23 / 16.
- **Size step**: the Rug size fields are derived from the shape (`reconcileSize`, `activePreset` in `lib/rugSize.ts`, tested): moving Width or Length, Auto or Reset clears a filled-in size and unmarks the preset (`aria-pressed`); picking a size re-applies it. The fields live in `PhotoEditor`, so switching tools keeps them.
- **Send to was slow because of compression, not bytes**: `uploadEntryPhoto` ran `browser-image-compression` (2000px, 2 MB) on PNG cutouts; PNG has no quality setting, so the library shrank the dimensions step by step (17.2 s on the DSC04675 cutout, stored at 1714px). Fixed 23 Nov 2026, see the next section.

## PNG cutouts: 3 MB cap, and no silent waits (23 Nov 2026)

- **Rule** (owner): a PNG cutout is stored at 3 MB and 2000px long side at most. Within both = the bytes go up untouched (size read from the PNG header, no decode). Over = one resize to `sqrt(3 MB x 0.9 / size)` (or the 2000px scale, whichever is smaller) in a worker (`lib/pngFit.worker.ts`, `createImageBitmap` resize quality high, OffscreenCanvas, PNG, alpha kept), then at most two corrective passes from the source (margins 0.85, 0.7). Never an open loop. Stored width/height = the uploaded bytes. Pure decision in `lib/cutoutSize.ts` (`planPngFit`, `nextPngPass`, `pngSize`, unit tested); pixels and Storage progress in `lib/uploadPrep.ts` (`prepareUpload`, `fitPng`, `uploadWithProgress` via `uploadBytesResumable`). In this portal a PNG is always a transparent one (photo intake), so the rule keys on PNG.
- **Where it applies**: `uploadEntryPhoto` (Custom Rugs / Sample Dispatch tiles and Send to entries), `uploadEditPhotos` (Edit design, Send to existing design) and `addProductPhotos` (New design, Library drop). JPEG on all three is unchanged (`browser-image-compression`, 2000px, 2 MB). The original kept beside a cutout is the camera JPEG, so it stays on the JPEG path. `bgDraft` uploads were never compressed (only progress added). The legacy `compressImage` path (dispatches, Sample Bazar, Kapetto) is untouched.
- **Measured** (production build, no-auth harness, DSC04675 / DSC04668 / DSC04648 and 8 more, all cut out at 2000px): every real 2000px cutout came out 0.46 to 2.74 MB, so all go up as they are, 2000x1334. DSC04675 cutout 2.7 MB: old path 35.9 s (stored 1714x1142, 1.8 MB), new 9.5 s and 7.5 s (all of it upload, stored 2000x1334, byte identical). Cut out at 3000px to force the resize: DSC04675 6.0 MB, old 33.3 s (1714x1142), new 7.3 s (resize 1.0 s, one pass, 2000x1334, 2.6 MB); DSC04668 4.5 MB, old 21.0 s (1900x1267), new 6.6 s (0.9 s resize, 2000x1334, 1.9 MB). The byte-driven resize (over 3 MB within 2000px) is covered by unit tests only; no real photo produced one.
- **No silent waits** (owner, acceptance test): every wait over about a second shows a moving indicator and words. `components/Working.tsx` (spinner, label, "Photo 2 of 5", progress bar when known, "Still working, large photo" after 20 s per step, seconds counter under reduced motion, no spinner on Waiting); words in `lib/jobStatus.ts` (tested). Tiles carry `Slot.job` (display only). One `aria-live` summary under the grid (no percentages). Steps: intake Waiting / Opening; Remove backgrounds Loading the background tool (first time only) / Finding the rug / Sharpening the edge / Cleaning up the edge / Saving the cutout (a frame is yielded before each); upload Reducing file size / Uploading NN% with "5.7 MB to 2.6 MB" / Original: ... ; Send to also Getting ready / Fetching from your draft / Saving to the design. Edit design and New design buttons say "Photo 2 of 5: Uploading 40%". Editor Apply: spinner plus "Applying at full size". Zip and Opening your draft: spinner.
- **Known gap**: the u2netp model runs on the main thread (onnxruntime-web wasm, `numThreads = 1`, no proxy), so during Finding the rug / Sharpening the edge the page does not repaint; the spinner is a CSS transform, so Chrome should keep it turning on the compositor (not verified: screenshots time out while the model runs), but the seconds counter and the 20 s line only update between steps. Editor Apply and the zip are main thread too. Moving the model to a worker (`ort.env.wasm.proxy`) is the fix, not done.

## Remove background in the Library preview (23 Nov 2026)

- **Where**: the round Eraser button under the rotate button on the big photo in the product preview (both 44px, `ROUND_BUTTON` in `lib/useCutout.ts`). Logic `lib/useCutout.ts`, UI `components/PhotoCutout.tsx`, pure rules `lib/photoOriginals.ts` (tested).
- **Run**: fetches the stored file of the photo shown (the best copy there is, `fixStorageUrl`), `normaliseImage`, then `removeBackground(file, 2000)` exactly as Background Removal (model, crop re-run, clean up). Status over the photo via `Working` with the `CUT_LABEL` steps ("Getting the photo" first). Rotate and remove are disabled while it runs. The cutout shows on a checkerboard with **Keep** / **Undo**; `cutoutWarning()` text shows in that bar. Nothing is written before Keep. Switching photo, closing or Escape drops the result (generation counter); nothing to undo.
- **Keep** (`keepCutoutPhoto` in `productEdit.ts`): reads the record fresh, uploads the PNG with `uploadEditPhotos` (3 MB PNG rule), then ONE write through `reorderPhotos` (photo list + `heroPinned` + `photoOriginals`), the same photos-only write a turn uses. Not `updateProduct`: it re-derives `baseStyleNumber` from the style number, which would regroup a colourway whose design number is not four-part. Same position, so main stays main. A Keep or Restore already sent finishes even if the dialog is closed (one upload, then one write; `onChanged` in Library only updates a preview still open on that record).
- **`photoOriginals`** (new field, `showroom_products` and `em_products`): `[{ url, originalUrl, at, by }]`, url = the cutout now in the list, originalUrl = the photo it replaced. Both files stay in Storage. A cutout of a cutout points at the first original. Entries are not pruned when a photo is removed, so "Photo removed. Undo" keeps restore working. `rotatePhoto` carries the entry to the turned file. Read by `mapShowroomData` / `mapEm` (`parsePhotoOriginals`).
- **Restore original**: when the photo shown has an entry, the button is Undo2 "Restore original": puts `originalUrl` back in the same position and drops the entry (cutout file stays). A cutout made elsewhere (no entry) shows Remove background; running it again is harmless and records that cutout as the original.
- **PNG consumers**: Library card, preview, thumbnails, slide preview: white behind (`thumb()` webp keeps alpha). Buyer link `/c/:id`: webp keeps alpha; img now `bg-white` (tile was grey). **Client deck**: the Netlify Image CDN with `fm=jpg` turns transparency BLACK (measured), so `deckImages.ts` fetches `.png` files as `fm=png` and flattens on white itself; verified slide media corner 255,255,255. MCP connector: only passes URLs. `build_deck.py` (outside the repo, connector decks): not checked; if it converts RGBA to RGB without a white matte, cutouts will be black there.
- **Measured** (production build, no-auth harness, test design EM-TEST-REMOVEBG, soft deleted after): DSC04675 first run 13.7 s (fetch 1.7 s, model load ~0.7 s, model 5.3 s, crop re-run 2.9 s, refine 2.8 s), second photo 10.2 s; Keep 10.8 to 18.5 s (2.1 MB PNG, all upload); Restore 1.8 to 5.9 s.
- **Fringes are lost**: on a simulated fringed rug on a pale blue floor (synthetic image, real rug texture, drawn tassels) the model cut the fringe off completely on one end and kept about 6% on the other, with no Check this warning. Confirmed on real photos 23 Nov 2026, see the next section.

## Cutout holes, unsure masks, fringes (23 Nov 2026, branch fix/cutout-holes-fringe)

Owner report: EM-26-MA-10456 (red and white flat weave, white fringes, pale blue floor) came out with a see-through hole in a band near the top and both fringes gone, and no Check this.

- **Cause of the hole**: the model itself. u2netp gives the grey and red band near the top only 0.2 to 0.5 on both passes (whole photo and crop re-run); the guided filter's re-steepen then makes it clear. Not the filter, not the decontamination.
- **Fix, a rug is one solid object** (`lib/maskFill.ts`, `fillInterior`, pure, tested with synthetic hole, weak patch, bay, sure-floor pocket, U shape, two rugs, frame strip): outside = flood from the frame border through mask < 128; anything not reached is the rug, its see-through pixels become 255, and rug pixels 12px (at 2000px) or more from the outside become 255 (weak patches); the soft rim is left for the filter. **Bays** (soft dent reached through a thin channel): channels narrower than 2 x 20px (at 2000px) are closed by an opening of the outside from the border; a cut-off pocket is filled only if it does not touch the frame, the model's mean there is at least 48/255 (unsure, not sure floor), 95% of it lies inside the convex outline of the rug, and it is at least 20 x 20px. A real concave shape has a wide mouth and sure floor, so it fails twice. Runs in the worker in `finishCutout`: fill (with bays) on the model mask, guided filter, fill again (holes only), alpha, decontaminate. Filled pixels are 255, so the edge colour step never recolours them: they keep the photo's own colours (tested).
- **Crop re-run guard** (`rerunKeepsRug`): EM-26-MA-10458 (lilac, mustard, black, white floor) lost its whole top half on live (kept 28% of the frame): the first pass was grey (unsure) up there, the re-run on the crop called it floor. Now if the re-run keeps under 85% of what the first pass kept (over 128), the first pass is used. 10458 now keeps 68% (most of the rug; the top lilac band is still partly lost, see below).
- **Check this**, two new reasons in `cutoutWarning()`: "The tool was unsure about parts of the rug. Check the cutout." when 15% or more of the model mask (over 64) is between 64 and 192 on either pass (`unsureShare`; measured 1.4 to 5.1 on 10 good photos, 42.6 on 10458's first pass in the browser), and "Part of the rug was see through and has been filled in. Check it." when 0.5% or more of the rug was filled (`filledPct`, first pass holes and weak plus second pass holes; 10456 4.8, plain test rugs 0 to 0.4; DSC04671 2.5 but it already says touches the edge). Order: little kept, almost all kept, unsure, touches edge, filled, see-through.
- **Measured** (production build, no-auth harness, 11 photos): 10456 hole gone, warning shown; 10458 68% kept (was 28%), warning shown; 273 and 8 plain Nahid photos unchanged except interior pixels that were wrongly see-through (DSC04664 label, DSC04671 top left, DSC04659 top edge), none lowered. Speed: clean-up step about 0.55 s slower (2.4 s to 2.95 s on a busy Intel i9; whole photo about 9 s on that run, both builds measured back to back).
- **Fringes: NOT fixed.** Tried and rejected (contact sheets in the session scratchpad, not in the repo): (1) extend the mask where pixels differ from the floor colour (chroma and darkness against a local floor estimate): 10456's cream heading band and fringes are within about 10 levels of the pale blue floor, so they come back faint or not at all; adding a texture score brings them back as ghostly strands but also grabs boards and torn paper beside DSC04668 / DSC04675 and draws a pale ring round the rug. (2) A zoomed second pass on each end: u2netp kept 10456's bottom fringe well and the top one not at all; not reliable. (3) Bigger models, all licence clean, run through the same pipeline: u2net (Apache 2.0; int8 44 MB, about 3.0 s per run in the browser; fp32 176 MB, 5 s), ISNet general use (Apache 2.0 from the DIS repo via rembg; the onnx-community copy is tagged AGPL, do not use it; int8 46 MB, 8 s at 1024), silueta (rembg, 44 MB, licence of the weights not stated, 2.8 s), BiRefNet lite (MIT; fp16 115 MB, fp32 224 MB; wasm runs out of memory, std::bad_alloc, at 1024 single thread). None kept the fringes on 10456, 10458 or 273; ISNet and BiRefNet lose most of 10456 and 10458 and fail the full-bleed DSC04671 / DSC04659; u2net and silueta are as good as u2netp on plain rugs but worse on 10456 and lose 273 entirely. So the model stays u2netp. A real fix needs a matting step (trimap from the rug outline plus a matting model) or a fringe-trained model; not available with a clean licence and browser size today.

## Touch up brush for cutouts (23 Nov 2026, branch feat/touch-up-brush)

Owner approved a manual brush because no model keeps fringes (see the section above). For Nahid, so it is meant to be obvious and forgiving.

- **What**: Bring back (paint to restore pixels from the original photo) and Erase (paint to clear). Brush size slider (log scale) and `[` `]`, soft edge (full strength inside 70% of the radius, so side by side strokes leave no see-through lines), zoom (wheel, trackpad pinch, two fingers, buttons, up to 16x) and move (Space drag, middle button, two fingers), Undo / Redo (buttons, Ctrl or Cmd Z, Shift Z, Ctrl Y), Reset, Hold to compare (shows the original photo; with no original, the cutout before touch up). In Bring back a faint copy of the original (32%) sits under the cutout over the checkerboard, so the lost fringe is visible. A ring shows the brush. A second finger cancels the stroke the first one started. The picture is pointer only (aria description says so); every other control is a labelled button, 44px.
- **Skip the floor** (on by default): a painted pixel comes back only as far as it differs from the floor colour (`smartAlpha`). Floor colour per tile (4% of the long side) from pixels the cutout's own mask calls background within two tiles, as the mode of a coarse colour histogram refined to the mean near it (strands spread over many colours, the floor is one tight cluster), blended between tiles; a local estimate further than 30 from the frame border's floor is not floor (inside a lost pale band the commonest "background" is the rug itself), so the border's is used. Distance weighs hue over brightness. Part covered pixels get the floor taken back out of their colour (gently). Off: restores exactly what is painted.
- **Where**: (1) `PhotoEditor` first tab "Touch up" for any cutout (opens on it), before Fix skew; the other tabs work on the touched cutout. Apply renders strokes at the cutout's own size; touch up alone gives a PNG at that size and the tile keeps `cutOfOriginal` (alpha and original pixels only), clears its Check this; with other steps the touched cutout's mask goes onto the full resolution original as before. (2) Library preview: "Touch up" in the Keep / Undo bar after Remove background (source = the fetched, normalised photo); Keep saves the touched file. A kept cutout (with a `photoOriginals` entry) also gets a round brush button under Restore original: it fetches both, the result goes to the same Keep bar, and `keepCutout` points the new file at the first original. (3) The Check this note under a PhotoPicker tile now has a Touch up button that opens the editor on Touch up; the Library bar adds "Touch up can fix it." to the warning.
- **Alignment rule** (`alignment`, `contentMismatch` in `lib/touchUp.ts`): the original is drawn at the cutout's size, exactly how `removeBackground` drew it, so pixel x,y is pixel x,y. Bring back is off, with the reason shown and Erase still working, when there is no original, when `cutOfOriginal` is false (skew, straighten, crop, size or tone ran after the cut: "the photo was changed after the cut"), when the sizes disagree by more than 1px after scaling the original to the cutout's long side (cropped, turned a quarter), or when the cutout's solid pixels differ from the original by more than 14 levels on average (turned 180, mirrored, a different photo).
- **Code**: maths `lib/touchUp.ts` (pure, `touchUp.test.ts`: alignment and mapping, brush raster, floor, smart alpha, painting bit by bit = replay, preview vs full size, undo stack); canvas glue and `useTouchState` / `useTouchKeys` in `lib/touchUpGlue.ts`; UI `components/TouchUp.tsx` (`TouchCanvas`, `TouchPanel`, default `TouchUpDialog`, lazy). Painting is on a 1600px copy, incrementally per segment from a snapshot taken at stroke start (only the dirty box is redrawn, once per frame); undo replays. Strokes are stored in fractions, so Apply replays them at full size ("Applying touch up").
- **Measured** (production build, no-auth harness, real photos): Apply 0.8 to 1.4 s; strokes paint without lag at 1600px. 10456 (cream fringe, pale blue white floor): 100% of strand-coloured pixels in both fringe zones back (0% and 18% before), 0.0% of floor-coloured pixels opaque; strands come back slightly clumped, shadowed floor between close strands partly comes back, edges look soft on a dark background, clean on white. The cream heading band comes back where painted. 10458 (lilac, mustard, black fringe on white): side fringes 100% (76 to 83% before), floor 0.1 to 0.2%, and painting over the lost top lilac band and the mustard notch restores them fully (lilac is far enough from white). Screenshots and side by sides in the session scratchpad.
- **Known**: the 3 MB PNG rule still applies at upload, and a touched cutout has more fine detail: the test design's touched cutout (1360x1805, 4.6 MB) was stored at 1062x1409. Touch up itself never lowers resolution. Library search on `vite preview` needs `/api` proxied to the live site (Netlify function); the client fallback throws on a product whose `materials` is not a string (pre-existing).

## Edit photo from the Library (23 Nov 2026, branch feat/library-photo-edit)

Owner: the photo editor (skew, straighten, crop, size, colour, brightness, and Touch up on a cutout) must open from the Library, not only from upload tiles.

- **Three ways in**: a sliders button on each grid card (main photo; opens the preview straight into the editor via `editOnOpen` on `Detail`), a round sliders button "Edit photo" on the big photo in the preview (the photo shown), and on each thumbnail in the preview a small blue sliders badge (top left, opposite the red cross) plus "Edit photo" at the top of the right-click menu (`PhotoOrder` `onEdit`).
- **Flow** (`edit` / `editDone` in `lib/useCutout.ts`, `EditPhotoButton` / `CutoutEdit` in `components/PhotoCutout.tsx`): fetches the stored file (`normaliseImage`), opens `PhotoEditor`; Apply puts the result in the same Keep / Undo bar as Remove background ("Edited. Nothing is saved until you keep it."), group label now "Unsaved change". Keep = `keepCutoutPhoto` (same position, `photoOriginals` records the photo it replaced or the first original), so Restore original undoes an edit too. JPEG edits go up on the JPEG path (2000px, 2 MB), PNG on the 3 MB rule. Editing a change not kept yet (a fresh cutout) edits that file, with its source as `full` while it is still a direct cut.
- **Full resolution original**: for a kept cutout, the editor samples the recorded original only if `isDirectCut` (`lib/touchUpGlue.ts`: transparent, sizes line up, content matches on a 500px copy) says the cutout is a direct cut of it; otherwise it edits the stored file as is. Touch up shows only for PNG files (bar button and the round brush).
- **Measured** (production build, no-auth harness, real 10456 and 10458 without Keep, test design EM-TEST-PHOTOEDIT with Keep, soft deleted after): card to editor 3.9 to 5.0 s (fetch), Apply 0.2 s, Keep 8.4 s, record shows the new `edit-*.jpg` with its `photoOriginals` entry. Desktop and 390px.

## Eastern Studio name, More and Kapetto off the UI (23 Nov 2026)

- **App name** (owner): staff see **Eastern Studio**: sidebar and mobile top bar brand ("Eastern" + small caps STUDIO), sign in card (EASTERN STUDIO), browser tab title and meta description, legacy dashboard header (/dispatches, /sample-bazar). "Eastern Mills" stays wherever it is the company: buyer links `/c/:id`, deck slides and file names, the MCP connector, the "Eastern Mills accounts only" line on sign in (it describes the Google account domain). The recorded training videos still show the old name in the sidebar.
- **More is off the sidebar** (`hidden: true` on its `TABS` entry in `AppShell.tsx`). `/more` still opens as a tab from its URL, with no sidebar item highlighted. Reachable only by URL now: `/more`, `/dispatches` (Dispatch photos, Orders app), `/sample-bazar`, and from that dashboard `/rug-gallery`; also `/upload/dispatch/:id`, `/upload/sample-bazar/:id`, `/admin/migrate` (as before).
- **Kapetto is not shown anywhere** (owner): `/kapetto` redirects to Library; the Kapetto Kits tab in `StudioDashboard` is behind `SHOW_KAPETTO = false` and its query is disabled (no read of the Kapetto project); More no longer lists it. Code (`KapettoKitsList`, `KapettoKitUpload`, the kapetto functions and the `kapetto-daa5e` app init in `firebase.ts`) stays, unreachable. The Orders app buyer `KAPETTO` (`buyers/K-01`, active) is filtered out of the Custom Rugs / Sample Dispatch customer list in `listCustomers()` (`HIDDEN_CUSTOMER`); the data is untouched.

## Training videos (22 Nov 2026)

- **Catalogue** `config/studio_training` (read once per page session, in memory; the app never writes it): `{ videos: { [videoId]: { title, src (mp4), poster (jpg), captions? (WebVTT), durationSec, version, updatedAt, chapters: [{ t, label }] } } }`. Video id to tab lives in code (`TRAINING_TABS` in `lib/training.ts`): `library`, `background-removal`, `custom-rugs`, `sample-dispatch`. A missing doc, missing id or empty `src` = no button and no pop-up on that tab.
- **Seen** `studio_training_seen/{uid}` = `{ seen: { [videoId]: version } }`, cloud only. Closing the pop-up in any way (X, Escape, backdrop, Got it) merges the current version in. It opens by itself when the tab is active, the page has painted (~0.6 s), the seen doc was read (read failure = never auto-open), the stored version is lower than the catalogue's, and no other `aria-modal` dialog is visible (it waits and retries while one is). Once per page session per video.
- **To publish a new video version**: upload the new mp4/poster/captions, then in the catalogue doc update that id's `src`/`poster`/`captions`/`durationSec`/`chapters` and **raise `version`** (and `updatedAt`). Raising `version` makes it open by itself once more for everyone; leave `version` alone for a silent fix. No deploy needed. If `captions` is set, the video is loaded with `crossOrigin="anonymous"`, so the mp4 and vtt hosts must send CORS headers (Firebase Storage download URLs do).
- Code: `lib/training.ts` (pure: `pickVideo`, `shouldAutoOpen`, `currentChapter`, unit tested), `lib/trainingStore.ts` (Firestore; `setTrainingTestOverride` lets a test page feed a fake catalogue and uid), `components/TrainingButton.tsx` (the control at the top right of each of the four pages, in the main bundle: +4.8 KB raw, +1.6 KB gzip with the store and helpers), `components/TrainingDialog.tsx` (lazy chunk; native video, `preload="metadata"`, starts paused on the poster with a large play button, never autoplays; speed 0.75/1/1.25/1.5; chapters beside from `md`, below on phones; pauses on close and when its tab goes to the background; Escape and focus trap gated by `useTabActive`).

## Photo order, slide layout and PPT for entries (24 Nov 2026, branch feat/entry-order-slide-layout)

Owner: Custom Rugs and Sample Dispatch get the Library's photo order and "On the deck slide" layout, saved as it will come out in the PPT.

- **Shared parts, not forks**: `PhotoOrder.tsx` now holds `PhotoStrip` (the strip: drag onto another, right-click or Shift+F10 / context menu key for Make main / Make 2nd / Remove photo, MAIN 2ND 3RD labels, Undo after a removal); `PhotoOrder` is the Library wrapper that saves through `reorderPhotos`. `SlidePreview.tsx` now holds `SlideBoxes` (the diagram: move, corners, arrow keys, Fit box, Reset); `SlidePreview` is the Library wrapper with its own debounced save. Library behaviour is unchanged apart from: menu items and resize corners are 44px on touch screens (`pointer: coarse`), the keyboard opens the menu, the menu takes focus and never opens above the window.
- **Where in an entry** (`EntryDialog.tsx`): saved entry, under the big photo (the strip replaces the old thumbnail row and its confirm on remove; the cross is hidden on the last photo); draft or new entry, an "Order on the deck" block under the photo tiles. One reorder UI per dialog; `PhotoPicker` has none. `menuOnSecondTap`: tapping the photo already selected opens the menu (phones have no right-click). The order is the order of the entry's `photos`: a saved entry reorders `photos`, a draft reorders its tiles (only uploaded ones are in the strip; tiles still uploading stay at the end). `reorderBy()` in `lib/studioEntryDeck.ts` (tested). The entry list's thumbnails follow it.
- **`slideLayout` on the entry** (`studio_custom_rugs` / `studio_sample_dispatches`): same shape as products (`{ v: 1, slots: [...]x4, updatedAt, updatedBy }`), part of `EntryFields`, so it goes through the entry autosave (1.5 s debounce, keepalive on pagehide); house layout = no field (`deleteField()`, and `patchOnExit` now treats a top-level `undefined` as remove: in the mask, not in the body).
- **Download PPT** (footer, drafts and saved): `PptDialog` with `singleOnly` (no layout choice, the Library's saved deck setup is not overwritten), `fileName` `Eastern_Mills_<Customer>_<date>.pptx`, `freshen` = the dialog's own state (newer than Firestore). Disabled with a visible reason while photos upload or backgrounds are being removed, or with no photo. The entry becomes one deck record (`entryDeckRecord`): photos in entry order with `heroPinned` (no main.* guessing), its `slideLayout`, and `deckSpec` lines CUSTOMER: / DATE: / the note as typed (no style, no prices). `pptGenerator.ts`: `DeckRecord = ShowroomProduct & { deckSpec? }`; a long note steps the font down (10.5/9/8pt), products keep 12pt. Intro and outro slides kept as for Library decks (it goes to a customer). Product slide XML and media are byte identical to before (hashed, single and grid).
- **Verified** (production build, no-auth harness, test entries soft deleted): exported slide photo boxes equal `fitContain(photoSlotsFor(layout))` to 1e-6 in, and the diagram's drawn photos to about 0.02 in; unit test `studioEntryDeck.test.ts` checks the same on generated XML.

## Turn photos in Custom Rugs and Sample Dispatch (27 Nov 2026, branch feat/entry-rotate)

Owner: entries get the Library's rotate.

- **Saved entry**: the round ↻ "Turn this photo 90° clockwise" on the big photo, top right, same `RotateButton` and `ROUND_BUTTON` as the Library preview. Clicks within 0.9 s are one turn (`useQuarterTurns` in `lib/useQuarterTurns.ts`, now shared; the Library's `useRotate` is a thin wrapper, behaviour unchanged). `rotateEntryPhoto` in `studioEntries.ts`: fetch, `rotateBlob` (2000px, PNG with alpha stays PNG), then `uploadEntryPhoto` (same folder, naming, 3 MB PNG rule, width/height of the stored bytes); the new photo replaces the old one in the same position and the entry autosave writes it, so list thumbnails, the slide diagram and Download PPT follow. `slideLayout` untouched. Old file stays in Storage. Disabled while photos upload; PPT waits while a turn saves; closing mid turn asks first. The big photo now fills its box (`absolute inset-0 h-full w-full object-contain`): a portrait photo used to overflow and be cropped.
- **Draft and new entry**: a round ↻ on each `PhotoPicker` tile (opt-in prop `rotate`, only entries pass it; Background Removal, New design, Edit design unchanged). 32px, 44px on `pointer: coarse`. Turns the tile's file at full resolution (up to 6000px) as an edit: `replaceFile`, first original kept, `cutOfOriginal: false`, so the tile's Undo puts the photo back as added and the tile re-uploads through `usePhotoSync`. Disabled while that tile uploads.
- **Originals**: a saved photo keeps its first `originalUrl`/`originalPath`, or the photo before the turn becomes it (same rule as tile edits); `cut` kept, `cutOfOriginal` dropped (the turned file no longer lines up with the original for Touch up).
- **Verified** (production build, no-auth harness, test entries customer TEST soft deleted): JPEG and PNG cutout turned in a draft and in a saved entry, desktop and 390px touch; stored width/height swapped, PNG corner alpha 0, persists after reload, list thumbnails, diagram and the PPT slide media (PNG flattened on white) show the turn.

## Room setting slides in decks (27 Nov 2026, branch feat/room-deck-slides)

Owner: "When the presentation goes, it goes with the room setting." Room images are kept on the product as `roomImages` (`showroom_products` and `em_products`, `RoomImage` in `lib/roomImages.ts`, first item = the one decks use, `firstRoomImage()`), JPEG 1376x768 under `studio-portal/room-settings/...`. Mapped in `mapShowroomData` and `mapEm`.

- **PptDialog**: tick "Add room setting slides", shown only in the one rug per slide layout and only when a chosen rug has one ("2 of 3 rugs have one"), ON by default, remembered in `config/ppt_prefs_<uid>` as `roomSlides`. `roomImages` is re-read from Firestore when the dialog opens (tray copies and search results are snapshots) and again before building, next to `freshen`; a rug that cannot be read keeps its tray copy. Entry decks (`singleOnly`) never read or show it.
- **Slide** (`addRoomSlide` in `pptGenerator.ts`): right after the rug's slide and its overflow slides. Image covers 0,0 to 13.333 x 7.5 in (pptxgenjs `sizing: cover` from the real pixel size, centred; 1376x768 trims 0.39% each side). The EM mark in the product slides' corner, on a small white plate at 88% (`ROOM_PLATE`, the intro slide's device; the mark is a thin dark outline that vanishes on a dark room). Caption bottom left on the same plate: style no., plus `  ·  COLOUR` when the style does not already end in it (`roomCaption`), Montserrat 10.5pt grey. A room image that failed to load gives no slide. Grid layout unchanged.
- **Size**: `deckPhotoSlots` adds one full-slide slot per rug with `maxPx: ROOM_SOURCE_PX` (1376), so `deckImages.ts` caps the long side at the source (never asks the CDN for an upscale); the email steps lower JPEG quality. Measured in a production build, 2 room slides: room media 132 and 145 KB (1376x768), deck 6.87 MB to 7.18 MB, about 150 KB per room slide.
- **Off = unchanged**: tick off, grid, or no rug with a room image gives slide XML and media byte identical to before (`roomDeck.test.ts`; also hashed against the origin/main generator during the build, single and grid, with and without extra photos). Order and geometry are tested there too.
- Not done: the server-side `build_deck.py` and the MCP connector do not add room slides; tearsheets not touched here.
