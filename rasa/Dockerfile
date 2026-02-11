FROM rasa/rasa:3.6.16-full
WORKDIR /app
COPY . .
# Run action server and bot in same container; override entrypoint to shell so we can start both.
USER root
# Install custom component dependencies (fastText LID).
RUN pip install --no-cache-dir -r requirements.txt
RUN chown -R 1001:0 /app
USER 1001
EXPOSE 5005
ENTRYPOINT ["/bin/sh","-c"]
CMD ["python /app/run_action_server.py & exec rasa run --enable-api --connector rest --cors '*' --credentials /app/credentials.yml --port ${PORT:-5005} --model /app/models/current.tar.gz"]
