# CodeSense

CodeSense is a read-only codebase intelligence platform. Phase 1 provides a
safe upload intake flow; it does not parse, execute, clone, or index code.

## Run

```bash
docker compose up --build
```

Open `http://localhost:5173`. The API docs are at `http://localhost:8000/docs`.

## Development

```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload
cd frontend && npm install && npm run dev
```

Run backend tests with `cd backend && pytest`.

## Safety boundaries

- Uploads are limited to 50 MiB and only `.zip` archives are accepted.
- Uploaded archives are stored as opaque files and are never extracted or run.
- Git repository URLs must use `https` or `git`; they are recorded only and are
  never fetched or cloned in this phase.

