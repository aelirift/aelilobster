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
python_image: python:3-alpine

# Default image for shell commands
shell_image: alpine

# Default working directory in container
work_dir: /tmp

# Default port for web server
default_port: 8080
