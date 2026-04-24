# Cashes Flow

Personal finance management app.

## Structure

```
pocket-pal/
├── frontend/   React + Tailwind + Supabase
└── backend/    Python Flask API
```

## Frontend Setup

```bash
cd frontend
cp .env.example .env
# Fill in your Supabase credentials in .env
npm install
npm run dev
```

## Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your Supabase credentials in .env
pip install -r requirements.txt
python app.py
```

## Environment Variables

### Frontend (`frontend/.env`)
- `VITE_SUPABASE_URL` — Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Your Supabase anon/public key

### Backend (`backend/.env`)
- `SUPABASE_URL` — Your Supabase project URL
- `SUPABASE_SERVICE_KEY` — Your Supabase service role key
- `PORT` — Port for Flask server (default: 5000)
