# OpenApp Hub

Simple human-first open-source application store (Stage 1 MVP).

Publishers can publish applications with clear structured guides:
- What problem it solves
- Why it matters
- How to use it

Users can discover apps and understand them without reading complicated READMEs.

## Stack

- **Frontend**: Next.js 16 + Tailwind CSS
- **Backend**: Go (Golang) – simple HTTP API

## Project Structure

```
openapp-hub/
├── frontend/     # Next.js 16 app
└── backend/      # Go API server
```

## Running locally

### 1. Start the backend

```bash
cd backend
go run main.go
```

Backend runs on http://localhost:8080

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

## Current Stage 1 Features

- List all published apps
- Publish a new app with structured form
- View app detail page (problem / significance / how to use / download)
- Very minimal friction for publishers

## Not included yet (later stages)

- User accounts / authentication
- Voting & feedback
- Metrics dashboard
- AI features
- Live demos
- Version management

## License

MIT
