# Video Background Effects Pipeline

Backend-first video processing app that applies background-only effects using MediaPipe selfie segmentation, OpenCV frame processing, and FFmpeg encoding. A React editor UI submits jobs and polls status until the processed result is ready.

## Architecture
- **Frontend**: React + TypeScript editor UI, React Query for API polling
- **Backend**: Flask API + Redis/RQ job queue
- **Pipeline**: OpenCV decode → MediaPipe segmentation → NumPy composite → FFmpeg encode
- **Storage**: `backend/data/jobs/<jobId>/input.*` and `backend/data/jobs/<jobId>/output.mp4`

## Backend Setup

### Requirements
- Python 3.10 or 3.11 (MediaPipe does not support Python 3.13)
- MediaPipe pinned to 0.10.14 for `mediapipe.solutions` support
- Redis
- ffmpeg (must be on PATH)

### Install Python dependencies (uv)
```bash
uv venv --python 3.11
source .venv/bin/activate  # Windows: .venv\Scripts\activate
uv lock
uv sync
```

### Run Redis
Option 1: Docker
```bash
docker run --rm -p 6379:6379 redis:7
```

Option 2: Local install
```bash
redis-server
```

Optional: override Redis URL
```bash
export REDIS_URL=redis://localhost:6379/0
```

### Start API server
```bash
python backend/main.py
```

### Start RQ worker
```bash
python backend/worker.py
```

## Frontend Setup
```bash
cd frontend
npm install
npm start
```

Optional API base URL:
```bash
export REACT_APP_API_BASE_URL=http://127.0.0.1:8080
```

## API Overview
- `GET /api/health`
- `GET /api/effects`
- `POST /api/jobs` (multipart: `video`, `effect`)
- `GET /api/jobs/<jobId>`
- `GET /api/jobs/<jobId>/result`

## Pipeline Details
1. Decode frames with OpenCV.
2. Run `mediapipe.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)`.
3. Smooth mask, composite foreground with background effect.
4. Write frames to disk and encode with FFmpeg (H.264 + yuv420p).

Supported effects:
- `none`
- `bg_grayscale`
- `bg_sepia`
- `bg_blur`

## Limitations
- Frame-by-frame processing can be slow for long videos.
- Output resolution capped at 1280px width for runtime safety.

## Future Work
- Persistent job history and cleanup policies.
- UI for trimming or selecting output resolution.
