# === Estágio 1: build do frontend ===
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json ./
COPY frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# === Estágio 2: backend + frontend compilado ===
FROM python:3.12-slim AS backend
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copia o código do backend
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/

# Copia o frontend compilado do estágio 1
COPY --from=frontend /app/frontend/dist /app/frontend/dist

# Aponta o backend para onde o frontend compilado está (container != máquina local)
ENV FRONTEND_DIST=/app/frontend/dist

EXPOSE 8000
WORKDIR /app/backend
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]