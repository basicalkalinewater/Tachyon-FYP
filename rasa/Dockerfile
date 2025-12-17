FROM rasa/rasa:3.6.20
WORKDIR /app
COPY . .
USER root
RUN pip install --no-cache-dir -r requirements.txt
RUN rasa train --fixed-model-name current
USER 1001
EXPOSE 5005
CMD ["run", "--enable-api", "--cors", "*", "--port", "5005"]
