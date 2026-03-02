"""
Design Tree Database Service
Stores design tree nodes in SQLite for the design page feature
Nodes are stored per user per project per design prompt
"""
import sqlite3
import os
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime

DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'design_tree.db')

# Node states
NODE_STATE_INCOMPLETE = 'incomplete'
NODE_STATE_IN_PROGRESS = 'in_progress'
NODE_STATE_COMPLETE = 'complete'
NODE_STATE_ERROR = 'error'

# Node levels
LEVEL_USER_PROMPT = 0
LEVEL_PRE_LLM_CONTEXT = 1
LEVEL_LLM_INPUT = 2
LEVEL_LLM_RESPONSE = 3

def _get_connection():
    """Get database connection, creating tables if needed"""
    os.makedirs(os.path.dirname(DATABASE_PATH), exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    _init_tables(conn)
    return conn

def _init_tables(conn):
    """Initialize database tables"""
    conn.execute('''
        CREATE TABLE IF NOT EXISTS design_tree_nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            node_id TEXT NOT NULL UNIQUE,
            project_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            prompt_id TEXT NOT NULL,
            level INTEGER NOT NULL,
            content TEXT,
            description TEXT,
            node_state TEXT NOT NULL DEFAULT 'incomplete',
            parent_node_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    # Create indexes for fast lookups
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_design_tree_prompt 
        ON design_tree_nodes(project_id, user_id, prompt_id)
    ''')
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_design_tree_parent 
        ON design_tree_nodes(parent_node_id)
    ''')
    conn.commit()

def create_node(
    project_id: str,
    user_id: str,
    prompt_id: str,
    level: int,
    content: str = '',
    description: str = '',
    node_state: str = NODE_STATE_INCOMPLETE,
    parent_node_id: Optional[str] = None
) -> Dict[str, Any]:
    """Create a new tree node"""
    conn = _get_connection()
    try:
        node_id = str(uuid.uuid4())
        conn.execute('''
            INSERT INTO design_tree_nodes 
            (node_id, project_id, user_id, prompt_id, level, content, description, node_state, parent_node_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ''', (node_id, project_id, user_id, prompt_id, level, content, description, node_state, parent_node_id))
        conn.commit()
        
        return get_node(node_id)
    finally:
        conn.close()

def get_node(node_id: str) -> Optional[Dict[str, Any]]:
    """Get a node by ID"""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            'SELECT * FROM design_tree_nodes WHERE node_id = ?',
            (node_id,)
        )
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()

def update_node(node_id: str, content: Optional[str] = None, description: Optional[str] = None, 
                 node_state: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Update a node's content, description, or state"""
    conn = _get_connection()
    try:
        updates = []
        params = []
        
        if content is not None:
            updates.append('content = ?')
            params.append(content)
        if description is not None:
            updates.append('description = ?')
            params.append(description)
        if node_state is not None:
            updates.append('node_state = ?')
            params.append(node_state)
        
        if updates:
            updates.append('updated_at = CURRENT_TIMESTAMP')
            params.append(node_id)
            
            conn.execute(f'''
                UPDATE design_tree_nodes 
                SET {', '.join(updates)}
                WHERE node_id = ?
            ''', params)
            conn.commit()
        
        return get_node(node_id)
    finally:
        conn.close()

def get_prompt_nodes(project_id: str, user_id: str, prompt_id: str) -> List[Dict[str, Any]]:
    """Get all nodes for a specific prompt"""
    conn = _get_connection()
    try:
        cursor = conn.execute('''
            SELECT * FROM design_tree_nodes 
            WHERE project_id = ? AND user_id = ? AND prompt_id = ?
            ORDER BY level ASC, created_at ASC
        ''', (project_id, user_id, prompt_id))
        return [dict(row) for row in cursor.fetchall()]
    finally:
        conn.close()

def delete_prompt_nodes(project_id: str, user_id: str, prompt_id: str):
    """Delete all nodes for a specific prompt"""
    conn = _get_connection()
    try:
        conn.execute('''
            DELETE FROM design_tree_nodes 
            WHERE project_id = ? AND user_id = ? AND prompt_id = ?
        ''', (project_id, user_id, prompt_id))
        conn.commit()
    finally:
        conn.close()

def get_all_prompts(project_id: str, user_id: str) -> List[str]:
    """Get all unique prompt_ids for a project/user"""
    conn = _get_connection()
    try:
        cursor = conn.execute('''
            SELECT DISTINCT prompt_id FROM design_tree_nodes 
            WHERE project_id = ? AND user_id = ?
            ORDER BY created_at DESC
        ''', (project_id, user_id))
        return [row['prompt_id'] for row in cursor.fetchall()]
    finally:
        conn.close()
