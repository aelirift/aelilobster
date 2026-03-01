# Pod Settings

## Container Lifecycle
# Keep pod running after code execution completes (vs destroy immediately)
keep_running: true

# Auto-destroy pod after this many minutes of idle time
idle_timeout_minutes: 30

# Use --rm flag to auto-destroy container after execution (overrides keep_running)
auto_destroy: false

## Container Configuration
# Default image for Python code
python_image: "python:3-slim"

# Default image for shell commands
shell_image: "ubuntu:latest"

# Default working directory in container
work_dir: "/tmp"

# Default port for web server
default_port: 8080

## Startup Commands
# Commands to run when container is first created (to install dependencies)
# These run in the container at startup time
startup_commands: |
  apt-get update
  apt-get install -y python3 python3-pip python3-venv
  pip3 install --break-system-packages flask