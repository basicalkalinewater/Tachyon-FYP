# Tachyon Chatbot
Conversational storefront and support assistant with a Flask backend, Rasa, and a React/Vite frontend backed by Supabase.

## Technologies
- Frontend: React 18, Vite 7, React Router, Redux Toolkit
- UI: Bootstrap 5 and custom CSS
- Backend: Flask, Gunicorn, Flask-Sock (REST + WebSocket)
- AI/NLU: Rasa Open Source 3.6 with custom language detector
- Data: Supabase (Postgres + Auth)
- LLM Integration: Gemini API
- Deployment: Render (Backend Web Service, Frontend Static Site, Rasa Docker Service)

## Core Features
- Embedded shopping assistant for product discovery and support
- Policy/FAQ guidance (shipping, returns, warranty, terms, privacy)
- Human handoff from bot to support dashboard
- Ticket-aware support flow (ticket number, subject, priority)
- Real-time support conversation loop and CSAT collection
- Supabase-backed persistence for sessions, carts, orders, and support context

## Render Deployment
This repository is configured for Render via `render.yaml` with 3 services:
- `FYP-25-S4-25-backend` (Python web service)
- `FYP-25-S4-25-frontend` (Static site)
- `FYP-25-S4-25-rasa` (Docker web service)

## Local Testing

### Backend (Flask)
```bash
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m flask --app server run --port 4000
```

### Frontend (Vite)
```bash
cd frontend
npm install
npm run dev
```

### Rasa (Local)
```bash
cd rasa
py -3.10 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
rasa train --fixed-model-name current
```

Run bot and action server in separate terminals:
```bash
# Terminal 1
cd rasa
.\.venv\Scripts\activate
rasa run --enable-api --cors "*" --credentials credentials.yml

# Terminal 2
cd rasa
.\.venv\Scripts\activate
rasa run actions --port 5055
```

## Required Environment Variables

### Frontend
- `VITE_API_BASE_URL`
- `VITE_RASA_URL`

### Backend
- `CORS_ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `RASA_RELAY_URL`
- `RASA_PUSH_URL`
- `RASA_FORWARD_URL`
- `LIVE_CUST_SUPPORT_FALLBACK_CUSTOMER_ID`
- `LIVE_CUST_SUPPORT_FALLBACK_AGENT_ID`
- `LIVE_AGENT_AVG_HANDLE_SECONDS`
- `SESSION_TTL_HOURS`
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; default configured in code)

### Rasa
- `PORT`
- `BACKEND_BASE_URL`
- `FRONTEND_BASE_URL`
- `LIVE_AGENT_HANDOFF_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`

## Rasa Model Requirement
Rasa runtime expects a trained model at:
- `rasa/models/current.tar.gz`

Before deploying Rasa, ensure this artifact exists in the service build context.

## Production Notes
- Keep all secrets in Render environment variables only.
- Do not commit `.env`.
- Use a single canonical backend URL across frontend, backend, and rasa envs.
- Ensure static rewrite for SPA routes is configured (`/* -> /index.html`).
