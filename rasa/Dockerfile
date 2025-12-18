FROM rasa/rasa:3.6.16-full
WORKDIR /app
COPY . .
# Run action server and rasa server in one container
USER 1001
EXPOSE 5005 5055
CMD ["/bin/sh", "-c", "rasa run actions --port 5055 & rasa run --enable-api --cors '*' --port 5005 --model /app/models/current.tar.gz"]
