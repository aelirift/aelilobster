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

// Terminal mode state
let terminalMode = false;
let terminalSessionId = null;
let terminalWaitingForInput = false;
let terminalWaitingForPassword = false;
let chatMode = true; // true = conversation mode, false = terminal mode

// Set password input mode (hide typed characters)
function setPasswordInputMode(enabled) {
    terminalWaitingForPassword = enabled;
    if (enabled) {
        messageInput.type = 'password';
        messageInput.placeholder = 'Password (hidden)...';
        messageInput.style.borderColor = '#ff6b6b'; // Red border for password
    } else {
        messageInput.type = 'text';
        messageInput.placeholder = 'Type command...';
        messageInput.style.borderColor = '#fd7e14'; // Orange border for terminal
    }
}

// Load saved mode from localStorage
function loadSavedMode() {
    const savedMode = localStorage.getItem('chatMode');
    if (savedMode === 'terminal') {
        chatMode = false;
        terminalMode = true;
    } else {
        chatMode = true;
        terminalMode = false;
    }
}

// Save mode to localStorage
function saveMode() {
    if (terminalMode) {
        localStorage.setItem('chatMode', 'terminal');
    } else {
        localStorage.setItem('chatMode', 'chat');
    }
}

// Strip ANSI color codes from terminal output
function stripAnsiCodes(text) {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// Terminal mode functions
async function enterTerminalMode() {
    if (terminalMode) return;
    
    // Update chat mode state
    chatMode = false;
    terminalMode = true;
    saveMode();
    
    // Update UI
    const modeToggle = document.getElementById('modeToggle');
    if (modeToggle) {
        modeToggle.classList.add('terminal-mode');
        modeToggle.querySelector('.mode-icon').textContent = '🖥️';
        modeToggle.querySelector('.mode-label').textContent = 'Terminal';
    }
    
    // Add terminal class to chat container
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        chatContainer.classList.add('terminal-mode');
    }
    
    // Clear chat messages when switching to terminal
    messages = [];
    
    try {
        // Start a new terminal session
        const response = await fetch('/api/terminal/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cwd: '/home/aeli/projects/aelilobster' })
        });
        
        const data = await response.json();
        
        if (data.success) {
            terminalSessionId = data.session_id;
            
            // Add system message about entering terminal mode
            messages.push({
                role: 'system',
                content: '🔴 TERMINAL MODE\n\nYou are now in interactive terminal mode.\n• Type any Linux command to execute\n• Use sudo, pipes, redirects - all supported\n• For interactive prompts (yes/no), just type your response\n• Click the toggle button to return to chat mode\n\n' + stripAnsiCodes(data.output),
                type: 'terminal-status'
            });
            
            renderMessages();
            addTrace('terminal', 'Terminal Mode', 'Entered terminal mode');
            
            // Update input for terminal mode
            messageInput.placeholder = 'Type command...';
            messageInput.style.borderColor = '#fd7e14';
        } else {
            alert('Failed to start terminal: ' + data.message);
            // Revert on failure
            chatMode = true;
            terminalMode = false;
            saveMode();
        }
    } catch (e) {
        alert('Error starting terminal: ' + e.message);
        chatMode = true;
        terminalMode = false;
        saveMode();
    }
}

async function exitTerminalMode() {
    if (!terminalMode) return;
    
    // Update chat mode state
    chatMode = true;
    saveMode();
    
    try {
        // Close the terminal session
        if (terminalSessionId) {
            await fetch(`/api/terminal/${terminalSessionId}/close`, { method: 'POST' });
        }
        
        const oldSessionId = terminalSessionId;
        terminalMode = false;
        terminalSessionId = null;
        terminalWaitingForInput = false;
        setPasswordInputMode(false); // Reset password input mode
        
        // Update UI
        const modeToggle = document.getElementById('modeToggle');
        if (modeToggle) {
            modeToggle.classList.remove('terminal-mode');
            modeToggle.querySelector('.mode-icon').textContent = '💬';
            modeToggle.querySelector('.mode-label').textContent = 'Chat';
        }
        
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.classList.remove('terminal-mode');
        }
        
        // Clear messages when exiting terminal mode (back to chat)
        messages = [];
        
        // Add system message
        messages.push({
            role: 'system',
            content: '💬 CHAT MODE\n\nReturned to conversation mode. You can now chat with the AI.',
            type: 'chat-status'
        });
        
        renderMessages();
        addTrace('terminal', 'Terminal Mode', 'Exited terminal mode (session: ' + oldSessionId + ')');
        
        // Restore UI
        messageInput.placeholder = 'Type a message...';
        messageInput.style.borderColor = '';
    } catch (e) {
        console.error('Error exiting terminal:', e);
    }
}

// Toggle between chat and terminal mode
async function toggleMode() {
    if (chatMode) {
        // Switch to terminal mode
        await enterTerminalMode();
    } else {
        // Switch to chat mode
        await exitTerminalMode();
    }
}

async function sendTerminalCommand(command) {
    // Check for exit command
    if (command.toLowerCase() === 'exit' || command.toLowerCase() === 'quit') {
        await exitTerminalMode();
        return;
    }
    
    // Add user command to messages (with $ prefix)
    messages.push({ role: 'user', content: '$ ' + command, type: 'terminal-command' });
    renderMessages();
    
    try {
        const response = await fetch(`/api/terminal/${terminalSessionId}/exec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: command })
        });
        
        const data = await response.json();
        
        if (data.waiting_for_input) {
            // Command is waiting for interactive input
            terminalWaitingForInput = true;
            
            // Check if this is a password prompt
            if (data.password_prompt) {
                setPasswordInputMode(true);
                messages.push({
                    role: 'system',
                    content: '🔐 ' + stripAnsiCodes(data.output) + '\n\nEnter password (hidden)...',
                    type: 'terminal-waiting'
                });
            } else {
                setPasswordInputMode(false);
                messages.push({
                    role: 'system',
                    content: '⏳ ' + stripAnsiCodes(data.output) + '\n\nWaiting for input...',
                    type: 'terminal-waiting'
                });
            }
        } else {
            // Command completed - just show output, don't repeat command
            terminalWaitingForInput = false;
            const output = stripAnsiCodes(data.output) || '(no output)';
            messages.push({
                role: 'assistant',
                content: output,
                type: 'terminal-output',
                exit_code: data.exit_code
            });
        }
        
        renderMessages();
    } catch (e) {
        messages.push({
            role: 'assistant',
            content: 'Error: ' + e.message,
            type: 'terminal-error'
        });
        renderMessages();
    }
}

async function sendTerminalInput(input) {
    try {
        const response = await fetch(`/api/terminal/${terminalSessionId}/input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ input: input })
        });
        
        const data = await response.json();
        
        terminalWaitingForInput = false;
        const isPassword = terminalWaitingForPassword;
        setPasswordInputMode(false);
        
        // Show obfuscated input for passwords
        const displayInput = isPassword ? '••••••••' : input;
        messages.push({
            role: 'system',
            content: '> ' + displayInput,
            type: 'terminal-input'
        });
        
        messages.push({
            role: 'assistant',
            content: stripAnsiCodes(data.output) || '(no output)',
            type: 'terminal-output'
        });
        
        renderMessages();
    } catch (e) {
        messages.push({
            role: 'assistant',
            content: 'Error sending input: ' + e.message,
            type: 'terminal-error'
        });
        renderMessages();
    }
}

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
    
    // Only scroll to bottom if user hasn't scrolled up
    const isNearBottom = traceContent.scrollHeight - traceContent.scrollTop - traceContent.clientHeight < 100;
    if (isNearBottom || !traceUserScrolledUp) {
        traceContent.scrollTop = traceContent.scrollHeight;
    }
}

// Track when user scrolls up in trace
let traceUserScrolledUp = false;
traceContent.addEventListener('scroll', () => {
    const isNearBottom = traceContent.scrollHeight - traceContent.scrollTop - traceContent.clientHeight < 100;
    if (!isNearBottom) {
        traceUserScrolledUp = true;
    }
});

function clearTrace() {
    traceContent.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p style="font-size: 12px;">Waiting for input...</p>
        </div>
    `;
    // Reset scroll flag when clearing
    traceUserScrolledUp = false;
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
    const confirmMsg = terminalMode 
        ? 'Clear all terminal history?' 
        : 'Clear all chat messages?';
    if (confirm(confirmMsg)) {
        messages = [];
        // Clear only the current mode's messages
        if (terminalMode) {
            localStorage.removeItem('terminalMessages');
        } else {
            localStorage.removeItem('chatMessages');
        }
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
    // Load saved chat mode first (before loading messages)
    loadSavedMode();
    
    // Update UI based on loaded mode
    const modeToggle = document.getElementById('modeToggle');
    if (modeToggle) {
        if (terminalMode) {
            modeToggle.classList.add('terminal-mode');
            modeToggle.querySelector('.mode-icon').textContent = '🖥️';
            modeToggle.querySelector('.mode-label').textContent = 'Terminal';
            
            // Add terminal class to chat container
            const chatContainer = document.querySelector('.chat-container');
            if (chatContainer) {
                chatContainer.classList.add('terminal-mode');
            }
            
            // Update input for terminal mode
            messageInput.placeholder = 'Type command...';
            messageInput.style.borderColor = '#fd7e14';
        } else {
            modeToggle.classList.remove('terminal-mode');
            modeToggle.querySelector('.mode-icon').textContent = '💬';
            modeToggle.querySelector('.mode-label').textContent = 'Chat';
            
            // Remove terminal class from chat container
            const chatContainer = document.querySelector('.chat-container');
            if (chatContainer) {
                chatContainer.classList.remove('terminal-mode');
            }
            
            // Reset input for chat mode
            messageInput.placeholder = 'Type your message...';
            messageInput.style.borderColor = '';
        }
    }
    
    const savedModel = localStorage.getItem('selectedModel');
    if (savedModel) {
        modelSelect.value = savedModel;
    }
    
    // Load messages appropriate for current mode
    let savedMessages;
    if (terminalMode) {
        savedMessages = localStorage.getItem('terminalMessages');
    } else {
        savedMessages = localStorage.getItem('chatMessages');
    }
    if (savedMessages) {
        try {
            messages = JSON.parse(savedMessages);
            renderMessages();
        } catch (e) {
            messages = [];
        }
    }
    
    // If loading terminal mode, start a new terminal session
    if (terminalMode) {
        try {
            const response = await fetch('/api/terminal/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cwd: '/home/aeli/projects/aelilobster' })
            });
            
            const data = await response.json();
            
            if (data.success) {
                terminalSessionId = data.session_id;
                
                // Add system message about reconnecting to terminal
                messages.push({
                    role: 'system',
                    content: '🔴 TERMINAL MODE (Reconnected)\n\nYou are now in interactive terminal mode.\n• Type any Linux command to execute\n• Use sudo, pipes, redirects - all supported\n• For interactive prompts (yes/no), just type your response\n• Click the toggle button to return to chat mode\n\n' + stripAnsiCodes(data.output),
                    type: 'terminal-status'
                });
                
                renderMessages();
                addTrace('terminal', 'Terminal Session', 'Reconnected to terminal');
            } else {
                // Failed to start terminal, switch back to chat mode
                alert('Failed to start terminal: ' + data.message);
                chatMode = true;
                terminalMode = false;
                saveMode();
                
                // Update UI back to chat mode
                const modeToggle = document.getElementById('modeToggle');
                if (modeToggle) {
                    modeToggle.classList.remove('terminal-mode');
                    modeToggle.querySelector('.mode-icon').textContent = '💬';
                    modeToggle.querySelector('.mode-label').textContent = 'Chat';
                }
                const chatContainer = document.querySelector('.chat-container');
                if (chatContainer) {
                    chatContainer.classList.remove('terminal-mode');
                }
                messageInput.placeholder = 'Type your message...';
                messageInput.style.borderColor = '';
            }
        } catch (e) {
            console.error('Error starting terminal session:', e);
            // On error, fall back to chat mode
            chatMode = true;
            terminalMode = false;
            saveMode();
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
    
    // Save messages to appropriate storage based on current mode
    if (terminalMode) {
        localStorage.setItem('terminalMessages', JSON.stringify(messages));
    } else {
        localStorage.setItem('chatMessages', JSON.stringify(messages));
    }
    
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
    
    // Handle terminal mode
    if (!chatMode && terminalMode) {
        if (terminalWaitingForInput) {
            // Send input to waiting command
            messageInput.value = '';
            await sendTerminalInput(content);
        } else {
            // Execute terminal command
            messageInput.value = '';
            await sendTerminalCommand(content);
        }
        return;
    }
    
    // Chat mode - just send to LLM for conversation (no code execution)
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
        
        // Use simple chat endpoint (no code execution)
        addTrace('process', 'Sending to LLM', {
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
        
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: content,
                model: modelSelect.value,
                messages: messages
                    .filter(m => m.type !== 'command' && m.type !== 'terminal-command' && m.type !== 'terminal-output')
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
        
        // Set looping to false since chat finished
        setLoopingState(false);
        
        // Remove loading message
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        // Handle simple chat response
        if (data.output) {
            addTrace('output', 'LLM Response', {
                model: data.model,
                output_length: data.output.length
            });
            
            messages.push({
                role: 'assistant',
                content: data.output,
                type: 'chat'
            });
        } else if (data.error) {
            addTrace('error', 'Chat Error', {
                error: data.error
            });
            
            messages.push({
                role: 'assistant',
                content: 'Error: ' + data.error,
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

// Mode toggle button
const modeToggle = document.getElementById('modeToggle');
if (modeToggle) {
    modeToggle.addEventListener('click', toggleMode);
}

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
