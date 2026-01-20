# 🐎 Tachyon Chatbot
- Conversational storefront and support assistant with a Flask API, RASA, and a Vite/React front end backed by Supabase.

## 📦 Technologies
- Vite + React
- CSS / custom theming
- Flask API (REST + WebSocket)
- RASA (NLP/NLU)
- Supabase (Postgres + auth + storage)
- Ticket System

## 📍 Features
Here's what you can do with Tachyon Chatbot:
- Browse products, manage carts, and persist orders via Supabase.
- Chat with the Rasa-powered assistant embedded in the storefront.
- Escalate to human support; agents respond from the Support Dashboard (ticket number, priority, subject).
- Guests complete a short pre-chat form before escalation; logged-in users bypass the form.
- Admin dashboard: user management (create/edit roles, name, phone, password), profile editing, and CSAT insights with customer attribution.


## 🤔 E2A Protocol
- Customer → bot/agent messages are sent via REST.
- Agent → customer live updates use WebSocket; a `/support/sessions/<session_id>/ws` stream from the Flask backend.
- Ticket metadata (ticket_number, subject, priority) travels with sessions for dashboards.

## Prerequisites
- Node.js (npm)
- Python 3.10

## Quickstart
1. Clone the repo and create a `.env` in the project root (template below).
2. (Optional) Seed Supabase with `database/seed.sql` if you want sample data.
3. Start the backend API.
4. Train and run Rasa locally.
5. Start the Vite dev server.

## Environment (.env in repo root)
```
SUPABASE_URL=your-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VITE_SUPABASE_URL=your-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:4000/api
VITE_RASA_URL=http://localhost:5005/webhooks/rest/webhook
PORT=4000
RATE_LIMIT_ENABLED=1
```

## Backend (Flask)
```bash
cd backend
# If you already have a Python 3.10 venv with these deps, activate it and skip the next two commands.
py -3.10 -m venv .venv
.\.venv\Scripts\activate   # or: source .venv/bin/activate
pip install -r requirements.txt
flask --app server run --port 4000
```
Notes:
- WebSocket live chat uses DB polling for updates.
- `email-validator` is required for email input validation (included via `pip install -r requirements.txt`).

### Local WebSocket Testing (Windows) IGNORE THIS if you don't understand
Flask's dev server does not reliably handle WebSocket upgrades on Windows. Use Docker to run the backend with Gunicorn (do not use WSL):

```powershell
cd backend
docker build -t fyp-backend .
docker run --rm -p 4000:4000 --env-file ..\.env fyp-backend
```

This runs the backend with Gunicorn and WebSocket support locally. The frontend can keep using `ws://localhost:4000/...`.

## Frontend (Vite/React)
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Rasa Chatbot

### Option A: Train locally (Python 3.10 venv)
```bash
cd rasa
py -3.10 -m venv .venv
.\.venv\Scripts\activate   # or: source .venv/bin/activate
pip install -r requirements.txt   # pins rasa 3.6.x
rasa train --fixed-model-name current
```
Run bot + actions (two terminals):
```bash
# Terminal 1
cd rasa && .\.venv\Scripts\activate
rasa run --enable-api --cors "*" --credentials credentials.yml   # http://localhost:5005

# Terminal 2
cd rasa && .\.venv\Scripts\activate
rasa run actions --port 5055
```

### Option B: Train with Docker Desktop (portable, works for all collaborators)
Prereqs: Docker Desktop running (uses WSL2 backend on Windows by default).

Use the command that matches your shell and replace the `-v` left side with your local path to the **rasa** folder (all collaborators are on Windows):

- **PowerShell (Windows)**
  ```powershell
  docker run --rm `
    -v "${PWD}/rasa:/app" `
    -w /app rasa/rasa:3.6.16-full `
    train --fixed-model-name current --force `
    --config config.yml --domain domain.yml --data data --out models
  ```
  - If you are not running the command from the repo root, change `${PWD}/rasa` to your absolute path, e.g. `//d/Repo/FYP/Testing-for-FYP/rasa`.

- **cmd.exe (Windows)**
  ```cmd
  docker run --rm -v "%cd%\\rasa:/app" -w /app rasa/rasa:3.6.16-full train --fixed-model-name current --force --config config.yml --domain domain.yml --data data --out models
  ```

Results:
- The trained model is written to `rasa/models/current.tar.gz` inside your repo.
- Keep only that tarball (delete older ones), commit, and push so Render can load it without retraining.

### Runtime (Render)
`rasa/Dockerfile` runs both bot (5005) and actions (5055):
```Dockerfile
FROM rasa/rasa:3.6.16-full
WORKDIR /app
COPY . .
USER 1001
EXPOSE 5005 5055
ENTRYPOINT ["/bin/sh","-c"]
CMD ["rasa run actions --port 5055 && rasa run --enable-api --cors '*' --port 5005 --model /app/models/current.tar.gz"]
```
Ensure Rasa service env vars on Render:
- `BACKEND_BASE_URL=https://fyp-25-s4-25-backend-1hbj.onrender.com`
- `FRONTEND_BASE_URL=https://fyp-25-s4-25-frontend-1hbj.onrender.com`
- Supabase/DB creds as required by actions.

## Notes
- Supabase schema/seed is optional; skip it if you prefer no sample data.
- Product images are served from `frontend/public/assets/...` matching the seed paths.
- Cart state persists via Supabase (cart id stored in `localStorage`).

## Sample Logins
```
customer@example.com / customer123
support@example.com  / support123
admin@example.com / admin123
```
- Customer dashboards: manage profile, shipping addresses, saved payment methods, view order history and RMAs.
- Support dashboard: ticket queue/claim/resolve, ticket metadata, live chat, CSAT summary/responses, and workload stats.




