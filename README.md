# Tachyon Chatbot Commerce

React + Supabase-backed storefront with carts/products API.

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
In one terminal:
```
cd backend
npm install
npm run dev
```
In another terminal:
```
cd frontend
npm install
npm run dev
```
Open http://localhost:3000

## Notes
- Product images are served locally from `frontend/public/assets/...` matching the seed paths.
- Cart state persists via Supabase (cart id stored in localStorage).
