"""
Command detection and execution service.
Determines if a user prompt is a Linux command or should be passed to LLM.
"""
import subprocess
import re
from typing import Tuple, Dict, Any, Optional

# Linux commands that should be executed directly
LINUX_COMMANDS = {
    'ls', 'pwd', 'cat', 'echo', 'find', 'grep', 'cd', 'mkdir', 'touch', 
    'rm', 'cp', 'mv', 'chmod', 'chown', 'chgrp', 'df', 'du', 'free', 
    'top', 'ps', 'kill', 'killall', 'curl', 'wget', 'git', 'npm', 
    'pip', 'pip3', 'python', 'python3', 'node', 'docker', 'docker-compose',
    'tar', 'zip', 'unzip', 'gzip', 'gunzip', 'ssh', 'scp', 'rsync',
    'head', 'tail', 'less', 'more', 'wc', 'sort', 'uniq', 'cut', 'awk',
    'sed', 'diff', 'patch', 'make', 'cmake', 'gcc', 'g++', 'clang',
    'env', 'export', 'source', 'which', 'whereis', 'locate', 'type',
    'history', 'alias', 'unalias', 'jobs', 'fg', 'bg', 'nohup',
    'systemctl', 'service', 'journalctl', 'netstat', 'ss', 'ip', 'ifconfig',
    'ping', 'traceroute', 'nslookup', 'dig', 'host', 'telnet', 'nc',
    'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'brew', 'snap', 'flatpak',
    'tree', 'ln', 'stat', 'file', 'md5sum', 'sha256sum', 'base64',
    'date', 'cal', 'sleep', 'wait', 'read', 'printf', 'test'
}

# Dangerous commands that should be blocked
DANGEROUS_COMMANDS = [
    'rm -rf', 'mkfs', 'dd if=', '> /dev/sd', 'shutdown', 'reboot', 
    'init 0', 'halt', 'poweroff', 'logout', 'exit', 'passwd',
    'chmod 777', 'chown -R', ':(){:|:&};:', 'wget | bash', 'curl | bash'
]

# Patterns that indicate a Linux command
COMMAND_PATTERNS = [
    r'^[a-zA-Z_][a-zA-Z0-9_\-\.]*\s+',  # command with arguments
    r'^/[a-zA-Z0-9_\-/.]+',  # absolute path
    r'^\./[a-zA-Z0-9_\-/.]+',  # relative path
    r'^~[a-zA-Z0-9_\-/.]*',  # home directory
]


def is_linux_command(prompt: str) -> Tuple[bool, Optional[str]]:
    """
    Determine if the prompt is a Linux command.
    
    Returns:
        Tuple of (is_command, command_to_run)
    """
    prompt = prompt.strip()
    
    # Check for dangerous commands first
    for dangerous in DANGEROUS_COMMANDS:
        if dangerous in prompt:
            return True, None  # Command, but blocked
    
    # Check if it starts with a known Linux command
    words = prompt.split()
    if words:
        first_word = words[0].split('|')[0].split('&')[0]  # Handle pipes and background
        
        # Remove common prefixes
        first_word = first_word.replace('sudo ', '').replace('sudo', '')
        
        if first_word in LINUX_COMMANDS:
            return True, prompt
    
    # Check against patterns
    for pattern in COMMAND_PATTERNS:
        if re.match(pattern, prompt):
            # Verify it's actually a known command
            first_word = prompt.split()[0] if prompt.split() else ''
            first_word = first_word.replace('sudo ', '').replace('sudo', '')
            if first_word in LINUX_COMMANDS or first_word.startswith('/') or first_word.startswith('./'):
                return True, prompt
    
    return False, None


def execute_command(command: str, cwd: str = "/home/aeli/projects/aelilobster", timeout: int = 30) -> Dict[str, Any]:
    """
    Execute a Linux command and return the output.
    
    Returns:
        Dict with 'output', 'exit_code', 'is_error' keys
    """
    # Final safety check
    for dangerous in DANGEROUS_COMMANDS:
        if dangerous in command:
            return {
                "output": f"Command blocked for safety: {dangerous}",
                "exit_code": 1,
                "is_error": True
            }
    
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=cwd
        )
        
        output = result.stdout + result.stderr
        if not output:
            output = "(no output)"
        
        return {
            "output": output[:50000],  # Limit output size
            "exit_code": result.returncode,
            "is_error": result.returncode != 0
        }
    except subprocess.TimeoutExpired:
        return {
            "output": "Command timed out after {} seconds".format(timeout),
            "exit_code": 124,
            "is_error": True
        }
    except Exception as e:
        return {
            "output": "Error: {}".format(str(e)),
            "exit_code": 1,
            "is_error": True
        }


def process_prompt(prompt: str, llm_callback=None, cwd: str = "/home/aeli/projects/aelilobster") -> Dict[str, Any]:
    """
    Process a user prompt - either execute as command or pass to LLM.
    
    Args:
        prompt: The user's input
        llm_callback: Optional callback function to call LLM if not a command
        cwd: Working directory for command execution
    
    Returns:
        Dict with 'type' ('command' or 'llm'), 'result', and optional 'command_output'
    """
    is_command, command = is_linux_command(prompt)
    
    if is_command:
        if command is None:
            return {
                "type": "error",
                "result": "Command blocked for safety reasons"
            }
        
        result = execute_command(command, cwd)
        return {
            "type": "command",
            "result": result["output"],
            "exit_code": result["exit_code"],
            "is_error": result["is_error"]
        }
    else:
        # Pass to LLM
        if llm_callback:
            llm_result = llm_callback(prompt)
            return {
                "type": "llm",
                "result": llm_result
            }
        else:
            return {
                "type": "llm",
                "result": None,
                "error": "No LLM callback provided"
            }
