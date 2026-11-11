# EM Studio Portal - Photography Upload System

## Overview
Simple photography portal for the studio team at Eastern Mills. Upload photos for:
1. **Sample Dispatches** - Photos for buyer presentations (shows in Orders app)
2. **Sample Bazar** - Product thumbnails (shows across all apps)
3. **Rug Gallery** - Browse all showroom products and upload additional photos

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

- **Nothing is compressed at upload.** Originals stay the archive. Each deck fetches its own copies through the Netlify Image CDN (`src/lib/deckImages.ts`), sized **per slot** at 300 pixels per inch (`deckPhotoSlots` in `pptGenerator.ts`), with `fit=contain` so the whole rug is kept.
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
- **Delete is soft**: `deletedAt` + `deletedBy`, Undo toast restores. Filtered in `library.ts` `dedupe()` and in `netlify/functions/search.mts`. Firestore delete rules were not touched. The MCP connector and server deck do not filter `deletedAt` yet.

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
