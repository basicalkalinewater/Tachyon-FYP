FROM rasa/rasa:3.6.20
WORKDIR /app
COPY . .
USER root
RUN pip install --no-cache-dir -r requirements.txt
USER 1001
# No training for docker, use latest model packaged in repo
EXPOSE 5005
CMD ["run", "--enable-api", "--cors", "*", "--port", "5005"]
