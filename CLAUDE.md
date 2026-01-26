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
- **`Showroom_Products`** - Gallery photos with full product details (read-only)
  - `baseStyleNumber`: Design identifier (e.g., "EM-17-AM-418")
  - `styleNumber`: Full ID with color (e.g., "EM-17-AM-418-GREY-YELLOW")
  - `firebaseUrl`: Main image URL
  - `additionalImages`: Array of additional photo URLs
- **`empl_designs`** - Master design library for additional uploaded photos
  - `designName`: Unique key (matches `baseStyleNumber`)
  - `photos`: Array of { url, type, uploadedAt }
  - `linkedShowroomProducts`: Array of styleNumbers

Photos are stored in Firebase Storage:
- Dispatches: `studio-photos/dispatches/{dispatchId}/{filename}`
- Sample Bazar: `sample-bazar/{productId}/{filename}`
- EMPL Designs: `empl-designs/{designName}/{filename}`

## Project Structure
```
src/
├── pages/
│   ├── StudioDashboard.tsx   # Main page with three tabs
│   ├── UploadPhotos.tsx      # Photo upload interface
│   └── RugGallery.tsx        # Rug Gallery grid + detail views
├── lib/
│   ├── firebase.ts           # Firebase operations
│   └── utils.ts              # Utilities (image compression, etc.)
├── App.tsx                   # Routes
└── main.tsx                  # Entry point
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
| `/rug-gallery` | Browse all designs from Showroom_Products |
| `/rug-gallery/:designName` | View design details, color variants, and upload photos |

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
- Grid view of all designs (grouped by baseStyleNumber)
- Search by design name, materials, or construction
- Detail view with all color variants
- Combined photos from Showroom_Products + uploaded photos
- Upload additional photos (saved to `empl_designs` collection)
- Lightbox for full-size image viewing
- Design details panel (construction, materials, category, size)
