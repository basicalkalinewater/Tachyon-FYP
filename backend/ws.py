from flask_sock import Sock

# Shared Sock instance for registering WS routes across modules.
sock = Sock()
