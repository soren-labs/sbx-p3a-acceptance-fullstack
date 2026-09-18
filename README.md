# Focus Board

Focus Board is a small task board with a FastAPI + SQLite backend and a React + Vite + TypeScript frontend.

## Local development

Start the backend from `backend/` with `python -m venv .venv`, `pip install -r requirements.txt`, and `uvicorn app.main:app --reload --port 8000`.

Start the frontend from `frontend/` with `npm install` and `npm run dev`. Set `VITE_API_BASE_URL` to the backend URL when it is not `http://localhost:8000`.

The backend exposes `GET /health` and task REST endpoints under `/tasks`.
