// Chat functionality
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const modelSelect = document.getElementById('model');
const traceContent = document.getElementById('traceContent');
const traceClear = document.getElementById('traceClear');

// State
let messages = [];
let isLoading = false;
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
    
    domEntry.innerHTML = `
        <div class="trace-time">${entry.time}</div>
        <div class="trace-step">
            <div class="trace-icon ${entry.type}">${entry.type === 'input' ? '↓' : entry.type === 'process' ? '⚙' : entry.type === 'output' ? '↑' : '!'}</div>
            <div class="trace-text">${escapeHtml(entry.label)}</div>
        </div>
        ${dataHtml}
    `;
    
    // Remove empty state if present
    const emptyState = traceContent.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    traceContent.appendChild(domEntry);
    
    // Only scroll to bottom for new entries, not during initial load
    if (!isInitial) {
        traceContent.scrollTop = traceContent.scrollHeight;
    }
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

// Load saved state from localStorage
function loadState() {
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
    
    // Load projects and set selected project
    loadProjects();
    
    // Check URL for project parameter
    const urlParams = new URLSearchParams(window.location.search);
    const projectParam = urlParams.get('project');
    if (projectParam) {
        const projectSelect = document.getElementById('headerProject');
        projectSelect.value = projectParam;
        localStorage.setItem('selectedProject', projectParam);
    } else {
        const savedProject = localStorage.getItem('selectedProject');
        if (savedProject) {
            const projectSelect = document.getElementById('headerProject');
            projectSelect.value = savedProject;
        }
    }
}

// Load projects from API
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
    } catch (e) {
        console.error('Failed to load projects:', e);
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
}

// Scroll to bottom of messages (only if user is near bottom or hasn't scrolled up)
function scrollToBottom(force = false) {
    setTimeout(() => {
        requestAnimationFrame(() => {
            const container = messagesContainer;
            // If force is true, always scroll
            // If user hasn't scrolled up manually, check if near bottom
            // This allows users to scroll up to see history without being forced to bottom
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
            if (force || !userHasScrolledUp || isNearBottom) {
                container.scrollTop = container.scrollHeight;
                // Reset userHasScrolledUp after scrolling to bottom
                if (isNearBottom) {
                    userHasScrolledUp = false;
                }
            }
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
                    <span>Processing...</span>
                </div>
            </div>
        </div>
    `;
    scrollToBottom();
    
    try {
        // TRACE: User input
        addTrace('input', 'User Input', {
            prompt: content,
            model: modelSelect.value
        });
        
        // Use the unified /prompt endpoint
        addTrace('process', 'Calling /prompt endpoint', {
            prompt: content,
            model: modelSelect.value,
            messages_count: messages.length
        });
        
        // Get selected project
        const projectSelect = document.getElementById('headerProject');
        const projectId = projectSelect ? projectSelect.value : null;
        
        const response = await fetch('/prompt', {
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
            const error = await response.json();
            throw new Error(error.detail || 'Failed to get response');
        }
        
        const data = await response.json();
        
        // TRACE: Response received
        addTrace('output', 'Response from /prompt', {
            type: data.type,
            has_code: data.has_code || false,
            code_blocks_count: data.code_blocks ? data.code_blocks.length : 0,
            output_length: data.output ? data.output.length : 0
        });
        
        // Remove loading message
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        if (data.type === 'command') {
            // Command result
            addTrace('output', 'Command Executed', {
                command: content,
                exit_code: data.exit_code,
                output: data.output
            });
            
            messages.push({ 
                role: 'assistant', 
                content: data.output, 
                type: 'command',
                command: content,
                exit_code: data.exit_code,
                is_error: data.is_error
            });
        } else if (data.type === 'llm') {
            // LLM result
            messages.push({ 
                role: 'assistant', 
                content: data.output, 
                type: 'llm',
                code_blocks: data.code_blocks || []
            });
            
            // Trace code execution if present
            if (data.code_blocks && data.code_blocks.length > 0) {
                addTrace('process', 'Code Stripper: Extracted code blocks', {
                    blocks: data.code_blocks.map(b => ({
                        language: b.language,
                        code: b.code.substring(0, 50) + '...'
                    }))
                });
                
                data.code_blocks.forEach((block, i) => {
                    addTrace('output', `Code Block ${i + 1} Executed`, {
                        code: block.code,
                        exit_code: block.exit_code,
                        output: block.output
                    });
                });
            }
        } else {
            // Error
            addTrace('error', 'Error Response', data);
            messages.push({ role: 'assistant', content: data.output || 'Error', type: 'error' });
        }
        
        renderMessages();
        saveState();
        
    } catch (error) {
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

// Focus input on load
messageInput.focus();
