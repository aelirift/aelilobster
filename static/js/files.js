// Context Files management
const fileNameInput = document.getElementById('fileName');
const fileTypeSelect = document.getElementById('fileType');
const fileContentInput = document.getElementById('fileContent');
const saveFileBtn = document.getElementById('saveFileBtn');
const deleteFileBtn = document.getElementById('deleteFileBtn');
const filesList = document.getElementById('filesList');
const statusMessage = document.getElementById('statusMessage');

let editingFileId = null;
let fileTypes = [];
let allFiles = [];

// Load file types
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

function renderFileTypeOptions() {
    fileTypeSelect.innerHTML = fileTypes.map(type => 
        `<option value="${type}">${type}</option>`
    ).join('');
}

// Load files
async function loadFiles() {
    try {
        const response = await fetch('/api/context-files');
        if (!response.ok) throw new Error('Failed to load files');
        allFiles = await response.json();
        renderFiles(allFiles);
    } catch (error) {
        showStatus('Failed to load files: ' + error.message, 'error');
    }
}

function renderFiles(files) {
    if (files.length === 0) {
        filesList.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">No files. Click "+ New" to create one.</div>';
        return;
    }
    
    // Sort by type then name
    files.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        return a.name.localeCompare(b.name);
    });
    
    filesList.innerHTML = files.map(file => `
        <div class="file-item-mini ${editingFileId === file.id ? 'active' : ''}" onclick="selectFile('${file.id}')">
            <span>${escapeHtml(file.name)}</span>
            <span class="file-type-badge">${escapeHtml(file.type)}</span>
        </div>
    `).join('');
}

// Select file to edit
function selectFile(id) {
    const file = allFiles.find(f => f.id === id);
    if (file) {
        editingFileId = id;
        fileNameInput.value = file.name;
        fileTypeSelect.value = file.type;
        fileContentInput.value = file.content;
        renderFiles(allFiles);
    }
}

// Save file
async function saveFile() {
    const name = fileNameInput.value.trim();
    const type = fileTypeSelect.value;
    const content = fileContentInput.value.trim();
    
    if (!name) {
        showStatus('Please enter a file name', 'error');
        return;
    }
    
    if (!content) {
        showStatus('Please enter content', 'error');
        return;
    }
    
    try {
        if (editingFileId) {
            // Update
            const response = await fetch(`/api/context-files/${editingFileId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, content })
            });
            if (!response.ok) throw new Error('Failed to update');
            showStatus('File updated', 'success');
        } else {
            // Create
            const response = await fetch('/api/context-files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type, content })
            });
            if (!response.ok) throw new Error('Failed to create');
            showStatus('File created', 'success');
        }
        loadFiles();
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

// Delete file
async function deleteFile() {
    if (!editingFileId) {
        showStatus('Select a file first', 'error');
        return;
    }
    
    if (!confirm('Delete this file?')) return;
    
    try {
        const response = await fetch(`/api/context-files/${editingFileId}`, {
            method: 'DELETE'
        });
        if (!response.ok) throw new Error('Failed to delete');
        showStatus('File deleted', 'success');
        newFile();
        loadFiles();
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
}

// New file
function newFile() {
    editingFileId = null;
    fileNameInput.value = '';
    fileTypeSelect.value = fileTypes[0] || '';
    fileContentInput.value = '';
    renderFiles(allFiles);
}

function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'config-status ' + type;
    statusMessage.style.display = 'block';
    setTimeout(() => { statusMessage.style.display = 'none'; }, 3000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Events
saveFileBtn.addEventListener('click', saveFile);
deleteFileBtn.addEventListener('click', deleteFile);

// Init
loadFileTypes();
loadFiles();
