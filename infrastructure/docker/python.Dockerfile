# Python FastAPI servisleri için Dockerfile
FROM python:3.11-slim AS base
RUN pip install poetry==1.8.0

FROM base AS deps
WORKDIR /app
COPY apps/ml-inference/pyproject.toml apps/ml-inference/poetry.lock* ./
RUN poetry config virtualenvs.create false \
  && poetry install --no-dev --no-interaction

FROM base AS runner
WORKDIR /app
ENV PYTHONUNBUFFERED=1
COPY --from=deps /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY apps/ml-inference/src ./src
EXPOSE 3005
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3005"]
