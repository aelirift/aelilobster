"""
Execution Tree - Tree data structure for visualizing LLM execution process.

This module provides a tree data structure specifically designed for 
visualizing the execution process in the chat interface.

The tree structure:
- Root node = User prompt (created when user submits)
- Child nodes = Each code step returned by LLM
- Error nodes = If a node fails, error is added as child node
- States: incomplete (red), complete (green), in-progress (flashing)
"""
import uuid
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


class NodeState(Enum):
    """State of an execution node."""
    INCOMPLETE = "incomplete"    # Created but not yet executed (red)
    IN_PROGRESS = "in_progress"  # Currently executing (flashing/animating)
    COMPLETE = "complete"        # Successfully completed (green)
    ERROR = "error"              # Failed with error (red with error child)


class NodeType(Enum):
    """Type of execution node."""
    PROMPT = "prompt"           # User prompt (root)
    COMMAND = "command"         # Code command to execute
    ERROR = "error"             # Error node (child of failed command)
    FIX = "fix"                 # Fix attempt after error


@dataclass
class ExecutionTreeNode:
    """
    Represents a node in the execution tree for visualization.
    
    Attributes:
        id: Unique identifier for the node
        type: Type of node (PROMPT, COMMAND, ERROR, FIX)
        state: Current state (INCOMPLETE, IN_PROGRESS, COMPLETE, ERROR)
        prompt: The user prompt (for root nodes)
        code: The code to execute (for command nodes)
        language: Programming language
        result: Execution result (for completed nodes)
        error: Error message (for error nodes)
        parent_id: ID of parent node
        children: List of child nodes
        level: Depth level in tree (0 = root)
        timestamp: When this node was created
    """
    id: str = field(default_factory=lambda: str(uuid.uuid4().hex[:8]))
    type: NodeType = NodeType.COMMAND
    state: NodeState = NodeState.INCOMPLETE
    prompt: Optional[str] = None
    code: Optional[str] = None
    language: str = "python"
    result: Optional[str] = None
    error: Optional[str] = None
    parent_id: Optional[str] = None
    children: List['ExecutionTreeNode'] = field(default_factory=list)
    level: int = 0
    timestamp: str = field(default_factory=lambda: __import__('datetime').datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert node to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "type": self.type.value,
            "state": self.state.value,
            "prompt": self.prompt,
            "code": self.code,
            "language": self.language,
            "result": self.result,
            "error": self.error,
            "parent_id": self.parent_id,
            "children": [c.to_dict() for c in self.children],
            "level": self.level,
            "timestamp": self.timestamp
        }
    
    @classmethod
    def from_command_node(cls, command_node, parent_id: Optional[str] = None) -> 'ExecutionTreeNode':
        """
        Create an ExecutionTreeNode from a CommandNode (from looper).
        
        Args:
            command_node: CommandNode from looper
            parent_id: Parent node ID
            
        Returns:
            ExecutionTreeNode instance
        """
        node = cls(
            id=command_node.id,
            type=NodeType.COMMAND,
            state=NodeState.COMPLETE if command_node.success else NodeState.ERROR,
            code=command_node.code,
            language=command_node.language,
            result=command_node.result,
            error=command_node.error,
            parent_id=parent_id,
            level=command_node.level
        )
        
        # Add children recursively
        for child_cmd in command_node.children:
            child_node = cls.from_command_node(child_cmd, command_node.id)
            node.children.append(child_node)
        
        return node


class ExecutionTree:
    """
    Manages the execution tree for visualization.
    
    The tree tracks:
    - Root prompt node (created when user submits)
    - Command nodes (created from LLM responses)
    - Error nodes (created when commands fail)
    - Fix nodes (created from debugging attempts)
    """
    
    def __init__(self):
        self.nodes: Dict[str, ExecutionTreeNode] = {}
        self.root_id: Optional[str] = None
        self.current_node_id: Optional[str] = None
        
    def create_prompt_node(self, prompt: str) -> ExecutionTreeNode:
        """
        Create the root prompt node when user submits.
        
        Args:
            prompt: The user's input prompt
            
        Returns:
            The created prompt node
        """
        node = ExecutionTreeNode(
            type=NodeType.PROMPT,
            state=NodeState.IN_PROGRESS,  # Start as in-progress while processing
            prompt=prompt,
            level=0
        )
        self.nodes[node.id] = node
        self.root_id = node.id
        self.current_node_id = node.id
        return node
    
    def add_command_node(
        self,
        code: str,
        language: str = "python",
        parent_id: Optional[str] = None,
        level: int = 0
    ) -> ExecutionTreeNode:
        """
        Add a new command node to the tree.
        
        Args:
            code: The code to execute
            language: Programming language
            parent_id: ID of parent node (defaults to current node)
            level: Depth level in tree
            
        Returns:
            The created command node
        """
        if parent_id is None:
            parent_id = self.current_node_id
            
        node = ExecutionTreeNode(
            type=NodeType.COMMAND,
            state=NodeState.IN_PROGRESS,
            code=code,
            language=language,
            parent_id=parent_id,
            level=level
        )
        
        self.nodes[node.id] = node
        self.current_node_id = node.id
        
        # Add to parent's children
        if parent_id and parent_id in self.nodes:
            self.nodes[parent_id].children.append(node)
            
        return node
    
    def add_error_node(
        self,
        error: str,
        parent_id: Optional[str] = None
    ) -> ExecutionTreeNode:
        """
        Add an error node as a child of a failed command.
        
        Args:
            error: The error message
            parent_id: ID of parent command node
            
        Returns:
            The created error node
        """
        if parent_id is None:
            parent_id = self.current_node_id
            
        node = ExecutionTreeNode(
            type=NodeType.ERROR,
            state=NodeState.ERROR,
            error=error,
            parent_id=parent_id,
            level=(self.nodes[parent_id].level + 1) if parent_id in self.nodes else 1
        )
        
        self.nodes[node.id] = node
        
        # Add to parent's children
        if parent_id and parent_id in self.nodes:
            self.nodes[parent_id].children.append(node)
            
        return node
    
    def mark_node_complete(
        self,
        node_id: str,
        result: Optional[str] = None
    ) -> None:
        """
        Mark a node as complete.
        
        Args:
            node_id: ID of the node to mark complete
            result: Optional execution result
        """
        if node_id in self.nodes:
            self.nodes[node_id].state = NodeState.COMPLETE
            if result:
                self.nodes[node_id].result = result
                
    def mark_node_error(
        self,
        node_id: str,
        error: str
    ) -> None:
        """
        Mark a node as failed with error.
        
        Args:
            node_id: ID of the node that failed
            error: The error message
        """
        if node_id in self.nodes:
            self.nodes[node_id].state = NodeState.ERROR
            self.nodes[node_id].error = error
            
    def mark_node_in_progress(self, node_id: str) -> None:
        """
        Mark a node as currently in progress.
        
        Args:
            node_id: ID of the node
        """
        if node_id in self.nodes:
            self.nodes[node_id].state = NodeState.IN_PROGRESS
            
    def mark_prompt_complete(self) -> None:
        """Mark the root prompt node as complete."""
        if self.root_id and self.root_id in self.nodes:
            self.nodes[self.root_id].state = NodeState.COMPLETE
    
    def get_root(self) -> Optional[ExecutionTreeNode]:
        """Get the root prompt node."""
        if self.root_id:
            return self.nodes.get(self.root_id)
        return None
    
    def get_current_node(self) -> Optional[ExecutionTreeNode]:
        """Get the current (most recent) node."""
        if self.current_node_id:
            return self.nodes.get(self.current_node_id)
        return None
    
    def get_tree_as_list(self) -> List[Dict[str, Any]]:
        """
        Get the tree as a flat list of nodes (for serialization).
        
        Returns:
            List of node dictionaries
        """
        return [node.to_dict() for node in self.nodes.values()]
    
    def get_tree_as_nested_dict(self) -> Optional[Dict[str, Any]]:
        """
        Get the tree as a nested dictionary (for visualization).
        
        Returns:
            Root node as dictionary with children, or None if empty
        """
        root = self.get_root()
        if root:
            return root.to_dict()
        return None
    
    def clear(self) -> None:
        """Clear the entire tree."""
        self.nodes.clear()
        self.root_id = None
        self.current_node_id = None
        
    @classmethod
    def from_command_tree(cls, command_nodes: List, prompt: str) -> 'ExecutionTree':
        """
        Create an ExecutionTree from looper's command tree.
        
        Args:
            command_nodes: List of CommandNode from looper
            prompt: The user prompt
            
        Returns:
            ExecutionTree instance
        """
        tree = cls()
        
        # Create root prompt node
        root = tree.create_prompt_node(prompt)
        root.state = NodeState.COMPLETE  # Prompt is always complete
        
        # Convert each top-level command node
        for cmd_node in command_nodes:
            tree_node = ExecutionTreeNode.from_command_node(cmd_node, root.id)
            root.children.append(tree_node)
            tree.nodes[tree_node.id] = tree_node
            
        return tree


# =============================================================================
# Helper Functions
# =============================================================================

def create_execution_tree(prompt: str) -> ExecutionTree:
    """
    Create a new execution tree with a prompt root node.
    
    Args:
        prompt: The user's input prompt
        
    Returns:
        New ExecutionTree instance
    """
    tree = ExecutionTree()
    tree.create_prompt_node(prompt)
    return tree


def build_tree_from_looper(
    prompt: str,
    command_tree: List,
    current_node_id: Optional[str] = None
) -> ExecutionTree:
    """
    Build an execution tree from looper state.
    
    This is used to reconstruct the tree for visualization from
    the looper's command_tree data.
    
    Args:
        prompt: User prompt
        command_tree: List of CommandNode dictionaries from looper
        current_node_id: Optional ID of currently executing node
        
    Returns:
        ExecutionTree instance
    """
    tree = ExecutionTree()
    
    # Create root
    root = tree.create_prompt_node(prompt)
    
    # Mark root as complete if we have command nodes
    if command_tree:
        root.state = NodeState.COMPLETE
    
    # Add command nodes
    for cmd_data in command_tree:
        _add_node_from_dict(tree, cmd_data, root.id)
        
    return tree


def _add_node_from_dict(
    tree: ExecutionTree,
    node_data: Dict,
    parent_id: str
) -> ExecutionTreeNode:
    """Recursively add nodes from dictionary data."""
    
    # Determine state
    if node_data.get('success'):
        state = NodeState.COMPLETE
    elif node_data.get('error'):
        state = NodeState.ERROR
    else:
        state = NodeState.INCOMPLETE
        
    node = ExecutionTreeNode(
        id=node_data.get('id', str(uuid.uuid4().hex[:8])),
        type=NodeType.COMMAND,
        state=state,
        code=node_data.get('code'),
        language=node_data.get('language', 'python'),
        result=node_data.get('result'),
        error=node_data.get('error'),
        parent_id=parent_id,
        level=node_data.get('level', 0)
    )
    
    tree.nodes[node.id] = node
    
    # Add to parent
    if parent_id in tree.nodes:
        tree.nodes[parent_id].children.append(node)
        
    # Add children
    children = node_data.get('children', [])
    for child_data in children:
        _add_node_from_dict(tree, child_data, node.id)
        
    return node
