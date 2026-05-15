# HowerFlow

HowerFlow is a playful MERN task planner for ADHD-friendly capture, review, and scheduling. It turns messy inbox text into structured tasks, nudges users into Eisenhower quadrants, keeps Q1 capped, protects one Q2 win per day, and can create Google Calendar events.

## Stack

- MongoDB for persistent storage
- Express + Node.js for the API
- React + Vite for the website
- Mongoose for models
- JWT auth for login
- Google OAuth + Calendar Events API for optional scheduling
- Three.js via React Three Fiber for lively 3D motion

## Run Locally

1. Install dependencies:

```bash
npm run install:all
```

2. Start MongoDB:

```bash
docker compose up -d
```

3. Copy backend env values:

```bash
cp backend/.env.example backend/.env
```

4. Start the API:

```bash
npm run dev:api
```

5. In another terminal, start the website:

```bash
npm run dev:web
```

Open `http://localhost:5173`.

## Google Calendar

The app can run without Google keys. In that mode, scheduling stores a local event id so the product flow still works.

For real Google Calendar events, fill these in `backend/.env`:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI=http://localhost:4000/api/integrations/google/callback`

When a user connects Google Calendar, the refresh token is encrypted with AES-256-GCM before it is saved in MongoDB. The tutorial and calendar button explain this in crisp language.

## File Guide

- `package.json`: Root helper scripts for installing, building, and running both apps.
- `docker-compose.yml`: Local MongoDB service.
- `backend/package.json`: Express API dependencies and scripts.
- `backend/.env.example`: Local configuration template.
- `backend/src/server.js`: API server, auth, Mongo models, AI-style task parsing, quadrant rules, daily/weekly summaries, Google OAuth, encrypted token storage, and Calendar event creation.
- `frontend/package.json`: Vite React dependencies and scripts.
- `frontend/index.html`: Website entry document.
- `frontend/vite.config.ts`: Vite dev server config.
- `frontend/tsconfig.json`: TypeScript config.
- `frontend/src/main.tsx`: React mount point.
- `frontend/src/App.tsx`: Main product UI: login, first-login tutorial, Quick Capture, Review Mode, scheduling, daily overview, weekly review, settings, and 3D animation scene.
- `frontend/src/api.ts`: Typed client calls to the Express API.
- `frontend/src/types.ts`: Shared frontend types.
- `frontend/src/styles.css`: Light/dark themes, colorful ADHD-friendly visual system, responsive layout, and smooth poppy animations.

## Product Features

- First-login tutorial with short step-by-step guidance.
- Email/password login.
- Persistent users, settings, onboarding state, tasks, schedules, and Google connection state in MongoDB.
- Quick Capture for one-box entry.
- Template mode for structured entry.
- AI-style parsing for title, due date, reminder, estimate, quadrant, explanation, and suggested schedule blocks.
- User-controlled quadrant selection:
  - Q1: Urgent + Important
  - Q2: Not Urgent + Important
  - Q3: Urgent + Not Important
  - Q4: Not Urgent + Not Important
- One-click schedule suggestions.
- Optional Google Calendar event creation.
- Daily overview: today, overdue, and one Q2 focus.
- Weekly review: completed, slipped, and Q2 time.
- Start now button that creates a 15-25 minute focus block.
- Anti-overwhelm limits: Q1 capped to three open items per day; Q4 reminders are ignored by design.
- Dark and light mode.
