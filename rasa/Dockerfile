FROM rasa/rasa:3.6.20
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
# No training for docker, use latest model
EXPOSE 5005
CMD ["run", "--enable-api", "--cors", "*", "--port", "5005"]
