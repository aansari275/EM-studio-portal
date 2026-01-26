# EM Studio Portal - Photography Upload System

## Overview
Simple photography portal for the studio team at Eastern Mills. Upload photos for:
1. **Sample Dispatches** - Photos for buyer presentations (shows in Orders app)
2. **Sample Bazar** - Product thumbnails (shows across all apps)

## Live URL
🌐 **https://em-studio-portal.netlify.app**

## Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS
- TanStack Query
- Firebase Firestore & Storage
- Netlify hosting

## How It Works

### For the Photographer:
1. Open https://em-studio-portal.netlify.app
2. See two tabs: **Sample Dispatches** and **Sample Bazar**
3. Click on any item marked "Pending"
4. Upload photos (Main photo required, others optional)
5. Done! Photos automatically appear everywhere they're needed

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
```bash
# Deploy to Netlify
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
