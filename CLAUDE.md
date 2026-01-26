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

## Firebase Collections
- **`sample_dispatches_to_buyers`** - Dispatch documents with photos array
- **`sample_bazar`** - Product documents with photos array
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
- Sample Bazar: `sample-bazar/{productId}/{filename}`
- EMPL Designs: `empl-designs/{designName}/{filename}`
- Showroom: `showroom/` and `heimtextil/` folders

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
- Design details panel (construction, materials, category, size)
- Select mode for multi-product PPT generation
- "HT26" badge for Heimtextil 2026 products
