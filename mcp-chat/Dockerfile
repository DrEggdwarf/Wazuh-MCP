# Chat léger SOC (FastAPI) — boucle MCP Wazuh + Anthropic (BYOK, sans compte)
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./
# non-root : le volume nommé /data hérite de cet owner à sa 1re création
RUN useradd -u 10001 -m app && mkdir -p /data && chown -R app:app /data /app
USER app
EXPOSE 8001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]
