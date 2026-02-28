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
const dynamicContentContainer = document.getElementById('dynamicContentContainer');

const CURRENT_USER = 'test_user';
let editingProjectId = null;
let currentProjectSettings = {};
let allContextFiles = [];
let allFileTypes = [];
let allProjects = [];

// Load projects from server on page load
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) throw new Error('Failed to load projects');
        
        const projects = await response.json();
        allProjects = projects;
        renderProjects(projects);
        populateProjectSelector(projects);
        
        // If only one project, auto-select it
        if (projects.length === 1) {
            const projectSelect = document.getElementById('headerProject');
            if (projectSelect) {
                projectSelect.value = projects[0].id;
                selectProject(projects[0].id);
            }
        }
    } catch (error) {
        showStatus('Failed to load projects: ' + error.message, 'error');
    }
}

// Populate project selector dropdown (deprecated - kept for compatibility)
function populateProjectSelector(projects) {
    // No longer used - projects shown directly in list
}

// Handle project selector change
function handleProjectSelectorChange() {
    const projectSelect = document.getElementById('headerProject');
    if (!projectSelect) return;
    
    const projectId = projectSelect.value;
    if (projectId) {
        localStorage.setItem('selectedProject', projectId);
        selectProject(projectId);
    }
}

// Select a project (click on card or dropdown)
function selectProject(projectId) {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    // Show project settings
    showProjectSettings(projectId, project.name);
    
    // Update header selector if exists
    const projectSelect = document.getElementById('headerProject');
    if (projectSelect) {
        projectSelect.value = projectId;
    }
    
    // Save to localStorage
    localStorage.setItem('selectedProject', projectId);
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
                <div class="project-info" onclick="selectProject('${project.id}')" style="cursor: pointer; flex: 1;">
                    <span class="project-name">${escapeHtml(project.name)}</span>
                    <span class="project-user">${escapeHtml(project.user)}</span>
                </div>
                <div class="project-actions">
                    <button class="project-action-btn settings-btn" onclick="event.stopPropagation(); showProjectSettings('${project.id}', '${escapeHtml(project.name)}')" title="Settings">
                        ⚙️
                    </button>
                    <button class="project-action-btn pods-btn" onclick="event.stopPropagation(); showProjectPodsPanel('${project.id}')" title="Pods">
                        📦
                    </button>
                    <button class="project-action-btn secrets-btn" onclick="event.stopPropagation(); showProjectSecretsPanel('${project.id}', '${escapeHtml(project.name)}')" title="Secrets">
                        🔐
                    </button>
                    <button class="project-action-btn delete-btn" onclick="event.stopPropagation(); deleteProject('${project.id}')" title="Delete">
                        🗑️
                    </button>
                </div>
            </div>
            <div class="project-path" onclick="selectProject('${project.id}')" style="cursor: pointer;">${escapeHtml(project.path)}</div>
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
    
    // Render context file dropdowns
    renderContextSettings();
    
    // Clear dynamic content
    dynamicContentContainer.innerHTML = '';
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
                    <div style="display: flex; gap: 4px;">
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #28a745;" 
                            onclick="startProjectPodByName('${escapeHtml(pod.name)}')">
                            Start
                        </button>
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #dc3545;" 
                            onclick="killProjectPodByName('${escapeHtml(pod.name)}')">
                            Stop
                        </button>
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #fd7e14;" 
                            onclick="resetProjectPodByName('${escapeHtml(pod.name)}')">
                            Reset
                        </button>
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #6c757d;" 
                            onclick="removeProjectPodByName('${escapeHtml(pod.name)}')">
                            Remove
                        </button>
                    </div>
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

// Kill a pod (using project id)
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

// Kill a pod by name
async function killProjectPodByName(podName) {
    if (!confirm('Stop pod ' + podName + '?')) return;
    
    try {
        const response = await fetch(`/api/pods/${encodeURIComponent(podName)}/kill`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            // Refresh pods panel if it's showing
            if (editingProjectId) {
                showProjectPodsPanel(editingProjectId);
            }
        } else {
            alert('Failed to stop pod: ' + data.message);
        }
    } catch (error) {
        alert('Failed to stop pod: ' + error.message);
    }
}

// Remove (delete) a pod by name
async function removeProjectPodByName(podName) {
    if (!confirm('Remove pod ' + podName + ' permanently?')) return;
    
    try {
        const response = await fetch(`/api/pods/${encodeURIComponent(podName)}/remove`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            // Refresh pods panel if it's showing
            if (editingProjectId) {
                showProjectPodsPanel(editingProjectId);
            }
        } else {
            alert('Failed to remove pod: ' + data.message);
        }
    } catch (error) {
        alert('Failed to remove pod: ' + error.message);
    }
}

// Start a pod by name
async function startProjectPodByName(podName) {
    if (!confirm('Start pod ' + podName + '?')) return;
    
    try {
        const response = await fetch(`/api/pods/${encodeURIComponent(podName)}/start`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            // Refresh pods panel if it's showing
            if (editingProjectId) {
                showProjectPodsPanel(editingProjectId);
            }
        } else {
            alert('Failed to start pod: ' + data.message);
        }
    } catch (error) {
        alert('Failed to start pod: ' + error.message);
    }
}

// Reset a pod by name (remove and recreate with fresh requirements)
async function resetProjectPodByName(podName) {
    if (!confirm('Reset pod ' + podName + '? This will remove the existing pod and create a new one with fresh requirements.')) return;
    
    try {
        const response = await fetch(`/api/pods/${encodeURIComponent(podName)}/reset`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            // Show requirements info if any
            let message = 'Pod reset successfully!';
            if (data.requirements && data.requirements.requirements_installed) {
                message += '\n\nRequirements installed: ' + data.requirements.requirements_count;
            } else if (data.requirements && data.requirements.message) {
                message += '\n\n' + data.requirements.message;
            }
            alert(message);
            
            // Refresh pods panel if it's showing
            if (editingProjectId) {
                showProjectPodsPanel(editingProjectId);
            }
        } else {
            alert('Failed to reset pod: ' + data.message);
        }
    } catch (error) {
        alert('Failed to reset pod: ' + error.message);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global pods functionality
const showPodsBtnGlobal = document.getElementById('showPodsBtnGlobal');
const globalPodsContainer = document.getElementById('globalPodsContainer');

// Show pods for selected project (global button)
async function showGlobalPods() {
    const projectSelect = document.getElementById('headerProject');
    const projectId = projectSelect ? projectSelect.value : null;
    
    if (!projectId) {
        globalPodsContainer.innerHTML = '<p style="color: var(--text-secondary);">Select a project first</p>';
        return;
    }
    
    globalPodsContainer.innerHTML = '<p style="color: var(--text-secondary);">Loading pods...</p>';
    
    try {
        const response = await fetch(`/api/projects/${projectId}/pods`);
        const data = await response.json();
        
        if (!data.pods || data.pods.length === 0) {
            globalPodsContainer.innerHTML = `
                <p style="color: var(--text-secondary);">No pods found.</p>
                <button class="save-button" onclick="startGlobalPod('${projectId}')" style="width: 100%; margin-top: 8px;">Start Pod</button>
            `;
            return;
        }
        
        globalPodsContainer.innerHTML = data.pods.map(pod => `
            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${escapeHtml(pod.name)}</strong>
                        <span style="font-size: 12px; color: ${pod.status.includes('Up') ? 'green' : 'orange'};">
                            ${escapeHtml(pod.status)}
                        </span>
                    </div>
                    <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #dc3545;" 
                        onclick="killGlobalPod('${projectId}')">
                        Stop
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        globalPodsContainer.innerHTML = '<p style="color: red;">Failed to load pods: ' + error.message + '</p>';
    }
}

async function startGlobalPod(projectId) {
    globalPodsContainer.innerHTML = '<p style="color: var(--text-secondary);">Starting pod...</p>';
    
    try {
        const response = await fetch(`/api/projects/${projectId}/pods/start`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            globalPodsContainer.innerHTML = '<p style="color: green;">' + data.message + '</p>';
            setTimeout(showGlobalPods, 1000);
        } else {
            globalPodsContainer.innerHTML = '<p style="color: red;">' + data.message + '</p>';
        }
    } catch (error) {
        globalPodsContainer.innerHTML = '<p style="color: red;">Failed: ' + error.message + '</p>';
    }
}

async function killGlobalPod(projectId) {
    if (!confirm('Stop this pod?')) return;
    
    try {
        const response = await fetch(`/api/projects/${projectId}/pods/kill`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            showGlobalPods();
        } else {
            alert('Failed: ' + data.message);
        }
    } catch (error) {
        alert('Failed: ' + error.message);
    }
}

// Show pods panel in dynamic content container
async function showProjectPodsPanel(projectId) {
    editingProjectId = projectId;
    projectSettingsPanel.style.display = 'block';
    noProjectSelected.style.display = 'none';
    
    dynamicContentContainer.innerHTML = '<p style="color: var(--text-secondary);">Loading pods...</p>';
    
    try {
        const response = await fetch(`/api/projects/${projectId}/pods`);
        const data = await response.json();
        
        if (!data.pods || data.pods.length === 0) {
            dynamicContentContainer.innerHTML = `
                <h4>Pods</h4>
                <p style="color: var(--text-secondary);">No pods found for this project.</p>
                <button class="save-button" onclick="startProjectPodByNameFromPanel('${projectId}')" style="width: 100%;">Start Pod</button>
            `;
            return;
        }
        
        dynamicContentContainer.innerHTML = '<h4>Pods</h4>' + data.pods.map(pod => `
            <div style="padding: 12px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong>${escapeHtml(pod.name)}</strong>
                        <span style="font-size: 12px; color: ${pod.status.includes('Up') ? 'green' : 'orange'};">
                            ${escapeHtml(pod.status)}
                        </span>
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #28a745;" 
                            onclick="startProjectPodByName('${escapeHtml(pod.name)}')">
                            Start
                        </button>
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #dc3545;" 
                            onclick="killProjectPodByName('${escapeHtml(pod.name)}')">
                            Stop
                        </button>
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #fd7e14;" 
                            onclick="resetProjectPodByName('${escapeHtml(pod.name)}')">
                            Reset
                        </button>
                        <button class="save-button" style="padding: 4px 12px; font-size: 12px; background: #6c757d;" 
                            onclick="removeProjectPodByName('${escapeHtml(pod.name)}')">
                            Remove
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        dynamicContentContainer.innerHTML = '<p style="color: red;">Failed to load pods: ' + error.message + '</p>';
    }
}

// Show context files in dynamic content container
async function showProjectContextFiles(projectId) {
    editingProjectId = projectId;
    projectSettingsPanel.style.display = 'block';
    noProjectSelected.style.display = 'none';
    
    dynamicContentContainer.innerHTML = '<p style="color: var(--text-secondary);">Loading context files...</p>';
    
    try {
        const response = await fetch(`/api/projects/${projectId}/context-settings`);
        const data = await response.json();
        
        // Build context files UI
        let html = '<h4>Context Files</h4>';
        
        if (allFileTypes && allFileTypes.length > 0) {
            allFileTypes.forEach(fileType => {
                if (fileType === 'pod') return; // Skip pod type
                const currentValue = data[fileType] || '';
                html += `
                    <div class="form-group" style="margin-bottom: 12px;">
                        <label>${fileType}</label>
                        <select id="context_${fileType}" class="form-select">
                            <option value="">None</option>
                        </select>
                    </div>
                `;
            });
            html += '<button class="save-button" onclick="saveDynamicContextSettings()" style="width: 100%;">Save Context Settings</button>';
        }
        
        dynamicContentContainer.innerHTML = html;
        
        // Load available context files and populate dropdowns
        const contextResponse = await fetch('/api/context-files');
        const contextFiles = await contextResponse.json();
        
        allFileTypes.forEach(fileType => {
            if (fileType === 'pod') return;
            const select = document.getElementById(`context_${fileType}`);
            if (select) {
                const filesForType = contextFiles.filter(f => f.type === fileType);
                filesForType.forEach(file => {
                    const option = document.createElement('option');
                    option.value = file.name;
                    option.textContent = file.name;
                    if (data[fileType] === file.name) {
                        option.selected = true;
                    }
                    select.appendChild(option);
                });
            }
        });
        
    } catch (error) {
        dynamicContentContainer.innerHTML = '<p style="color: red;">Failed to load context files: ' + error.message + '</p>';
    }
}

// Save context settings from dynamic content panel
async function saveDynamicContextSettings() {
    if (!editingProjectId) return;
    
    const settings = {};
    allFileTypes.forEach(fileType => {
        if (fileType === 'pod') return;
        const select = document.getElementById(`context_${fileType}`);
        if (select && select.value) {
            settings[fileType] = select.value;
        }
    });
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/context-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            dynamicContentContainer.innerHTML = '<p style="color: green;">Settings saved!</p>';
            setTimeout(() => showProjectContextFiles(editingProjectId), 1000);
        } else {
            dynamicContentContainer.innerHTML = '<p style="color: red;">Failed to save settings</p>';
        }
    } catch (error) {
        dynamicContentContainer.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
    }
}

// Start pod from panel
async function startProjectPodByNameFromPanel(projectId) {
    dynamicContentContainer.innerHTML = '<p style="color: var(--text-secondary);">Starting pod...</p>';
    
    try {
        const response = await fetch(`/api/projects/${projectId}/pods/start`, { method: 'POST' });
        const data = await response.json();
        
        if (data.success) {
            // Refresh pods panel immediately
            showProjectPodsPanel(projectId);
        } else {
            dynamicContentContainer.innerHTML = '<p style="color: red;">' + data.message + '</p>';
        }
    } catch (error) {
        dynamicContentContainer.innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
    }
}

// =============================================================================
// Project Secrets Functions
// =============================================================================

// Show secrets panel in dynamic content container
async function showProjectSecretsPanel(projectId, projectName) {
    editingProjectId = projectId;
    projectSettingsPanel.style.display = 'block';
    noProjectSelected.style.display = 'none';
    
    // Show secrets in dynamic content container
    dynamicContentContainer.innerHTML = `
        <div style="padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0;">Secrets - ${escapeHtml(projectName)}</h3>
                <button class="btn-small" onclick="showAddSecretForm()" style="background: #28a745;">+ Add Secret</button>
            </div>
            <div id="secretsListInPanel">
                <!-- Secrets will be loaded here -->
            </div>
        </div>
    `;
    
    // Load secrets into the panel
    await loadSecretsForPanel(projectId);
}

// Load secrets into the panel container
async function loadSecretsForPanel(projectId) {
    const container = document.getElementById('secretsListInPanel');
    if (!container) return;
    
    try {
        const response = await fetch(`/api/projects/${projectId}/secrets`);
        const data = await response.json();
        
        if (data.success && data.secrets && data.secrets.length > 0) {
            let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            data.secrets.forEach(secret => {
                const tagsHtml = secret.tags && secret.tags.length > 0 
                    ? secret.tags.map(t => `<span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 4px;">${escapeHtml(t)}</span>`).join('')
                    : '';
                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); padding: 8px 12px; border-radius: 6px;">
                        <div>
                            <strong>${escapeHtml(secret.name)}</strong>
                            ${tagsHtml}
                        </div>
                        <div>
                            <button class="btn-small" onclick="editSecretFromPanel('${secret.id}')" style="background: #ffc107; color: #000; margin-right: 4px;">Edit</button>
                            <button class="btn-small" onclick="deleteSecretFromPanel('${secret.id}')" style="background: #dc3545;">Delete</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="color: var(--text-secondary);">No secrets yet. Click "Add Secret" to create one.</p>';
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Error loading secrets: ' + error.message + '</p>';
    }
}

// Show add secret form in panel
function showAddSecretForm() {
    const container = document.getElementById('secretsListInPanel');
    container.innerHTML = `
        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
            <h4 style="margin: 0 0 12px 0;">Add New Secret</h4>
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="secretNamePanel" placeholder="e.g., SSH_KEY, API_TOKEN">
            </div>
            <div class="form-group">
                <label>Value</label>
                <input type="password" id="secretValuePanel" placeholder="Secret value (will be encrypted)">
            </div>
            <div class="form-group">
                <label>Tags (comma-separated)</label>
                <input type="text" id="secretTagsPanel" placeholder="e.g., ssh, production, server1">
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="save-button" onclick="saveSecretFromPanel()">Create</button>
                <button class="btn-small" onclick="loadSecretsForPanel(editingProjectId)" style="background: #6c757d;">Cancel</button>
            </div>
        </div>
    `;
}

// Save secret from panel
async function saveSecretFromPanel() {
    const name = document.getElementById('secretNamePanel').value.trim();
    const value = document.getElementById('secretValuePanel').value;
    const tagsStr = document.getElementById('secretTagsPanel').value.trim();
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
    
    if (!name || !value) {
        alert('Secret name and value are required');
        return;
    }
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/secrets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, value, tags })
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadSecretsForPanel(editingProjectId);
        } else {
            alert('Error: ' + (data.error || 'Failed to save secret'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Edit secret from panel
async function editSecretFromPanel(secretId) {
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/secrets`);
        const data = await response.json();
        
        if (data.success && data.secrets) {
            const secret = data.secrets.find(s => s.id === secretId);
            if (secret) {
                const container = document.getElementById('secretsListInPanel');
                container.innerHTML = `
                    <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
                        <h4 style="margin: 0 0 12px 0;">Edit Secret</h4>
                        <div class="form-group">
                            <label>Name</label>
                            <input type="text" id="secretNamePanel" value="${escapeHtml(secret.name)}">
                        </div>
                        <div class="form-group">
                            <label>New Value (leave empty to keep current)</label>
                            <input type="password" id="secretValuePanel" placeholder="New secret value">
                        </div>
                        <div class="form-group">
                            <label>Tags (comma-separated)</label>
                            <input type="text" id="secretTagsPanel" value="${escapeHtml(secret.tags.join(', '))}">
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="save-button" onclick="updateSecretFromPanel('${secretId}')">Update</button>
                            <button class="btn-small" onclick="loadSecretsForPanel(editingProjectId)" style="background: #6c757d;">Cancel</button>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        alert('Error loading secret: ' + error.message);
    }
}

// Update secret from panel
async function updateSecretFromPanel(secretId) {
    const name = document.getElementById('secretNamePanel').value.trim();
    const value = document.getElementById('secretValuePanel').value;
    const tagsStr = document.getElementById('secretTagsPanel').value.trim();
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
    
    if (!name) {
        alert('Secret name is required');
        return;
    }
    
    try {
        const updateData = { name };
        if (value) updateData.value = value;
        if (tags.length > 0) updateData.tags = tags;
        
        const response = await fetch(`/api/projects/${editingProjectId}/secrets/${secretId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updateData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadSecretsForPanel(editingProjectId);
        } else {
            alert('Error: ' + (data.error || 'Failed to update secret'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Delete secret from panel
async function deleteSecretFromPanel(secretId) {
    if (!confirm('Are you sure you want to delete this secret? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/secrets/${secretId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadSecretsForPanel(editingProjectId);
        } else {
            alert('Error: ' + (data.error || 'Failed to delete secret'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Load and display secrets for current project (for settings panel)
async function loadProjectSecrets(projectId) {
    const container = document.getElementById('secretsListContainer');
    if (!container) return;
    
    if (!projectId) {
        container.innerHTML = '<p style="color: var(--text-secondary);">No project selected</p>';
        return;
    }
    
    try {
        const response = await fetch(`/api/projects/${projectId}/secrets`);
        const data = await response.json();
        
        if (data.success && data.secrets && data.secrets.length > 0) {
            let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
            data.secrets.forEach(secret => {
                const tagsHtml = secret.tags && secret.tags.length > 0 
                    ? secret.tags.map(t => `<span style="background: #e9ecef; padding: 2px 6px; border-radius: 4px; font-size: 11px; margin-left: 4px;">${escapeHtml(t)}</span>`).join('')
                    : '';
                html += `
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-secondary); padding: 8px 12px; border-radius: 6px;">
                        <div>
                            <strong>${escapeHtml(secret.name)}</strong>
                            ${tagsHtml}
                        </div>
                        <div>
                            <button class="btn-small" onclick="editSecret('${secret.id}')" style="background: #ffc107; color: #000; margin-right: 4px;">Edit</button>
                            <button class="btn-small" onclick="deleteSecret('${secret.id}')" style="background: #dc3545;">Delete</button>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            container.innerHTML = html;
        } else {
            container.innerHTML = '<p style="color: var(--text-secondary);">No secrets yet. Click "Add Secret" to create one.</p>';
        }
    } catch (error) {
        container.innerHTML = '<p style="color: red;">Error loading secrets: ' + error.message + '</p>';
    }
}

// Show add/edit secret modal
function showSecretModal(secretId = null, secretName = '', secretValue = '', secretTags = '') {
    const container = document.getElementById('secretsListContainer');
    const isEdit = secretId !== null;
    
    container.innerHTML = `
        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-top: 8px;">
            <h4 style="margin: 0 0 12px 0;">${isEdit ? 'Edit Secret' : 'Add New Secret'}</h4>
            <div class="form-group">
                <label>Name</label>
                <input type="text" id="secretName" placeholder="e.g., SSH_KEY, API_TOKEN" value="${escapeHtml(secretName)}">
            </div>
            <div class="form-group">
                <label>Value</label>
                <input type="password" id="secretValue" placeholder="Secret value (will be encrypted)" value="${escapeHtml(secretValue)}">
            </div>
            <div class="form-group">
                <label>Tags (comma-separated)</label>
                <input type="text" id="secretTags" placeholder="e.g., ssh, production, server1" value="${escapeHtml(secretTags)}">
            </div>
            <div style="display: flex; gap: 8px;">
                <button class="save-button" onclick="saveSecret('${secretId || ''}')">${isEdit ? 'Update' : 'Create'}</button>
                <button class="btn-small" onclick="loadProjectSecrets(editingProjectId)" style="background: #6c757d;">Cancel</button>
            </div>
        </div>
    `;
}

// Save secret (create or update)
async function saveSecret(secretId) {
    const name = document.getElementById('secretName').value.trim();
    const value = document.getElementById('secretValue').value;
    const tagsStr = document.getElementById('secretTags').value.trim();
    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(t => t) : [];
    
    if (!name) {
        alert('Secret name is required');
        return;
    }
    
    // Don't require value on edit if not changing
    const isEdit = secretId !== '';
    if (!isEdit && !value) {
        alert('Secret value is required');
        return;
    }
    
    try {
        let response;
        if (isEdit) {
            // Update - only include value if changed
            const updateData = { name };
            if (value) updateData.value = value;
            if (tags.length > 0) updateData.tags = tags;
            
            response = await fetch(`/api/projects/${editingProjectId}/secrets/${secretId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });
        } else {
            // Create
            response = await fetch(`/api/projects/${editingProjectId}/secrets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, value, tags })
            });
        }
        
        const data = await response.json();
        
        if (data.success) {
            loadProjectSecrets(editingProjectId);
        } else {
            alert('Error: ' + (data.error || 'Failed to save secret'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Edit secret - load values
async function editSecret(secretId) {
    // Get the secret list first to find the name and tags
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/secrets`);
        const data = await response.json();
        
        if (data.success && data.secrets) {
            const secret = data.secrets.find(s => s.id === secretId);
            if (secret) {
                showSecretModal(secretId, secret.name, '', secret.tags.join(', '));
            }
        }
    } catch (error) {
        alert('Error loading secret: ' + error.message);
    }
}

// Delete secret
async function deleteSecret(secretId) {
    if (!confirm('Are you sure you want to delete this secret? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/projects/${editingProjectId}/secrets/${secretId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            loadProjectSecrets(editingProjectId);
        } else {
            alert('Error: ' + (data.error || 'Failed to delete secret'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Show secrets button handler
document.getElementById('showSecretsBtn')?.addEventListener('click', () => {
    if (editingProjectId) {
        loadProjectSecrets(editingProjectId);
    } else {
        alert('Please select a project first');
    }
});

// Event listeners
createProjectBtn.addEventListener('click', createProject);
projectNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createProject();
});
saveSettingsBtn.addEventListener('click', saveProjectSettings);

// Project selector event listener
const projectSelect = document.getElementById('headerProject');
if (projectSelect) {
    projectSelect.addEventListener('change', handleProjectSelectorChange);
}

// Initialize
loadProjects();
loadContextData();
