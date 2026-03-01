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

// Save terminal session before page unload
window.addEventListener('beforeunload', function() {
    if (terminalMode) {
        // Save state before closing
        saveState();
        console.log('[DEBUG] Page unloading, saved terminal mode');
    }
});

// Restore terminal session after page load
window.addEventListener('load', function() {
    console.log('[DEBUG] Page loaded');
});

// Load saved mode from localStorage (project-specific) AND from requirements.md via API
async function loadSavedMode() {
    const projectSelect = document.getElementById('headerProject');
    const projectId = projectSelect ? projectSelect.value : 'none';
    const localProject = localStorage.getItem('selectedProject');
    const modeKey = getProjectStorageKey('chatMode');
    const savedMode = localStorage.getItem(modeKey);
    
    console.log('[DEBUG] loadSavedMode: projectSelect.value =', projectId);
    console.log('[DEBUG] loadSavedMode: localStorage selectedProject =', localProject);
    console.log('[DEBUG] loadSavedMode: modeKey =', modeKey);
    console.log('[DEBUG] loadSavedMode: savedMode =', savedMode);
    
    // First, try to load from API (requirements.md) - this takes priority
    if (projectId && projectId !== 'none') {
        try {
            const response = await fetch(`/api/projects/${projectId}/settings`);
            const data = await response.json();
            if (data.settings && data.settings.chat_mode) {
                console.log('[DEBUG] loadSavedMode: Loaded from API:', data.settings.chat_mode);
                if (data.settings.chat_mode === 'terminal') {
                    chatMode = false;
                    terminalMode = true;
                    console.log('[DEBUG] loadSavedMode: FINAL chatMode =', chatMode, 'terminalMode =', terminalMode, '(from API)');
                    return;
                }
            }
        } catch (e) {
            console.log('[DEBUG] loadSavedMode: Failed to load from API:', e);
        }
    }
    
    // Fall back to localStorage
    if (savedMode === 'terminal') {
        chatMode = false;
        terminalMode = true;
    } else {
        // Default to chat mode if nothing saved OR if explicitly saved as chat
        chatMode = true;
        terminalMode = false;
    }
    console.log('[DEBUG] loadSavedMode: FINAL chatMode =', chatMode, 'terminalMode =', terminalMode);
}

// Save mode to localStorage (project-specific) AND to requirements.md via API
async function saveMode() {
    console.log('[DEBUG] saveMode called from:', new Error().stack);
    console.log('[DEBUG] saveMode current: chatMode=', chatMode, 'terminalMode=', terminalMode);
    const modeKey = getProjectStorageKey('chatMode');
    if (terminalMode) {
        localStorage.setItem(modeKey, 'terminal');
    } else {
        localStorage.setItem(modeKey, 'chat');
    }
    console.log('[DEBUG] saveMode: modeKey =', modeKey, 'chatMode =', chatMode, 'terminalMode =', terminalMode);
    
    // Also save to requirements.md via API
    const projectSelect = document.getElementById('headerProject');
    const projectId = projectSelect ? projectSelect.value : 'none';
    if (projectId && projectId !== 'none') {
        try {
            const chatModeValue = terminalMode ? 'terminal' : 'chat';
            await fetch(`/api/projects/${projectId}/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_mode: chatModeValue })
            });
            console.log('[DEBUG] saveMode: Saved to API:', chatModeValue);
        } catch (e) {
            console.log('[DEBUG] saveMode: Failed to save to API:', e);
        }
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
    console.log('[DEBUG] toggleMode called! chatMode=', chatMode, 'terminalMode=', terminalMode);
    if (chatMode) {
        // Switch to terminal mode
        console.log('[DEBUG] toggleMode calling enterTerminalMode!');
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
    console.log('[DEBUG] clearTrace called!');
    traceContent.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p style="font-size: 12px;">Waiting for input...</p>
        </div>
    `;
    // Reset scroll flag when clearing
    traceUserScrolledUp = false;
    traceEntries = [];
    saveTraceState();
    console.log('[DEBUG] clearTrace: cleared local, calling backend');
    
    // Also clear the backend trace logger (both in-memory and persistent file)
    fetch('/api/trace/clear', { method: 'POST' }).catch(e => console.log('Failed to clear trace:', e));
}

// Save trace entries to localStorage
function saveTraceState() {
    const traceKey = getProjectStorageKey('traceEntries');
    localStorage.setItem(traceKey, JSON.stringify(traceEntries));
}

// Load trace entries from localStorage
function loadTraceState() {
    const traceKey = getProjectStorageKey('traceEntries');
    const saved = localStorage.getItem(traceKey);
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

console.log('[DEBUG] traceClear event listener attached');
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
        // Clear messages - use project-specific keys
        messages = [];
        const chatKey = getProjectStorageKey('chatMessages');
        const terminalKey = getProjectStorageKey('terminalMessages');
        localStorage.removeItem(chatKey);
        localStorage.removeItem(terminalKey);
        
        // Clear project selection
        localStorage.removeItem('selectedProject');
        const projectSelect = document.getElementById('headerProject');
        if (projectSelect) {
            projectSelect.value = '';
        }
        
        // Clear traces - use project-specific key
        clearTrace();
        const traceKey = getProjectStorageKey('traceEntries');
        localStorage.removeItem(traceKey);
        
        // Clear URL params
        window.history.replaceState({}, document.title, '/');
        
        // Re-render
        renderMessages();
        updateProjectSelectorState();
    });
}

// Clear chat button
console.log('[DEBUG] clearChatBtn event listener attached');
clearChatBtn.addEventListener('click', () => {
    console.log('[DEBUG] clearChatBtn clicked! terminalMode=', terminalMode);
    const confirmMsg = terminalMode 
        ? 'Clear all terminal history?' 
        : 'Clear all chat messages?';
    if (confirm(confirmMsg)) {
        console.log('[DEBUG] User confirmed clear');
        messages = [];
        // Clear BOTH chat and terminal messages to ensure complete clear
        const chatKey = getProjectStorageKey('chatMessages');
        const terminalKey = getProjectStorageKey('terminalMessages');
        console.log('[DEBUG] Clearing chatKey=', chatKey, 'terminalKey=', terminalKey);
        localStorage.removeItem(chatKey);
        localStorage.removeItem(terminalKey);
        
        // Also clear ALL possible message keys (for any project variations)
        // This ensures complete clear regardless of mode
        console.log('[DEBUG] Also clearing traceKey and executionTree');
        const traceKey = getProjectStorageKey('traceEntries');
        localStorage.removeItem(traceKey);
        
        // Also clear execution tree
        const treeStateKey = getProjectStorageKey('executionTree');
        localStorage.removeItem(treeStateKey);
        
        renderMessages();
        updateProjectSelectorState();
        console.log('[DEBUG] Clear complete - all localStorage cleared');
    } else {
        console.log('[DEBUG] User cancelled clear');
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
    console.log('[DEBUG] loadState starting...');
    
    // First, load projects to ensure we have a valid project selected
    // This must happen BEFORE loading saved mode, so we use the correct project-specific key
    await loadProjects();
    
    // Now that we have a valid project, load the saved mode - MUST await!
    console.log('[DEBUG] loadState: BEFORE loadSavedMode, terminalMode =', terminalMode);
    await loadSavedMode();
    console.log('[DEBUG] loadState: AFTER loadSavedMode, terminalMode =', terminalMode);
    
    // FIX: Removed saveMode() call here - it was overwriting the loaded mode!
    // saveMode() is now only called when user explicitly changes mode (in enterTerminalMode/exitTerminalMode)
    console.log('[DEBUG] loadState: NOT calling saveMode() to preserve loaded value');
    
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
    
    // Load messages appropriate for current mode (project-specific)
    const chatKey = getProjectStorageKey('chatMessages');
    const terminalKey = getProjectStorageKey('terminalMessages');
    const traceKey = getProjectStorageKey('traceEntries');
    
    console.log('[DEBUG] loadState: chatKey=', chatKey, 'terminalKey=', terminalKey, 'traceKey=', traceKey);
    
    let savedMessages;
    if (terminalMode) {
        savedMessages = localStorage.getItem(terminalKey);
    } else {
        savedMessages = localStorage.getItem(chatKey);
    }
    console.log('[DEBUG] loadState: savedMessages=', savedMessages ? 'EXISTS' : 'null');
    if (savedMessages) {
        try {
            messages = JSON.parse(savedMessages);
            renderMessages();
        } catch (e) {
            messages = [];
        }
    }
    
    // Load trace entries (project-specific)
    const savedTrace = localStorage.getItem(traceKey);
    if (savedTrace) {
        try {
            traceEntries = JSON.parse(savedTrace);
            // Re-render all trace entries
            const traceContent = document.getElementById('traceContent');
            if (traceContent) {
                traceContent.innerHTML = '';
                traceEntries.forEach(entry => renderTraceEntry(entry, true));
            }
        } catch (e) {
            traceEntries = [];
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
        // Get current user first
        let currentUser = localStorage.getItem('currentUser');
        if (!currentUser) {
            try {
                const userResponse = await fetch('/api/user');
                const userData = await userResponse.json();
                currentUser = userData.user || 'default';
                localStorage.setItem('currentUser', currentUser);
            } catch (e) {
                console.log('[DEBUG] Could not get user from API, using default');
                currentUser = 'default';
            }
        }
        
        // Fetch projects filtered by user
        const response = await fetch(`/api/projects?user=${encodeURIComponent(currentUser)}`);
        const projects = await response.json();
        
        const projectSelect = document.getElementById('headerProject');
        projectSelect.innerHTML = '<option value="">Select Project</option>';
        
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name} (${project.user})`;
            projectSelect.appendChild(option);
        });
        
        // If no projects exist or none selected, auto-create one
        const savedProject = localStorage.getItem('selectedProject');
        console.log('[DEBUG] loadProjects: savedProject =', savedProject);
        console.log('[DEBUG] loadProjects: projects =', projects.map(p => p.id));
        
        if (!savedProject || !projects.find(p => p.id === savedProject)) {
            if (projects.length > 0) {
                // Use first available project
                projectSelect.value = projects[0].id;
                localStorage.setItem('selectedProject', projects[0].id);
                console.log('[DEBUG] loadProjects: set to first project', projects[0].id);
            } else {
                // Create a random project
                console.log('[DEBUG] No projects found, creating one...');
                const randomName = 'project-' + Math.random().toString(36).substring(2, 8);
                try {
                    const createResponse = await fetch('/api/projects', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: randomName, user: currentUser })
                    });
                    const newProject = await createResponse.json();
                    if (newProject.id) {
                        projectSelect.value = newProject.id;
                        localStorage.setItem('selectedProject', newProject.id);
                        console.log('[DEBUG] Created project:', newProject.id);
                    }
                } catch (e) {
                    console.error('Failed to create project:', e);
                }
            }
        } else {
            // Saved project exists - set it
            projectSelect.value = savedProject;
            console.log('[DEBUG] loadProjects: set to savedProject', savedProject);
        }
        
        console.log('[DEBUG] loadProjects: FINAL projectSelect.value =', projectSelect.value);
        
        return projects;
    } catch (e) {
        console.error('Failed to load projects:', e);
        return [];
    }
}

// Detect if the prompt is about code/command execution or just conversation
// Returns true if it should go to looper (code execution), false for simple chat
function isCodeRequest(prompt) {
    const lower = prompt.toLowerCase().trim();
    
    // Linux command patterns
    const linuxCommands = ['ls', 'cd', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'find', 'chmod', 'chown', 'tar', 'zip', 'unzip', 'curl', 'wget', 'git', 'npm', 'pip', 'python', 'node', 'java', 'gcc', 'make', 'docker', 'kubectl', 'sudo', 'apt', 'yum', 'yum', 'grep', 'awk', 'sed'];
    
    // Code-related keywords
    const codeKeywords = [
        'write code', 'create code', 'run code', 'execute code', 'debug code',
        'fix code', 'improve code', 'refactor', 'function', 'class', 'method',
        'python', 'javascript', 'java', 'c++', 'ruby', 'go', 'rust', 'php',
        'code', 'script', 'program', 'algorithm', 'implement', 'compile',
        'install', 'import', 'package', 'library', 'dependency',
        'api', 'endpoint', 'function', 'loop', 'if', 'else', 'for', 'while',
        'return', 'print', 'console.log', 'print_r', 'var', 'let', 'const',
        'git', 'commit', 'push', 'pull', 'branch', 'merge',
        'test', 'unit test', 'pytest', 'jest', 'unittest',
        'error', 'bug', 'exception', 'traceback', 'stack',
        'command', 'terminal', 'bash', 'shell', 'exec', 'run',
        'pod', 'container', 'docker', 'kubernetes', 'podman',
        'file', 'directory', 'folder', 'path', 'create', 'delete', 'remove'
    ];
    
    // Check if it starts with a known Linux command
    const firstWord = lower.split(' ')[0];
    if (linuxCommands.includes(firstWord) || firstWord.startsWith('./') || firstWord.startsWith('/')) {
        return true;
    }
    
    // Check for code-related keywords
    for (const keyword of codeKeywords) {
        if (lower.includes(keyword)) {
            return true;
        }
    }
    
    // Check for code blocks or programming syntax
    if (lower.includes('```') || lower.includes('def ') || lower.includes('function ') || 
        lower.includes('class ') || lower.includes('import ') || lower.includes('from ') ||
        lower.includes('const ') || lower.includes('let ') || lower.includes('var ') ||
        lower.includes('print(') || lower.includes('console.log') || lower.includes('return ')) {
        return true;
    }
    
    return false;
}

// Get project-specific storage key
function getProjectStorageKey(baseKey) {
    const projectSelect = document.getElementById('headerProject');
    const projectId = projectSelect ? projectSelect.value : localStorage.getItem('selectedProject') || 'default';
    return `${projectId}_${baseKey}`;
}

// Save state to localStorage (project-specific)
function saveState() {
    localStorage.setItem('selectedModel', modelSelect.value);
    
    // Get project-specific keys
    const chatKey = getProjectStorageKey('chatMessages');
    const terminalKey = getProjectStorageKey('terminalMessages');
    const traceKey = getProjectStorageKey('traceEntries');
    
    // Save messages to appropriate storage based on current mode
    if (terminalMode) {
        localStorage.setItem(terminalKey, JSON.stringify(messages));
    } else {
        localStorage.setItem(chatKey, JSON.stringify(messages));
    }
    
    // Save trace entries
    localStorage.setItem(traceKey, JSON.stringify(traceEntries));
    
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
    
    // Detect if this is a code/command request
    const useLooper = isCodeRequest(content);
    
    // Create execution tree for looper requests
    if (useLooper) {
        createExecutionTree(content);
    }
    
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
                
                // Update execution tree in real-time based on trace entries
                // Force immediate re-render for real-time updates
                updateExecutionTreeFromTrace(entry);
                
                // Force DOM update by accessing the tree view element
                const treeView = document.getElementById('treeView');
                if (treeView) {
                    // Trigger reflow to ensure visual update
                    treeView.style.display = 'none';
                    treeView.offsetHeight; // Force reflow
                    treeView.style.display = 'block';
                }
            }
        };
        
        traceEventSource.onerror = function() {
            traceEventSource.close();
        };
        
        // Detect if this is a code/command request or normal conversation
        const useLooper = isCodeRequest(content);
        
        let response;
        if (useLooper) {
            // Code/command request - use looper for execution in pods
            addTrace('process', 'Detected code request, using Looper', { prompt: content });
            response = await fetch('/api/looper/run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: content,
                    model: modelSelect.value,
                    project_id: projectId,
                    messages: messages
                        .filter(m => m.type !== 'command' && m.type !== 'terminal-command' && m.type !== 'terminal-output')
                        .map(m => ({ role: m.role, content: m.content }))
                })
            });
        } else {
            // Normal conversation - use simple chat endpoint (no code execution)
            addTrace('process', 'Detected conversation, using LLM directly', { prompt: content });
            response = await fetch('/api/chat', {
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
        }
        
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
        
        // Handle looper response (also works for simple chat)
        const responseText = data.response || data.output || '';
        
        if (responseText) {
            addTrace('output', 'LLM Response', {
                model: data.model,
                output_length: responseText.length
            });
            
            messages.push({
                role: 'assistant',
                content: responseText,
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
            
            // Update execution tree with response data
            updateExecutionTreeFromResponse({
                prompt: content,
                command_tree: data.command_tree
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
    console.log('[DEBUG] modeToggle click listener attached');
    modeToggle.addEventListener('click', (e) => {
        console.log('[DEBUG] modeToggle CLICKED! event:', e);
        toggleMode();
    });
} else {
    console.log('[DEBUG] modeToggle NOT FOUND');
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
    projectSelect.addEventListener('change', function() {
        // Save current project state before switching
        saveState();
        // Reload state for new project
        loadState();
    });
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

// =============================================================================
// Execution Tree Visualization
// =============================================================================

// Execution tree state
let executionTree = null;
let currentViewMode = 'tree'; // 'tree' or 'trace'

// Initialize execution tree
function initExecutionTree() {
    // Create tree container in trace panel
    const tracePanel = document.getElementById('traceContent');
    if (!tracePanel) return;
    
    // Check if tree container already exists
    let treeContainer = document.getElementById('executionTreeContainer');
    if (!treeContainer) {
        // Create tree toggle buttons
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'tree-toggle';
        toggleDiv.innerHTML = `
            <button class="tree-toggle-btn active" data-view="tree" onclick="switchTreeView('tree')">
                🌳 Tree
            </button>
            <button class="tree-toggle-btn" data-view="trace" onclick="switchTreeView('trace')">
                📋 Log
            </button>
            <button class="tree-clear-btn" onclick="clearExecutionTree()" title="Clear execution tree">
                🗑️ Clear
            </button>
        `;
        
        // Create tree container
        treeContainer = document.createElement('div');
        treeContainer.id = 'executionTreeContainer';
        treeContainer.className = 'execution-tree-container';
        
        // Create tree view
        const treeView = document.createElement('div');
        treeView.id = 'treeView';
        treeView.className = 'tree-view active';
        treeView.innerHTML = `
            <div class="tree-empty">
                <div class="tree-empty-icon">🌳</div>
                <div class="tree-empty-text">No execution tree yet</div>
            </div>
        `;
        
        // Create trace log view - wraps the actual trace content
        const traceLogView = document.createElement('div');
        traceLogView.id = 'traceLogView';
        traceLogView.className = 'trace-log-view';
        
        // The traceContent stays in place but we control its visibility via CSS
        // No need to clone or move - just use the existing element
        const traceContent = document.getElementById('traceContent');
        if (traceContent) {
            traceContent.classList.add('original-trace-content');
        }
        
        treeContainer.appendChild(toggleDiv);
        treeContainer.appendChild(treeView);
        treeContainer.appendChild(traceLogView);
        
        // Insert after the header if it exists, otherwise prepend
        const traceHeader = tracePanel.querySelector('.panel-header') || tracePanel.previousElementSibling;
        if (traceHeader && traceHeader.parentNode) {
            traceHeader.parentNode.insertBefore(treeContainer, traceHeader.nextSibling);
        } else {
            tracePanel.parentNode.insertBefore(treeContainer, tracePanel);
        }
    }
}

// Switch between tree view and trace log view
function switchTreeView(mode) {
    currentViewMode = mode;
    
    // Update toggle buttons
    const buttons = document.querySelectorAll('.tree-toggle-btn');
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === mode);
    });
    
    // Show/hide views
    const treeView = document.getElementById('treeView');
    const traceLogView = document.getElementById('traceLogView');
    const traceContent = document.getElementById('traceContent');
    
    if (mode === 'tree') {
        if (treeView) treeView.classList.add('active');
        if (traceLogView) traceLogView.classList.remove('active');
        // Show original trace content
        if (traceContent) {
            traceContent.style.display = 'block';
        }
    } else {
        // Log view - show the trace content in the log view area
        if (treeView) treeView.classList.remove('active');
        if (traceLogView) traceLogView.classList.add('active');
        // Move trace content to log view for display
        if (traceContent && traceLogView) {
            // Ensure trace is visible
            traceContent.style.display = 'block';
            // Make sure it's in the log view container
            if (!traceLogView.contains(traceContent)) {
                traceLogView.appendChild(traceContent);
            }
        }
    }
}

// Create execution tree from user prompt
function createExecutionTree(prompt) {
    executionTree = {
        rootId: null,
        nodes: {},
        currentPrompt: prompt,
        l0Collapsed: false // L0 starts expanded
    };
    
    // Create root prompt node (L0 = User prompt only)
    const rootNode = {
        id: 'prompt-' + Date.now(),
        type: 'prompt',
        state: 'in_progress',
        prompt: prompt,
        code: null,
        language: null,
        result: null,
        error: null,
        parentId: null,
        children: [],
        level: 0, // L0 = User prompt only
        timestamp: new Date().toISOString(),
        collapsed: false,
        showLLM: false,
        llmResponse: null // Will store the LLM response
    };
    
    executionTree.rootId = rootNode.id;
    executionTree.nodes[rootNode.id] = rootNode;
    
    renderExecutionTree();
    return rootNode;
}

// Add command node to execution tree
// Level scheme: L0 = User prompt (root), L1 = First level commands, L2 = Children of L1, etc.
function addCommandNode(code, language = 'python', parentId = null, customLevel = null) {
    if (!executionTree) return null;
    
    const parent = parentId ? executionTree.nodes[parentId] : 
        Object.values(executionTree.nodes).find(n => n.type === 'prompt');
    
    if (!parent) return null;
    
    // Level scheme: 
    // - Root (prompt) is L0
    // - First level children (commands from LLM) are L1
    // - L2+ are children of L1+ nodes
    let nodeLevel;
    if (customLevel !== null) {
        // Use provided level (but ensure commands are at least L1)
        nodeLevel = Math.max(customLevel, 1);
    } else if (parent.type === 'prompt') {
        // Direct children of prompt are L1
        nodeLevel = 1;
    } else {
        // Children of commands are one level deeper than parent
        nodeLevel = parent.level + 1;
    }
    
    const node = {
        id: 'cmd-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        type: 'command',
        state: 'in_progress',
        prompt: null,
        code: code,
        language: language,
        result: null,
        error: null,
        parentId: parent.id,
        children: [],
        level: nodeLevel,
        timestamp: new Date().toISOString(),
        collapsed: false,
        showLLM: false,
        llmResponse: null // Store LLM response for this command
    };
    
    executionTree.nodes[node.id] = node;
    parent.children.push(node.id);
    
    // Force immediate re-render for real-time updates
    renderExecutionTree();
    return node;
}

// Mark node as complete
function markNodeComplete(nodeId, result = null) {
    if (!executionTree || !executionTree.nodes[nodeId]) return;
    
    const node = executionTree.nodes[nodeId];
    node.state = 'complete';
    if (result) {
        node.result = result;
    }
    
    renderExecutionTree();
}

// Mark node as error
function markNodeError(nodeId, error) {
    if (!executionTree || !executionTree.nodes[nodeId]) return;
    
    const node = executionTree.nodes[nodeId];
    node.state = 'error';
    node.error = error;
    
    // Add error child node
    const errorNode = {
        id: 'error-' + Date.now(),
        type: 'error',
        state: 'error',
        prompt: null,
        code: null,
        language: null,
        result: null,
        error: error,
        parentId: node.id,
        children: [],
        level: node.level + 1,
        timestamp: new Date().toISOString(),
        collapsed: false,
        showLLM: false
    };
    
    executionTree.nodes[errorNode.id] = errorNode;
    node.children.push(errorNode.id);
    
    renderExecutionTree();
}

// Render execution tree
function renderExecutionTree() {
    const treeView = document.getElementById('treeView');
    if (!treeView || !executionTree) return;
    
    const rootNode = executionTree.nodes[executionTree.rootId];
    if (!rootNode) {
        treeView.innerHTML = `
            <div class="tree-empty">
                <div class="tree-empty-icon">🌳</div>
                <div class="tree-empty-text">No execution tree yet</div>
            </div>
        `;
        return;
    }
    
    // Render the tree
    treeView.innerHTML = renderTreeNode(rootNode, executionTree);
}

// Force immediate re-render of execution tree (for real-time updates)
function forceRenderExecutionTree() {
    const treeView = document.getElementById('treeView');
    if (!treeView) return;
    
    // Force DOM reflow to ensure visual update
    treeView.style.display = 'none';
    treeView.offsetHeight; // Force reflow
    treeView.style.display = 'block';
    
    // Re-render the tree
    renderExecutionTree();
}

// Get level badge class based on node level - neutral styling (indentation shows level)
function getLevelBadgeClass(level) {
    // Return neutral class - indentation and L# label show the level, not color
    return 'level-neutral';
}

// Render a single tree node recursively
function renderTreeNode(node, tree) {
    const stateClass = node.state;
    const typeIcon = getNodeIcon(node.type);
    const statusLabel = getStatusLabel(node.state);
    const label = getNodeLabel(node);
    const preview = getNodePreview(node);
    
    // Get level from node (default to 0 if not set)
    const nodeLevel = node.level !== undefined ? node.level : 0;
    const levelBadgeClass = getLevelBadgeClass(nodeLevel);
    
    // Build expandable details content
    const detailsContent = renderNodeDetails(node);
    
    // Determine if this node should collapse children based on level
    // L0 collapses all, L1+ collapse their own children
    const isL0 = nodeLevel === 0;
    
    // For L0, use a global collapsed state; for L1+, use per-node state
    let isExpanded = true;
    if (isL0) {
        isExpanded = !tree.l0Collapsed;
    } else {
        isExpanded = !node.collapsed;
    }
    
    // Add LLM prompt/response button for root prompt node
    const llmButton = node.type === 'prompt' ? 
        `<button class="tree-llm-btn" onclick="event.stopPropagation(); toggleLLMPrompt('${node.id}')" title="View LLM Prompt/Response">🤖 LLM</button>` 
        : '';
    
    let html = `
        <div class="tree-node" data-node-id="${node.id}" data-level="${nodeLevel}">
            <div class="tree-node-content ${stateClass}" onclick="toggleTreeNode('${node.id}', ${nodeLevel})">
                <div class="tree-node-expand">${node.children && node.children.length > 0 ? (isExpanded ? '▼' : '▶') : '•'}</div>
                <div class="tree-node-icon ${node.type}">${typeIcon}</div>
                <div class="tree-node-level ${levelBadgeClass}">L${nodeLevel}</div>
                <div class="tree-node-info">
                    <div class="tree-node-label">${escapeHtml(label)}</div>
                    <div class="tree-node-preview">${escapeHtml(preview)}</div>
                </div>
                ${llmButton}
                <span class="tree-node-status ${stateClass}">${statusLabel}</span>
            </div>
            <div class="tree-node-details">
                ${detailsContent}
            </div>
    `;
    
    // Render children - only show if expanded
    if (node.children && node.children.length > 0 && isExpanded) {
        html += '<div class="tree-children">';
        node.children.forEach(childId => {
            const childNode = tree.nodes[childId];
            if (childNode) {
                html += renderTreeNode(childNode, tree);
            }
        });
        html += '</div>';
    }
    
    html += '</div>';
    return html;
}

// Render expandable details for a node
function renderNodeDetails(node) {
    let html = '';
    
    // LLM section for root prompt node (when LLM button is clicked)
    if (node.type === 'prompt' && node.showLLM) {
        html += renderLLMDetails(node);
    }
    
    // Code section (truncated in preview, full in expanded)
    if (node.code) {
        const codePreview = node.code.split('\n').slice(0, 3).join('\n');
        const codeFull = node.code;
        const isTruncated = node.code.split('\n').length > 3;
        
        html += `
            <div class="tree-detail-section">
                <div class="tree-detail-label">Code:</div>
                <div class="tree-detail-code-preview">${escapeHtml(codePreview)}${isTruncated ? '\n...' : ''}</div>
                ${isTruncated ? `<div class="tree-detail-code-full">${escapeHtml(codeFull)}</div>` : ''}
            </div>
        `;
    }
    
    // Result section
    if (node.result) {
        const resultPreview = node.result.split('\n').slice(0, 5).join('\n');
        const resultFull = node.result;
        const isTruncated = node.result.split('\n').length > 5;
        
        html += `
            <div class="tree-detail-section">
                <div class="tree-detail-label">Result:</div>
                <div class="tree-detail-result-preview">${escapeHtml(resultPreview)}${isTruncated ? '\n... (' + node.result.split('\n').length + ' lines total)' : ''}</div>
                ${isTruncated ? `<div class="tree-detail-result-full">${escapeHtml(resultFull)}</div>` : ''}
            </div>
        `;
    }
    
    // Error section
    if (node.error) {
        const errorPreview = node.error.split('\n').slice(0, 3).join('\n');
        const errorFull = node.error;
        const isTruncated = node.error.split('\n').length > 3;
        
        html += `
            <div class="tree-detail-section tree-detail-error">
                <div class="tree-detail-label">Error:</div>
                <div class="tree-detail-error-preview">${escapeHtml(errorPreview)}${isTruncated ? '\n...' : ''}</div>
                ${isTruncated ? `<div class="tree-detail-error-full">${escapeHtml(errorFull)}</div>` : ''}
            </div>
        `;
    }
    
    // Prompt section for root node (always show, not just when LLM clicked)
    if (node.type === 'prompt' && node.prompt) {
        const promptPreview = node.prompt.split('\n').slice(0, 2).join('\n');
        const promptFull = node.prompt;
        const isTruncated = node.prompt.split('\n').length > 2;
        
        html += `
            <div class="tree-detail-section">
                <div class="tree-detail-label">Prompt:</div>
                <div class="tree-detail-prompt-preview">${escapeHtml(promptPreview)}${isTruncated ? '\n...' : ''}</div>
                ${isTruncated ? `<div class="tree-detail-prompt-full">${escapeHtml(promptFull)}</div>` : ''}
            </div>
        `;
    }
    
    return html || '<div class="tree-detail-empty">No details</div>';
}

// Get icon for node type
function getNodeIcon(type) {
    switch (type) {
        case 'prompt': return '?';
        case 'command': return '>';
        case 'error': return '!';
        case 'fix': return '+';
        default: return '•';
    }
}

// Get status label
function getStatusLabel(state) {
    switch (state) {
        case 'incomplete': return 'Pending';
        case 'in_progress': return 'Running';
        case 'complete': return 'Done';
        case 'error': return 'Failed';
        default: return state;
    }
}

// Get node label
function getNodeLabel(node) {
    switch (node.type) {
        case 'prompt': return 'User Prompt';
        case 'command': 
            return `Command (${node.language || 'code'})`;
        case 'error': return 'Error';
        case 'fix': return 'Fix Attempt';
        default: return 'Node';
    }
}

// Get node preview text
function getNodePreview(node) {
    if (node.prompt) {
        return node.prompt.substring(0, 50) + (node.prompt.length > 50 ? '...' : '');
    }
    if (node.code) {
        const firstLine = node.code.split('\n')[0];
        return firstLine.substring(0, 40) + (firstLine.length > 40 ? '...' : '');
    }
    if (node.error) {
        return node.error.substring(0, 40) + (node.error.length > 40 ? '...' : '');
    }
    return '';
}

// Render tooltip content
function renderTooltipContent(node) {
    let html = `<div class="tree-tooltip-title">${getNodeLabel(node)}</div>`;
    
    if (node.code) {
        html += `<div class="tree-tooltip-code">${escapeHtml(node.code)}</div>`;
    }
    
    if (node.result) {
        const resultPreview = node.result.substring(0, 200);
        html += `<div class="tree-tooltip-result">Result: ${escapeHtml(resultPreview)}${node.result.length > 200 ? '...' : ''}</div>`;
    }
    
    if (node.error) {
        const errorPreview = node.error.substring(0, 200);
        html += `<div class="tree-tooltip-error">${escapeHtml(errorPreview)}${node.error.length > 200 ? '...' : ''}</div>`;
    }
    
    return html;
}

// Toggle tree node expansion - handles collapsible by level
// L0 (root) toggles all children (global collapse/expand)
// L1+ nodes collapse ALL their descendants when clicked
function toggleTreeNode(nodeId, nodeLevel) {
    if (!executionTree) return;
    
    const node = executionTree.nodes[nodeId];
    if (!node) return;
    
    // L0 (root) toggles all children (global collapse/expand)
    if (nodeLevel === 0) {
        // Toggle global L0 collapsed state
        executionTree.l0Collapsed = !executionTree.l0Collapsed;
    } else {
        // L1+ nodes: collapse/expand ALL descendants
        // When collapsed = true, hide ALL children and grandchildren
        // When collapsed = false, show all children
        const newCollapsedState = !node.collapsed;
        node.collapsed = newCollapsedState;
        
        // Recursively set collapsed state for all descendants
        function setDescendantsCollapsed(parentNode, collapsed) {
            if (parentNode.children && parentNode.children.length > 0) {
                parentNode.children.forEach(childId => {
                    const child = executionTree.nodes[childId];
                    if (child) {
                        child.collapsed = collapsed;
                        setDescendantsCollapsed(child, collapsed);
                    }
                });
            }
        }
        
        // Apply to all descendants
        setDescendantsCollapsed(node, newCollapsedState);
    }
    
    renderExecutionTree();
}

// Toggle LLM prompt/response view
function toggleLLMPrompt(nodeId) {
    if (!executionTree) return;
    
    const node = executionTree.nodes[nodeId];
    if (!node) return;
    
    // Toggle LLM view mode
    node.showLLM = !node.showLLM;
    
    // Re-render to show/hide LLM details
    renderExecutionTree();
}

// Get additional details for LLM prompt/response
function renderLLMDetails(node) {
    if (!node.showLLM || node.type !== 'prompt') return '';
    
    // Build LLM input/output display
    let html = `
        <div class="tree-detail-section tree-llm-section">
            <div class="tree-detail-label">🤖 LLM Prompt:</div>
            <div class="tree-llm-content">${escapeHtml(node.prompt || 'N/A')}</div>
        </div>
    `;
    
    // If we have LLM response stored, show it
    if (node.llmResponse) {
        html += `
            <div class="tree-detail-section tree-llm-section">
                <div class="tree-detail-label">📤 LLM Response:</div>
                <div class="tree-llm-content">${escapeHtml(node.llmResponse)}</div>
            </div>
        `;
    }
    
    return html;
}

// Update execution tree from looper response
// This is called when the looper finishes and returns the final response
function updateExecutionTreeFromResponse(response) {
    if (!response || !response.command_tree) return;
    
    // If we don't have a tree yet, create one from prompt
    if (!executionTree && response.prompt) {
        createExecutionTree(response.prompt);
    }
    
    if (!executionTree) return;
    
    // Update root node to complete and store LLM response
    const rootNode = executionTree.nodes[executionTree.rootId];
    if (rootNode) {
        rootNode.state = 'complete';
        // Store the full LLM response from the response
        if (response.response) {
            rootNode.llmResponse = response.response;
        }
    }
    
    // Add command nodes from response
    // Level scheme: L0 = prompt, L1 = first level commands, L2 = children of L1
    response.command_tree.forEach(cmd => {
        const existingNode = Object.values(executionTree.nodes).find(
            n => n.code && n.code.substring(0, 50) === (cmd.code || '').substring(0, 50)
        );
        
        // Get level from command tree node
        // Commands from LLM are at level 1 (L1)
        // Children of commands are at level 2+ (L2, L3, etc.)
        let cmdLevel = 1; // Default to L1 for first level commands
        if (cmd.level !== undefined) {
            // Ensure commands are at least L1
            cmdLevel = Math.max(cmd.level, 1);
        }
        
        if (existingNode) {
            // Update existing node
            if (cmd.success) {
                markNodeComplete(existingNode.id, cmd.result);
            } else {
                markNodeError(existingNode.id, cmd.error || 'Unknown error');
            }
        } else {
            // Create new node with the specified level
            // Parent is at level cmdLevel - 1
            const parentNode = findNodeAtLevel(executionTree.rootId, cmdLevel - 1);
            const newNode = addCommandNode(cmd.code, cmd.language, parentNode ? parentNode.id : executionTree.rootId, cmdLevel);
            if (newNode) {
                if (cmd.success) {
                    markNodeComplete(newNode.id, cmd.result);
                } else {
                    markNodeError(newNode.id, cmd.error || 'Unknown error');
                }
            }
        }
    });
    
    // Force immediate re-render
    renderExecutionTree();
}

// Clear execution tree - removes all nodes and resets state
function clearExecutionTree() {
    console.log('[DEBUG] clearExecutionTree called!');
    // Clear all nodes from the tree
    executionTree = null;
    
    // Update the tree view to show empty state
    const treeView = document.getElementById('treeView');
    if (treeView) {
        treeView.innerHTML = `
            <div class="tree-empty">
                <div class="tree-empty-icon">🌳</div>
                <div class="tree-empty-text">No execution tree yet</div>
            </div>
        `;
    }
    
    // Clear any stored tree state from localStorage
    const treeStateKey = getProjectStorageKey('executionTree');
    localStorage.removeItem(treeStateKey);
    
    // Add trace entry for clarity
    addTrace('terminal', 'Execution Tree', 'Tree cleared');
}

// Update execution tree from real-time trace entries
// This is called on each SSE message for real-time updates
function updateExecutionTreeFromTrace(entry) {
    if (!executionTree) {
        // Create a new execution tree if none exists
        const prompt = entry.data?.prompt || 'Execution';
        createExecutionTree(prompt);
    }
    
    if (!executionTree) return;
    
    // Process different trace entry types to update tree
    const entryType = entry.type;
    const entryLabel = entry.label;
    const entryData = entry.data;
    
    // Get level from trace entry if available (default to 1 for commands)
    const entryLevel = entryData?.level !== undefined ? Math.max(entryData.level, 1) : 1;
    
    // Handle LLM Response - capture and store it
    if (entryType === 'output' && entryLabel === 'LLM Response') {
        // Store the LLM response in the root prompt node
        const rootNode = executionTree.nodes[executionTree.rootId];
        if (rootNode) {
            // Get full response from data if available, otherwise use preview
            const fullResponse = entryData?.response || entryData?.preview || 'No response';
            rootNode.llmResponse = fullResponse;
        }
    }
    
    if (entryType === 'process' && entryData?.code) {
        // New command being executed
        const existingNode = Object.values(executionTree.nodes).find(
            n => n.code && n.code.substring(0, 50) === (entryData.code || '').substring(0, 50)
        );
        
        if (!existingNode) {
            // Create new command node with level from trace entry (ensure at least L1)
            const language = entryData.language || 'python';
            const nodeLevel = Math.max(entryLevel, 1);
            const parentNode = findNodeAtLevel(executionTree.rootId, nodeLevel - 1);
            addCommandNode(entryData.code, language, parentNode ? parentNode.id : executionTree.rootId, nodeLevel);
        }
    }
    
    if (entryType === 'output' && entryData?.result) {
        // Command completed with result
        // Try to find the node at the matching level
        const targetNode = findNodeAtLevel(executionTree.rootId, entryLevel);
        if (targetNode && targetNode.children.length > 0) {
            // Get the last command node (most recent)
            const lastChildId = targetNode.children[targetNode.children.length - 1];
            const lastChild = executionTree.nodes[lastChildId];
            if (lastChild && lastChild.state === 'in_progress') {
                markNodeComplete(lastChildId, entryData.result);
            }
        } else {
            // Fallback to root's last child
            const rootNode = executionTree.nodes[executionTree.rootId];
            if (rootNode && rootNode.children.length > 0) {
                const lastChildId = rootNode.children[rootNode.children.length - 1];
                const lastChild = executionTree.nodes[lastChildId];
                if (lastChild && lastChild.state === 'in_progress') {
                    markNodeComplete(lastChildId, entryData.result);
                }
            }
        }
    }
    
    if (entryType === 'error' && entryData?.error) {
        // Command failed with error
        const targetNode = findNodeAtLevel(executionTree.rootId, entryLevel);
        if (targetNode && targetNode.children.length > 0) {
            const lastChildId = targetNode.children[targetNode.children.length - 1];
            const lastChild = executionTree.nodes[lastChildId];
            if (lastChild && lastChild.state === 'in_progress') {
                markNodeError(lastChildId, entryData.error);
            }
        } else {
            // Fallback to root's last child
            const rootNode = executionTree.nodes[executionTree.rootId];
            if (rootNode && rootNode.children.length > 0) {
                const lastChildId = rootNode.children[rootNode.children.length - 1];
                const lastChild = executionTree.nodes[lastChildId];
                if (lastChild && lastChild.state === 'in_progress') {
                    markNodeError(lastChildId, entryData.error);
                }
            }
        }
    }
    
    // Force immediate re-render for real-time updates
    renderExecutionTree();
    
    // Also force DOM update by triggering a reflow
    const treeView = document.getElementById('treeView');
    if (treeView) {
        // Use requestAnimationFrame for smooth real-time updates
        requestAnimationFrame(() => {
            treeView.dispatchEvent(new Event('tree-updated'));
        });
    }
}

// Find a node at a specific level in the tree
function findNodeAtLevel(rootId, targetLevel) {
    if (!executionTree) return null;
    
    const root = executionTree.nodes[rootId];
    if (!root) return null;
    
    // If target is 0, return root
    if (targetLevel === 0) return root;
    
    // Find children at the target level
    const findAtLevel = (node, level) => {
        if (level === targetLevel) return node;
        if (!node.children || node.children.length === 0) return null;
        
        for (const childId of node.children) {
            const child = executionTree.nodes[childId];
            if (child) {
                const result = findAtLevel(child, level + 1);
                if (result) return result;
            }
        }
        return null;
    };
    
    return findAtLevel(root, 0);
}

// Make functions globally available
window.switchTreeView = switchTreeView;
window.toggleTreeNode = toggleTreeNode;
window.toggleLLMPrompt = toggleLLMPrompt;
window.clearExecutionTree = clearExecutionTree;

// =============================================================================
// Resizable Chat Panel
// =============================================================================

// Initialize resizable panel
function initResizablePanel() {
    const appContainer = document.querySelector('.app-container');
    const tracePanel = document.querySelector('.trace-panel');
    const mainContent = document.querySelector('.main-content');
    
    if (!appContainer || !tracePanel || !mainContent) return;
    
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.title = 'Drag to resize';
    
    // Insert between main content and trace panel
    appContainer.insertBefore(resizeHandle, tracePanel);
    
    // Load saved width from localStorage AND from API (requirements.md)
    async function loadTraceWidth() {
        const projectSelect = document.getElementById('headerProject');
        const projectId = projectSelect ? projectSelect.value : 'none';
        
        // First try API (requirements.md)
        if (projectId && projectId !== 'none') {
            try {
                const response = await fetch(`/api/projects/${projectId}/settings`);
                const data = await response.json();
                if (data.settings && data.settings.trace_panel_width) {
                    const width = data.settings.trace_panel_width;
                    console.log('[DEBUG] initResizablePanel: Loaded width from API:', width);
                    if (width > 200 && width < 800) {
                        tracePanel.style.width = width + 'px';
                        document.documentElement.style.setProperty('--trace-width', width + 'px');
                        return;
                    }
                }
            } catch (e) {
                console.log('[DEBUG] initResizablePanel: Failed to load width from API:', e);
            }
        }
        
        // Fall back to localStorage
        const savedWidth = localStorage.getItem('tracePanelWidth');
        if (savedWidth) {
            const width = parseInt(savedWidth, 10);
            if (width > 200 && width < 800) {
                tracePanel.style.width = width + 'px';
                document.documentElement.style.setProperty('--trace-width', width + 'px');
            }
        }
    }
    loadTraceWidth();
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = tracePanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        resizeHandle.classList.add('active');
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const delta = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(800, startWidth + delta));
        
        tracePanel.style.width = newWidth + 'px';
        document.documentElement.style.setProperty('--trace-width', newWidth + 'px');
    });
    
    document.addEventListener('mouseup', async () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizeHandle.classList.remove('active');
            
            const newWidth = tracePanel.offsetWidth;
            
            // Save width to localStorage
            localStorage.setItem('tracePanelWidth', newWidth);
            
            // Also save to requirements.md via API
            const projectSelect = document.getElementById('headerProject');
            const projectId = projectSelect ? projectSelect.value : 'none';
            if (projectId && projectId !== 'none') {
                try {
                    await fetch(`/api/projects/${projectId}/settings`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trace_panel_width: newWidth })
                    });
                    console.log('[DEBUG] mouseup: Saved width to API:', newWidth);
                } catch (e) {
                    console.log('[DEBUG] mouseup: Failed to save width to API:', e);
                }
            }
        }
    });
}

// Initialize execution tree on load
document.addEventListener('DOMContentLoaded', function() {
    initExecutionTree();
    initResizablePanel();
});

// =============================================================================
// End Execution Tree Visualization
// =============================================================================

// Load state on page load (includes loading projects, mode, messages, and trace entries)
loadState();

// Focus input on load
messageInput.focus();
