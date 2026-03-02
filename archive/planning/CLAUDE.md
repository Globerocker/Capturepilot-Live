# Caturepilot 2.0 - Project Guidelines

## 📋 Project Overview
**Caturepilot** is a Next.js-based dashboard for managing government contractor opportunities, SAM registrations, and business development intelligence. The project integrates with Supabase for data management and uses modern React patterns with TypeScript.

**Repository**: https://github.com/Globerocker/capturepilot-v3
**Vercel Deployment**: https://vercel.com/celluiq/capturepilot-v3

## 📁 Project Structure

```
/Users/andreschuler/Caturepilot 2.0/
├── dashboard/                 # Main Next.js application
│   ├── src/
│   │   ├── app/              # App router pages
│   │   │   ├── contractors/   # Contractor management
│   │   │   ├── opportunities/ # Opportunity tracking
│   │   │   ├── matches/       # AI matching engine
│   │   │   ├── pipeline/      # Sales pipeline
│   │   │   └── settings/      # Configuration
│   │   └── components/        # Reusable components
│   ├── package.json           # Dependencies
│   ├── tsconfig.json          # TypeScript config
│   └── next.config.ts         # Next.js config
├── tools/                     # Backend services
├── venv/                      # Python virtual environment
├── architecture/              # System design docs
├── gemini.md                  # AI integration notes
└── [data files]               # SAM and reference data
```

## 🛠️ Tech Stack

**Frontend:**
- Next.js 16.1.6 (Turbopack)
- React 19.2.3
- TypeScript 5
- Tailwind CSS 4
- Lucide React (icons)

**Backend:**
- Supabase (PostgreSQL + Auth)
- Python services in `/tools`

**DevOps:**
- Vercel (production)
- Node.js 18+ required

## 📦 Key Dependencies
- `@supabase/supabase-js` - Database client
- `lucide-react` - Icon library (all icons imported here)
- `clsx` - Classname utility
- `tailwind-merge` - Tailwind utilities merging

## ✅ Build & Deployment

### Local Development
```bash
cd dashboard
npm install
npm run dev  # Runs on localhost:3000
```

### Build
```bash
npm run build
npm start
```

### Known Build Issues
1. **Sparkles import error**: The Sparkles icon is correctly imported from lucide-react on line 5 of multiple files. If Vercel reports a "Cannot find name 'Sparkles'" error, it's likely a caching issue. Solution: Clear `.next` folder and Vercel build cache.
2. **Next.js uses Turbopack**: Modern bundler, no webpack config needed.

## 🔑 Environment Variables

**Required in `.env` and `.env.local`:**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**MCP Integration**: Ensure MCP server credentials are configured for AI model access.

## 📊 Key Components & Algorithms

### 1. **Contractor Management** (`src/app/contractors/page.tsx`)
- **Purpose**: Display and filter SAM-registered contractors
- **Features**:
  - Search by company name, UEI, or CAGE code
  - Tab-based filtering (SAM vs external)
  - Pagination (50 items per page)
  - Detailed contractor cards with expiration tracking
- **Algorithm**: ILIKE fuzzy search on Supabase with pagination

### 2. **Opportunity Matching** (`src/app/opportunities/page.tsx`)
- **Purpose**: Match contractors to government opportunities
- **Features**:
  - Grid/list view toggle
  - Advanced filtering (industry, size, location)
  - Export functionality
- **Optimization**: Client-side filtering for better performance

### 3. **AI Matching Engine** (`src/app/matches/page.tsx`)
- **Label**: "B.L.A.S.T AI Engine"
- **Purpose**: Intelligent opportunity-to-contractor matching
- **Algorithm**: Proprietary matching logic (see MCP for AI integration)
- **Status Field**: Uses binary status to track AI model processing

### 4. **Sales Pipeline** (`src/app/pipeline/page.tsx`)
- **Purpose**: Track sales progression stages
- **Features**: Stage management and progression tracking

## 🔄 Automation & Integrations

1. **Supabase Real-time**: Consider enabling for live contractor updates
2. **MCP AI Integration**: Currently configured for contractor matching
3. **Data Sync**: SAM.gov data imported via `/tools` Python services
4. **Vercel Webhooks**: Configured for auto-deployment on push

## 🐛 Known Issues & Fixes

| Issue | Status | Fix |
|-------|--------|-----|
| Sparkles icon not found (line 431, contractors/page.tsx) | Caching | Clear `.next` folder |
| Build takes >7s on Vercel | Normal | Turbopack optimization |
| SAM data freshness | Needs review | See `/tools` update schedule |

## 💡 Best Practices

1. **Import from lucide-react**: All icons come from this package, never add custom icon libraries
2. **Use "use client"**: All pages use client-side rendering for interactivity
3. **Supabase queries**: Always include proper filtering and pagination
4. **TypeScript**: Enable strict mode, avoid `any` types when possible
5. **Styling**: Use Tailwind classes, leverage `clsx` for conditional styling
6. **Component naming**: Use PascalCase for components, separate layouts

## 🚀 Deployment Steps

1. **Local Testing**: `npm run dev` and test all pages
2. **Build Verification**: `npm run build` must pass without errors
3. **Git Push**: All changes committed and pushed to main
4. **Vercel Sync**: Dashboard automatically deploys via Vercel webhook
5. **Monitor**: Check Vercel dashboard for build logs

## 📝 Last Updated
February 25, 2026

## 🔗 Related Files
- `gemini.md` - AI integration notes
- `architecture/` - System design documentation
- `frontend_planning.md` - UI/UX specifications
- `tools/` - Backend services and data processing

---
**Maintained by**: Claude Code Agent
**Next Review**: After next deployment milestone
