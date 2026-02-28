"""
Terminal Service
Provides interactive terminal functionality using PTY for command execution.
Allows running commands with sudo, interactive prompts, and shell-like behavior.
"""
import os
import pty
import select
import subprocess
import time
import threading
from typing import Dict, Any, Optional, Tuple

# Terminal session storage
terminal_sessions = {}


class TerminalSession:
    """Represents an interactive terminal session."""
    
    def __init__(self, session_id: str, cwd: str = "/home/aeli/projects/aelilobster"):
        self.session_id = session_id
        self.cwd = cwd
        self.master_fd = None
        self.pid = None
        self.running = False
        self.output_buffer = ""
        self.command_history = []
    
    def start(self) -> Dict[str, Any]:
        """Start the terminal session."""
        try:
            # Fork a PTY
            pid, master_fd = pty.fork()
            
            if pid == 0:
                # Child process - exec the shell
                os.chdir(self.cwd)
                # Use bash -i for interactive shell
                os.execvp('bash', ['bash', '-i'])
            
            # Parent process
            self.pid = pid
            self.master_fd = master_fd
            self.running = True
            
            # Read initial output
            time.sleep(0.3)
            self._read_output()
            
            return {
                "success": True,
                "session_id": self.session_id,
                "output": self.output_buffer,
                "message": "Terminal session started"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "message": f"Failed to start terminal: {e}"
            }
    
    def _read_output(self, timeout: float = 0.1) -> str:
        """Read available output from the PTY."""
        if not self.master_fd:
            return ""
        
        output = ""
        try:
            # Use select for non-blocking read
            while True:
                ready, _, _ = select.select([self.master_fd], [], [], timeout)
                if not ready:
                    break
                
                data = os.read(self.master_fd, 4096)
                if not data:
                    break
                output += data.decode('utf-8', errors='replace')
                timeout = 0.05  # Shorter timeout for subsequent reads
        except OSError:
            pass
        
        self.output_buffer += output
        return output
    
    def execute_command(self, command: str, timeout: float = 30.0) -> Dict[str, Any]:
        """Execute a command in the terminal and wait for completion."""
        if not self.running or not self.master_fd:
            return {
                "success": False,
                "output": "Terminal session not running",
                "exit_code": -1
            }
        
        # Clear output buffer before command
        self.output_buffer = ""
        
        try:
            # Send the command
            cmd_with_newline = command + "\n"
            os.write(self.master_fd, cmd_with_newline.encode('utf-8'))
            
            # Record in history
            self.command_history.append({
                "command": command,
                "timestamp": time.time()
            })
            
            # Wait for command to complete
            # We'll wait for a prompt pattern (common shell prompts)
            start_time = time.time()
            last_output_time = start_time
            prompt_patterns = ['$ ', '# ', '> ', 'aeli@', '~# ', '~% ']
            
            while time.time() - start_time < timeout:
                output = self._read_output(timeout=0.2)
                
                if output:
                    last_output_time = time.time()
                
                # Check if we have a prompt (command finished)
                # Look for prompt at the end of output
                for pattern in prompt_patterns:
                    if pattern in output and (output.rfind(pattern) > output.rfind('\n') - 20):
                        # Check if there's new content after the prompt (user typing)
                        if len(output) > output.rfind(pattern) + len(pattern) + 5:
                            continue
                        # Got prompt, command likely done
                        return {
                            "success": True,
                            "output": output.strip(),
                            "exit_code": 0,
                            "session_id": self.session_id
                        }
                
                # Check if process exited
                try:
                    pid, status = os.waitpid(self.pid, os.WNOHANG)
                    if pid != 0:
                        # Process exited
                        self._read_output(timeout=0.1)
                        return {
                            "success": status == 0,
                            "output": self.output_buffer.strip(),
                            "exit_code": os.WEXITSTATUS(status),
                            "session_id": self.session_id
                        }
                except ChildProcessError:
                    pass
                
                # Check for inactivity timeout (might be waiting for input)
                if time.time() - last_output_time > 5.0:
                    # Might be waiting for interactive input
                    return {
                        "success": False,
                        "output": self.output_buffer.strip() + "\n\n[Waiting for input...]",
                        "exit_code": -1,
                        "waiting_for_input": True,
                        "session_id": self.session_id
                    }
            
            # Timeout
            return {
                "success": False,
                "output": self.output_buffer.strip() + "\n\n[Command timed out]",
                "exit_code": 124,
                "session_id": self.session_id
            }
            
        except Exception as e:
            return {
                "success": False,
                "output": f"Error: {str(e)}",
                "exit_code": 1,
                "session_id": self.session_id
            }
    
    def send_input(self, input_text: str) -> Dict[str, Any]:
        """Send interactive input (like yes/no responses)."""
        if not self.running or not self.master_fd:
            return {
                "success": False,
                "output": "Terminal session not running"
            }
        
        try:
            os.write(self.master_fd, (input_text + "\n").encode('utf-8'))
            time.sleep(0.3)
            output = self._read_output()
            
            return {
                "success": True,
                "output": output.strip(),
                "session_id": self.session_id
            }
        except Exception as e:
            return {
                "success": False,
                "output": f"Error: {str(e)}"
            }
    
    def resize(self, rows: int, cols: int) -> bool:
        """Resize the terminal window."""
        if not self.master_fd:
            return False
        try:
            import fcntl
            import termios
            import struct
            winsize = struct.pack('HHHH', rows, cols, 0, 0)
            fcntl.ioctl(self.master_fd, termios.TIOCSWINSZ, winsize)
            return True
        except:
            return False
    
    def is_alive(self) -> bool:
        """Check if the terminal process is still running."""
        if not self.running or not self.pid:
            return False
        
        try:
            pid, status = os.waitpid(self.pid, os.WNOHANG)
            return pid == 0
        except ChildProcessError:
            return False
    
    def close(self) -> Dict[str, Any]:
        """Close the terminal session."""
        if not self.running:
            return {"success": True, "message": "Already closed"}
        
        try:
            if self.master_fd:
                os.close(self.master_fd)
            
            if self.pid:
                try:
                    os.kill(self.pid, 9)
                except:
                    pass
            
            self.running = False
            
            # Remove from sessions
            if self.session_id in terminal_sessions:
                del terminal_sessions[self.session_id]
            
            return {
                "success": True,
                "message": "Terminal session closed",
                "session_id": self.session_id
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }


def create_session(session_id: str, cwd: str = "/home/aeli/projects/aelilobster") -> TerminalSession:
    """Create a new terminal session."""
    session = TerminalSession(session_id, cwd)
    terminal_sessions[session_id] = session
    return session


def get_session(session_id: str) -> Optional[TerminalSession]:
    """Get an existing terminal session."""
    return terminal_sessions.get(session_id)


def execute_in_terminal(session_id: str, command: str) -> Dict[str, Any]:
    """Execute a command in an existing terminal session."""
    session = get_session(session_id)
    if not session:
        return {
            "success": False,
            "output": "No terminal session found. Create one first.",
            "error": "no_session"
        }
    
    return session.execute_command(command)


def send_terminal_input(session_id: str, input_text: str) -> Dict[str, Any]:
    """Send interactive input to a terminal session."""
    session = get_session(session_id)
    if not session:
        return {
            "success": False,
            "output": "No terminal session found"
        }
    
    return session.send_input(input_text)


def close_terminal_session(session_id: str) -> Dict[str, Any]:
    """Close a terminal session."""
    session = get_session(session_id)
    if not session:
        return {
            "success": False,
            "output": "No terminal session to close"
        }
    
    return session.close()


def list_sessions() -> Dict[str, Any]:
    """List all active terminal sessions."""
    sessions = []
    for sid, session in terminal_sessions.items():
        sessions.append({
            "session_id": sid,
            "cwd": session.cwd,
            "alive": session.is_alive(),
            "command_count": len(session.command_history)
        })
    
    return {
        "sessions": sessions,
        "count": len(sessions)
    }
