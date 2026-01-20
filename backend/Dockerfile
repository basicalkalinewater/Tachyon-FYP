FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=4000
EXPOSE 4000

CMD ["gunicorn", "server:create_app()", "--bind", "0.0.0.0:4000", "--worker-class", "gthread", "--threads", "50"]
