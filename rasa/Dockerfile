FROM rasa/rasa:3.6.16
WORKDIR /app
COPY . .
USER root
RUN pip install --no-cache-dir -r requirements.txt
USER 1001
EXPOSE 5005
CMD ["run", "--enable-api", "--cors", "*", "--port", "5005", "--model", "/app/models/current.tar.gz", "--debug"]
