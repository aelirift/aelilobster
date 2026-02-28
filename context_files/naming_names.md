# Naming Conventions

This file documents all naming conventions used in the project. Before creating any named resource, check this file for the correct format.

## Projects

### Project ID Format
- **Format**: `{user_name}-{project_name}`
- **Example**: `test_user-testproject1`
- **Separators**: Use hyphen (`-`) to separate user and project names
- **Valid Examples**:
  - `test_user-myproject`
  - `john-demosite`
  - `alice-webapp`

### Project Directory
- **Path**: `user_login/{user_name}/{project_name}/`
- **Example**: `user_login/test_user/testproject1/`

## Pods

### Pod Name Format
- **Format**: `{user_name}-{project_name}-pod`
- **Example**: `test_user-testproject1-pod`
- **Separators**: Use hyphen (`-`) throughout
- **Valid Examples**:
  - `test_user-default-pod`
  - `john-demosite-pod`

### Pod Container Naming Rules
1. Always use hyphen (`-`) as separator
2. Always end with `-pod`
3. User name and project name should match project_id format

## Context Files

### File Naming Format
- **Preferred Format**: `{type}_{name}.md` (no numeric ID required)
- **Legacy Format**: `{id}_{type}_{name}.md` (still supported)
- **Type**: File type (see below)
- **Name**: Descriptive name with hyphens

### File Types
| Type | Format Example | Description |
|------|----------------|-------------|
| Pre-LLM | `pre-llm_default.md` | Context loaded before LLM call |
| Post-LLM | `post-llm_filter.md` | Context loaded after LLM response |
| Pre-Code | `pre-code_template.md` | Context before code extraction |
| Post-Code | `post-code_format.md` | Context after code execution |
| Debugger | `debugger_debug.md` | Debugger-specific context |
| Pod Settings | `pod_settings.md` | Pod/container configuration |

### Current Context Files
| File | Type | Name |
|------|------|------|
| `pre-llm_default.md` | pre-llm | default |
| `pre-code_test.md` | pre-code | test |
| `debugger_debug.md` | debugger | debug |
| `default_pod.md` | pod | default |
| `pod_settings.md` | pod | settings |

### File Types (JSON)
- **File**: `context_files/file_types.json`
- **Format**: JSON array of type strings

## API Endpoints

### Project Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/projects` | GET | List all projects |
| `/api/projects` | POST | Create project |
| `/api/projects/{project_id}` | DELETE | Delete project |

### Looper Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/looper/run` | POST | Run looper with prompt |
| `/api/looper/stop` | POST | Stop running looper |
| `/api/looper/trace-stream` | GET | SSE trace stream |

## Variables and Settings

### Pod Settings (default_pod.md)
| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `keep_running` | boolean | true | Keep pod running after execution |
| `auto_destroy` | boolean | false | Auto-destroy pod |
| `idle_timeout_minutes` | integer | 30 | Minutes before idle pod is destroyed |
| `python_image` | string | python:3-alpine | Docker image for Python |
| `shell_image` | string | alpine | Docker image for shell |
| `work_dir` | string | /tmp | Working directory in container |
| `default_port` | integer | 8080 | Default port for web servers |

## General Rules

1. **Use hyphens (`-`) for separation** in names, IDs, and paths
2. **Use underscores (`_`) only in user names** when part of the login (e.g., `test_user`)
3. **Always check this file** before creating new resources
4. **Update this file** when adding new resource types