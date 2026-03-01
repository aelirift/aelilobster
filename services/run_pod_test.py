"""
Run Pod Test Service
Spins up a podman pod to run code and return results.
"""
import subprocess
import os
import uuid
import re
import time
import random
from pathlib import Path
from typing import Dict, Any, Optional, List

from services.naming import get_pod_name_normalized


# Default pod settings
DEFAULT_POD_SETTINGS = {
    "keep_running": True,
    "idle_timeout_minutes": 30,
    "auto_destroy": False,
    "python_image": "python:3-slim",
    "shell_image": "ubuntu:latest",
    "work_dir": "/tmp",
    "default_port": 8080
}

# Track allocated ports in memory
_allocated_ports: Dict[str, int] = {}  # pod_name -> port


def get_allocated_port(pod_name: str) -> Optional[int]:
    """Get the allocated port for a pod."""
    return _allocated_ports.get(pod_name)


def allocate_port(pod_name: str, preferred_port: int = 8080) -> int:
    """
    Allocate a port for a pod. 
    If preferred port is available, use it. Otherwise find a random available port.
    """
    # First check if this pod already has a port
    if pod_name in _allocated_ports:
        return _allocated_ports[pod_name]
    
    # Check if preferred port is available
    if _is_port_available(preferred_port):
        _allocated_ports[pod_name] = preferred_port
        return preferred_port
    
    # Try to find a random available port in the range 8081-8180
    tried = set()
    for _ in range(20):  # Try 20 times
        port = random.randint(8081, 8180)
        if port not in tried and _is_port_available(port):
            _allocated_ports[pod_name] = port
            return port
        tried.add(port)
    
    # Fallback: use preferred port anyway (let podman handle conflict)
    _allocated_ports[pod_name] = preferred_port
    return preferred_port


def _is_port_available(port: int) -> bool:
    """Check if a port is available by checking podman ps."""
    try:
        result = subprocess.run(
            ['podman', 'ps', '--format', '{{.Ports}}'],
            capture_output=True,
            text=True,
            timeout=5
        )
        # Check if port is already mapped
        for line in result.stdout.split('\n'):
            if f':{port}->' in line or f':{port}/' in line:
                return False
        return True
    except Exception:
        return True  # Assume available if check fails


def release_port(pod_name: str) -> None:
    """Release the allocated port for a pod."""
    if pod_name in _allocated_ports:
        del _allocated_ports[pod_name]


def get_pod_settings() -> Dict[str, Any]:
    """Load pod settings from default_pod_pod.md context file."""
    context_files_dir = Path(__file__).parent.parent / "context_files"
    pod_settings_file = context_files_dir / "default_pod_pod.md"
    
    settings = DEFAULT_POD_SETTINGS.copy()
    
    if pod_settings_file.exists():
        try:
            with open(pod_settings_file, 'r') as f:
                content = f.read()
                for line in content.split('\n'):
                    line = line.strip()
                    # Skip comments and empty lines
                    if not line or line.startswith('#'):
                        continue
                    # Parse key: value format
                    if ':' in line:
                        key, value = line.split(':', 1)
                        key = key.strip()
                        value = value.strip()
                        # Convert value to appropriate type
                        if value.lower() == 'true':
                            settings[key] = True
                        elif value.lower() == 'false':
                            settings[key] = False
                        elif value.isdigit():
                            settings[key] = int(value)
                        else:
                            settings[key] = value
        except Exception as e:
            print(f"Error loading pod settings: {e}")
    
    return settings


def get_pod_name(user_name: str, project_name: str) -> str:
    """Generate pod name based on user and project.
    
    Uses normalized naming to ensure consistency:
    - Username keeps underscores (test_user)
    - Project uses hyphens (myproject)
    - Format: {user}-{project}-pod
    """
    return get_pod_name_normalized(user_name, project_name)


def kill_pod(user_name: str, project_name: str) -> Dict[str, Any]:
    """
    Kill a pod by user and project name.
    Returns result with verification that pod is down.
    """
    pod_name = get_pod_name(user_name, project_name)
    settings = get_pod_settings()
    
    # First check if pod exists
    check_result = subprocess.run(
        ['podman', 'ps', '-a', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    
    pods_found = [p.strip() for p in check_result.stdout.strip().split('\n') if p.strip() and pod_name in p]
    
    if not pods_found:
        return {
            "success": True,
            "pod_name": pod_name,
            "was_running": False,
            "message": f"Pod {pod_name} not found (already stopped)"
        }
    
    # Kill the pod
    kill_result = subprocess.run(
        ['podman', 'kill', pod_name],
        capture_output=True,
        text=True
    )
    
    # Wait a moment for cleanup
    time.sleep(1)
    
    # Verify pod is down
    verify_result = subprocess.run(
        ['podman', 'ps', '-a', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    
    pods_still_running = [p.strip() for p in verify_result.stdout.strip().split('\n') if p.strip() and pod_name in p]
    
    if pods_still_running:
        # Try force kill
        force_kill = subprocess.run(
            ['podman', 'kill', '--signal', 'KILL', pod_name],
            capture_output=True,
            text=True
        )
        time.sleep(1)
        
        # Verify again
        final_verify = subprocess.run(
            ['podman', 'ps', '-a', '--filter', f'name={pod_name}', '--format', '{{.Names}}'],
            capture_output=True,
            text=True
        )
        pods_final = [p.strip() for p in final_verify.stdout.strip().split('\n') if p.strip() and pod_name in p]
        
        if pods_final:
            return {
                "success": False,
                "pod_name": pod_name,
                "was_running": True,
                "verified": False,
                "message": f"Failed to kill pod {pod_name}"
            }
    
    # Release the allocated port
    release_port(pod_name)
    print(f"[PORT] Released port for {pod_name}")
    
    return {
        "success": True,
        "pod_name": pod_name,
        "was_running": True,
        "verified": True,
        "message": f"Pod {pod_name} killed and verified down"
    }


def ensure_podman_installed():
    """Check if podman is installed, if not return False."""
    try:
        result = subprocess.run(
            ['which', 'podman'],
            capture_output=True,
            text=True
        )
        return result.returncode == 0
    except:
        return False


def find_requirements_file(project_path: str) -> str:
    """Find requirements.txt or requirements.md in project folder."""
    if not project_path:
        return None
    
    project_dir = Path(project_path)
    if not project_dir.exists():
        return None
    
    # Check for requirements.txt
    req_txt = project_dir / "requirements.txt"
    if req_txt.exists():
        return str(req_txt)
    
    # Check for requirements.md
    req_md = project_dir / "requirements.md"
    if req_md.exists():
        return str(req_md)
    
    return None


def parse_requirements_from_file(req_file: str) -> list:
    """Parse requirements from requirements.txt or requirements.md."""
    try:
        with open(req_file, 'r') as f:
            content = f.read()
        
        # Extract pip requirements from markdown or plain text
        requirements = []
        for line in content.split('\n'):
            line = line.strip()
            # Skip empty lines and comments
            if not line or line.startswith('#'):
                continue
            # Remove markdown code block markers
            line = re.sub(r'^```\w*$', '', line)
            line = line.strip()
            if line and not line.startswith('-') and not line.startswith('*'):
                requirements.append(line)
        
        return requirements
    except:
        return []


def install_requirements_in_pod(requirements: list) -> dict:
    """Install requirements in the pod."""
    if not requirements:
        return {"output": "No requirements to install", "exit_code": 0, "is_error": False}
    
    # Create pip install command
    reqs = ' '.join(requirements)
    cmd = f"pip install --no-cache-dir {reqs}"
    
    result = subprocess.run(
        [
            'podman', 'run', '--rm',
            '-e', ' pipelines_pod_uuid=temp',
            'python:3-slim', 'sh', '-c', cmd
        ],
        capture_output=True,
        text=True,
        timeout=120
    )
    
    return {
        "output": result.stdout + result.stderr,
        "exit_code": result.returncode,
        "is_error": result.returncode != 0
    }


def detect_language(code: str) -> dict:
    """
    Detect the programming language of the code.
    
    Returns:
        dict with 'language' and 'runner' keys
    """
    code_stripped = code.strip()
    
    # Check if it's clearly not code (natural language)
    # If it starts with "Let", "I", "Here", "Sure", etc., it's likely conversational
    conversational_patterns = ['^Let me', '^I will', '^I can', '^Sure,', '^Here', '^Okay,', '^Yes,', '^I\'ll', '^First,', '^Then,']
    import re
    for pattern in conversational_patterns:
        if re.match(pattern, code_stripped, re.IGNORECASE):
            print(f"[DEBUG detect_language] Detected conversational text: {code_stripped[:50]}... -> unknown")
            return {'language': 'unknown', 'runner': 'bash'}
    
    # Check for incomplete/truncated code
    if 'if __name__' in code_stripped and '__main__' not in code_stripped:
        print(f"[DEBUG detect_language] Detected incomplete code (truncated __name__ block)")
        return {'language': 'incomplete', 'runner': 'bash'}
    
    # Check for code that's too short to be real
    if len(code_stripped) < 30:
        print(f"[DEBUG detect_language] Code too short ({len(code_stripped)} chars): {code_stripped[:30]}...")
        return {'language': 'unknown', 'runner': 'bash'}
    
    # Check for shebang
    if code_stripped.startswith('#!'):
        if 'python' in code_stripped:
            return {'language': 'python', 'runner': 'python3'}
        if 'node' in code_stripped:
            return {'language': 'javascript', 'runner': 'node'}
        if 'bash' in code_stripped or 'sh' in code_stripped:
            return {'language': 'shell', 'runner': 'bash'}
    
    # Check for single line shell command (no newlines)
    if '\n' not in code_stripped:
        # Could be shell or python - check for common patterns
        if any(x in code_stripped for x in ['apt-get', 'pip3', 'mkdir', 'cd ', 'ls ', 'echo ', 'cat ', 'grep ']):
            return {'language': 'shell', 'runner': 'bash'}
        if 'python' in code_stripped.lower() and '=' not in code_stripped:
            return {'language': 'python', 'runner': 'python3'}
        return {'language': 'shell', 'runner': 'bash'}
    
    # Check for Python patterns
    python_indicators = [
        'import ', 'from ', 'def ', 'class ', 'if __name__',
        'print(', 'print (', 'elif ', '@app.route', '@staticmethod'
    ]
    if any(indicator in code for indicator in python_indicators):
        return {'language': 'python', 'runner': 'python3'}
    
    # Check for C++ patterns
    cpp_indicators = ['#include', 'std::', 'int main(', 'cout <<', 'endl', 'namespace std']
    if any(indicator in code for indicator in cpp_indicators):
        return {'language': 'cpp', 'runner': 'g++'}
    
    # Check for JavaScript patterns
    js_indicators = ['const ', 'let ', 'function ', 'console.log', 'require(', 'module.exports', 'async ', 'await ']
    if any(indicator in code for indicator in js_indicators):
        return {'language': 'javascript', 'runner': 'node'}
    
    # Check for Java patterns
    java_indicators = ['public class', 'public static void main', 'System.out.println', 'import java.']
    if any(indicator in code for indicator in java_indicators):
        return {'language': 'java', 'runner': 'java'}
    
    # Default to shell
    return {'language': 'shell', 'runner': 'bash'}


def detect_port(output: str) -> str:
    """Detect if the code started a web server and extract the port."""
    # Common patterns for web server output
    port_patterns = [
        r'Running on (http://[^:]+:(\d+))',
        r'Server running at (http://[^:]+:(\d+))',
        r'listening on (http://[^:]+:(\d+))',
        r'http://[^:]+:(\d+)',
        r'Port\s*[:=]\s*(\d+)',
    ]
    
    for pattern in port_patterns:
        match = re.search(pattern, output, re.IGNORECASE)
        if match:
            if len(match.groups()) >= 2:
                return match.group(1)
            return match.group(0)
    
    return None


def detect_web_server(code: str) -> bool:
    """
    Detect if the code is a web server (Flask, FastAPI, etc.).
    
    Args:
        code: The Python code to analyze
        
    Returns:
        True if the code appears to be a web server, False otherwise
    """
    # Check for Flask indicators
    flask_indicators = [
        'from flask import',
        'import flask',
        'Flask(',
        '@app.route',
        'app.run(',
    ]
    
    # Check for FastAPI indicators
    fastapi_indicators = [
        'from fastapi import',
        'import fastapi',
        'FastAPI(',
        '@app.get(',
        '@app.post(',
        '@app.put(',
        '@app.delete(',
    ]
    
    # Check for Django indicators
    django_indicators = [
        'from django',
        'import django',
        'django.setup()',
        'manage.py',
    ]
    
    # Check for Streamlit indicators
    streamlit_indicators = [
        'import streamlit',
        'from streamlit',
        'st.',
        'streamlit run',
    ]
    
    # Check for other common web frameworks
    tornado_indicators = ['from tornado', 'import tornado', 'tornado.web.']
    aiohttp_indicators = ['from aiohttp', 'import aiohttp', 'aiohttp.web.']
    bottle_indicators = ['from bottle', 'import bottle', 'Bottle(']
    cherrypy_indicators = ['from cherrypy', 'import cherrypy']
    pyramid_indicators = ['from pyramid', 'import pyramid']
    web2py_indicators = ['from gluon', 'import gluon']
    
    # Check for app.run() pattern (common for Flask/Django dev servers)
    app_run_pattern = re.search(r'app\.run\s*\(', code)
    
    # Combine all indicators
    all_indicators = (
        flask_indicators + fastapi_indicators + django_indicators +
        streamlit_indicators + tornado_indicators + aiohttp_indicators +
        bottle_indicators + cherrypy_indicators + pyramid_indicators +
        web2py_indicators
    )
    
    # Check if any indicator is in the code
    for indicator in all_indicators:
        if indicator in code:
            return True
    
    # Also check for app.run() pattern
    if app_run_pattern:
        return True
    
    return False


def extract_port_from_code(code: str) -> int:
    """
    Extract the port number from web server code.
    
    Args:
        code: The Python code to analyze
        
    Returns:
        The port number if found, otherwise 8080 (default)
    """
    # Common patterns for port specification in web server code
    
    # Pattern 1: app.run(port=XXXX)
    match = re.search(r'app\.run\s*\([^)]*port\s*=\s*(\d+)', code)
    if match:
        return int(match.group(1))
    
    # Pattern 2: app.run("host", port=XXXX)
    match = re.search(r'port\s*=\s*(\d+)', code)
    if match:
        return int(match.group(1))
    
    # Pattern 3: PORT = XXXX or port = XXXX
    match = re.search(r'(?:PORT|port)\s*=\s*(\d+)', code)
    if match:
        return int(match.group(1))
    
    # Pattern 4: uvicorn.run(..., port=XXXX)
    match = re.search(r'uvicorn\.run\s*\([^)]*port\s*=\s*(\d+)', code)
    if match:
        return int(match.group(1))
    
    # Pattern 5: uvicorn --port XXXX (would be in comments or separate)
    match = re.search(r'--port\s+(\d+)', code)
    if match:
        return int(match.group(1))
    
    # Pattern 6: streamlit run app.py --server.port XXXX
    match = re.search(r'server\.port\s+(\d+)', code)
    if match:
        return int(match.group(1))
    
    # Default port
    return 8080


def run_code_in_pod(code: str, project_path: str = None, user_name: str = None, project_name: str = None) -> dict:
    """
    Run code in an isolated podman pod.
    
    Args:
        code: The code to execute
        project_path: Optional project path for the pod's working directory
        user_name: Username for pod naming (optional)
        project_name: Project name for pod naming (optional)
    
    Returns:
        Dict with output, exit_code, is_error, and access_info
    """
    # Check if podman is available
    if not ensure_podman_installed():
        return {
            "output": "Podman is not installed. Please install podman first.",
            "exit_code": 1,
            "is_error": True,
            "access_info": None
        }
    
    # Load pod settings
    settings = get_pod_settings()
    
    # Create container name based on user/project or generate unique
    if user_name and project_name:
        container_name = get_pod_name_normalized(user_name, project_name)
    else:
        container_name = f"test-pod-{uuid.uuid4().hex[:8]}"
    
    # Check if pod is already running with this name
    check_running = subprocess.run(
        ['podman', 'ps', '--filter', f'name={container_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    pod_already_running = container_name in check_running.stdout
    
    # Check if pod exists (but not running)
    check_exists = subprocess.run(
        ['podman', 'ps', '-a', '--filter', f'name={container_name}', '--format', '{{.Names}}'],
        capture_output=True,
        text=True
    )
    pod_exists = container_name in check_exists.stdout
    
    # Determine the working directory
    # FIX: Always use container-internal path /workspace for working directory
    # Mount the project path to /workspace so files are accessible inside container
    # Previously was using host path directly which failed because container doesn't have
    # access to host filesystem paths - causing "no such file or directory" error
    if project_path:
        host_path = project_path
        container_work_dir = "/workspace"
    else:
        host_path = "/tmp"
        container_work_dir = "/tmp"
    work_dir = container_work_dir
    
    # Allocate a port for this pod (uses 8080 if available, otherwise random)
    allocated_port = allocate_port(container_name, settings.get("default_port", 8080))
    print(f"[PORT] Allocated port {allocated_port} for {container_name}")
    
    # Decide whether to keep pod running
    keep_running = settings.get("keep_running", True)
    auto_destroy = settings.get("auto_destroy", False)
    
    # DEBUG: Log the settings
    print(f"[DEBUG] keep_running={keep_running}, auto_destroy={auto_destroy}")
    print(f"[DEBUG] pod_already_running={pod_already_running}, pod_exists={pod_exists}")
    
    # Find and install requirements if project_path is provided
    requirements_installed = False
    requirements_output = ""
    
    if project_path:
        req_file = find_requirements_file(project_path)
        if req_file:
            requirements = parse_requirements_from_file(req_file)
            if requirements:
                print(f"Installing requirements: {requirements}")
                install_result = install_requirements_in_pod(requirements)
                requirements_output = f"\n[Installing requirements from {Path(req_file).name}]\n{install_result['output']}"
                if install_result['is_error']:
                    return {
                        "output": f"Failed to install requirements: {install_result['output']}",
                        "exit_code": 1,
                        "is_error": True,
                        "access_info": None,
                        "access_url": None
                    }
                requirements_installed = True
    
    try:
        # Run the code in a container
        # Detect language from code content
        language_info = detect_language(code)
        lang = language_info['language']
        
        # Detect if this is a web server (Flask, FastAPI, etc.)
        is_web_server = False
        web_server_port = None
        if lang == 'python':
            is_web_server = detect_web_server(code)
            if is_web_server:
                web_server_port = extract_port_from_code(code)
                print(f"[DEBUG] Web server detected! Port: {web_server_port}")
                # Auto-add if __name__ block if missing
                if "__name__" not in code and "app.run" in code.lower():
                    code = code.rstrip() + "\n\nif __name__ == '__main__':\n    app.run(host='0.0.0.0', port=8080)\n"
                    print(f"[DEBUG] Added __name__ block to Flask code")
        
        print(f"[DEBUG] Detected language: {lang}, is_web_server: {is_web_server}, code_length: {len(code)}")
        print(f"[DEBUG] Code preview: {code[:200]}...")
        
        if lang == 'shell':
            cmd = code.strip()
            image = settings.get("shell_image", "ubuntu:latest")
        elif lang == 'python':
            cmd = code
            image = settings.get("python_image", "python:3-slim")
        elif lang == 'cpp':
            cmd = code
            image = "gcc:latest"
        elif lang == 'javascript':
            cmd = code
            image = "node:latest"
        elif lang == 'java':
            cmd = code
            image = "openjdk:latest"
        else:
            # Default to shell
            cmd = code.strip()
            image = settings.get("shell_image", "ubuntu:latest")
        
        # For web server code, prepare to write to file and run in background
        if is_web_server and lang == 'python':
            # Write code to app.py file in the host's project directory (mounted to /workspace)
            app_file_path = os.path.join(host_path, "app.py") if host_path != "/tmp" else "/tmp/app.py"
            try:
                # Ensure directory exists
                os.makedirs(os.path.dirname(app_file_path), exist_ok=True)
                with open(app_file_path, 'w') as f:
                    f.write(code)
                print(f"[WEB] Wrote web server code to {app_file_path}")
            except Exception as e:
                print(f"[WEB] Warning: Could not write app.py: {e}")
                # Fall back to inline execution
            
        # Check if we can reuse existing pod or need to create new one
        if pod_already_running:
            # Pod is already running - exec into it
            print(f"[POD] Reusing existing pod: {container_name}")
            print(f"[DEBUG] exec work_dir = {work_dir}")
            
            # Use the detected language runner
            runner = language_info.get('runner', 'bash')
            if lang == 'shell':
                podman_cmd = ['podman', 'exec', '-w', work_dir, container_name, 'sh', '-c', cmd]
                result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
            elif is_web_server and lang == 'python':
                # For web server, run in background and return immediately
                web_cmd = f"cd {work_dir} && python /workspace/app.py &"
                print(f"[WEB] Running web server in background: {web_cmd}")
                podman_cmd = ['podman', 'exec', '-w', work_dir, container_name, 'sh', '-c', web_cmd]
                result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=10  # Short timeout since we just start the server
                )
                # For web server, we consider it success even if there's no output
                full_output = result.stdout + result.stderr
                if not full_output.strip():
                    full_output = f"Web server started in background on port {web_server_port}"
                # Return immediately without waiting for server to finish
                return {
                    "output": full_output,
                    "exit_code": 0,
                    "is_error": False,
                    "access_url": f"http://localhost:{allocated_port}",
                    "access_info": f"Web server running! Access at: http://localhost:{allocated_port}",
                    "requirements_installed": requirements_installed,
                    "container_name": container_name,
                    "allocated_port": allocated_port,
                    "keep_running": keep_running,
                    "pod_reused": True,
                    "web_server": True
                }
            else:
                podman_cmd = ['podman', 'exec', '-w', work_dir, container_name, runner, '-c', cmd]
                result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
        elif pod_exists:
            # Pod exists but not running - start it first
            print(f"[POD] Starting existing pod: {container_name}")
            subprocess.run(['podman', 'start', container_name], capture_output=True)
            # Wait a bit for pod to start
            import time
            time.sleep(1)
            # Now exec into it - use detected language runner
            runner = language_info.get('runner', 'bash')
            if lang == 'shell':
                podman_cmd = ['podman', 'exec', '-w', work_dir, container_name, 'sh', '-c', cmd]
                result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
            elif is_web_server and lang == 'python':
                # For web server, run in background and return immediately
                web_cmd = f"cd {work_dir} && python /workspace/app.py &"
                print(f"[WEB] Running web server in background: {web_cmd}")
                podman_cmd = ['podman', 'exec', '-w', work_dir, container_name, 'sh', '-c', web_cmd]
                result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                full_output = result.stdout + result.stderr
                if not full_output.strip():
                    full_output = f"Web server started in background on port {web_server_port}"
                return {
                    "output": full_output,
                    "exit_code": 0,
                    "is_error": False,
                    "access_url": f"http://localhost:{allocated_port}",
                    "access_info": f"Web server running! Access at: http://localhost:{allocated_port}",
                    "requirements_installed": requirements_installed,
                    "container_name": container_name,
                    "allocated_port": allocated_port,
                    "keep_running": keep_running,
                    "pod_reused": True,
                    "web_server": True
                }
            else:
                podman_cmd = ['podman', 'exec', '-w', work_dir, container_name, runner, '-c', cmd]
                result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
        else:
            # Pod doesn't exist - create new one
            print(f"[POD] Creating new pod: {container_name}, keep_running={keep_running}")
            
            if keep_running:
                # When keep_running=True, start container in detached mode with keepalive
                # Then exec the command into the running container
                podman_cmd = ['podman', 'run', '-d']
                
                # Don't use --rm when keeping running
                # if auto_destroy or not keep_running:
                #     podman_cmd.append('--rm')
                
                podman_cmd.extend([
                    '--name', container_name,
                    '-v', f'{host_path}:{container_work_dir}:Z',
                    '-w', container_work_dir,
                    '-p', f"{allocated_port}:8080",
                    image, 'tail', '-f', '/dev/null'
                ])
                
                print(f"[POD] Running: {' '.join(podman_cmd)}")
                
                # Start container in detached mode (running in background)
                run_result = subprocess.run(
                    podman_cmd,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                print(f"[POD] Run result: returncode={run_result.returncode}, stdout={run_result.stdout}, stderr={run_result.stderr}")
                
                # Wait for container to start
                import time
                time.sleep(2)
                
                # Now exec the command into the running container - use detected language runner
                runner = language_info.get('runner', 'bash')
                if lang == 'shell':
                    exec_cmd = ['podman', 'exec', '-w', work_dir, container_name, 'sh', '-c', cmd]
                    result = subprocess.run(
                        exec_cmd,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                elif is_web_server and lang == 'python':
                    # For web server, run in background and return immediately
                    web_cmd = f"cd {work_dir} && python /workspace/app.py &"
                    print(f"[WEB] Running web server in background: {web_cmd}")
                    exec_cmd = ['podman', 'exec', '-w', work_dir, container_name, 'sh', '-c', web_cmd]
                    result = subprocess.run(
                        exec_cmd,
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    full_output = result.stdout + result.stderr
                    if not full_output.strip():
                        full_output = f"Web server started in background on port {web_server_port}"
                    return {
                        "output": full_output,
                        "exit_code": 0,
                        "is_error": False,
                        "access_url": f"http://localhost:{allocated_port}",
                        "access_info": f"Web server running! Access at: http://localhost:{allocated_port}",
                        "requirements_installed": requirements_installed,
                        "container_name": container_name,
                        "allocated_port": allocated_port,
                        "keep_running": keep_running,
                        "pod_reused": False,
                        "web_server": True
                    }
                else:
                    exec_cmd = ['podman', 'exec', '-w', work_dir, container_name, runner, '-c', cmd]
                    result = subprocess.run(
                        exec_cmd,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
            else:
                # When not keeping running, use the original behavior
                podman_cmd = ['podman', 'run']
                
                # Add --rm only if auto_destroy is true OR keep_running is false
                if auto_destroy or not keep_running:
                    podman_cmd.append('--rm')
                
                # Use detected language runner
                runner = language_info.get('runner', 'bash')
                if lang == 'shell':
                    podman_cmd.extend([
                        '--name', container_name,
                        '-v', f'{host_path}:{container_work_dir}:Z',
                        '-w', container_work_dir,
                        '-p', f"{allocated_port}:8080",
                        image, 'sh', '-c', cmd
                    ])
                    result = subprocess.run(
                        podman_cmd,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
                elif is_web_server and lang == 'python':
                    # For web server, run in background with tail -f /dev/null to keep container running
                    web_cmd = f"cd {work_dir} && python /workspace/app.py &"
                    print(f"[WEB] Running web server in background: {web_cmd}")
                    podman_cmd.extend([
                        '--name', container_name,
                        '-v', f'{host_path}:{container_work_dir}:Z',
                        '-w', container_work_dir,
                        '-p', f"{allocated_port}:8080",
                        image, 'sh', '-c', f"{web_cmd}; tail -f /dev/null"
                    ])
                    result = subprocess.run(
                        podman_cmd,
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    full_output = result.stdout + result.stderr
                    if not full_output.strip():
                        full_output = f"Web server started in background on port {web_server_port}"
                    return {
                        "output": full_output,
                        "exit_code": 0,
                        "is_error": False,
                        "access_url": f"http://localhost:{allocated_port}",
                        "access_info": f"Web server running! Access at: http://localhost:{allocated_port}",
                        "requirements_installed": requirements_installed,
                        "container_name": container_name,
                        "allocated_port": allocated_port,
                        "keep_running": keep_running,
                        "pod_reused": False,
                        "web_server": True
                    }
                else:
                    podman_cmd.extend([
                        '--name', container_name,
                        '-v', f'{host_path}:{container_work_dir}:Z',
                        '-w', container_work_dir,
                        '-p', f"{allocated_port}:8080",
                        image, runner, '-c', cmd
                    ])
                    result = subprocess.run(
                        podman_cmd,
                        capture_output=True,
                        text=True,
                        timeout=60
                    )
        
        full_output = result.stdout + result.stderr
        
        # Detect if a web server was started
        port = detect_port(full_output)
        access_info = None
        access_url = None
        if port:
            access_url = f"http://localhost:{allocated_port}"
            access_info = f"Web server detected! Access at: {access_url} (port {port})"
        
        return {
            "output": full_output,
            "exit_code": result.returncode,
            "is_error": result.returncode != 0,
            "access_info": access_info,
            "access_url": access_url,
            "requirements_installed": requirements_installed,
            "container_name": container_name,
            "allocated_port": allocated_port,
            "keep_running": keep_running,
            "pod_reused": pod_already_running or pod_exists
        }
        
    except subprocess.TimeoutExpired:
        # Try to clean up the container
        subprocess.run(['podman', 'kill', container_name], capture_output=True)
        return {
            "output": "Execution timed out after 60 seconds",
            "exit_code": 1,
            "is_error": True,
            "access_info": None,
            "access_url": None,
            "container_name": container_name
        }
    except Exception as e:
        return {
            "output": f"Error running code: {str(e)}",
            "exit_code": 1,
            "is_error": True,
            "access_info": None,
            "access_url": None,
            "container_name": container_name
        }
    finally:
        # Only cleanup if auto_destroy is true or keep_running is false
        if settings.get("auto_destroy", False) or not settings.get("keep_running", True):
            subprocess.run(['podman', 'kill', container_name], capture_output=True)
            release_port(container_name)
            print(f"[PORT] Released port for {container_name} (cleanup)")


def run_shell_command(command: str, project_path: str = None) -> dict:
    """
    Run a shell command in a podman pod.
    
    Args:
        command: The shell command to execute
        project_path: Optional project path
    
    Returns:
        Dict with output, exit_code, and is_error
    """
    if not ensure_podman_installed():
        return {
            "output": "Podman is not installed. Please install podman first.",
            "exit_code": 1,
            "is_error": True
        }
    
    container_name = f"shell-pod-{uuid.uuid4().hex[:8]}"
    # FIX: Use container-internal path instead of host path
    if project_path:
        host_path = project_path
        container_work_dir = "/workspace"
    else:
        host_path = "/tmp"
        container_work_dir = "/tmp"
    
    try:
        result = subprocess.run(
            [
                'podman', 'run', '--rm', '--name', container_name,
                '-v', f'{host_path}:{container_work_dir}:Z',
                '-w', container_work_dir,
                'ubuntu:latest', 'sh', '-c', command
            ],
            capture_output=True,
            text=True,
            timeout=60
        )
        
        return {
            "output": result.stdout + result.stderr,
            "exit_code": result.returncode,
            "is_error": result.returncode != 0
        }
        
    except subprocess.TimeoutExpired:
        subprocess.run(['podman', 'kill', container_name], capture_output=True)
        return {
            "output": "Execution timed out after 60 seconds",
            "exit_code": 1,
            "is_error": True
        }
    except Exception as e:
        return {
            "output": f"Error running command: {str(e)}",
            "exit_code": 1,
            "is_error": True
        }
    finally:
        subprocess.run(['podman', 'kill', container_name], capture_output=True)


if __name__ == "__main__":
    # Test
    result = run_code_in_pod("print('Hello from pod!')")
    print(result)
