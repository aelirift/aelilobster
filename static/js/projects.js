// Projects management
const projectNameInput = document.getElementById('projectName');
const createProjectBtn = document.getElementById('createProjectBtn');
const createStatus = document.getElementById('createStatus');
const projectsList = document.getElementById('projectsList');
const statusMessage = document.getElementById('statusMessage');
const projectSettingsPanel = document.getElementById('projectSettingsPanel');
const noProjectSelected = document.getElementById('noProjectSelected');
const contextSettingsContainer = document.getElementById('contextSettingsContainer');
const settingsProjectName = document.getElementById('settingsProjectName');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

const CURRENT_USER = 'test_user';
let editingProjectId = null;
let currentProjectSettings = {};
let allContextFiles = [];
let allFileTypes = [];

// Load projects from server on page load
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to load projects');
        
        const projects = await response.json();
        renderProjects(projects);
    } catch (error) {
        showStatus('Failed to load projects: ' + error.message, 'error');
    }
}

// Render projects list
function renderProjects(projects) {
    if (projects.length === 0) {
        projectsList.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <p style="margin-top: 16px;">No projects yet</p>
                <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">Create a new project above to get started</p>
            </div>
        `;
        return;
    }
    
    projectsList.innerHTML = projects.map(project => `
        <div class="project-card" data-id="${project.id}">
            <div class="project-header">
                <div class="project-info">
                    <span class="project-name">${escapeHtml(project.name)}</span>
                    <span class="project-user">${escapeHtml(project.user)}</span>
                </div>
                <div class="project-actions">
                    <button class="project-action-btn use-btn" onclick="openProject('${project.id}')" title="Open project">
                        Open
                    </button>
                    <button class="project-action-btn settings-btn" onclick="showProjectSettings('${project.id}', '${escapeHtml(project.name)}')" title="Settings">
                        ⚙️
                    </button>
                    <button class="project-action-btn run-btn" onclick="runInPod('${project.id}')" title="Run in Pod">
                        Run
                    </button>
                    <button class="project-action-btn delete-btn" onclick="deleteProject('${project.id}')" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="project-path">${escapeHtml(project.path)}</div>
        </div>
    `).join('');
}

// Create new project
async function createProject() {
    const name = projectNameInput.value.trim();
    
    if (!name) {
        showCreateStatus('Please enter a project name', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, user: CURRENT_USER })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to create project');
        }
        
        showCreateStatus('Project created successfully', 'success');
        projectNameInput.value = '';
        loadProjects();
    } catch (error) {
        showCreateStatus(error.message, 'error');
    }
}

// Delete project
async function deleteProject(id) {
    if (!confirm('Are you sure you want to delete this project? This will also delete the project folder.')) return;
    
    try {
        const response = await fetch(`/api/projects/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete project');
        
        showStatus('Project deleted', 'success');
        loadProjects();
    } catch (error) {
        showStatus('Failed to delete project: ' + error.message, 'error');
    }
}

// Open project - redirect to chat with project context
function openProject(id) {
    localStorage.setItem('selectedProject', id);
    window.location.href = '/?project=' + id;
}

// Run code in pod
async function runInPod(projectId) {
    const code = prompt('Enter the code to run in the pod:');
    if (!code) return;
    
    showStatus('Running code in pod...', 'success');
    
    try {
        const response = await fetch('/api/run-pod-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                project_id: projectId, 
                code: code 
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to run in pod');
        }
        
        const result = await response.json();
        alert('Pod execution result:\n\n' + result.output);
        showStatus('Code executed successfully', 'success');
    } catch (error) {
        showStatus('Failed to run in pod: ' + error.message, 'error');
    }
}

// Show create status message
function showCreateStatus(message, type) {
    createStatus.textContent = message;
    createStatus.className = 'config-status ' + type;
    createStatus.style.display = 'block';
    
    setTimeout(() => {
        createStatus.style.display = 'none';
    }, 3000);
}

// Show status message
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'config-status ' + type;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 3000);
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load context files and types
async function loadContextData() {
    try {
        const [filesRes, typesRes] = await Promise.all([
            fetch('/api/context-files'),
            fetch('/api/file-types')
        ]);
        allContextFiles = await filesRes.json();
        allFileTypes = await typesRes.json();
    } catch (error) {
        console.error('Failed to load context data:', error);
    }
}

// Show project settings panel
async function showProjectSettings(projectId, projectName) {
    editingProjectId = projectId;
    settingsProjectName.value = projectName;
    projectSettingsPanel.style.display = 'block';
    noProjectSelected.style.display = 'none';
    
    // Load project context settings or defaults
    try {
        const response = await fetch(`/api/projects/${projectId}/context-settings`);
        currentProjectSettings = await response.json();
    } catch (error) {
        currentProjectSettings = {};
    }
    
    renderContextSettings();
}

// Render context file dropdowns
function renderContextSettings() {
    // Filter out non-context types (like 'pod')
    const contextTypes = allFileTypes.filter(t => t !== 'pod');
    
    contextSettingsContainer.innerHTML = contextTypes.map(type => {
        const filesOfType = allContextFiles.filter(f => f.type === type);
        const currentValue = currentProjectSettings[type] || '';
        
        // Get default for this type
        const defaultFile = filesOfType.find(f => f.is_default);
        const defaultName = defaultFile ? defaultFile.name : '';
        
        return `
            <div class="form-group">
                <label>${type} ${defaultName ? `(default: ${defaultName})` : ''}</label>
                <select id="context_${type}" data-type="${type}">
                    <option value="">-- Default (${defaultName || 'none'}) --</option>
                    ${filesOfType.map(f => `
                        <option value="${f.name}" ${f.name === currentValue ? 'selected' : ''}>
                            ${escapeHtml(f.name)} ${f.is_default ? '(Default)' : ''}
                        </option>
                    `).join('')}
                </select>
            </div>
        `;
    }).join('');
}

// Save project context settings
async function saveProjectSettings() {
    if (!editingProjectId) return;
    
    // Gather settings from dropdowns
    const contextTypes = allFileTypes.filter(t => t !== 'pod');
    const settings = {};
    
    contextTypes.forEach(type => {
        const select = document.getElementById(`context_${type}`);
        if (select && select.value) {
            settings[type] = select.value;
        }
    });
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/context-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (!response.ok) throw new Error('Failed to save settings');
        
        showStatus('Settings saved successfully', 'success');
    } catch (error) {
        showStatus('Failed to save settings: ' + error.message, 'error');
    }
}

// Pods functionality
const showPodsBtn = document.getElementById('showPodsBtn');
const podsContainer = document.getElementById('podsContainer');

// Show pods for the selected project
async function showProjectPods() {
    if (!editingProjectId) {
        podsContainer.innerHTML = '<p style="color: var(--text-secondary);">Select a project first</p>';
        return;
    }
    
    podsContainer.innerHTML = '<p style="color: var(--text-secondary);">Loading pods...</p>';
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/pods`);
        const data = await response.json();
        
        if (!data.pods || data.pods.length === 0) {
            podsContainer.innerHTML = `
                <p style="color: var(--text-secondary);">No pods found for this project.</p>
                <button class="save-button" onclick="startProjectPod()" style="width: 100%; margin-top: 8px;">Start Pod</button>
            `;
            return;
        }
        
        podsContainer.innerHTML = data.pods.map(pod => `
            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${escapeHtml(pod.name)}</strong>
                        <span style="font-size: 12px; color: ${pod.status.includes('Up') ? 'green' : 'orange'};">
                            ${escapeHtml(pod.status)}
                        </span>
                    </div>
                    <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #dc3545;" 
                        onclick="killProjectPod('${escapeHtml(pod.name)}')">
                        Stop
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        podsContainer.innerHTML = '<p style="color: red;">Failed to load pods: ' + error.message + '</p>';
    }
}

// Start a pod for the project
async function startProjectPod() {
    if (!editingProjectId) return;
    
    podsContainer.innerHTML = '<p style="color: var(--text-secondary);">Starting pod...</p>';
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/pods/start`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            podsContainer.innerHTML = '<p style="color: green;">' + data.message + '</p>';
            // Refresh pods after a delay
            setTimeout(showProjectPods, 1000);
        } else {
            podsContainer.innerHTML = '<p style="color: red;">' + data.message + '</p>';
        }
    } catch (error) {
        podsContainer.innerHTML = '<p style="color: red;">Failed to start pod: ' + error.message + '</p>';
    }
}

// Kill a pod
async function killProjectPod(podName) {
    if (!editingProjectId || !confirm('Stop this pod?')) return;
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/pods/kill`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showProjectPods();
        } else {
            alert('Failed to stop pod: ' + data.message);
        }
    } catch (error) {
        alert('Failed to stop pod: ' + error.message);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Event listeners
createProjectBtn.addEventListener('click', createProject);
projectNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createProject();
});
saveSettingsBtn.addEventListener('click', saveProjectSettings);
showPodsBtn.addEventListener('click', showProjectPods);

// Initialize
loadProjects();
loadContextData();
