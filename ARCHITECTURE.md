# Aelilobster Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           app.py                                        │
│                   (FastAPI Entry Point ~290 lines)                     │
│                                                                          │
│  - Health check                                                          │
│  - Config endpoints                                                      │
│  - Command execution                                                     │
│  - Chat completions                                                      │
│  - Prompt processing                                                     │
│  - Looper endpoints                                                      │
│  - Static file serving                                                   │
│  - Context files endpoints                                               │
│  - Projects endpoints                                                    │
│  - Pod management endpoints                                              │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 │ imports from
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        services/                                        │
│                    (Modular Services)                                   │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
     ┌──────────┬───────────────┬┴───────────────┬──────────┬─────────┐
     │          │               │                │          │         │
     ▼          ▼               ▼                ▼          ▼         ▼
┌─────────┐ ┌──────────┐ ┌────────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐
│ config  │ │llm_providers│ │context_files│ │projects│ │pod_mngr│ │ __init__ │
│    .py  │ │   .py    │ │    .py     │ │   .py  │ │  .py   │ │   .py    │
└─────────┘ └──────────┘ └────────────┘ └─────────┘ └────────┘ └──────────┘

     │          │               │                │          │         │
     │  load/   │  MiniMax &    │  CRUD ops     │  Load/   │  Run/   │
     │  save    │  OpenAI API   │  for context │  Create/ │  Kill   │
     │  config  │  calling      │  files       │  Delete  │  Pods   │
     │  API keys│               │               │  Projects│         │
     └──────────┴───────────────┴───────────────┴──────────┴─────────┘

     ┌─────────────────────────────────────────────────────────────────┐
     │                    Already Modular                             │
     ├─────────────────┬─────────────────┬─────────────────────────────┤
     │command_service  │code_stripper   │debugger                    │
     │     .py         │     .py        │    .py                     │
     └─────────────────┴─────────────────┴─────────────────────────────┘
               │                   │                 │
         Detect & exec      Extract code        Error analysis
         Linux commands     from LLM           & debugging
         safely             responses

     ┌─────────────────────────────────────────────────────────────────┐
     │                       run_pod_test.py                         │
     │            Podman pod execution core                          │
     └─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                     services/looper/                          │
     │                 Tree-based Execution Package                  │
     ├─────────────────┬─────────────────┬─────────────────────────────┤
     │   llm_client   │code_extractor  │executor                    │
     │      .py       │     .py        │    .py                     │
     ├─────────────────┼─────────────────┼─────────────────────────────┤
     │    debugger    │    tracer      │      __init__               │
     │      .py       │     .py        │                            │
     └─────────────────┴─────────────────┴─────────────────────────────┘

                          │
                          ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    context_files/                               │
     │              (Markdown Context Files)                          │
     ├─────────────────────────────────────────────────────────────────┤
     │  *.md files - pre-llm, post-llm, pre-code, pre-pod, etc.    │
     │  file_types.json - list of valid file types                   │
     │  defaults.json - default context files by type                │
     └─────────────────────────────────────────────────────────────────┘

                          │
                          ▼
     ┌─────────────────────────────────────────────────────────────────┐
     │                    user_login/                                 │
     │                  (Project Storage)                             │
     ├─────────────────────────────────────────────────────────────────┤
     │  {user}/{project}/ - project directories                     │
     └─────────────────────────────────────────────────────────────────┘
```

## Service Responsibilities

### New Services (Created in this refactor)

| Service | File | Responsibility |
|---------|------|----------------|
| **Config** | `services/config.py` | Load/save config.json, get API keys, parse project IDs |
| **LLM Providers** | `services/llm_providers.py` | Setup headers, call MiniMax (Anthropic & OpenAI compat), call OpenAI |
| **Context Files** | `services/context_files.py` | CRUD for context .md files, defaults, project settings |
| **Projects** | `services/projects.py` | Load/create/delete project folders |
| **Pod Manager** | `services/pod_manager.py` | Run code in pods, kill pods |

### Existing Services (Already Modular)

| Service | File | Responsibility |
|---------|------|----------------|
| **Command Service** | `services/command_service.py` | Detect Linux commands, safe execution |
| **Code Stripper** | `services/code_stripper.py` | Extract code blocks from LLM responses |
| **Debugger** | `services/debugger.py` | Analyze errors, suggest fixes |
| **Run Pod Test** | `services/run_pod_test.py` | Core podman execution |
| **Looper** | `services/looper/` | Tree-based execution with debugging loop |

## Design Principles

1. **Single Responsibility**: Each file has one job
2. **Loose Coupling**: Services import each other, don't know about FastAPI
3. **Easy Testing**: Each service can be tested independently
4. **Localized Changes**: Fixing MiniMax calling won't touch context files
5. **Clear Boundaries**: Each service is self-contained

## Imports Flow

```
app.py
  ├── services.config (load_config, save_config, get_api_key)
  ├── services.llm_providers (call_llm, get_provider_and_headers)
  ├── services.context_files (load_context_files, save_context_file, etc.)
  ├── services.projects (load_projects, create_project_folder)
  ├── services.pod_manager (run_pod_test, kill_pod)
  ├── services.command_service (is_linux_command, execute_command)
  ├── services.code_stripper (extract_code_blocks)
  ├── services.run_pod_test (run_code_in_pod)
  └── services.looper (run_looper, get_looper_state, trace_logger)
```
