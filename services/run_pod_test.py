"""
Run Pod Test Service
Spins up a podman pod to run code and return results.
"""
import subprocess
import os
import uuid
import re
import time
from pathlib import Path
from typing import Dict, Any, Optional


# Default pod settings
DEFAULT_POD_SETTINGS = {
    "keep_running": True,
    "idle_timeout_minutes": 30,
    "auto_destroy": False,
    "python_image": "python:3-alpine",
    "shell_image": "alpine",
    "work_dir": "/tmp",
    "default_port": 8080
}


def get_pod_settings() -> Dict[str, Any]:
    """Load pod settings from default_pod.md context file."""
    context_files_dir = Path(__file__).parent.parent / "context_files"
    pod_settings_file = context_files_dir / "default_pod.md"
    
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
    """Generate pod name based on user and project."""
    return f"{user_name}-{project_name}-pod"


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
            'python:3-alpine', 'sh', '-c', cmd
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
        container_name = get_pod_name(user_name, project_name)
    else:
        container_name = f"test-pod-{uuid.uuid4().hex[:8]}"
    
    # Determine the working directory
    if project_path:
        work_dir = project_path
    else:
        work_dir = settings.get("work_dir", "/tmp")
    
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
                        "access_info": None
                    }
                requirements_installed = True
    
    try:
        # Run the code in a container
        # Determine if it's Python or shell command
        if code.strip().startswith('#!') or '\n' not in code:
            # Might be shell command
            cmd = code.strip()
            image = settings.get("shell_image", "alpine")
        else:
            # Python code
            cmd = f"python -c {repr(code)}"
            image = settings.get("python_image", "python:3-alpine")
        
        # Build podman run command based on settings
        podman_cmd = ['podman', 'run']
        
        # Add --rm only if auto_destroy is true
        if settings.get("auto_destroy", False):
            podman_cmd.append('--rm')
        
        podman_cmd.extend([
            '--name', container_name,
            '-v', f'{work_dir}:{work_dir}:Z',
            '-w', work_dir,
            '-p', f"{settings.get('default_port', 8080)}:8080",
            image, 'sh', '-c', cmd
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
        if port:
            access_info = f"Web server detected! Access at: http://localhost:{settings.get('default_port', 8080)} (port {port})"
        
        return {
            "output": full_output,
            "exit_code": result.returncode,
            "is_error": result.returncode != 0,
            "access_info": access_info,
            "requirements_installed": requirements_installed,
            "container_name": container_name,
            "keep_running": settings.get("keep_running", True)
        }
        
    except subprocess.TimeoutExpired:
        # Try to clean up the container
        subprocess.run(['podman', 'kill', container_name], capture_output=True)
        return {
            "output": "Execution timed out after 60 seconds",
            "exit_code": 1,
            "is_error": True,
            "access_info": None,
            "container_name": container_name
        }
    except Exception as e:
        return {
            "output": f"Error running code: {str(e)}",
            "exit_code": 1,
            "is_error": True,
            "access_info": None,
            "container_name": container_name
        }
    finally:
        # Only cleanup if auto_destroy is true or keep_running is false
        if settings.get("auto_destroy", False) or not settings.get("keep_running", True):
            subprocess.run(['podman', 'kill', container_name], capture_output=True)


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
    work_dir = project_path if project_path else "/tmp"
    
    try:
        result = subprocess.run(
            [
                'podman', 'run', '--rm', '--name', container_name,
                '-v', f'{work_dir}:{work_dir}:Z',
                '-w', work_dir,
                'alpine', 'sh', '-c', command
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
