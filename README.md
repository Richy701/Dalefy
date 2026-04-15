# DAF Adventures

Internal travel planning and itinerary management platform for teams. Build, manage, and publish multi-day trip itineraries with flights, hotels, activities, and dining — all in one place.

---

## Features

### Dashboard
- Animated stat counters (trips, travelers, destinations, revenue)
- Upcoming trips carousel with spotlight view
- Live activity feed and quick-action buttons
- Drag-and-drop file import — drop a PDF, Word doc, PPTX, or TXT directly onto the page to parse it into a trip
- Grid and list view toggle with live search

### Workspace (Itinerary Builder)
- Day-by-day event management — flights, hotels, activities, dining
- Inline event editor with date picker, time, notes, and tags
- Interactive route map powered by Mapbox GL with marching-ants arc animation
- Per-trip media tab alongside the itinerary
- AI Zap — AI-assisted itinerary suggestions
- PDF export via html2canvas + jsPDF

### Destinations
- Mapbox world globe with pulsing destination markers
- Connection lines between visited destinations via GeoJSON layers
- Animated stats per destination

### Travelers
- Sortable member table with role, status, and compliance columns
- Per-traveler document compliance tracking (Signed / Pending / Expired)
- Sign & remind actions with confirmation dialogs
- Drawer-based add-traveler form (vaul)
- HR Documents tab — aggregated compliance view with virtual scrolling

### Reports
- Operations overview with Recharts bar, line, and pie charts
- Documents compliance tab
- Tab switcher between views

### Media Library
- Upload, browse, and manage photos and videos across all trips
- Drag-and-drop upload with lightbox preview

### Global
- ⌘K command palette — search trips, navigate pages, trigger actions
- Dark / light mode with instant switching
- Sidebar with collapsible icon mode, recent trip shortcut, user footer
- Notification panel — bell popover with unread count and mark-all-read
- Mobile-responsive with sheet-based sidebar on small screens
- Smooth page transitions via Motion

### New Trip Form
- Full-width inline date range picker with seamless range highlight
- Currency selector (pill buttons — no dropdown conflicts in drawer)
- Budget field (numbers only)
- Cover image: paste a URL **or** type a destination name to auto-fetch a banner

---

## Demo Data

Comes preloaded with 8 fully detailed trips:

| Trip | Events |
|---|---|
| Kenya Luxury Safari | 22 |
| Japan Discovery | 10 |
| Maldives Retreat | 10 |
| Amalfi Coast Tour | 8 |
| Iceland Coastal FAM | 9 |
| Bali VIP Retreat | 12 |
| Swiss Alps Winter FAM | 10 |
| New York Urban FAM | 10 |

---

## Tech Stack

| Layer | Library |
|---|---|
| Framework | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 3 |
| Components | Shadcn-style (Base UI v1) — Dialog, Tabs, Select, Popover, Tooltip, Avatar, Badge |
| Icons | Lucide React |
| Maps | Mapbox GL JS via `react-map-gl/mapbox` |
| Charts | Recharts |
| Carousel | Embla Carousel |
| Table | TanStack Table |
| Virtual scroll | TanStack Virtual |
| Command palette | cmdk |
| Drawer | vaul |
| Page transitions | motion (`motion/react`) |
| Animated counters | @number-flow/react |
| Keyboard shortcuts | react-hotkeys-hook |
| Lightbox | yet-another-react-lightbox |
| Dates | date-fns + React Day Picker |
| PDF export | html2canvas + jsPDF |
| Import parsing | pdfjs-dist + mammoth + jszip |

---

## Getting Started

```bash
npm install --legacy-peer-deps
npm run dev
```

Opens at [http://localhost:5173](http://localhost:5173).

> **Note:** `--legacy-peer-deps` is required due to a react-day-picker peer dep conflict with React 19.

---

## Environment Variables

Copy `.env.local.example` to `.env.local`:

| Variable | Required | Purpose |
|---|---|---|
| `VITE_MAPBOX_TOKEN` | **Yes** | Workspace map + destinations globe |
| `VITE_GOOGLE_API_KEY` | Optional | Destination image search |
| `VITE_GOOGLE_CSE_ID` | Optional | Destination image search |
| `VITE_UNSPLASH_ACCESS_KEY` | Optional | Fallback image search (50 req/hr free) |

Without `VITE_MAPBOX_TOKEN` the maps will not render. Without the image keys the app falls back to a built-in image bank.

---

## Deployment

Deployed on Vercel. The `vercel.json` sets `installCommand` to use `--legacy-peer-deps` and `buildCommand` to `vite build`. The `mobile/` directory is excluded via `.vercelignore`.
