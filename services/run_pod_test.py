"""
Run Pod Test Service
Spins up a podman pod to run code and return results.
"""
import subprocess
import os
import uuid
from pathlib import Path


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


def run_code_in_pod(code: str, project_path: str = None) -> dict:
    """
    Run code in an isolated podman pod.
    
    Args:
        code: The code to execute
        project_path: Optional project path for the pod's working directory
    
    Returns:
        Dict with output, exit_code, and is_error
    """
    # Check if podman is available
    if not ensure_podman_installed():
        return {
            "output": "Podman is not installed. Please install podman first.",
            "exit_code": 1,
            "is_error": True
        }
    
    # Create a unique container name
    container_name = f"test-pod-{uuid.uuid4().hex[:8]}"
    
    # Determine the working directory
    if project_path:
        work_dir = project_path
    else:
        work_dir = "/tmp"
    
    try:
        # Run the code in a container
        # Using alpine or ubuntu as base image - try python first
        result = subprocess.run(
            [
                'podman', 'run', '--rm', '--name', container_name,
                '-v', f'{work_dir}:{work_dir}:Z',
                '-w', work_dir,
                'python:3-alpine', 'python', '-c', code
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
        # Try to clean up the container
        subprocess.run(['podman', 'kill', container_name], capture_output=True)
        return {
            "output": "Execution timed out after 60 seconds",
            "exit_code": 1,
            "is_error": True
        }
    except Exception as e:
        return {
            "output": f"Error running code: {str(e)}",
            "exit_code": 1,
            "is_error": True
        }
    finally:
        # Ensure container is cleaned up
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
