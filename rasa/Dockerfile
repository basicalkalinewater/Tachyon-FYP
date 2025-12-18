FROM rasa/rasa:3.7.0-full
WORKDIR /app
COPY . .
USER 1001
EXPOSE 5005
CMD ["run", "--enable-api", "--cors", "*", "--port", "5005", "--model", "/app/models/current.tar.gz"]
