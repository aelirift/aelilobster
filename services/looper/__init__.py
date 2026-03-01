"""
Looper - Tree-based Command Execution Service

Handles the tree: prompt -> commands -> error fixes -> results

Modules:
- llm_client: LLM API calls
- code_extractor: Extract code blocks from LLM response  
- executor: Run code in pod
- debugger: Handle errors and suggest fixes
- tracer: Trace/logging functionality
- execution_tree: Tree data structure for visualization
"""
import uuid
import subprocess
from typing import List, Dict, Any, Optional, Callable

# Import submodules
from .llm_client import LLMClient, run_llm_with_context
from .code_extractor import CodeExtractor, extract_code_blocks
from .executor import Executor, execute_code_with_podman_check, ensure_project_requirements, list_project_files
from .debugger import DebuggerWrapper, analyze_error, get_debugger_context
from .tracer import TraceLogger, get_trace_logger, log_trace, clear_trace, TraceCallback
from .execution_tree import (
    ExecutionTree,
    ExecutionTreeNode,
    NodeState,
    NodeType,
    create_execution_tree,
    build_tree_from_looper
)


# =============================================================================
# Data Models
# =============================================================================

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


# =============================================================================
# Global State
# =============================================================================

# Global trace logger
trace_logger = get_trace_logger()

# Global looper state
looper_state = LooperState()


# =============================================================================
# Public API Functions (for backward compatibility)
# =============================================================================

def get_looper_state() -> LooperState:
    """Get the current looper state."""
    return looper_state


def set_trace_callback(callback: TraceCallback):
    """Set the trace callback function."""
    looper_state.trace_callback = callback


def stop_looper():
    """Signal the looper to stop immediately."""
    looper_state.stop()
    log_trace('input', 'Looper Stopped', 'Stop signal received', looper_state.trace_callback)


# =============================================================================
# Internal Implementation
# =============================================================================

async def _process_command_node(
    node: CommandNode,
    llm_client: LLMClient,
    project_path: Optional[str],
    context_files: List[Dict],
    max_depth: int,
    user_name: str,
    project_name: str
):
    """
    Process a single command node - execute and handle errors with debugging.
    Returns the node with results.
    """
    if looper_state.should_stop:
        return node
    
    executor = Executor()
    debugger = DebuggerWrapper()
    
    # Log tree node status - starting execution (IN_PROGRESS)
    log_trace('tree_node', f'L{node.level} Node Executing: {node.id}', {
        'node_id': node.id,
        'parent_id': node.parent_id,
        'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code,
        'language': node.language,
        'level': node.level,
        'state': 'in_progress'
    }, looper_state.trace_callback)
    
    log_trace('process', f'Executing Code (Level {node.level})', {
        'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code,
        'language': node.language,
        'node_id': node.id
    }, looper_state.trace_callback)
    
    # Get pod settings and determine container name
    settings = get_pod_settings()
    # Use standardized pod name without suffix (no node.id)
    container_name = executor.get_pod_name(user_name, project_name)
    
    # Import and ensure pod is ready before executing
    from services.pre_llm import ensure_pod_ready
    pod_status = ensure_pod_ready(user_name, project_name, project_path, auto_start=True)
    
    log_trace('process', 'Pod Status', {
        'pod_name': pod_status.get('pod_name'),
        'ready': pod_status.get('ready'),
        'running': pod_status.get('running'),
        'action': pod_status.get('action'),
        'message': pod_status.get('message')
    }, looper_state.trace_callback)
    
    if not pod_status.get('ready', False):
        node.error = f"Pod not ready: {pod_status.get('message', 'Unknown error')}"
        return node
    
    # Execute the code in pod
    log_trace('process', 'Starting Pod', {
        'container': container_name,
        'image': settings.get('python_image', 'python:3-slim') if not node.code.strip().startswith('#!') else settings.get('shell_image', 'ubuntu:latest'),
        'work_dir': project_path or settings.get('work_dir', '/tmp'),
        'keep_running': settings.get('keep_running', True),
        'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code
    }, looper_state.trace_callback)
    
    exec_result = executor.execute(node.code, project_path, user_name, project_name)
    
    # Check if pod should be destroyed based on settings
    if settings.get('keep_running', True) and not settings.get('auto_destroy', False):
        # Pod should stay running, don't show destroyed message
        log_trace('output', 'Pod Running', {
            'container': container_name,
            'keep_running': True,
            'exit_code': exec_result.get('exit_code')
        }, looper_state.trace_callback)
    else:
        # Verify pod is actually destroyed before showing message
        forced = executor.cleanup_pod(container_name)
        
        if not forced:
            log_trace('output', 'Pod Destroyed', {
                'container': container_name,
                'verified': True,
                'exit_code': exec_result.get('exit_code')
            }, looper_state.trace_callback)
        else:
            log_trace('output', 'Pod Destroyed (Forced)', {
                'container': container_name,
                'verified': True,
                'note': 'Had to force kill',
                'exit_code': exec_result.get('exit_code')
            }, looper_state.trace_callback)
    
    node.result = exec_result.get('output', '')
    node.error = exec_result.get('output', '') if exec_result.get('is_error') else None
    node.success = not exec_result.get('is_error', False)
    
    # Log tree node completion status - REAL-TIME UPDATE
    if node.success:
        log_trace('tree_node', f'L{node.level} Node Complete: {node.id}', {
            'node_id': node.id,
            'parent_id': node.parent_id,
            'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code,
            'language': node.language,
            'level': node.level,
            'state': 'complete',
            'result_preview': node.result[:200] + '...' if node.result and len(node.result) > 200 else node.result
        }, looper_state.trace_callback)
    else:
        log_trace('tree_node', f'L{node.level} Node Error: {node.id}', {
            'node_id': node.id,
            'parent_id': node.parent_id,
            'code_preview': node.code[:100] + '...' if len(node.code) > 100 else node.code,
            'language': node.language,
            'level': node.level,
            'state': 'error',
            'error_preview': node.error[:200] + '...' if node.error and len(node.error) > 200 else node.error
        }, looper_state.trace_callback)
    
    log_trace('output', f'Code Result (Level {node.level})', {
        'exit_code': exec_result.get('exit_code'),
        'success': node.success,
        'podman_missing': exec_result.get('podman_missing', False),
        'result_preview': node.result[:200] + '...' if node.result and len(node.result) > 200 else node.result
    }, looper_state.trace_callback)
    
    # Check for podman_missing - this is an environment error, not a code error
    # Don't try to debug it - just fail immediately
    if exec_result.get('podman_missing', False):
        log_trace('error', 'Podman Not Installed', {
            'message': 'Podman is required but not installed on this system',
            'node_id': node.id
        }, looper_state.trace_callback)
        # Mark this as a terminal error - don't try to debug
        node.error = "PODMAN_NOT_INSTALLED: " + (node.error or 'Podman is not installed')
        return node
    
    # If there's an error and we haven't reached max depth, try to debug
    if not node.success and node.level < max_depth and not looper_state.should_stop:
        # Analyze the error
        error_info = debugger.analyze(node.error or '')
        
        log_trace('error', f'Error at Level {node.level}', {
            'error_type': error_info.get('error_type'),
            'error_message': error_info.get('error_message', '')[:100]
        }, looper_state.trace_callback)
        
        # Get debugger context for error fixing
        debugger_context = debugger.get_context()
        
        try:
            debug_response = await llm_client.call_for_fix(
                error=node.error or '',
                error_type=error_info.get('error_type', 'unknown'),
                original_code=node.code,
                context_files=context_files,
                debugger_context=debugger_context
            )
            
            code_blocks = extract_code_blocks(debug_response)
            
            if code_blocks:
                fix_node = CommandNode(
                    code_blocks[0]['code'],
                    code_blocks[0].get('language', 'python'),
                    node.id
                )
                fix_node.level = node.level + 1
                node.children.append(fix_node)
                
                # Log FIX node creation for tree visualization
                log_trace('tree_node', f'L{fix_node.level} Fix Node Created', {
                    'node_id': fix_node.id,
                    'parent_id': fix_node.parent_id,
                    'code_preview': fix_node.code[:100] + '...' if len(fix_node.code) > 100 else fix_node.code,
                    'language': fix_node.language,
                    'level': fix_node.level,
                    'instruction': _get_instruction_for_code(fix_node.code, fix_node.language),
                    'fix_for_error': node.error[:100] + '...' if node.error and len(node.error) > 100 else node.error
                }, looper_state.trace_callback)
                
                await _process_command_node(
                    fix_node,
                    llm_client,
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
            log_trace('error', 'Debug Error', str(e), looper_state.trace_callback)
    
    return node


def get_pod_settings() -> Dict[str, Any]:
    """Get pod settings from the executor module."""
    from .executor import Executor
    return Executor().settings


def _get_instruction_for_code(code: str, language: str) -> str:
    """
    Extract instruction context from code block.
    Looks for comments or common patterns that indicate what the code should do.
    
    Args:
        code: The code block content
        language: Programming language
        
    Returns:
        A human-readable instruction string
    """
    if not code:
        return "Execute code"
    
    # Get first few lines
    lines = code.strip().split('\n')
    first_lines = '\n'.join(lines[:3])
    
    # Check for common patterns
    if language == 'python':
        # Look for docstring or comments at the start
        if '"""' in first_lines or "'''" in first_lines:
            # Try to extract docstring
            import re
            docstring_match = re.search(r'"""(.*?)"""', code, re.DOTALL)
            if docstring_match:
                instruction = docstring_match.group(1).strip()[:100]
                if instruction:
                    return instruction
        
        # Look for comment lines
        comment_lines = [l.strip().lstrip('#') for l in lines if l.strip().startswith('#')]
        if comment_lines:
            return comment_lines[0][:100]
    
    elif language == 'shell' or language == 'bash':
        # First line is often the command
        if lines:
            return f"Run: {lines[0][:100]}"
    
    # Default: show what type of file/operation
    if code.strip().startswith('#!'):
        # Shebang - show the interpreter
        return f"Execute with {code.split()[0].lstrip('#!')}"
    
    # Generic fallback
    return f"Create/run {language} code"


# =============================================================================
# Main Looper Function
# =============================================================================

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
    
    Args:
        initial_prompt: The user's prompt
        model: Model name to use
        api_key: API key for authentication
        project_path: Optional path to project
        call_llm_func: Function to call the LLM
        context_files: Optional context files
        trace_callback: Optional callback for trace updates
        user_name: Optional user name
        project_name: Optional project name
        
    Returns:
        Dict with results
    """
    looper_state.reset()
    looper_state.current_project_path = project_path
    looper_state.trace_callback = trace_callback
    looper_state.is_running = True
    
    # Clear trace logger for new run
    clear_trace()
    
    log_trace('input', 'User Prompt', initial_prompt, trace_callback)
    log_trace('process', 'Starting Tree Looper', {
        'model': model,
        'project': project_path
    }, trace_callback)
    
    # Ensure project has requirements
    if project_path:
        req_result = ensure_project_requirements(project_path)
        log_trace('process', 'Project Requirements', req_result, trace_callback)
        
        project_files = list_project_files(project_path)
        log_trace('process', 'Project Files', {'count': len(project_files), 'files': project_files[:10]}, trace_callback)
    
    try:
        # Create LLM client
        llm_client = LLMClient(model, api_key, call_llm_func)
        
        # Step 1: Get commands from LLM - pre-llm context already instructs it to generate code
        log_trace('process', 'Calling LLM for Commands', {'prompt': initial_prompt[:100]}, trace_callback)
        
        # The pre-llm context file already contains prompt engineering to generate code
        llm_response = await llm_client.call(
            initial_prompt,
            context_files=context_files
        )
        
        log_trace('output', 'LLM Response', {
            'length': len(llm_response),
            'preview': llm_response[:200]
        }, trace_callback)
        
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
        
        log_trace('process', 'Extracted Commands', {'count': len(code_blocks)}, trace_callback)
        
        # Step 3: Create root nodes and ADD THEM TO TREE IMMEDIATELY for real-time visualization
        for i, block in enumerate(code_blocks):
            if looper_state.should_stop:
                break
            
            # Create root node
            root_node = CommandNode(
                block['code'],
                block.get('language', 'python'),
                None
            )
            root_node.level = 0
            looper_state.command_tree.append(root_node)
            
            # IMMEDIATELY log L1 node creation for real-time tree visualization
            log_trace('tree_node', f'L1 Node Created: Command {i+1}', {
                'node_id': root_node.id,
                'code_preview': root_node.code[:100] + '...' if len(root_node.code) > 100 else root_node.code,
                'language': root_node.language,
                'instruction': _get_instruction_for_code(root_node.code, root_node.language),
                'level': 0,
                'index': i
            }, trace_callback)
            
            # Process this node (will handle errors recursively)
            await _process_command_node(
                root_node,
                llm_client,
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
        }, trace_callback)
        
        log_trace('output', 'Looper Complete', {
            'total_commands': len(looper_state.command_tree),
            'successful': len(looper_state.successful_results),
            'failed': len(looper_state.error_stack),
            'response': final_response[:200]
        }, trace_callback)
        
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
        log_trace('error', 'Looper Exception', str(e), trace_callback)
        return {
            "success": False,
            "error": str(e),
            "command_tree": [n.to_dict() for n in looper_state.command_tree],
            "loop_count": looper_state.loop_count,
            "successful_results": looper_state.successful_results,
            "stopped": looper_state.should_stop,
            "trace_entries": trace_logger.get_all()
        }


# =============================================================================
# Main entry point
# =============================================================================

if __name__ == "__main__":
    print("Tree-based Looper service loaded")
    state = get_looper_state()
    print(f"Max loops: {state.max_loops}, Max depth: {state.max_depth}")
