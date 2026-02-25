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

// Trace logging functions
function addTrace(type, label, data) {
    const entry = document.createElement('div');
    entry.className = 'trace-entry';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString();
    
    let dataHtml = '';
    if (typeof data === 'object') {
        dataHtml = `<div class="trace-data">${escapeHtml(JSON.stringify(data, null, 2))}</div>`;
    } else {
        dataHtml = `<div class="trace-data">${escapeHtml(String(data))}</div>`;
    }
    
    entry.innerHTML = `
        <div class="trace-time">${timeStr}</div>
        <div class="trace-step">
            <div class="trace-icon ${type}">${type === 'input' ? '↓' : type === 'process' ? '⚙' : type === 'output' ? '↑' : '!'}</div>
            <div class="trace-text">${escapeHtml(label)}</div>
        </div>
        ${dataHtml}
    `;
    
    // Remove empty state if present
    const emptyState = traceContent.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    traceContent.appendChild(entry);
    traceContent.scrollTop = traceContent.scrollHeight;
}

function clearTrace() {
    traceContent.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p style="font-size: 12px;">Waiting for input...</p>
        </div>
    `;
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
}

// Save state to localStorage
function saveState() {
    localStorage.setItem('selectedModel', modelSelect.value);
    localStorage.setItem('chatMessages', JSON.stringify(messages));
}

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
            let codeBlocksHtml = msg.code_blocks.map(block => `
                <div class="command-output" style="margin-top: 12px;">
                    <div class="command-header" onclick="toggleCommandOutput(this.parentElement)">
                        <div class="command-title">
                            <span class="exit-code ${block.exit_code === 0 ? 'success' : 'error'}">${block.exit_code}</span>
                            <span>Code: ${block.language}</span>
                        </div>
                        <span class="command-toggle">▼</span>
                    </div>
                    <div class="command-body">${escapeHtml(block.output)}</div>
                </div>
            `).join('');
            
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

// Scroll to bottom of messages
function scrollToBottom() {
    setTimeout(() => {
        requestAnimationFrame(() => {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
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
        
        const response = await fetch('/prompt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: content,
                model: modelSelect.value,
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

// Load state on page load
loadState();

// Focus input on load
messageInput.focus();
