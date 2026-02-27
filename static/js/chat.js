// Chat functionality
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const modelSelect = document.getElementById('model');
const traceContent = document.getElementById('traceContent');
const traceClear = document.getElementById('traceClear');
const traceStop = document.getElementById('traceStop');
const clearChatBtn = document.getElementById('clearChatBtn');

// Build tree response for display
function buildTreeResponse(tree, indent = 0) {
    let result = '';
    const prefix = '  '.repeat(indent);
    const icon = indent === 0 ? '📌' : '  ';
    
    tree.forEach((node, i) => {
        const nodeIcon = node.success ? '✅' : '❌';
        result += `${prefix}${icon} Command ${i+1}:\n`;
        result += `${prefix}   Code: ${node.code || 'N/A'}\n`;
        result += `${prefix}   ${nodeIcon} ${node.success ? 'Success' : 'Failed'}\n`;
        
        if (node.result) {
            const resultLines = node.result.split('\n').slice(0, 5).join('\n');
            result += `${prefix}   Output:\n${prefix}   ${resultLines}\n`;
            if (node.result.split('\n').length > 5) {
                result += `${prefix}   ... (${node.result.split('\n').length} lines total)\n`;
            }
        }
        
        // Add children
        if (node.children && node.children.length > 0) {
            result += buildTreeResponse(node.children, indent + 1);
        }
    });
    
    return result;
}

// State
let messages = [];
let isLoading = false;
let isLooping = false;
let traceId = 0;
let traceEntries = []; // Store trace entries for session persistence

// Trace logging functions
function addTrace(type, label, data) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    
    // Store in trace entries for persistence
    const traceEntry = {
        type,
        label,
        data,
        time: timeStr,
        timestamp: now.toISOString()
    };
    traceEntries.push(traceEntry);
    
    renderTraceEntry(traceEntry, false);
    
    // Save to localStorage
    saveTraceState();
}

function renderTraceEntry(entry, isInitial) {
    const traceContent = document.getElementById('traceContent');
    const domEntry = document.createElement('div');
    domEntry.className = 'trace-entry';
    
    let dataHtml = '';
    if (typeof entry.data === 'object') {
        dataHtml = `<div class="trace-data">${escapeHtml(JSON.stringify(entry.data, null, 2))}</div>`;
    } else {
        dataHtml = `<div class="trace-data">${escapeHtml(String(entry.data))}</div>`;
    }
    
    // Create copy button handler
    const copyContent = typeof entry.data === 'object' ? JSON.stringify(entry.data, null, 2) : String(entry.data);
    
    domEntry.innerHTML = `
        <div class="trace-time">${entry.time}</div>
        <div class="trace-step">
            <div class="trace-icon ${entry.type}">${entry.type === 'input' ? '↓' : entry.type === 'process' ? '⚙' : entry.type === 'output' ? '↑' : '!'}</div>
            <div class="trace-text">${escapeHtml(entry.label)}</div>
            <button class="trace-copy" title="Copy to clipboard">📋</button>
        </div>
        ${dataHtml}
    `;
    
    // Add copy functionality
    const copyBtn = domEntry.querySelector('.trace-copy');
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(copyContent).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => { copyBtn.textContent = '📋'; }, 1000);
        });
    });
    
    // Remove empty state if present
    const emptyState = traceContent.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    traceContent.appendChild(domEntry);
    
    // Always scroll to bottom for new trace entries
    traceContent.scrollTop = traceContent.scrollHeight;
}

function clearTrace() {
    traceContent.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p style="font-size: 12px;">Waiting for input...</p>
        </div>
    `;
    traceEntries = [];
    saveTraceState();
}

// Save trace entries to localStorage
function saveTraceState() {
    localStorage.setItem('chatTraceEntries', JSON.stringify(traceEntries));
}

// Load trace entries from localStorage
function loadTraceState() {
    const saved = localStorage.getItem('chatTraceEntries');
    if (saved) {
        try {
            traceEntries = JSON.parse(saved);
            // Re-render all trace entries
            const traceContent = document.getElementById('traceContent');
            traceContent.innerHTML = '';
            
            if (traceEntries.length === 0) {
                traceContent.innerHTML = `
                    <div class="empty-state" style="padding: 20px;">
                        <p style="font-size: 12px;">Waiting for input...</p>
                    </div>
                `;
            } else {
                traceEntries.forEach(entry => {
                    renderTraceEntry(entry, true);
                });
            }
        } catch (e) {
            traceEntries = [];
        }
    }
}

traceClear.addEventListener('click', clearTrace);

// Function to update project selector state based on chat status
function updateProjectSelectorState() {
    const projectSelect = document.getElementById('headerProject');
    const createProjectLink = document.getElementById('createProjectLink');
    
    if (!projectSelect) return;
    
    // If chat has started (has messages), disable project selector
    if (messages.length > 0) {
        projectSelect.disabled = true;
        projectSelect.title = "Start a new chat to change project";
        if (createProjectLink) {
            createProjectLink.style.display = 'none';
        }
    } else {
        projectSelect.disabled = false;
        projectSelect.title = "Select project";
        if (createProjectLink) {
            createProjectLink.style.display = 'inline-block';
        }
    }
}

// New chat button - clears everything and resets project
const newChatBtn = document.getElementById('newChatBtn');
if (newChatBtn) {
    newChatBtn.addEventListener('click', () => {
        // Clear messages
        messages = [];
        localStorage.removeItem('chatMessages');
        
        // Clear project selection
        localStorage.removeItem('selectedProject');
        const projectSelect = document.getElementById('headerProject');
        if (projectSelect) {
            projectSelect.value = '';
        }
        
        // Clear traces
        clearTrace();
        localStorage.removeItem('chatTraceEntries');
        
        // Clear URL params
        window.history.replaceState({}, document.title, '/');
        
        // Re-render
        renderMessages();
        updateProjectSelectorState();
    });
}

// Clear chat button
clearChatBtn.addEventListener('click', () => {
    if (confirm('Clear all chat messages?')) {
        messages = [];
        localStorage.removeItem('chatMessages');
        renderMessages();
        updateProjectSelectorState();
    }
});

// Toggle stop button visibility
function setLoopingState(looping) {
    isLooping = looping;
    traceStop.style.display = looping ? 'inline-block' : 'none';
    sendButton.disabled = looping;
    messageInput.disabled = looping;
}

// Stop button handler
traceStop.addEventListener('click', async () => {
    if (!isLooping) return;
    
    try {
        await fetch('/api/looper/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (e) {
        console.error('Failed to stop looper:', e);
    }
    
    setLoopingState(false);
    addTrace('input', 'Looper Stopped', 'User requested to stop the execution');
});

// Load saved state from localStorage
async function loadState() {
    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
        modelSelect.value = savedModel;
    }
    
    const savedMessages = localStorage.getItem('chatMessages');
    if (savedMessages) {
        try {
            messages = JSON.parse(savedMessages);
            renderMessages();
        } catch (e) {
            messages = [];
        }
    }
    
    // Load projects first, then set selected project after
    await loadProjects();
    
    // Update project selector state based on existing messages
    updateProjectSelectorState();
    
    // Get the saved project BEFORE checking URL
    const savedProject = localStorage.getItem('selectedProject');
    
    // Check URL for project parameter (takes priority)
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get('project');
    
    const projectSelect = document.getElementById('headerProject');
    if (projectParam) {
        projectSelect.value = projectParam;
        localStorage.setItem('selectedProject', projectParam);
    } else if (savedProject) {
        // Try to set saved project - it should now be in the dropdown
        projectSelect.value = savedProject;
    }
    
    // If value is still empty but we have a saved project, the project might have been deleted
    // In that case, keep it empty
    if (!projectSelect.value && savedProject) {
        console.log('Saved project not found:', savedProject);
        localStorage.removeItem('selectedProject');
    }
}

// Load projects from API and return the projects list
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        const projects = await response.json();
        
        const projectSelect = document.getElementById('headerProject');
        projectSelect.innerHTML = '<option value="">Select Project</option>';
        
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name} (${project.user})`;
            projectSelect.appendChild(option);
        });
        
        return projects;
    } catch (e) {
        console.error('Failed to load projects:', e);
        return [];
    }
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('selectedModel', modelSelect.value);
    localStorage.setItem('chatMessages', JSON.stringify(messages));
    
    const projectSelect = document.getElementById('headerProject');
    if (projectSelect) {
        localStorage.setItem('selectedProject', projectSelect.value);
    }
}

// Load trace entries

// Toggle collapsible command output
function toggleCommandOutput(element) {
    element.classList.toggle('collapsed');
}

// Render messages
function renderMessages() {
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <p>Start a conversation</p>
                <p style="margin-top: 8px; font-size: 12px; opacity: 0.7;">Type any Linux command to execute it</p>
            </div>
        `;
        return;
    }
    
    // Track if user has scrolled up - don't auto-scroll if reading history
    let userScrolledUp = false;
    
    messagesContainer.innerHTML = messages.map((msg, index) => {
        if (msg.type === 'command') {
            const isError = msg.is_error;
            const exitCode = msg.exit_code;
            const output = msg.content;
            const command = msg.command || '';
            
            return `
                <div class="message command">
                    <div class="message-avatar">$</div>
                    <div class="message-content">
                        <div style="margin-bottom: 4px; color: var(--accent);">$ ${escapeHtml(command)}</div>
                        <div class="command-output">
                            <div class="command-header" onclick="toggleCommandOutput(this.parentElement)">
                                <div class="command-title">
                                    <span class="exit-code ${exitCode === 0 ? 'success' : 'error'}">${exitCode}</span>
                                    <span>${output.split('\n').length} lines</span>
                                </div>
                                <span class="command-toggle">▼</span>
                            </div>
                            <div class="command-body">${escapeHtml(output)}</div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        // Check for code blocks in LLM response
        if (msg.code_blocks && msg.code_blocks.length > 0) {
            let codeBlocksHtml = msg.code_blocks.map(block => {
                // Add pod info badge if ran in pod
                const podBadge = block.ran_in_pod ? 
                    '<span class="pod-badge">Pod</span>' : '';
                
                // Add access info if available (for web servers)
                const accessInfo = block.access_info ? 
                    `<div class="access-info">${escapeHtml(block.access_info)}</div>` : '';
                
                return `
                <div class="command-output" style="margin-top: 12px;">
                    <div class="command-header" onclick="toggleCommandOutput(this.parentElement)">
                        <div class="command-title">
                            <span class="exit-code ${block.exit_code === 0 ? 'success' : 'error'}">${block.exit_code}</span>
                            <span>Code: ${block.language}</span>
                            ${podBadge}
                        </div>
                        <span class="command-toggle">▼</span>
                    </div>
                    <div class="command-body">${escapeHtml(block.output)}</div>
                    ${accessInfo}
                </div>
            `}).join('');
            
            return `
                <div class="message ${msg.role}">
                    <div class="message-avatar">
                        ${msg.role === 'user' ? 'U' : 'AI'}
                    </div>
                    <div class="message-content">
                        ${escapeHtml(msg.content)}
                        ${codeBlocksHtml}
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="message ${msg.role}">
                <div class="message-avatar">
                    ${msg.role === 'user' ? 'U' : 'AI'}
                </div>
                <div class="message-content">${escapeHtml(msg.content)}</div>
            </div>
        `;
    }).join('');
    
    // Scroll to bottom
    scrollToBottom();
    
    // Update project selector state
    updateProjectSelectorState();
}

// Scroll to bottom of messages - always scroll to latest
function scrollToBottom(force = true) {
    setTimeout(() => {
        requestAnimationFrame(() => {
            const container = messagesContainer;
            // Always scroll to bottom for new messages
            container.scrollTop = container.scrollHeight;
        });
    }, 50);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Send message
async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || isLoading) return;
    
    // Add user message
    messages.push({ role: 'user', content, type: 'user' });
    renderMessages();
    saveState();
    
    // Clear input
    messageInput.value = '';
    
    // Show loading
    isLoading = true;
    sendButton.disabled = true;
    messageInput.disabled = true;
    setLoopingState(true);
    
    // Add loading message
    const loadingId = 'loading-' + Date.now();
    messagesContainer.innerHTML += `
        <div class="message assistant" id="${loadingId}">
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <div class="loading">
                    <div class="loading-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span>Processing with Looper...</span>
                </div>
            </div>
        </div>
    `;
    scrollToBottom();
    
    // Declare traceEventSource outside try block so it can be accessed in catch
    let traceEventSource;
    
    try {
        // Start a new trace session
        const traceResponse = await fetch('/api/trace/start', { method: 'POST' });
        const traceData = await traceResponse.json();
        const traceId = traceData.trace_id;
        
        // Set trace ID in session storage for persistence
        sessionStorage.setItem('currentTraceId', traceId);
        
        // TRACE: User input
        addTrace('input', 'User Input', {
            prompt: content,
            model: modelSelect.value,
            trace_id: traceId
        });
        
        // Use the looper endpoint
        addTrace('process', 'Starting Looper', {
            prompt: content,
            model: modelSelect.value,
            messages_count: messages.length
        });
        
        // Get selected project
        const projectSelect = document.getElementById('headerProject');
        const projectId = projectSelect ? projectSelect.value : null;
        
        // Start SSE connection for real-time trace updates BEFORE making the request
        const traceEventSource = new EventSource('/api/looper/trace-stream');
        
        traceEventSource.onmessage = function(event) {
            const entry = JSON.parse(event.data);
            if (entry.type === 'done') {
                traceEventSource.close();
            } else {
                // Add trace entry in real-time
                addTrace(entry.type, entry.label, entry.data);
            }
        };
        
        traceEventSource.onerror = function() {
            traceEventSource.close();
        };
        
        const response = await fetch('/api/looper/run', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: content,
                model: modelSelect.value,
                project_id: projectId,
                messages: messages
                    .filter(m => m.type !== 'command')
                    .map(m => ({ role: m.role, content: m.content }))
            })
        });
        
        if (!response.ok) {
            // Close trace stream on error
            if (traceEventSource) {
                traceEventSource.close();
            }
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get response');
        }
        
        const data = await response.json();
        
        // Close the trace stream
        if (traceEventSource) {
            traceEventSource.close();
        }
        
        // Set looping to false since looper finished
        setLoopingState(false);
        
        // Remove loading message
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        // Handle looper response
        if (data.success) {
            // Looper completed successfully
            addTrace('output', 'Looper Complete', {
                loop_count: data.loop_count || 1,
                success: true,
                results_count: data.successful_results ? data.successful_results.length : 0
            });
            
            // Build detailed response from command tree
            let responseText = '';
            if (data.command_tree && data.command_tree.length > 0) {
                responseText = buildTreeResponse(data.command_tree);
            } else {
                responseText = data.response || (data.successful_results ? data.successful_results.join('\n') : 'Completed');
            }
            
            messages.push({
                role: 'assistant',
                content: responseText,
                type: 'looper-success',
                loop_count: data.loop_count
            });
        } else {
            // Looper failed
            addTrace('error', 'Looper Failed', {
                error: data.error,
                loop_count: data.loop_count || 1,
                stopped: data.stopped || false
            });
            
            // Try to show partial results
            let errorContent = data.error || 'Execution failed';
            if (data.command_tree && data.command_tree.length > 0) {
                errorContent = buildTreeResponse(data.command_tree) + '\n\n❌ Error: ' + errorContent;
            }
            
            messages.push({
                role: 'assistant',
                content: errorContent,
                type: 'error'
            });
        }
        
        // Add detailed trace for each command
        if (data.command_tree) {
            data.command_tree.forEach((node, i) => {
                addTrace('output', `Command ${i+1}: ${node.code ? node.code.substring(0, 30) + '...' : 'N/A'}`, {
                    success: node.success,
                    result: node.result || node.error,
                    level: node.level
                });
            });
        }
        
        // Display trace entries from looper (append, don't overwrite!)
        // This is intentional - real-time SSE already shows entries as they come
        // We only add any final entries that might be missing
        if (data.trace_entries && data.trace_entries.length > 0) {
            // Just log that looper finished - don't clear or overwrite real-time entries
            // The SSE already showed everything in real-time
            console.log('Looper finished with', data.trace_entries.length, 'trace entries');
        }
        
        renderMessages();
        saveState();
        
    } catch (error) {
        // Close trace stream on exception
        if (traceEventSource) {
            traceEventSource.close();
        }
        
        // Reset looping state
        setLoopingState(false);
        
        // Remove loading message
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        // Add error message
        addTrace('error', 'Exception Error', {
            message: error.message,
            stack: error.stack
        });
        
        messages.push({ role: 'assistant', content: `Error: ${error.message}`, type: 'error' });
        renderMessages();
        saveState();
    }
    
    isLoading = false;
    sendButton.disabled = false;
    messageInput.disabled = false;
    setLoopingState(false);
    messageInput.focus();
}

// Event listeners
sendButton.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Auto-resize textarea
messageInput.addEventListener('input', () => {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + 'px';
});

// Model change - save selection
modelSelect.addEventListener('change', saveState);

// Project selection change - save
const projectSelect = document.getElementById('headerProject');
if (projectSelect) {
    projectSelect.addEventListener('change', saveState);
}

// Track when user scrolls up manually
let userHasScrolledUp = false;
messagesContainer.addEventListener('scroll', () => {
    const container = messagesContainer;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
    if (!isNearBottom) {
        userHasScrolledUp = true;
    }
});

// Load state on page load
loadState();

// Load trace entries from localStorage on page load
loadTraceState();

// Focus input on load
messageInput.focus();
