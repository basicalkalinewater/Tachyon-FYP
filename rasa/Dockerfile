FROM rasa/rasa:3.6.16-full
WORKDIR /app
COPY . .
# Run action server and bot in same container; override entrypoint to shell so we can start both.
USER root
RUN chown -R 1001:0 /app
USER 1001
EXPOSE 5005 5055
ENTRYPOINT ["/bin/sh","-c"]
CMD ["rasa run actions --port 5055 & rasa run --enable-api --cors '*' --port 5005 --model /app/models/current.tar.gz"]
