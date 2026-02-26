// Context Files management
const fileNameInput = document.getElementById('fileName');
const fileTypeSelect = document.getElementById('fileType');
const fileContentInput = document.getElementById('fileContent');
const addFileBtn = document.getElementById('addFileBtn');
const filesList = document.getElementById('filesList');
const statusMessage = document.getElementById('statusMessage');

let editingFileId = null;
let fileTypes = [];

// Load file types from server
async function loadFileTypes() {
    try {
        const response = await fetch('/api/file-types');
        if (!response.ok) throw new Error('Failed to load file types');
        
        fileTypes = await response.json();
        renderFileTypeOptions();
    } catch (error) {
        console.error('Failed to load file types:', error);
    }
}

// Render file type options in dropdown
function renderFileTypeOptions() {
    fileTypeSelect.innerHTML = fileTypes.map(type => 
        `<option value="${type}">${type}</option>`
    ).join('');
}

// Load files from server on page load
async function loadFiles() {
    try {
        const response = await fetch('/api/context-files');
        if (!response.ok) throw new Error('Failed to load files');
        
        const files = await response.json();
        renderFiles(files);
    } catch (error) {
        showStatus('Failed to load files: ' + error.message, 'error');
    }
}

// Render files list
function renderFiles(files) {
    if (files.length === 0) {
        filesList.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px;">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p style="margin-top: 16px;">No context files yet</p>
                <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">Add markdown files above to use as AI context</p>
            </div>
        `;
        return;
    }
    
    // Sort by type then name
    files.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
    });
    
    filesList.innerHTML = files.map((file, index) => `
        <div class="context-file" data-id="${file.id}">
            <div class="file-header">
                <div class="file-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                    <span class="file-name">${escapeHtml(file.name)}</span>
                    <span class="file-type-badge">${escapeHtml(file.type)}</span>
                </div>
                <div class="file-actions">
                    <button class="file-action-btn use-btn" onclick="useFile('${file.id}')" title="Use in chat">
                        Use
                    </button>
                    <button class="file-action-btn edit-btn" onclick="editFile('${file.id}')" title="Edit">
                        Edit
                    </button>
                    <button class="file-action-btn delete-btn" onclick="deleteFile('${file.id}')" title="Delete">
                        Delete
                    </button>
                </div>
            </div>
            <div class="file-preview">${escapeHtml(file.content.substring(0, 200))}${file.content.length > 200 ? '...' : ''}</div>
        </div>
    `).join('');
}

// Add new file
async function addFile() {
    const name = fileNameInput.value.trim();
    const type = fileTypeSelect.value;
    const content = fileContentInput.value.trim();
    
    if (!name) {
        showStatus('Please enter a file name', 'error');
        return;
    }
    
    if (!content) {
        showStatus('Please enter file content', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/context-files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, content })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to add file');
        }
        
        showStatus('File added successfully', 'success');
        fileNameInput.value = '';
        fileContentInput.value = '';
        loadFiles();
    } catch (error) {
        showStatus('Failed to add file: ' + error.message, 'error');
    }
}

// Delete file
async function deleteFile(id) {
    if (!confirm('Are you sure you want to delete this file?')) return;
    
    try {
        const response = await fetch(`/api/context-files/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) throw new Error('Failed to delete file');
        
        showStatus('File deleted', 'success');
        loadFiles();
    } catch (error) {
        showStatus('Failed to delete file: ' + error.message, 'error');
    }
}

// Edit file - populate form for editing
function editFile(id) {
    // Fetch all files and find the one to edit
    fetch('/api/context-files')
        .then(res => res.json())
        .then(files => {
            const file = files.find(f => f.id === id);
            if (file) {
                editingFileId = id;
                fileNameInput.value = file.name;
                fileTypeSelect.value = file.type;
                fileContentInput.value = file.content;
                // Change button to update
                addFileBtn.textContent = 'Update File';
                addFileBtn.onclick = updateFile;
                // Scroll to form
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
}

// Update existing file
async function updateFile() {
    if (!editingFileId) return;
    
    const name = fileNameInput.value.trim();
    const type = fileTypeSelect.value;
    const content = fileContentInput.value.trim();
    
    if (!name || !content) {
        showStatus('Please fill in all fields', 'error');
        return;
    }
    
    try {
        const response = await fetch(`/api/context-files/${editingFileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, type, content })
        });
        
        if (!response.ok) throw new Error('Failed to update file');
        
        showStatus('File updated successfully', 'success');
        fileNameInput.value = '';
        fileContentInput.value = '';
        editingFileId = null;
        addFileBtn.textContent = 'Add File';
        addFileBtn.onclick = addFile;
        loadFiles();
    } catch (error) {
        showStatus('Failed to update file: ' + error.message, 'error');
    }
}

// Use file - redirect to chat with context
function useFile(id) {
    // Store the selected file ID to use in chat
    localStorage.setItem('selectedContextFile', id);
    // Redirect to chat
    window.location.href = '/?context=' + id;
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

// Event listeners
addFileBtn.addEventListener('click', addFile);

// Initialize
loadFileTypes();
loadFiles();
