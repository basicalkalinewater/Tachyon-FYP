# 🐎 Tachyon Chatbot
- Conversational storefront and support assistant with a Flask API, RASA, and a Vite/React front end backed by Supabase.

## 📦 Technologies
- Vite
- React.js
- CSS
- Flask
- RASA
- Supabase

## 🦄 Features
Here's what you can do with Tachyon Chatbot:
- Browse products, manage carts, and persist orders via Supabase.
- Chat with the Rasa-powered assistant embedded in the storefront.
- Escalate to human support; agents can respond from the support dashboard.

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

## Frontend (Vite/React)
```bash
cd frontend
npm install
npm run dev   # http://localhost:3000
```

## Rasa Chatbot (Python 3.10)
```bash
cd rasa
# If you already have a Python 3.10 venv with Rasa installed, activate it and skip venv/pip.
py -3.10 -m venv .venv
.\.venv\Scripts\activate   # or: source .venv/bin/activate
pip install -r requirements.txt   # installs rasa==3.6.20 plus python-dotenv
rasa train
rasa run --enable-api --cors "*"   # http://localhost:5005
```
In another terminal:
```bash
cd rasa
.\.venv\Scripts\activate
rasa run actions
```
Deprecation warnings during `rasa train`/`run` (SQLAlchemy/pkg_resources) are expected on Rasa 3.6.20.
If error trying to install rasa package, try upgrading pip (in the .venv)

## Notes
- Supabase schema/seed is optional; skip it if you prefer no sample data.
- Product images are served from `frontend/public/assets/...` matching the seed paths.
- Cart state persists via Supabase (cart id stored in `localStorage`).

## Sample Logins
```
customer@example.com / customer123
support@example.com  / support123
```
