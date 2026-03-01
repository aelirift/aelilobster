"""
Project Settings Database Service
Stores project-specific settings in SQLite with unique constraint on setting_name
"""
import sqlite3
import os
from typing import Optional, Dict, Any

DATABASE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'project_settings.db')

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
        CREATE TABLE IF NOT EXISTS project_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT NOT NULL,
            setting_name TEXT NOT NULL,
            setting_value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_id, setting_name)
        )
    ''')
    # Create index for fast lookups
    conn.execute('''
        CREATE INDEX IF NOT EXISTS idx_project_setting 
        ON project_settings(project_id, setting_name)
    ''')
    conn.commit()

def get_setting(project_id: str, setting_name: str) -> Optional[str]:
    """Get a setting value for a project"""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            'SELECT setting_value FROM project_settings WHERE project_id = ? AND setting_name = ?',
            (project_id, setting_name)
        )
        row = cursor.fetchone()
        return row['setting_value'] if row else None
    finally:
        conn.close()

def set_setting(project_id: str, setting_name: str, value: str):
    """Set a setting value (upsert)"""
    conn = _get_connection()
    try:
        conn.execute('''
            INSERT INTO project_settings (project_id, setting_name, setting_value, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(project_id, setting_name) 
            DO UPDATE SET setting_value = excluded.setting_value, 
                          updated_at = CURRENT_TIMESTAMP
        ''', (project_id, setting_name, value))
        conn.commit()
    finally:
        conn.close()

def get_project_settings(project_id: str) -> Dict[str, str]:
    """Get all settings for a project"""
    conn = _get_connection()
    try:
        cursor = conn.execute(
            'SELECT setting_name, setting_value FROM project_settings WHERE project_id = ?',
            (project_id,)
        )
        return {row['setting_name']: row['setting_value'] for row in cursor.fetchall()}
    finally:
        conn.close()

def delete_project_settings(project_id: str):
    """Delete all settings for a project"""
    conn = _get_connection()
    try:
        conn.execute('DELETE FROM project_settings WHERE project_id = ?', (project_id,))
        conn.commit()
    finally:
        conn.close()
