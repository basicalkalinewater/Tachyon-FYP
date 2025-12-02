# FYP-25-S4-25 Tachyon Chatbot 

React + Supabase-backed storefront with carts/products API. 
Backend runs on Flask (Python).

## Prerequisites
- Node.js (npm) installed.
- Supabase project with a SQL role that can run the provided schema/seed.
- Python 3.10 

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

### Backend (Flask, Supabase) — Python 3.10
```
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\activate   # or source .venv/bin/activate on macOS/Linux
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

### Rasa chatbot (local) — Python 3.10
Install Rasa in its own venv (Python 3.10):
```
cd rasa
py -3.10 -m venv .venv
.\.venv\Scripts\activate   # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt   # installs rasa==3.6.20
<<<<<<< HEAD
=======

If error trying to install rasa package, try upgrading pip (in the .venv)
>>>>>>> f0e03935cfeebe81b84e59cace3916f2d4fbc206
```
If the venv is already set up with Rasa installed, skip to:
```
cd rasa
rasa train
rasa run --enable-api --cors "*"   # starts on http://localhost:5005 with CORS open

```
In another terminal run: 
```
cd rasa 
.\.venv\Scripts\activate
rasa run actions
``` 




cd rasa
py -3.10 -m venv .venv 
.\.venv\Scripts\activate
rasa run actions
```
Then set `VITE_RASA_URL=http://localhost:5005/webhooks/rest/webhook` in your `.env` so the web widget can talk to Rasa. Deprecation warnings during `rasa train`/`run` (SQLAlchemy/pkg_resources) are expected on 3.6.20 and can be ignored.

## Notes
- Product images are served locally from `frontend/public/assets/...` matching the seed paths.
- Cart state persists via Supabase (cart id stored in localStorage).

### Sample User Login
``` 
customer@example.com customer123

```
