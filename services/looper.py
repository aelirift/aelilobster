"""
Looper Service - Tree-based Command Execution
Handles the tree: prompt -> commands -> error fixes -> results
"""
import uuid
import json
import subprocess
from typing import List, Dict, Any, Optional, Callable
from pathlib import Path
from services.code_stripper import extract_code_blocks
from services.run_pod_test import run_code_in_pod, find_requirements_file, parse_requirements_from_file, ensure_podman_installed, get_pod_name, get_pod_settings
from services.debugger import debug_error, analyze_error, get_debugger_context


# Callback type for trace logging
TraceCallback = Optional[Callable[[str, str, Any], None]]


class TraceLogger:
    """Stores trace entries for sending to frontend."""
    def __init__(self):
        self.entries = []
    
    def add(self, type: str, label: str, data: Any):
        from datetime import datetime
        entry = {
            "type": type,
            "label": label,
            "data": data,
            "time": datetime.now().strftime("%H:%M:%S")
        }
        self.entries.append(entry)
    
    def clear(self):
        self.entries = []
    
    def get_all(self):
        return self.entries


# Global trace logger
trace_logger = TraceLogger()


class CommandNode:
    """Represents a node in the command tree."""
    def __init__(self, code: str, language: str = "python", parent_id: str = None):
        self.id = str(uuid.uuid4().hex[:8])
        self.code = code
        self.language = language
        self.parent_id = parent_id
        self.result = None
        self.error = None
        self.success = False
        self.fixed_code = None  # Code after debugging
        self.children: List['CommandNode'] = []
        self.level = 0
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "code": self.code,
            "language": self.language,
            "parent_id": self.parent_id,
            "result": self.result,
            "error": self.error,
            "success": self.success,
            "fixed_code": self.fixed_code,
            "level": self.level,
            "children": [c.to_dict() for c in self.children]
        }


class LooperState:
    """Tracks the state of the looper execution."""
    def __init__(self):
        self.is_running = False
        self.should_stop = False
        self.loop_count = 0
        self.max_loops = 10
        self.max_depth = 5  # Max depth for tree
        self.successful_results: List[str] = []
        self.error_stack: List[Dict[str, Any]] = []
        self.debug_context: List[str] = []
        self.current_project_path: Optional[str] = None
        self.trace_callback: TraceCallback = None
        self.command_tree: List[CommandNode] = []  # Root nodes
    
    def reset(self):
        """Reset the state for a new run."""
        self.is_running = False
        self.should_stop = False
        self.loop_count = 0
        self.successful_results = []
        self.error_stack = []
        self.debug_context = []
        self.command_tree = []
    
    def stop(self):
        """Signal the looper to stop."""
        self.should_stop = True


# Global state
looper_state = LooperState()


def get_looper_state() -> LooperState:
    """Get the current looper state."""
    return looper_state


def set_trace_callback(callback: TraceCallback):
    """Set the trace callback function."""
    looper_state.trace_callback = callback


def log_trace(type: str, label: str, data: Any):
    """Log to trace - both to callback and to logger for frontend."""
    # Add to logger for frontend
    trace_logger.add(type, label, data)
    
    # Also call callback if set
    if looper_state.trace_callback:
        looper_state.trace_callback(type, label, data)


def ensure_project_requirements(project_path: str) -> Dict[str, Any]:
    """Find or create requirements.txt for a project."""
    if not project_path:
        return {"exists": False, "created": False, "path": None, "message": "No project path"}
    
    project_dir = Path(project_path)
    if not project_dir.exists():
        return {"exists": False, "created": False, "path": None, "message": "No project dir"}
    
    req_txt = project_dir / "requirements.txt"
    req_md = project_dir / "requirements.md"
    
    if req_txt.exists():
        return {"exists": True, "created": False, "path": str(req_txt), "message": "Found requirements.txt"}
    if req_md.exists():
        return {"exists": True, "created": False, "path": str(req_md), "message": "Found requirements.md"}
    
    try:
        req_txt.touch()
        return {"exists": True, "created": True, "path": str(req_txt), "message": "Created requirements.txt"}
    except Exception as e:
        return {"exists": False, "created": False, "path": None, "message": str(e)}


def list_project_files(project_path: str) -> List[str]:
    """List all files in a project."""
    if not project_path:
        return []
    project_dir = Path(project_path)
    if not project_dir.exists():
        return []
    files = []
    try:
        for item in project_dir.rglob("*"):
            if item.is_file():
                rel_path = item.relative_to(project_dir)
                files.append(str(rel_path))
    except:
        pass
    return sorted(files)


def execute_code_with_podman_check(code: str, project_path: Optional[str], user_name: str = None, project_name: str = None) -> Dict[str, Any]:
    """
    Execute code, handling podman not installed scenario.
    Returns execution result with special flag if podman missing.
    """
    # Check if podman is available first
    if not ensure_podman_installed():
        return {
            "output": "Podman is not installed. Please install podman first: https://podman.io/getting-started/installation",
            "exit_code": 1,
            "is_error": True,
            "podman_missing": True,
            "access_info": None
        }
    
    # Run the code
    return run_code_in_pod(code, project_path, user_name, project_name)


async def run_llm_with_context(
    prompt: str,
    model: str,
    api_key: str,
    call_llm_func: Callable,
    context_files: List[Dict] = None,
    debug_context: str = None
) -> Dict[str, Any]:
    """Call LLM with optional context and debug context."""
    messages = []
    
    # Add pre-llm context files (these contain the prompt engineering)
    if context_files:
        for ctx in context_files:
            if ctx.get('type') == 'pre-llm':
                messages.append({"role": "system", "content": ctx.get('content', '')})
    
    # Add debug context if available (from previous error fixes)
    if debug_context:
        messages.append({"role": "system", "content": f"Previous debugging context:\n{debug_context}"})
    
    # Add user prompt
    messages.append({"role": "user", "content": prompt})
    
    log_trace('process', 'LLM Request', {
        'message_count': len(messages),
        'has_pre_llm_context': any(m.get('role') == 'system' for m in messages)
    })
    
    result = await call_llm_func(model, messages, 0.7, 4096, api_key)
    response = result["choices"][0]["message"]["content"]
    
    log_trace('output', 'LLM Response', {
        'length': len(response),
        'preview': response[:150]
    })
    
    return response


async def process_command_node(
    node: CommandNode,
    model: str,
    api_key: str,
    call_llm_func: Callable,
    project_path: Optional[str],
    context_files: List[Dict],
    max_depth: int = 5,
    user_name: str = None,
    project_name: str = None
):
    """
    Process a single command node - execute and handle errors with debugging.
    Returns the node with results.
    """
    if looper_state.should_stop:
        return node
    
    log_trace('process', f'Executing Code (Level {node.level})', {
        'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code,
        'language': node.language,
        'node_id': node.id
    })
    
    # Get pod settings and determine container name
    settings = get_pod_settings()
    container_name = get_pod_name(user_name, project_name) if user_name and project_name else f"test-pod-{node.id[:8]}"
    
    # Execute the code in pod
    log_trace('process', 'Starting Pod', {
        'container': container_name,
        'image': settings.get('python_image', 'python:3-alpine') if not node.code.strip().startswith('#!') else settings.get('shell_image', 'alpine'),
        'work_dir': project_path or settings.get('work_dir', '/tmp'),
        'keep_running': settings.get('keep_running', True),
        'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code
    })
    
    exec_result = execute_code_with_podman_check(node.code, project_path, user_name, project_name)
    
    # Check if pod should be destroyed based on settings
    if settings.get('keep_running', True) and not settings.get('auto_destroy', False):
        # Pod should stay running, don't show destroyed message
        log_trace('output', 'Pod Running', {
            'container': container_name,
            'keep_running': True,
            'exit_code': exec_result.get('exit_code')
        })
    else:
        # Verify pod is actually destroyed before showing message
        verify_result = subprocess.run(
            ['podman', 'ps', '-a', '--filter', f'name={container_name}', '--format', '{{.Names}}'],
            capture_output=True,
            text=True
        )
        pods_remaining = [p.strip() for p in verify_result.stdout.strip().split('\n') if p.strip() and container_name in p]
        
        if not pods_remaining:
            log_trace('output', 'Pod Destroyed', {
                'container': container_name,
                'verified': True,
                'exit_code': exec_result.get('exit_code')
            })
        else:
            # Pod still exists, try to kill it
            subprocess.run(['podman', 'kill', container_name], capture_output=True)
            log_trace('output', 'Pod Destroyed (Forced)', {
                'container': container_name,
                'verified': True,
                'note': 'Had to force kill',
                'exit_code': exec_result.get('exit_code')
            })
    
    node.result = exec_result.get('output', '')
    node.error = exec_result.get('output', '') if exec_result.get('is_error') else None
    node.success = not exec_result.get('is_error', False)
    
    log_trace('output', f'Code Result (Level {node.level})', {
        'exit_code': exec_result.get('exit_code'),
        'success': node.success,
        'podman_missing': exec_result.get('podman_missing', False),
        'result_preview': node.result[:200] + '...' if node.result and len(node.result) > 200 else node.result
    })
    
    # Check for podman_missing - this is an environment error, not a code error
    # Don't try to debug it - just fail immediately
    if exec_result.get('podman_missing', False):
        log_trace('error', 'Podman Not Installed', {
            'message': 'Podman is required but not installed on this system',
            'node_id': node.id
        })
        # Mark this as a terminal error - don't try to debug
        node.error = "PODMAN_NOT_INSTALLED: " + (node.error or 'Podman is not installed')
        return node
    
    # If there's an error and we haven't reached max depth, try to debug
    if not node.success and node.level < max_depth and not looper_state.should_stop:
        # Analyze the error
        error_info = analyze_error(node.error or '')
        
        log_trace('error', f'Error at Level {node.level}', {
            'error_type': error_info.get('error_type'),
            'error_message': error_info.get('error_message', '')[:100]
        })
        
        # Regular error - let the debugger handle it generically
        debug_prompt = f"""The previous code had an error:

Error: {node.error}
Error Type: {error_info.get('error_type', 'unknown')}

Original Code:
```
{node.code}
```

Please provide corrected code that fixes this error. Respond with only the corrected code in a code block.
Do not include explanations - just the fixed code."""
        
        # Load debugger context for error fixing
        debugger_context = get_debugger_context()
        
        try:
            debug_response = await run_llm_with_context(
                debug_prompt,
                model,
                api_key,
                call_llm_func,
                context_files,
                debug_context=debugger_context  # Pass debugger context
            )
            
            code_blocks = extract_code_blocks(debug_response)
            
            if code_blocks:
                    fix_node = CommandNode(code_blocks[0]['code'], code_blocks[0].get('language', 'python'), node.id)
                    fix_node.level = node.level + 1
                    node.children.append(fix_node)
                    
                    await process_command_node(
                        fix_node,
                        model,
                        api_key,
                        call_llm_func,
                        project_path,
                        context_files,
                        max_depth,
                        user_name,
                        project_name
                    )
                    
                    if fix_node.success:
                        node.success = True
                        node.result = f"[Fixed] {fix_node.result}"
                        node.fixed_code = fix_node.code
        except Exception as e:
            log_trace('error', 'Debug Error', str(e))
    
    return node


async def run_looper(
    initial_prompt: str,
    model: str,
    api_key: str,
    project_path: Optional[str],
    call_llm_func: Callable,
    context_files: Optional[List[Dict[str, Any]]] = None,
    trace_callback: Optional[TraceCallback] = None,
    user_name: Optional[str] = None,
    project_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Run the looper with tree-based command execution.
    
    Flow:
    1. User prompt -> LLM
    2. LLM returns commands -> Create root nodes
    3. Execute each root command:
       - If success: add to results
       - If error: debug -> create child node -> execute fix -> repeat
    4. Return all results
    """
    looper_state.reset()
    looper_state.current_project_path = project_path
    looper_state.trace_callback = trace_callback
    looper_state.is_running = True
    
    # Clear trace logger for new run
    trace_logger.clear()
    
    log_trace('input', 'User Prompt', initial_prompt)
    log_trace('process', 'Starting Tree Looper', {
        'model': model,
        'project': project_path
    })
    
    # Ensure project has requirements
    if project_path:
        req_result = ensure_project_requirements(project_path)
        log_trace('process', 'Project Requirements', req_result)
        
        project_files = list_project_files(project_path)
        log_trace('process', 'Project Files', {'count': len(project_files), 'files': project_files[:10]})
    
    try:
        # Step 1: Get commands from LLM - pre-llm context already instructs it to generate code
        log_trace('process', 'Calling LLM for Commands', {'prompt': initial_prompt[:100]})
        
        # The pre-llm context file already contains prompt engineering to generate code
        llm_response = await run_llm_with_context(
            initial_prompt,
            model,
            api_key,
            call_llm_func,
            context_files
        )
        
        log_trace('output', 'LLM Response', {
            'length': len(llm_response),
            'preview': llm_response[:200]
        })
        
        # Step 2: Extract code blocks (these are the root commands)
        code_blocks = extract_code_blocks(llm_response)
        
        if not code_blocks:
            looper_state.is_running = False
            return {
                "success": True,
                "response": llm_response,
                "command_tree": [],
                "loop_count": 1,
                "successful_results": [llm_response]
            }
        
        log_trace('process', 'Extracted Commands', {'count': len(code_blocks)})
        
        # Step 3: Create root nodes and execute each
        for i, block in enumerate(code_blocks):
            if looper_state.should_stop:
                break
            
            root_node = CommandNode(
                block['code'],
                block.get('language', 'python'),
                None
            )
            root_node.level = 0
            looper_state.command_tree.append(root_node)
            
            # Process this node (will handle errors recursively)
            await process_command_node(
                root_node,
                model,
                api_key,
                call_llm_func,
                project_path,
                context_files,
                looper_state.max_depth,
                user_name,
                project_name
            )
            
            # If successful, add to results
            if root_node.success:
                looper_state.successful_results.append(root_node.result)
            else:
                looper_state.error_stack.append({
                    "node_id": root_node.id,
                    "error": root_node.error,
                    "code": root_node.code
                })
        
        # Build detailed response showing each command and its result
        response_parts = []
        
        for i, node in enumerate(looper_state.command_tree):
            cmd_label = f"Command {i+1}"
            if node.level > 0:
                cmd_label = f"{'  ' * node.level}└─ Fix {i+1} (Level {node.level})"
            
            if node.success:
                response_parts.append(f"**{cmd_label}:**\n```\n{node.code}\n```\n✅ Success:\n{node.result or 'Completed'}")
            else:
                response_parts.append(f"**{cmd_label}:**\n```\n{node.code}\n```\n❌ Failed: {node.error or 'Unknown error'}")
            
            # Add children results
            for j, child in enumerate(node.children):
                child_label = f"{'  ' * (child.level)}  └─ Attempt {j+1}"
                if child.success:
                    response_parts.append(f"{child_label}: ✅ Success\n{child.result}")
                else:
                    response_parts.append(f"{child_label}: ❌ Failed\n{child.error}")
        
        final_response = "\n\n".join(response_parts)
        
        # Also add raw results to successful_results for backward compatibility
        for node in looper_state.command_tree:
            if node.success:
                looper_state.successful_results.append(node.result)
        
        looper_state.is_running = False
        
        # All pods are destroyed at this point (--rm flag removes containers after execution)
        log_trace('output', 'All Pods Destroyed', {
            'total_containers': len(looper_state.command_tree),
            'note': 'All podman containers have been removed'
        })
        
        log_trace('output', 'Looper Complete', {
            'total_commands': len(looper_state.command_tree),
            'successful': len(looper_state.successful_results),
            'failed': len(looper_state.error_stack),
            'response': final_response[:200]
        })
        
        return {
            "success": len(looper_state.error_stack) == 0,
            "response": final_response or llm_response,
            "command_tree": [n.to_dict() for n in looper_state.command_tree],
            "loop_count": looper_state.loop_count,
            "successful_results": looper_state.successful_results,
            "error_stack": looper_state.error_stack,
            "stopped": looper_state.should_stop,
            "trace_entries": trace_logger.get_all()
        }
        
    except Exception as e:
        looper_state.is_running = False
        log_trace('error', 'Looper Exception', str(e))
        return {
            "success": False,
            "error": str(e),
            "command_tree": [n.to_dict() for n in looper_state.command_tree],
            "loop_count": looper_state.loop_count,
            "successful_results": looper_state.successful_results,
            "stopped": looper_state.should_stop,
            "trace_entries": trace_logger.get_all()
        }


def stop_looper():
    """Signal the looper to stop immediately."""
    looper_state.stop()
    log_trace('input', 'Looper Stopped', 'Stop signal received')


if __name__ == "__main__":
    print("Tree-based Looper service loaded")
    state = get_looper_state()
    print(f"Max loops: {state.max_loops}, Max depth: {state.max_depth}")
