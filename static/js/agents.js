// Agents Page JavaScript
// Handles CRUD operations for agent management

const API_BASE = '/api/agents';

let agents = [];
let editingId = null;

// ── DOM refs ────────────────────────────────────────────────────────────────
const grid = document.getElementById('agentsGrid');
const modal = document.getElementById('agentModal');
const modalTitle = document.getElementById('modalTitle');
const agentIdInput = document.getElementById('agentId');
const nameInput = document.getElementById('agentName');
const roleSelect = document.getElementById('agentRole');
const statusSelect = document.getElementById('agentStatus');
const descInput = document.getElementById('agentDescription');

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadAgents();

    document.getElementById('addAgentBtn').addEventListener('click', openNewModal);
    document.getElementById('modalCancel').addEventListener('click', closeModal);
    document.getElementById('modalSave').addEventListener('click', saveAgent);

    // Close modal on overlay click
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });
});

// ── API helpers ─────────────────────────────────────────────────────────────
async function loadAgents() {
    try {
        const res = await fetch(API_BASE);
        agents = await res.json();
        renderAgents();
    } catch (err) {
        console.error('Failed to load agents:', err);
        agents = [];
        renderAgents();
    }
}

async function createAgent(data) {
    const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

async function updateAgent(id, data) {
    const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    return res.json();
}

async function deleteAgent(id) {
    await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderAgents() {
    if (!agents.length) {
        grid.innerHTML = `
            <div class="agents-empty" style="grid-column: 1 / -1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <p>No agents configured yet</p>
                <p style="font-size: 12px; opacity: 0.6;">Click <strong>+ New Agent</strong> to get started</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = agents.map(agent => `
        <div class="agent-card" data-id="${agent.id}">
            <div class="agent-card-header">
                <div>
                    <p class="agent-name">${escapeHtml(agent.name)}</p>
                    <p class="agent-role">${capitalize(agent.role)}</p>
                </div>
                <span class="agent-status ${agent.status}">
                    <span class="agent-status-dot"></span>
                    ${capitalize(agent.status)}
                </span>
            </div>
            <p class="agent-description">${escapeHtml(agent.description || '—')}</p>
            <div class="agent-card-actions">
                <button class="btn-edit" onclick="openEditModal('${agent.id}')">Edit</button>
                <button class="btn-delete" onclick="confirmDelete('${agent.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// ── Modal ────────────────────────────────────────────────────────────────────
function openNewModal() {
    editingId = null;
    modalTitle.textContent = 'New Agent';
    agentIdInput.value = '';
    nameInput.value = '';
    roleSelect.value = 'assistant';
    statusSelect.value = 'active';
    descInput.value = '';
    modal.classList.add('open');
    nameInput.focus();
}

function openEditModal(id) {
    const agent = agents.find(a => a.id === id);
    if (!agent) return;
    editingId = id;
    modalTitle.textContent = 'Edit Agent';
    agentIdInput.value = id;
    nameInput.value = agent.name;
    roleSelect.value = agent.role;
    statusSelect.value = agent.status;
    descInput.value = agent.description || '';
    modal.classList.add('open');
    nameInput.focus();
}

function closeModal() {
    modal.classList.remove('open');
    editingId = null;
}

async function saveAgent() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const data = {
        name,
        role: roleSelect.value,
        status: statusSelect.value,
        description: descInput.value.trim(),
    };

    try {
        if (editingId) {
            await updateAgent(editingId, data);
        } else {
            await createAgent(data);
        }
        closeModal();
        await loadAgents();
    } catch (err) {
        console.error('Save failed:', err);
        alert('Failed to save agent.');
    }
}

async function confirmDelete(id) {
    const agent = agents.find(a => a.id === id);
    if (!agent) return;
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    try {
        await deleteAgent(id);
        await loadAgents();
    } catch (err) {
        console.error('Delete failed:', err);
    }
}

// ── Utilities ────────────────────────────────────────────────────────────────
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
