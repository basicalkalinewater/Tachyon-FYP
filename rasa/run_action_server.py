"""Start the Rasa SDK action server bound to localhost only.

Render can mis-detect the action port as the public service port if the action
server listens on 0.0.0.0. We run it on 127.0.0.1 so only the local Rasa
process can call it via endpoints.yml.
"""

from rasa_sdk.endpoint import create_app
from rasa_sdk.executor import ActionExecutor


def main() -> None:
    executor = ActionExecutor()
    executor.register_package("actions")
    app = create_app(executor)
    app.run(host="127.0.0.1", port=5055)


if __name__ == "__main__":
    main()
