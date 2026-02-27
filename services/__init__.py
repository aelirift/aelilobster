"""
Services Package

This package contains all the modular services for the Aelilobster application.

Modules:
- config: Configuration and API key management
- llm_providers: LLM provider setup and calling (MiniMax, OpenAI)
- context_files: Context file CRUD operations
- projects: Project management
- pod_manager: Pod execution and management
- command_service: Command detection and execution
- code_stripper: Code extraction from LLM responses
- debugger: Error analysis and debugging
- run_pod_test: Pod execution core
- looper: Tree-based command execution (package)
"""

# Re-export main functions for convenience
from services.config import (
    load_config,
    save_config,
    get_api_key,
    parse_project_id,
    PROJECTS_DIR,
)

from services.llm_providers import (
    call_llm,
    get_provider_and_headers,
    get_llm_call_function,
)

from services.context_files import (
    get_file_types,
    load_context_files,
    save_context_file,
    delete_context_file,
    load_context_defaults,
    save_context_defaults,
    load_project_context_settings,
    save_project_context_settings,
)

from services.projects import (
    load_projects,
    create_project_folder,
    delete_project_folder,
    get_project_path,
)

from services.pod_manager import (
    run_pod_test,
    kill_pod,
)
