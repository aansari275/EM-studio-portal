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
