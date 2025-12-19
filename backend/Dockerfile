FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml uv.lock /app/

RUN pip install --no-cache-dir uv \
    && uv sync --frozen --no-dev

COPY backend /app/backend

ENV PYTHONUNBUFFERED=1

CMD [".venv/bin/python", "backend/main.py"]
