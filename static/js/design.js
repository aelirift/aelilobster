// Design Page JavaScript
// Single LLM call with pre-llm context - no loops

let messages = [];
let projectId = null;
let userId = 'test_user';
let promptId = null;  // Unique ID for this conversation
let preLLMContext = "";

// For stopping requests
let currentController = null;
let isProcessing = false;

// Tree nodes cache
let treeNodes = {};

// Trace entries for design page
let designTraceEntries = [];

// Tree poll interval
let treePollInterval = null;

// Load design chat history from localStorage
function loadDesignChatHistory() {
    const saved = localStorage.getItem('design_chat_history');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            messages = data.messages || [];
            promptId = data.promptId || null;
            // Restore expand state
            if (data.expandState) {
                Object.assign(treeExpandState, data.expandState);
            }
            console.log('[Design] Loaded chat history:', messages.length, 'messages');
        } catch (e) {
            console.error('[Design] Failed to load chat history:', e);
        }
    }
}

// Save design chat history to localStorage
function saveDesignChatHistory() {
    const data = {
        messages: messages,
        promptId: promptId,
        expandState: treeExpandState
    };
    localStorage.setItem('design_chat_history', JSON.stringify(data));
}

// Clear design chat history from localStorage
function clearDesignChatHistory() {
    localStorage.removeItem('design_chat_history');
}

function getProjectStorageKey(baseKey) {
    const projectSelect = document.getElementById('headerProject');
    const proj = projectSelect ? projectSelect.value : 'default';
    return `${proj}_${baseKey}`;
}

// Add trace entry for design page
function addDesignTrace(type, label, data) {
    const entry = {
        type,
        label,
        data,
        timestamp: new Date().toISOString()
    };
    designTraceEntries.push(entry);
    renderDesignTraceEntry(entry);
}

function renderDesignTraceEntry(entry) {
    const traceContent = document.getElementById('traceContent');
    
    // Remove empty state if present
    const emptyState = traceContent.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const entryDiv = document.createElement('div');
    entryDiv.className = `trace-entry trace-${entry.type}`;
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'trace-entry-header';
    headerDiv.innerHTML = `<span class="trace-type">${entry.type}</span> <span class="trace-label">${entry.label}</span>`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'trace-entry-content';
    
    // Format data based on type
    if (typeof entry.data === 'object') {
        contentDiv.innerHTML = `<pre>${escapeHtml(JSON.stringify(entry.data, null, 2))}</pre>`;
    } else {
        contentDiv.innerHTML = `<pre>${escapeHtml(String(entry.data))}</pre>`;
    }
    
    entryDiv.appendChild(headerDiv);
    entryDiv.appendChild(contentDiv);
    traceContent.appendChild(entryDiv);
    
    // Scroll to bottom
    traceContent.scrollTop = traceContent.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Design Tree Functions
// ============================================================================

// Generate a new prompt ID for this conversation
function generatePromptId() {
    return 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Create a node in the database
async function createTreeNode(level, content, description, nodeState = 'incomplete', parentNodeId = null) {
    if (!projectId || !promptId) {
        console.log('[Design] createTreeNode skipped: projectId=', projectId, 'promptId=', promptId);
        return null;
    }
    
    try {
        console.log('[Design] Creating node level', level, 'projectId=', projectId, 'userId=', userId, 'promptId=', promptId);
        const response = await fetch('/api/design-tree/nodes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                project_id: projectId,
                user_id: userId,
                prompt_id: promptId,
                level: level,
                content: content,
                description: description,
                node_state: nodeState,
                parent_node_id: parentNodeId
            })
        });
        const data = await response.json();
        console.log('[Design] Created node level', level, ':', data.node ? data.node.node_id : 'error', data);
        return data.node;
    } catch (e) {
        console.error('[Design] Failed to create node:', e);
        return null;
    }
}

// Update a node in the database
async function updateTreeNode(nodeId, content = null, description = null, nodeState = null) {
    try {
        const response = await fetch(`/api/design-tree/nodes/${nodeId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                node_id: nodeId,
                content: content,
                description: description,
                node_state: nodeState
            })
        });
        const data = await response.json();
        return data.node;
    } catch (e) {
        console.error('[Design] Failed to update node:', e);
        return null;
    }
}

// Fetch tree from database
async function fetchTreeFromDB() {
    if (!projectId || !promptId) return [];
    
    try {
        const response = await fetch(`/api/design-tree/${projectId}/${userId}/${promptId}`);
        const data = await response.json();
        return data.nodes || [];
    } catch (e) {
        console.error('[Design] Failed to fetch tree:', e);
        return [];
    }
}

// Start polling tree from DB every second
function startTreePoll() {
    console.log('[Design] startTreePoll called, projectId:', projectId, 'promptId:', promptId);
    if (treePollInterval) {
        console.log('[Design] Clearing existing poll interval');
        clearInterval(treePollInterval);
    }
    
    treePollInterval = setInterval(async () => {
        console.log('[Design] Poll tick, projectId:', projectId, 'promptId:', promptId);
        if (!projectId || !promptId) {
            console.log('[Design] Poll skipped: missing projectId or promptId');
            return;
        }
        
        const nodes = await fetchTreeFromDB();
        console.log('[Design] Tree poll:', projectId, userId, promptId, '-> nodes:', nodes.length);
        if (nodes.length > 0) {
            renderTreeView(nodes);
        }
    }, 1000);
}

// Stop polling
function stopTreePoll() {
    if (treePollInterval) {
        clearInterval(treePollInterval);
        treePollInterval = null;
    }
}

// Stop the current request
function stopDesignRequest() {
    if (currentController) {
        currentController.abort();
        currentController = null;
        console.log('[Design] Request aborted');
    }
    
    // Stop polling
    stopTreePoll();
    
    // Reset UI
    isProcessing = false;
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const stopButton = document.getElementById('stopButton');
    
    if (messageInput) messageInput.disabled = false;
    if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = 'Design';
    }
    if (stopButton) stopButton.style.display = 'none';
    messageInput.focus();
    
    // Add cancelled message
    messages.push({ role: 'assistant', content: 'Request cancelled by user.' });
    renderMessages();
    addDesignTrace('error', 'Cancelled', 'Request was cancelled by user');
}

// Render tree view
function renderTreeView(nodes) {
    const treeContainer = document.getElementById('treeContainer');
    if (!treeContainer) {
        console.log('[Design] renderTreeView: treeContainer not found');
        return;
    }
    
    console.log('[Design] renderTreeView called with', nodes.length, 'nodes');
    
    // Build tree structure
    const nodeMap = {};
    nodes.forEach(node => {
        nodeMap[node.node_id] = { ...node, children: [] };
    });
    
    let rootNodes = [];
    nodes.forEach(node => {
        if (node.parent_node_id && nodeMap[node.parent_node_id]) {
            nodeMap[node.parent_node_id].children.push(nodeMap[node.node_id]);
        } else {
            rootNodes.push(nodeMap[node.node_id]);
        }
    });
    
    console.log('[Design] renderTreeView: rootNodes =', rootNodes.length);
    
    // Render
    treeContainer.innerHTML = '';
    rootNodes.forEach(root => {
        treeContainer.appendChild(renderTreeNode(root, 0));
    });
    
    console.log('[Design] renderTreeView: rendered', rootNodes.length, 'root nodes');
}

// Store expand state globally to persist across re-renders
const treeExpandState = {};

// Render a single tree node
function renderTreeNode(node, depth) {
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'tree-node';
    // Barely indented - just 2px per level
    nodeDiv.style.marginLeft = (depth * 2) + 'px';

    // State color
    const stateColors = {
        'incomplete': '#666',
        'in_progress': '#f0ad4e',
        'complete': '#5cb85c',
        'error': '#d9534f'
    };
    const stateColor = stateColors[node.node_state] || '#666';

    // Level labels
    const levelLabels = {
        0: 'User Prompt',
        1: 'Pre-LLM Context',
        2: 'LLM Input',
        3: 'LLM Response'
    };

    // Check if content is expandable (>100 chars)
    const isExpandable = node.content && node.content.length > 100;

    // Get stored expand state (persist across re-renders)
    const expandKey = node.node_id;
    if (!(expandKey in treeExpandState)) {
        treeExpandState[expandKey] = false; // Default collapsed
    }
    const isExpanded = treeExpandState[expandKey];

    const headerDiv = document.createElement('div');
    headerDiv.className = 'tree-node-header';
    headerDiv.style.cursor = 'pointer';

    // Single toggle arrow - shows expanded state
    const toggleIcon = isExpanded ? '▼' : '▶';

    headerDiv.innerHTML = `
        <span class="tree-expand-toggle">${toggleIcon}</span>
        <span class="tree-level-badge" style="background:${stateColor}">L${node.level}</span>
        <span class="tree-label">${levelLabels[node.level] || 'Node ' + node.level}</span>
        <span class="tree-state">${node.node_state}</span>
        <button class="tree-copy-btn" title="Copy content" style="margin-left: auto; padding: 2px 6px; font-size: 10px; cursor: pointer;">Copy</button>
    `;

    // Copy button functionality
    const copyBtn = headerDiv.querySelector('.tree-copy-btn');
    copyBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const content = node.content || '';
        navigator.clipboard.writeText(content).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    });

    const contentDiv = document.createElement('div');
    contentDiv.className = 'tree-node-content';
    // Auto-height and larger font - no fixed height/overflow that blocks content
    contentDiv.style.overflow = 'visible';
    contentDiv.style.minHeight = '0';
    contentDiv.style.maxHeight = 'none';
    contentDiv.style.height = 'auto';
    contentDiv.style.whiteSpace = 'pre-wrap';
    contentDiv.style.wordBreak = 'break-word';
    contentDiv.style.fontSize = '14px';
    contentDiv.style.lineHeight = '1.4';
    contentDiv.style.marginTop = '4px';

    function updateContent() {
        let displayContent;
        if (isExpandable && !isExpanded) {
            displayContent = node.content.substring(0, 100) + '...';
        } else {
            displayContent = node.content || '(empty)';
        }
        contentDiv.innerHTML = `<pre style="margin: 0; white-space: pre-wrap; word-break: break-word; font-family: inherit; background: transparent;">${escapeHtml(displayContent)}</pre>`;
    }
    updateContent();

    // Click handler for expand/collapse - toggles and STAYS expanded
    headerDiv.addEventListener('click', function(e) {
        // Toggle the state
        treeExpandState[expandKey] = !treeExpandState[expandKey];
        const nowExpanded = treeExpandState[expandKey];

        // Update content
        updateContent();

        // Update toggle icon
        headerDiv.querySelector('.tree-expand-toggle').textContent = nowExpanded ? '▼' : '▶';
    });

    nodeDiv.appendChild(headerDiv);
    nodeDiv.appendChild(contentDiv);

    // Render children (always visible, tree structure is the hierarchy)
    if (node.children && node.children.length > 0) {
        const childrenDiv = document.createElement('div');
        childrenDiv.className = 'tree-children';

        node.children.forEach(child => {
            childrenDiv.appendChild(renderTreeNode(child, depth + 1));
        });

        nodeDiv.appendChild(childrenDiv);
    }

    return nodeDiv;
}

// ============================================================================
// Pre-LLM Context Functions
// ============================================================================

// Load pre-LLM context
async function loadPreLLMContext() {
    const projectSelect = document.getElementById('headerProject');
    const project = projectSelect ? projectSelect.value : null;
    
    try {
        const response = await fetch(`/api/design/pre-llm-context?project_id=${project || ''}`);
        const data = await response.json();
        preLLMContext = data.pre_llm_context || "";
        console.log('[Design] Loaded pre-LLM context:', preLLMContext.substring(0, 100) + '...');
    } catch (e) {
        console.error('[Design] Failed to load pre-LLM context:', e);
        preLLMContext = "";
    }
}

// Send message to LLM
async function sendDesignMessage() {
    // First check if project is selected
    if (!checkProjectSelected()) return;
    
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const stopButton = document.getElementById('stopButton');
    const prompt = messageInput.value.trim();
    
    if (!prompt) return;
    
    // Set up abort controller
    currentController = new AbortController();
    isProcessing = true;
    
    // Save project selection
    const projectSelect = document.getElementById('headerProject');
    projectId = projectSelect.value;
    localStorage.setItem('design_selected_project', projectId);
    
    // Generate new prompt ID for new conversation (if not already set)
    const isNewConversation = !promptId;
    if (isNewConversation) {
        promptId = generatePromptId();
        console.log('[Design] New prompt ID:', promptId);
    }
    
    // Always start polling tree from DB when sending a message
    console.log('[Design] Starting tree poll, promptId:', promptId);
    startTreePoll();
    
    // Auto-switch to tree view when sending a message (every time)
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle && viewToggle.value !== 'tree') {
        viewToggle.value = 'tree';
        viewToggle.dispatchEvent(new Event('change'));
        console.log('[Design] Auto-switched to tree view');
    }
    
    // Disable input while processing, show stop button
    messageInput.disabled = true;
    sendButton.disabled = true;
    sendButton.textContent = 'Processing...';
    stopButton.style.display = 'inline-block';
    
    // Get project and model
    const project = projectId;
    const modelSelect = document.getElementById('model');
    const model = modelSelect ? modelSelect.value : 'MiniMax-M2.5';
    
    // === CREATE LEVEL 0 NODE (User Prompt) ===
    const level0Node = await createTreeNode(0, prompt, 'user_prompt', 'complete');
    
    // Add user message to chat
    messages.push({ role: 'user', content: prompt });
    renderMessages();
    messageInput.value = '';
    
    // Add to trace - User Prompt
    addDesignTrace('input', 'User Prompt', prompt);
    
    // Load pre-LLM context if not loaded
    if (!preLLMContext) {
        await loadPreLLMContext();
    }
    
    // === CREATE LEVEL 1 NODE (Pre-LLM Context) ===
    const level1Node = await createTreeNode(1, preLLMContext || '', 'pre_llm_context', 'complete', level0Node.node_id);
    
    // Add to trace - Pre-LLM Context
    addDesignTrace('context', 'Pre-LLM Context', preLLMContext || "(No context file)");
    
    // Prepare full input for LLM
    const fullLLMInput = (preLLMContext ? preLLMContext + '\n\n' : '') + 'User: ' + prompt;
    
    // === CREATE LEVEL 2 NODE (LLM Input) - start in_progress ===
    const level2Node = await createTreeNode(2, fullLLMInput, 'input_to_llm', 'in_progress', level1Node.node_id);
    
    try {
        const response = await fetch('/api/design', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: currentController ? currentController.signal : null,
            body: JSON.stringify({
                prompt: prompt,
                model: model,
                project_id: project,
                messages: messages.slice(0, -1) // Exclude the just-added user message
            })
        });
        
        const data = await response.json();
        
        if (data.trace) {
            // Get the actual LLM request (full messages) for consistent display
            const actualLLMInput = JSON.stringify(data.trace.llm_request, null, 2);
            
            // Add to trace - LLM Request
            addDesignTrace('request', 'LLM Request', actualLLMInput);
            
            // === UPDATE LEVEL 2 NODE (LLM Input) with actual LLM request ===
            await updateTreeNode(level2Node.node_id, actualLLMInput, null, 'complete');
            
            // === CREATE LEVEL 3 NODE (LLM Response) ===
            const level3Node = await createTreeNode(3, data.trace.llm_response || '', 'response_from_llm', 'complete', level2Node.node_id);
            
            // Add to trace - LLM Response
            addDesignTrace('output', 'LLM Response', data.trace.llm_response);
        }
        
        // Add assistant response
        messages.push({ role: 'assistant', content: data.output });
        renderMessages();
        
    } catch (e) {
        if (e.name === 'AbortError') {
            console.log('[Design] Request was aborted');
            endDesignRequest();
            return; // Stop function execution
        }
        console.error('[Design] Error:', e);
        messages.push({ role: 'assistant', content: `Error: ${e.message}` });
        renderMessages();
        addDesignTrace('error', 'Error', e.message);
        
        // Mark level 2 as error
        await updateTreeNode(level2Node.node_id, null, null, 'error');
        
        endDesignRequest();
    }
}

// End of design request service - stops polling and enables UI
function endDesignRequest() {
    console.log('[Design] Ending design request, stopping poll');
    
    // Stop polling tree updates
    stopTreePoll();
    
    // Re-enable input
    isProcessing = false;
    currentController = null;
    
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const stopButton = document.getElementById('stopButton');
    
    if (messageInput) messageInput.disabled = false;
    if (sendButton) {
        sendButton.disabled = false;
        sendButton.textContent = 'Design';
    }
    if (stopButton) stopButton.style.display = 'none';
    
    if (messageInput) messageInput.focus();
}

function renderMessages() {
    const messagesContainer = document.getElementById('messages');

    // Clear existing messages
    messagesContainer.innerHTML = '';

    // Remove empty state if present
    const emptyState = messagesContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }

    // Render each message
    messages.forEach(msg => {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${msg.role}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        // Convert markdown-like formatting
        contentDiv.innerHTML = formatMessageContent(msg.content);

        messageDiv.appendChild(contentDiv);
        messagesContainer.appendChild(messageDiv);
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Save chat history to localStorage
    saveDesignChatHistory();
}

function formatMessageContent(content) {
    // Basic formatting - escape HTML first
    let formatted = escapeHtml(content);
    
    // Convert code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Convert inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert bold
    formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Convert newlines to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
}

// Clear chat
async function clearDesignChat() {
    if (confirm('Clear design chat history?')) {
        messages = [];
        renderMessages();

        // Clear trace
        const traceContent = document.getElementById('traceContent');
        traceContent.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p style="font-size: 12px;">Design trace will show:</p>
                <ul style="font-size: 11px; padding-left: 20px; margin-top: 5px;">
                    <li>User Prompt</li>
                    <li>Pre-LLM Context</li>
                    <li>LLM Request</li>
                    <li>LLM Response</li>
                </ul>
            </div>
        `;
        designTraceEntries = [];

        // Clear tree from database
        if (projectId && userId && promptId) {
            try {
                await fetch(`/api/design-tree/${projectId}/${userId}/${promptId}`, {
                    method: 'DELETE'
                });
            } catch (e) {
                console.log('[Design] Failed to clear tree:', e);
            }
        }
        
        // Clear tree display
        const treeContainer = document.getElementById('treeContainer');
        if (treeContainer) {
            treeContainer.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p style="font-size: 12px;">Tree will show:</p>
                    <ul style="font-size: 11px; padding-left: 20px; margin-top: 5px;">
                        <li>Level 0: User Prompt</li>
                        <li>Level 1: Pre-LLM Context</li>
                        <li>Level 2: LLM Input</li>
                        <li>Level 3: LLM Response</li>
                    </ul>
                </div>
            `;
        }

        // Clear localStorage
        clearDesignChatHistory();
    }
}

// New chat
function newDesignChat() {
    // Reset prompt ID and stop polling
    promptId = null;
    stopTreePoll();

    // Clear tree display
    const treeContainer = document.getElementById('treeContainer');
    if (treeContainer) {
        treeContainer.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <p style="font-size: 12px;">Tree will show:</p>
                <ul style="font-size: 11px; padding-left: 20px; margin-top: 5px;">
                    <li>Level 0: User Prompt</li>
                    <li>Level 1: Pre-LLM Context</li>
                    <li>Level 2: LLM Input</li>
                    <li>Level 3: LLM Response</li>
                </ul>
            </div>
        `;
    }

    // Clear messages but NOT from localStorage yet (user might want to go back)
    messages = [];
    renderMessages();

    // Clear trace
    const traceContent = document.getElementById('traceContent');
    traceContent.innerHTML = `
        <div class="empty-state" style="padding: 20px;">
            <p style="font-size: 12px;">Design trace will show:</p>
            <ul style="font-size: 11px; padding-left: 20px; margin-top: 5px;">
                <li>User Prompt</li>
                <li>Pre-LLM Context</li>
                <li>LLM Request</li>
                <li>LLM Response</li>
            </ul>
        </div>
    `;
    designTraceEntries = [];
}

// Load projects
async function loadProjects() {
    try {
        const response = await fetch('/api/projects?user=test_user');
        const data = await response.json();
        
        console.log('[Design] Projects API response:', data);
        
        const projectSelect = document.getElementById('headerProject');
        
        projectSelect.innerHTML = '<option value="">Select Project</option>';
        
        // API returns array directly, not {projects: [...]}
        const projects = Array.isArray(data) ? data : (data.projects || []);
        
        if (projects.length > 0) {
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                projectSelect.appendChild(option);
            });
        } else {
            console.log('[Design] No projects found for user test_user');
        }
        
        // Try to restore saved project selection
        const savedProject = localStorage.getItem('design_selected_project');
        if (savedProject && projectSelect.querySelector(`option[value="${savedProject}"]`)) {
            projectSelect.value = savedProject;
            projectId = savedProject;
            console.log('[Design] Restored project selection:', savedProject);
        }
        
    } catch (e) {
        console.error('[Design] Failed to load projects:', e);
    }
}

// Check if project is selected, if not show alert
function checkProjectSelected() {
    const projectSelect = document.getElementById('headerProject');
    if (!projectSelect.value) {
        alert('Please select a project first!');
        projectSelect.focus();
        return false;
    }
    return true;
}

// Initialize
document.addEventListener('DOMContentLoaded', async function() {
    console.log('[Design] DOM loaded, starting initialization...');

    // Load design chat history from localStorage
    loadDesignChatHistory();

    // Render loaded messages
    if (messages.length > 0) {
        renderMessages();
    }

    // Load projects (this also restores project from localStorage)
    await loadProjects();
    
    // Get current project after restoration
    const projectSelect = document.getElementById('headerProject');
    const currentProject = projectSelect.value;
    console.log('[Design] Current project after restoration:', currentProject || 'NONE (user must select)');
    
    // Update UI to reflect project selection state
    const sendButton = document.getElementById('sendButton');
    const messageInput = document.getElementById('messageInput');
    
    if (!currentProject) {
        sendButton.disabled = true;
        sendButton.title = 'Please select a project first';
        messageInput.placeholder = 'Select a project first...';
    } else {
        sendButton.disabled = false;
        sendButton.title = 'Send to LLM';
        messageInput.placeholder = 'Describe what you want to build...';
    }
    
    // Only load pre-LLM context if a project is selected
    if (currentProject) {
        await loadPreLLMContext();
    } else {
        console.log('[Design] No project selected - waiting for user to select one');
    }
    
    // Set up event listeners (sendButton and messageInput already declared above)
    const clearBtn = document.getElementById('clearChatBtn');
    const newChatBtn = document.getElementById('newChatBtn');
    
    // Send on button click
    sendButton.addEventListener('click', sendDesignMessage);
    
    // Send on Enter ( Shift+Enter for newline)
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendDesignMessage();
        }
    });
    
    // Clear button
    clearBtn.addEventListener('click', clearDesignChat);
    
    // New chat button
    newChatBtn.addEventListener('click', newDesignChat);
    
    // Project change - reload context AND save to localStorage
    projectSelect.addEventListener('change', async function() {
        const newProjectId = this.value;
        console.log('[Design] Project changed to:', newProjectId);

        // Update UI state
        if (!newProjectId) {
            sendButton.disabled = true;
            sendButton.title = 'Please select a project first';
            messageInput.placeholder = 'Select a project first...';
        } else {
            sendButton.disabled = false;
            sendButton.title = 'Send to LLM';
            messageInput.placeholder = 'Describe what you want to build...';
        }

        // Save to localStorage
        if (newProjectId) {
            localStorage.setItem('design_selected_project', newProjectId);
            projectId = newProjectId;
            console.log('[Design] Saved project to localStorage:', newProjectId);
        } else {
            localStorage.removeItem('design_selected_project');
            console.log('[Design] Cleared project from localStorage');
        }

        // Reload pre-LLM context for new project
        await loadPreLLMContext();

        // Reload panel size for new project
        initDesignResizablePanel();
    });
    
    // View toggle (trace vs tree)
    const viewToggle = document.getElementById('viewToggle');
    const traceContent = document.getElementById('traceContent');
    const treeContainer = document.getElementById('treeContainer');
    const panelTitle = document.getElementById('panelTitle');
    
    // Load saved view preference
    const savedView = localStorage.getItem('design_view_mode') || 'trace';
    viewToggle.value = savedView;
    
    function updateView() {
        const view = viewToggle.value;
        if (view === 'tree') {
            traceContent.style.display = 'none';
            treeContainer.style.display = 'block';
            panelTitle.textContent = 'Design Tree';
        } else {
            traceContent.style.display = 'block';
            treeContainer.style.display = 'none';
            panelTitle.textContent = 'Design Trace Log';
        }
        localStorage.setItem('design_view_mode', view);
    }
    
    viewToggle.addEventListener('change', updateView);
    updateView(); // Apply initial view

    // Initialize resize panel - immediately to avoid flash
    console.log('[Design] Calling initDesignResizablePanel');
    initDesignResizablePanel();
    
    // Stop button
    const stopButton = document.getElementById('stopButton');
    stopButton.style.display = 'none'; // Hidden by default
    
    stopButton.addEventListener('click', function() {
        console.log('[Design] Stop clicked');
        // Cancel any in-flight requests
        stopDesignRequest();
    });
    
    console.log('[Design] Initialized');
});

// Initialize resizable panel (for side panel width)
function initDesignResizablePanel() {
    const resizeHandle = document.getElementById('resizeHandle');
    const sidePanel = document.getElementById('sidePanel');
    
    if (!resizeHandle || !sidePanel) return;
    
    // Load saved width - first from localStorage (sync, immediate), then from DB (async)
    function loadPanelWidth() {
        const projectSelect = document.getElementById('headerProject');
        const projectId = projectSelect ? projectSelect.value : null;

        console.log('[Design] Loading panel width, projectId:', projectId);

        // First, immediately apply localStorage (sync - no flash)
        const localWidth = localStorage.getItem('designPanelWidth');
        if (localWidth) {
            const width = parseInt(localWidth, 10);
            if (width > 200 && width < 800) {
                sidePanel.style.width = width + 'px';
                console.log('[Design] Set immediate width from localStorage:', width);
            }
        }

        // Then, try to get from DB (async - may override localStorage if different)
        async function loadFromDB() {
            if (!projectId) return;

            try {
                const response = await fetch(`/api/projects/${projectId}/settings`);
                const data = await response.json();
                console.log('[Design] Settings API response:', data);
                if (data.settings && data.settings.design_page_panel_size) {
                    const width = parseInt(data.settings.design_page_panel_size, 10);
                    console.log('[Design] Loaded panel size from DB:', width);
                    if (width > 200 && width < 800) {
                        sidePanel.style.width = width + 'px';
                    }
                } else {
                    console.log('[Design] No design_page_panel_size in settings');
                }
            } catch (e) {
                console.log('[Design] Failed to load panel size from DB:', e);
            }
        }
        loadFromDB();
    }
    loadPanelWidth();
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidePanel.offsetWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        resizeHandle.classList.add('active');
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const delta = startX - e.clientX;
        const newWidth = Math.max(200, Math.min(800, startWidth + delta));
        
        sidePanel.style.width = newWidth + 'px';
    });
    
    document.addEventListener('mouseup', async () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            resizeHandle.classList.remove('active');
            
            const newWidth = sidePanel.offsetWidth;
            
            // Save to localStorage as fallback
            localStorage.setItem('designPanelWidth', newWidth);
            
            // Save to DB via API
            const projectSelect = document.getElementById('headerProject');
            const projectId = projectSelect ? projectSelect.value : null;
            
            if (projectId) {
                try {
                    const response = await fetch(`/api/projects/${projectId}/settings`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            design_page_panel_size: newWidth.toString()
                        })
                    });
                    const result = await response.json();
                    console.log('[Design] Saved panel size to DB:', newWidth, 'Result:', result);
                } catch (e) {
                    console.log('[Design] Failed to save panel size to DB:', e);
                }
            }
        }
    });
}

// Initialize resize on load (call immediately since DOM is already loaded)
