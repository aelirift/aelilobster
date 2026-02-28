// ═══════════════════════════════════════════════════════════════════════════
// COMMAND CENTER — command.js
// ═══════════════════════════════════════════════════════════════════════════

// ── Mock Data ───────────────────────────────────────────────────────────────
const AGENTS = [
    { id: 'nexus', name: 'NEXUS', role: 'Team Lead · Head Node', status: 'active', task: 'Coordinating team operations', progress: 100, color: '#00d4ff' },
    { id: 'writer-01', name: 'WRITER-01', role: 'Content Writer', status: 'active', task: 'Drafting Instagram carousel copy', progress: 72, color: '#3fb950' },
    { id: 'designer-01', name: 'DESIGNER-01', role: 'Visual Designer', status: 'active', task: 'Creating story templates for Q1', progress: 45, color: '#ab47bc' },
    { id: 'scraper-01', name: 'SCRAPER-01', role: 'Web Researcher', status: 'queued', task: 'Queued: competitor analysis scan', progress: 0, color: '#d29922' },
    { id: 'sched-01', name: 'SCHED-01', role: 'Post Scheduler', status: 'idle', task: 'Awaiting scheduling tasks', progress: 0, color: '#586574' },
    { id: 'analyst-01', name: 'ANALYST-01', role: 'Analytics Agent', status: 'active', task: 'Processing engagement metrics', progress: 88, color: '#42a5f5' },
];

const INITIAL_LOGS = [
    { time: '11:02:14', from: 'NEXUS', to: 'ALL', msg: 'Pod online. All agents reporting.', type: 'delegate' },
    { time: '11:02:16', from: 'WRITER-01', to: 'NEXUS', msg: 'Ready. Starting content queue.', type: 'report' },
    { time: '11:02:17', from: 'DESIGNER-01', to: 'NEXUS', msg: 'Template engine loaded. Ready.', type: 'report' },
    { time: '11:02:19', from: 'ANALYST-01', to: 'NEXUS', msg: 'Connected to analytics pipeline.', type: 'report' },
    { time: '11:03:41', from: 'NEXUS', to: 'WRITER-01', msg: 'Priority: Draft carousel for product launch.', type: 'delegate' },
    { time: '11:04:02', from: 'WRITER-01', to: 'NEXUS', msg: 'Acknowledged. Pulling brand voice context.', type: 'report' },
    { time: '11:05:18', from: 'NEXUS', to: 'DESIGNER-01', msg: 'Begin Q1 story template batch.', type: 'delegate' },
    { time: '11:06:33', from: 'ANALYST-01', to: 'NEXUS', msg: 'Engagement data pulled: +12% WoW.', type: 'report' },
];

const INITIAL_ACCOM = [
    { time: '11:06:33', agent: 'ANALYST-01', desc: 'Weekly engagement report generated', icon: '📊', detail: 'Engagement up 12% WoW. Top post: product teaser (2.3k likes). Reel reach increased 18%. Recommended: more carousel content.' },
    { time: '10:58:12', agent: 'WRITER-01', desc: 'LinkedIn thought-leadership post published', icon: '📝', detail: 'Published to company page. 1,200 impressions in first hour. CTR: 4.2%.' },
    { time: '10:45:00', agent: 'SCHED-01', desc: 'Scheduled 5 posts for next 48 hours', icon: '📅', detail: 'Platforms: Instagram (2), Twitter (2), LinkedIn (1). Optimal times selected based on historical engagement data.' },
    { time: '10:30:22', agent: 'DESIGNER-01', desc: 'Brand asset pack v2 finalized', icon: '🎨', detail: '12 templates created: 4 story, 4 post, 4 carousel. Figma synced.' },
];

const INITIAL_SCHED = [
    { day: 'Today', time: '14:00', desc: 'Publish product launch carousel', agent: 'SCHED-01', status: 'scheduled' },
    { day: 'Today', time: '16:30', desc: 'Twitter thread: industry trends', agent: 'WRITER-01', status: 'pending' },
    { day: 'Today', time: '18:00', desc: 'Story series: behind the scenes', agent: 'DESIGNER-01', status: 'pending' },
    { day: 'Tomorrow', time: '09:00', desc: 'Competitor content audit', agent: 'SCRAPER-01', status: 'scheduled' },
    { day: 'Tomorrow', time: '11:00', desc: 'Weekly analytics digest', agent: 'ANALYST-01', status: 'scheduled' },
    { day: 'Tomorrow', time: '15:00', desc: 'LinkedIn case study draft', agent: 'WRITER-01', status: 'pending' },
];

// ── Delegation responses (simulate Head Node AI) ────────────────────────────
const DELEGATION_MAP = [
    { match: /write|draft|copy|post|article|blog|thread|caption/i, agent: 'WRITER-01', ack: 'Copy that. Routing to content pipeline.', del: 'Begin drafting. Use brand voice context.' },
    { match: /design|template|visual|graphic|image|banner|story/i, agent: 'DESIGNER-01', ack: 'Understood. Assigning visual task.', del: 'Produce assets per brand guidelines.' },
    { match: /research|scrape|competitor|analyze site|crawl|find/i, agent: 'SCRAPER-01', ack: 'Research task received. Deploying scraper.', del: 'Run full scan. Report key findings.' },
    { match: /schedule|publish|queue|post at|send at/i, agent: 'SCHED-01', ack: 'Scheduling directive received.', del: 'Queue for optimal engagement window.' },
    { match: /analytics|metrics|engagement|report|data|stats/i, agent: 'ANALYST-01', ack: 'Analytics request logged.', del: 'Pull latest metrics and generate report.' },
];
const FALLBACK_DEL = { agent: 'WRITER-01', ack: 'Directive received. Analyzing and assigning.', del: 'Execute per the user\'s directive.' };

// ── State ───────────────────────────────────────────────────────────────────
let logs = [...INITIAL_LOGS];
let accom = [...INITIAL_ACCOM];
let sched = [...INITIAL_SCHED];
let commsFilter = 'all';
let selectedAgent = null;
let uptimeSeconds = 264; // start at 00:04:24
let tasksDone = INITIAL_ACCOM.length;

// ── DOM refs ────────────────────────────────────────────────────────────────
const $roster = document.getElementById('rosterList');
const $chatHistory = document.getElementById('chatHistory');
const $chatInput = document.getElementById('chatInput');
const $chatSend = document.getElementById('chatSend');
const $commsLog = document.getElementById('commsLog');
const $commsFilters = document.getElementById('commsFilters');
const $accomList = document.getElementById('accomList');
const $schedList = document.getElementById('schedList');
const $addTaskBtn = document.getElementById('addTaskBtn');
const $addTaskForm = document.getElementById('addTaskForm');
const $confirmTask = document.getElementById('confirmTask');
const $uptime = document.getElementById('uptime');
const $agentCount = document.getElementById('agentCount');
const $mcpCount = document.getElementById('mcpCount');
const $tasksDone = document.getElementById('tasksDone');
const $mobileTabs = document.getElementById('mobileTabs');
const $newTaskAgent = document.getElementById('newTaskAgent');

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Set URL params if present
    const params = new URLSearchParams(location.search);
    if (params.get('pod')) document.getElementById('podTitle').textContent = params.get('pod');

    $agentCount.textContent = AGENTS.length;
    $mcpCount.textContent = '4';
    $tasksDone.textContent = tasksDone;

    renderRoster();
    renderCommsFilters();
    renderCommsLog();
    renderAccom();
    renderSched();
    populateAgentSelector();
    startUptime();
    startSimulation();

    // Event listeners
    $chatSend.addEventListener('click', handleChatSend);
    $chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleChatSend(); });
    $addTaskBtn.addEventListener('click', () => $addTaskForm.classList.toggle('open'));
    $confirmTask.addEventListener('click', handleAddTask);

    // Mobile tabs
    $mobileTabs.querySelectorAll('.mob-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $mobileTabs.querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.cc-panel').forEach(p => p.classList.remove('mobile-active'));
            document.getElementById('panel' + capitalize(tab.dataset.tab)).classList.add('mobile-active');
        });
    });
});

// ── Uptime ──────────────────────────────────────────────────────────────────
function startUptime() {
    setInterval(() => {
        uptimeSeconds++;
        const h = String(Math.floor(uptimeSeconds / 3600)).padStart(2, '0');
        const m = String(Math.floor((uptimeSeconds % 3600) / 60)).padStart(2, '0');
        const s = String(uptimeSeconds % 60).padStart(2, '0');
        $uptime.textContent = `${h}:${m}:${s}`;
    }, 1000);
}

// ── Agent Roster ────────────────────────────────────────────────────────────
function renderRoster() {
    $roster.innerHTML = AGENTS.filter(a => a.id !== 'nexus').map(a => `
        <div class="agent-row ${selectedAgent === a.id ? 'selected' : ''}" data-id="${a.id}">
            <div class="agent-row-top">
                <div>
                    <span class="agent-name">${a.name}</span>
                    <span class="agent-role"> · ${a.role}</span>
                </div>
                <span class="agent-dot ${a.status}"></span>
            </div>
            <div class="agent-task">${a.task}</div>
            <div class="agent-progress"><div class="agent-progress-bar" style="width:${a.progress}%;background:${a.color}"></div></div>
        </div>
    `).join('');

    $roster.querySelectorAll('.agent-row').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.id;
            selectedAgent = selectedAgent === id ? null : id;
            renderRoster();
            renderCommsLog();
        });
    });
}

// ── Comms Log ───────────────────────────────────────────────────────────────
function renderCommsFilters() {
    const filters = ['All', 'Head Only', ...AGENTS.filter(a => a.id !== 'nexus').map(a => a.name)];
    $commsFilters.innerHTML = filters.map(f => {
        const val = f === 'All' ? 'all' : f === 'Head Only' ? 'head' : f;
        return `<button class="comms-filter ${commsFilter === val ? 'active' : ''}" data-f="${val}">${f}</button>`;
    }).join('');
    $commsFilters.querySelectorAll('.comms-filter').forEach(btn => {
        btn.addEventListener('click', () => {
            commsFilter = btn.dataset.f;
            selectedAgent = null;
            renderRoster();
            renderCommsFilters();
            renderCommsLog();
        });
    });
}

function renderCommsLog() {
    let filtered = logs;
    if (selectedAgent) {
        const name = AGENTS.find(a => a.id === selectedAgent)?.name;
        if (name) filtered = logs.filter(l => l.from === name || l.to === name);
    } else if (commsFilter === 'head') {
        filtered = logs.filter(l => l.from === 'NEXUS' || l.to === 'NEXUS');
    } else if (commsFilter !== 'all') {
        filtered = logs.filter(l => l.from === commsFilter || l.to === commsFilter);
    }

    $commsLog.innerHTML = filtered.map(l => {
        const fromColor = getAgentColor(l.from);
        const toColor = getAgentColor(l.to);
        return `<div class="log-entry ${l.type}">
            <span class="log-ts">${l.time}</span>
            <span class="log-route"><span style="color:${fromColor}">${l.from}</span> → <span style="color:${toColor}">${l.to}</span></span>
            <span class="log-msg">${esc(l.msg)}</span>
        </div>`;
    }).join('');
    $commsLog.scrollTop = $commsLog.scrollHeight;
}

function addLog(from, to, msg, type = 'report') {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    logs.push({ time, from, to, msg, type });
    renderCommsLog();
}

// ── Head Node Chat ──────────────────────────────────────────────────────────
function handleChatSend() {
    const text = $chatInput.value.trim();
    if (!text) return;
    $chatInput.value = '';

    // User message
    appendChat('user', 'YOU', text);

    // Find delegation target
    const match = DELEGATION_MAP.find(d => d.match.test(text)) || FALLBACK_DEL;
    const targetAgent = AGENTS.find(a => a.name === match.agent) || AGENTS[1];

    // Head Node acknowledgment (delayed)
    setTimeout(() => {
        appendChat('head', 'NEXUS', match.ack);
        document.getElementById('headStatus').textContent = '● PROCESSING DIRECTIVE';
    }, 600);

    // Delegation message
    setTimeout(() => {
        appendChat('delegate', '', `→ Assigned to ${targetAgent.name}`);
        addLog('NEXUS', targetAgent.name, match.del, 'delegate');
        document.getElementById('headStatus').textContent = '● ONLINE — AWAITING ORDERS';

        // Update target agent status
        targetAgent.status = 'active';
        targetAgent.task = text.length > 40 ? text.slice(0, 40) + '…' : text;
        targetAgent.progress = 5;
        renderRoster();

        // Simulate agent working
        simulateAgentWork(targetAgent, text);
    }, 1500);
}

function appendChat(type, label, text) {
    const div = document.createElement('div');
    div.className = `chat-msg ${type}`;
    if (label) div.innerHTML = `<div class="msg-label">${label}</div>${esc(text)}`;
    else div.textContent = text;
    $chatHistory.appendChild(div);
    $chatHistory.scrollTop = $chatHistory.scrollHeight;
}

function simulateAgentWork(agent, taskDesc) {
    let prog = 10;
    const interval = setInterval(() => {
        prog += Math.floor(Math.random() * 20) + 10;
        if (prog >= 100) {
            prog = 100;
            clearInterval(interval);
            agent.progress = 100;
            agent.status = 'idle';
            agent.task = 'Awaiting next task';
            renderRoster();

            addLog(agent.name, 'NEXUS', `Task complete: "${taskDesc.slice(0, 50)}"`, 'report');
            setTimeout(() => addLog('NEXUS', 'USER', `${agent.name} finished: ${taskDesc.slice(0, 40)}`, 'report'), 500);

            // Add to accomplishments
            tasksDone++;
            $tasksDone.textContent = tasksDone;
            accom.unshift({
                time: new Date().toTimeString().slice(0, 8),
                agent: agent.name,
                desc: taskDesc.slice(0, 60),
                icon: agent.name.includes('WRITER') ? '📝' : agent.name.includes('DESIGNER') ? '🎨' : agent.name.includes('ANALYST') ? '📊' : '✅',
                detail: `Task completed successfully. Output ready for review.`,
            });
            renderAccom();
        } else {
            agent.progress = prog;
            renderRoster();
        }
    }, 1200);
}

// ── Accomplishments ─────────────────────────────────────────────────────────
function renderAccom() {
    $accomList.innerHTML = accom.map((a, i) => `
        <div class="accom-item" data-idx="${i}">
            <div class="accom-top">
                <span class="accom-ts">${a.time}</span>
                <span class="accom-agent">${a.agent}</span>
            </div>
            <div class="accom-desc"><span class="accom-icon">${a.icon}</span>${esc(a.desc)}</div>
            <div class="accom-detail">${esc(a.detail)}</div>
        </div>
    `).join('');

    $accomList.querySelectorAll('.accom-item').forEach(item => {
        item.addEventListener('click', () => item.classList.toggle('expanded'));
    });
}

// ── Scheduler ───────────────────────────────────────────────────────────────
function renderSched() {
    let html = '';
    let currentDay = '';
    sched.forEach(s => {
        if (s.day !== currentDay) {
            currentDay = s.day;
            html += `<div class="sched-day-label">${s.day}</div>`;
        }
        html += `<div class="sched-item">
            <span class="sched-time">${s.time}</span>
            <span class="sched-desc">${esc(s.desc)}</span>
            <span class="sched-agent">${s.agent}</span>
            <span class="sched-status ${s.status}">${s.status}</span>
        </div>`;
    });
    $schedList.innerHTML = html;
}

function populateAgentSelector() {
    $newTaskAgent.innerHTML = AGENTS.filter(a => a.id !== 'nexus').map(a =>
        `<option value="${a.name}">${a.name}</option>`
    ).join('');
}

function handleAddTask() {
    const time = document.getElementById('newTaskTime').value || '12:00';
    const desc = document.getElementById('newTaskDesc').value.trim();
    const agent = $newTaskAgent.value;
    if (!desc) return;

    sched.push({ day: 'Today', time, desc, agent, status: 'pending' });
    // Re-sort by day then time
    const dayOrder = { 'Today': 0, 'Tomorrow': 1 };
    sched.sort((a, b) => (dayOrder[a.day] ?? 2) - (dayOrder[b.day] ?? 2) || a.time.localeCompare(b.time));
    renderSched();
    document.getElementById('newTaskDesc').value = '';
    $addTaskForm.classList.remove('open');

    addLog('USER', 'NEXUS', `Scheduled: "${desc}" → ${agent} at ${time}`, 'delegate');
}

// ── Background Simulation ───────────────────────────────────────────────────
function startSimulation() {
    const simMessages = [
        { from: 'WRITER-01', to: 'NEXUS', msg: 'First carousel draft ready for review.', type: 'report' },
        { from: 'NEXUS', to: 'WRITER-01', msg: 'Approved. Proceed to finalize copy.', type: 'delegate' },
        { from: 'ANALYST-01', to: 'NEXUS', msg: 'Story engagement up 23% since template refresh.', type: 'report' },
        { from: 'DESIGNER-01', to: 'NEXUS', msg: 'Template batch 3/8 complete.', type: 'report' },
        { from: 'NEXUS', to: 'SCRAPER-01', msg: 'Begin trending topics scan.', type: 'delegate' },
        { from: 'SCRAPER-01', to: 'NEXUS', msg: 'Starting scan. ETA: 4 minutes.', type: 'report' },
        { from: 'WRITER-01', to: 'DESIGNER-01', msg: 'Need visual for slide 3 of carousel.', type: 'report' },
        { from: 'DESIGNER-01', to: 'WRITER-01', msg: 'On it. Pulling from approved asset library.', type: 'report' },
        { from: 'ANALYST-01', to: 'NEXUS', msg: 'Optimal posting window: 14:15–14:45.', type: 'report' },
        { from: 'NEXUS', to: 'SCHED-01', msg: 'Queue carousel publish at 14:20.', type: 'delegate' },
        { from: 'SCHED-01', to: 'NEXUS', msg: 'Scheduled. Carousel going live at 14:20.', type: 'report' },
        { from: 'SCRAPER-01', to: 'NEXUS', msg: 'Trending: AI tooling, sustainability, creator economy.', type: 'report' },
    ];

    let idx = 0;
    setInterval(() => {
        if (idx < simMessages.length) {
            const m = simMessages[idx];
            addLog(m.from, m.to, m.msg, m.type);
            idx++;

            // Occasionally tick progress bars
            AGENTS.forEach(a => {
                if (a.status === 'active' && a.progress < 100 && a.id !== 'nexus') {
                    a.progress = Math.min(100, a.progress + Math.floor(Math.random() * 8) + 2);
                    if (a.progress >= 100) { a.status = 'idle'; a.task = 'Awaiting next task'; }
                }
            });
            renderRoster();
        }
    }, 6000);

    // Activate queued agents after a delay
    setTimeout(() => {
        const scraper = AGENTS.find(a => a.id === 'scraper-01');
        if (scraper) { scraper.status = 'active'; scraper.task = 'Scanning competitor feeds'; scraper.progress = 10; renderRoster(); }
    }, 12000);
}

// ── Pause / Resume ──────────────────────────────────────────────────────────
let isPaused = false;
const $pauseBtn = document.getElementById('pauseBtn');
if ($pauseBtn) {
    $pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        const pill = document.getElementById('statusPill');
        const label = document.getElementById('statusLabel');
        if (isPaused) {
            pill.className = 'status-pill idle';
            label.textContent = 'PAUSED';
            $pauseBtn.textContent = '▶ RESUME';
        } else {
            pill.className = 'status-pill running';
            label.textContent = 'RUNNING';
            $pauseBtn.textContent = '⏸ PAUSE';
        }
    });
}

const $settingsBtn = document.getElementById('settingsBtn');
if ($settingsBtn) {
    $settingsBtn.addEventListener('click', () => {
        alert('Settings panel — coming soon. This will allow configuring agent parameters, MCP connections, and pod resources.');
    });
}

// ── Utilities ───────────────────────────────────────────────────────────────
function getAgentColor(name) {
    const a = AGENTS.find(x => x.name === name);
    return a ? a.color : '#7d8590';
}
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

