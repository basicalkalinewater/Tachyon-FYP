## :wave: 1) Tachyon - AI Powered Chatbot
Tachyon is our AI-powered e-commerce customer support and shopping-assistance platform.

From our team analysis, e-commerce support teams face high ticket volume, repetitive FAQs, and inconsistent response speed during peak periods. Customers expect immediate, accurate, and always-available support, but human-only workflows do not scale efficiently.

### Project Goal
Our goal was to build a production-oriented chatbot platform that:
- Provides real-time support for common e-commerce queries
- Reduces repetitive workload for human agents
- Escalates unresolved/high-complexity issues to live support with context continuity
- Maintains safe and scope-controlled AI behavior

As a team, we designed Tachyon to combine:
- Product discovery and shopping support
- Policy/FAQ assistance
- Live human handoff for complex issues
- A support dashboard workflow for agents

The implemented architecture uses React (Vite) frontend, Flask backend services, Rasa for deterministic conversational orchestration, Gemini for scoped generative responses, and Supabase/PostgreSQL for persistence.

## :hammer_and_wrench: 2) Technologies / Stack Used
- Frontend: React 18, Vite 7, React Router, Redux Toolkit
- UI: Bootstrap 5 + custom CSS
- Backend: Flask, Gunicorn, Flask-Sock (REST + WebSocket)
- AI/NLU: Rasa Open Source 3.6 + custom language detector
- LLM: Gemini API integration for fallback/product-assist responses
- Data: Supabase (Postgres + Auth-related data)
- Deployment target: Render

## :robot: 3) Features of the AI Chatbot and Platform
### AI Chatbot
- Product search, recommendation, and comparison support
- FAQ and policy guidance (shipping, returns, warranty, terms, privacy)
- Escalation path from chatbot to human support
- Session-aware flow with ticket context
- Quick-reply guided interaction for common intents
- Bilingual support (English + Chinese)

### Platform
- Customer dashboard features (profile/orders/addresses/payments)
- Admin operations (content, product, analytics, user management)
- Live support queue and real-time message updates
- CSAT collection for support quality tracking

### Safety, Scope, and Quality Controls
- Scope-controlled chatbot behavior (product/support scope only)
- Safety checks for restricted request types and jailbreak-style prompts
- Transparent AI behavior (assistant identity and controlled fallback behavior)
- Designed with performance/availability targets in mind:
  - Short informational responses under normal load: ~1-2s target
  - Monthly API availability target: 99.9%

## :compass: 4) The Process
This was our team process at a high level:
1. Defined user journeys for customer, support agent, and admin roles.
2. Documented functional and non-functional requirements before implementation.
3. Built core storefront and backend APIs first.
4. Implemented hybrid chatbot architecture:
   - Rasa for intents, entities, dialogue control, escalation logic
   - Gemini for scoped product comparison and fallback Q&A
5. Connected chatbot escalation into live support workflows.
6. Added role-based dashboards and operational tooling.
7. Iterated through testing and edge-case handling (queue flow, session behavior, errors, rate limits, and safety controls).

We followed an iterative delivery approach (Scrum-style sprints) because conversational quality, safety behavior, and integration reliability required continuous validation.

## :mortar_board: 5) What I Learned
Working on this project taught me:
- How to design role-based architecture across frontend, API, and data layers
- How chatbot logic and production support workflows must work together
- How important operational concerns are (auth/session handling, observability, failure paths, and rate limiting)
- How much team alignment matters when integrating multiple services (frontend/backend/Rasa/DB)

### How Can It Be Improved?
- Improve monitoring and alerting for production incidents
- Strengthen chatbot evaluation with measurable conversation quality metrics (resolution rate, escalation rate, CSAT trend)
- Expand multilingual coverage and model tuning for mixed-language prompts
- Add omnichannel support (messaging channels) as a future scope extension
- Add proactive support triggers and richer retrieval grounding for product/policy responses

## :rocket: 6) Running the Project (Local Test)
### Prerequisites
- Python 3.10
- Node.js 18+
- npm

### Start Backend
```bash
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python -m flask --app server run --port 4000
```

### Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### Start Rasa
Train model:
```bash
cd rasa
py -3.10 -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
rasa train --fixed-model-name current
```

Run in two terminals:
```bash
# Terminal 1
cd rasa
.\.venv\Scripts\activate
rasa run --enable-api --cors "*" --credentials credentials.yml
```

```bash
# Terminal 2
cd rasa
.\.venv\Scripts\activate
rasa run actions --port 5055
```

## :movie_camera: 7) Demo Video


https://github.com/user-attachments/assets/2d96cd60-2f89-4901-89d2-727882982724



