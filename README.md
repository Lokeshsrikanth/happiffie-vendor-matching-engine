# Happiffie AI Vendor Matching Engine

Happiffie is a high-volume celebration/event vendor matchmaking platform. When a user submits an event requirement, the engine evaluates available candidates, filters them through a series of hard criteria constraints, ranks them based on a multi-attribute weighted scoring model, and coordinates staggered invitations.

This repository implements the full-stack demonstration prototype, combining a Node.js + Express + Prisma + PostgreSQL backend with a React + Tailwind CSS + Vite frontend.

---

## System Architecture Overview

- **Frontend (Port 3000)**: React SPA styled with Tailwind CSS (dark mode theme, glassmorphic panels) featuring a client matching form, a recommendation matches feed, inline vendor simulation controls, and an admin override hub.
- **Backend (Port 4000)**: Node.js, Express, and TypeScript API managing requirements, invitation triggers, vendor responses, and the core scoring engine.
- **Database (Port 5435)**: PostgreSQL relational DB managed via Prisma ORM.

---

## Local Setup Instructions

### Prerequisites
Ensure you have the following installed on your system:
- **Node.js** (v18 or higher)
- **Docker & Docker Compose** (for PostgreSQL)

---

## Required Secrets & Environment Variables

Copy the root `.env.example` file to create your environment configs, or set them inside your cloud hosting dashboards. **Never commit raw API keys or `.env` files to git.**

| Environment Variable | Description | Where to Set | Value Source / Default |
|---|---|---|---|
| `DATABASE_URL` | Postgres SQL connection URL. The database instance must support and enable the `pgvector` extension. | Backend `.env` / Render or Railway DB Settings | Local: `postgresql://postgres:postgres@localhost:5435/happiffie?schema=public` |
| `PORT` | The port the Express backend server listens on (defaults to 4000). | Backend `.env` / Render Web Service dashboard | Local: `4000` (Render/Railway inject this automatically in cloud env) |
| `CORS_ORIGIN` | Allowed cross-origin source URLs, separated by commas. | Backend `.env` / Render Web Service dashboard | Local: `*` (In production, set to your deployed Vercel frontend URL) |
| `ANTHROPIC_API_KEY` | Anthropic Claude API key used for free-text requirement parsing and natural rationale text. | Backend `.env` / Render Web Service dashboard | Get from Anthropic Console. (Gracefully falls back to local regex offline mode if missing) |
| `VITE_API_BASE_URL` | Public URL of the running backend Express server. | Frontend Vercel Project Settings / `.env` | Local: `http://localhost:4000` (Vercel builds read this to hit the API) |

---

### Step 1: Install Dependencies
Run npm install in the root folder, and then trigger the recursive setup script to install backend and frontend node packages:

```bash
# Install root orchestrator utilities
npm install

# Install dependencies in both backend/ and frontend/ subdirectories
npm run install:all
```

---

### Step 2: Spin Up PostgreSQL Database
Start the PostgreSQL container. It is configured to run on port **5435** to prevent conflicts with standard local Postgres installations (port 5432):

```bash
npm run db:up
```

---

### Step 3: Run Database Migrations
Deploy the database schema via Prisma. This creates tables for Users, Vendors, Requirements, Matches, Invitations, Bookings, and more:

```bash
npm run db:migrate
```

---

### Step 4: Seed Mock Data
Seed the database with ~40 vendors distributed across Chennai and Bangalore. These vendors have realistic ratings, budgets, specialties, experience levels, and calendar blocks (needed for availability testing):

```bash
npm run db:seed
```

---

### Step 5: Start Development Servers
Run both backend and frontend servers concurrently.
- Backend runs at [http://localhost:4000](http://localhost:4000)
- Frontend runs at [http://localhost:3000](http://localhost:3000)

```bash
npm run dev
```

Once started, open [http://localhost:3000](http://localhost:3000) in your web browser to explore.

---

## How to Test the Matching Loop (Walkthrough)

1. **Client Submission**:
   - Go to the **Client Matching Feed** tab.
   - Fill out the form on the left: Category (e.g. `decorator`), City (`Chennai`), Date (`2026-10-12`), Budget (`₹2,00,000`), Theme details (`Rustic garden with fairy lights`), and select a coordinate preset.
   - Click **Match & Invite Vendors**.
2. **Review Ranked Suggestions**:
   - The middle section loads the matches list. Notice they are ranked by match score.
   - Click vendor cards to view their **AI Match Rationale** and score breakdown.
   - *Cold-Start Case*: New vendors are automatically given a `+15` discovery boost and imputed average ratings. They are marked with a "Cold Start Discovery" badge.
3. **Simulate Vendor Response**:
   - The top 3 vendors automatically receive invitations.
   - Under the invited vendor cards, you will see a simulated "Vendor Panel Action" box.
   - Select **Accept & Book** (inputting a quote) or **Decline** (inputting reasons like "Fully Booked").
   - Accepting will:
     - Record the response status.
     - Update the overall requirement state to **Booked**.
     - Lock the vendor's calendar for that date.
     - Create a booking record in the database.
4. **Admin Dashboard Intervention**:
   - Go to the **Admin Control** tab.
   - Select your recent requirement.
   - You can manually apply overrides:
     - **Boost**: Adds $+20$ points to a vendor's ranking score.
     - **Force Invite**: Sends an invitation to a vendor immediately, bypassing other rankings.
     - **Exclude**: Excludes/hides a vendor from the candidate pool.
5. **Vendor Directory**:
   - Go to the **Vendor Directory** tab to browse all seeded vendors, view their specialties, pricing ranges, and their real-time statistics (number of invites received vs. bookings completed).
