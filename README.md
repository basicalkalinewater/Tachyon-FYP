# Tachyon Chatbot Commerce

React + Supabase-backed storefront with carts/products API. Backend runs on Flask (Python).

## Prerequisites
- Node.js (npm) installed.
- Supabase project with a SQL role that can run the provided schema/seed.

## Setup
1) Clone and open the repo.
2) (Optional if `.env` is already present) Create a root `.env` with your keys:
   ```
   SUPABASE_URL=your-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   VITE_SUPABASE_URL=your-url
   VITE_SUPABASE_ANON_KEY=your-anon-key
   VITE_API_BASE_URL=http://localhost:4000/api
   PORT=4000
   ```

## Install & Run

### Backend (Flask, Supabase)
```
cd backend
python -m venv .venv
.venv\Scripts\activate   # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
flask --app app run --port 4000
```
If the venv is already set up and dependencies installed, you can skip activation/install and just run:
```
cd backend
flask --app app run --port 4000
```

### Frontend (Vite/React)
```
cd frontend
npm install
npm run dev
```
Open http://localhost:3000

## Notes
- Product images are served locally from `frontend/public/assets/...` matching the seed paths.
- Cart state persists via Supabase (cart id stored in localStorage).
