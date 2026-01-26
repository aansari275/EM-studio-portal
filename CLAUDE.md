# EM Studio Portal - Photography Upload System

## Overview
Simple photography portal for the studio team at Eastern Mills. Upload photos for:
1. **Sample Dispatches** - Photos for buyer presentations (shows in Orders app)
2. **Sample Bazar** - Product thumbnails (shows across all apps)

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
2. See two tabs: **Sample Dispatches** and **Sample Bazar**
3. Click on any dispatch marked "Pending"
4. Upload PPT file (optional, for entire dispatch)
5. See **product list** with status indicators (Pending/Done)
6. Click on a product → upload photos (Main photo required)
7. Back to list → see updated status
8. Done when all products have main photos!

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

Photos are stored in Firebase Storage:
- Dispatches: `dispatches/{dispatchId}/{filename}`
- Sample Bazar: `sample-bazar/{productId}/{filename}`

## Project Structure
```
src/
├── pages/
│   ├── StudioDashboard.tsx   # Main page with two tabs
│   └── UploadPhotos.tsx      # Photo upload interface
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
| `/` | Dashboard with Sample Dispatches & Sample Bazar tabs |
| `/upload/dispatch/:id` | Upload photos for a dispatch |
| `/upload/sample-bazar/:id` | Upload photos for a Sample Bazar product |

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
