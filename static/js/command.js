/* ═══════════════════════════════════════════════════════════════════════════
   FLEET COMMAND CENTER — command.js
   Multi-pod orchestration platform with Fleet View, Pod View, Orchestration
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── FLEET DATA MODEL ──────────────────────────────────────────────────────
const FLEET = [
    {
        pod_id: 'pod_001', pod_name: 'Social Media Content Pod', status: 'active',
        head_node: { codename: 'HERALD', accent: '#a855f7' },
        agents: [
            { id: 'nexus', name: 'NEXUS', role: 'Team Lead · Head Node', status: 'active', task: 'Coordinating team ops', progress: 100, color: '#a855f7' },
            { id: 'writer-01', name: 'WRITER-01', role: 'Content Writer', status: 'active', task: 'Drafting Instagram carousel copy', progress: 72, color: '#3fb950' },
            { id: 'designer-01', name: 'DESIGNER-01', role: 'Visual Designer', status: 'active', task: 'Creating story templates for Q1', progress: 45, color: '#ab47bc' },
            { id: 'scraper-01', name: 'SCRAPER-01', role: 'Web Researcher', status: 'queued', task: 'Queued: competitor analysis', progress: 0, color: '#d29922' },
            { id: 'sched-01', name: 'SCHED-01', role: 'Post Scheduler', status: 'idle', task: 'Awaiting scheduling tasks', progress: 0, color: '#586574' },
            { id: 'analyst-01', name: 'ANALYST-01', role: 'Analytics Agent', status: 'active', task: 'Processing engagement metrics', progress: 88, color: '#42a5f5' },
        ],
        tasks_today: 12, mcp: 4, uptime: 264,
        dependencies: { receives_from: ['pod_003'], sends_to: [] },
        logs: [
            { time: '11:02:14', from: 'NEXUS', to: 'ALL', msg: 'Pod online. All agents reporting.', type: 'delegate' },
            { time: '11:02:16', from: 'WRITER-01', to: 'NEXUS', msg: 'Ready. Starting content queue.', type: 'report' },
            { time: '11:03:41', from: 'NEXUS', to: 'WRITER-01', msg: 'Priority: Draft carousel for product launch.', type: 'delegate' },
            { time: '11:04:02', from: 'WRITER-01', to: 'NEXUS', msg: 'Acknowledged. Pulling brand voice.', type: 'report' },
            { time: '11:05:18', from: 'NEXUS', to: 'DESIGNER-01', msg: 'Begin Q1 story template batch.', type: 'delegate' },
            { time: '11:06:33', from: 'ANALYST-01', to: 'NEXUS', msg: 'Engagement data: +12% WoW.', type: 'report' },
        ],
        accomplishments: [
            { time: '11:06:33', agent: 'ANALYST-01', desc: 'Weekly engagement report generated', icon: '📊', detail: 'Engagement up 12% WoW. Top post: product teaser.' },
            { time: '10:58:12', agent: 'WRITER-01', desc: 'LinkedIn post published', icon: '📝', detail: '1,200 impressions in first hour. CTR: 4.2%.' },
            { time: '10:45:00', agent: 'SCHED-01', desc: 'Scheduled 5 posts for 48h', icon: '📅', detail: 'IG (2), Twitter (2), LinkedIn (1).' },
            { time: '10:30:22', agent: 'DESIGNER-01', desc: 'Brand asset pack v2 finalized', icon: '🎨', detail: '12 templates: 4 story, 4 post, 4 carousel.' },
        ],
        schedule: [
            { day: 'Today', time: '14:00', desc: 'Publish product launch carousel', agent: 'SCHED-01', status: 'scheduled' },
            { day: 'Today', time: '16:30', desc: 'Twitter thread: industry trends', agent: 'WRITER-01', status: 'pending' },
            { day: 'Tomorrow', time: '09:00', desc: 'Competitor content audit', agent: 'SCRAPER-01', status: 'scheduled' },
            { day: 'Tomorrow', time: '11:00', desc: 'Weekly analytics digest', agent: 'ANALYST-01', status: 'scheduled' },
        ],
        delegation_map: [
            { match: /write|draft|copy|post|article|blog|thread/i, agent: 'WRITER-01', ack: 'Copy that. Routing to content pipeline.', del: 'Begin drafting. Use brand voice context.' },
            { match: /design|template|visual|graphic|image/i, agent: 'DESIGNER-01', ack: 'Understood. Assigning visual task.', del: 'Produce assets per brand guidelines.' },
            { match: /research|scrape|competitor|crawl|find/i, agent: 'SCRAPER-01', ack: 'Research task received. Deploying scraper.', del: 'Run full scan. Report key findings.' },
            { match: /schedule|publish|queue/i, agent: 'SCHED-01', ack: 'Scheduling directive received.', del: 'Queue for optimal engagement window.' },
            { match: /analytics|metrics|engagement|report|data/i, agent: 'ANALYST-01', ack: 'Analytics request logged.', del: 'Pull latest metrics and generate report.' },
        ],
        alerts: 0, lastActivity: 23,
    },
    {
        pod_id: 'pod_002', pod_name: 'Dev Ops Pod', status: 'active',
        head_node: { codename: 'FORGE', accent: '#10b981' },
        agents: [
            { id: 'nexus', name: 'FORGE', role: 'Team Lead · Head Node', status: 'active', task: 'Managing CI/CD pipeline', progress: 100, color: '#10b981' },
            { id: 'coder-01', name: 'CODER-01', role: 'Code Generator', status: 'active', task: 'Implementing auth module', progress: 60, color: '#3fb950' },
            { id: 'reviewer-01', name: 'REVIEWER-01', role: 'Code Reviewer', status: 'idle', task: 'Awaiting PR submission', progress: 0, color: '#42a5f5' },
            { id: 'tester-01', name: 'TESTER-01', role: 'QA Tester', status: 'active', task: 'Running integration tests', progress: 82, color: '#f59e0b' },
            { id: 'deployer-01', name: 'DEPLOYER-01', role: 'Deployment Agent', status: 'queued', task: 'Queued: staging deploy', progress: 0, color: '#ef4444' },
        ],
        tasks_today: 8, mcp: 3, uptime: 1820,
        dependencies: { receives_from: [], sends_to: ['pod_001'] },
        logs: [
            { time: '10:15:00', from: 'FORGE', to: 'ALL', msg: 'Sprint 4 build pipeline active.', type: 'delegate' },
            { time: '10:16:22', from: 'CODER-01', to: 'FORGE', msg: 'Auth module skeleton ready.', type: 'report' },
            { time: '10:30:45', from: 'FORGE', to: 'TESTER-01', msg: 'Run integration suite on auth.', type: 'delegate' },
            { time: '10:45:10', from: 'TESTER-01', to: 'FORGE', msg: '8/10 tests passing. 2 edge cases.', type: 'report' },
        ],
        accomplishments: [
            { time: '10:45:10', agent: 'TESTER-01', desc: 'Integration test suite executed', icon: '🧪', detail: '8/10 passing. Edge cases flagged.' },
            { time: '10:16:22', agent: 'CODER-01', desc: 'Auth module skeleton generated', icon: '💻', detail: 'JWT + OAuth2 scaffolding complete.' },
            { time: '09:30:00', agent: 'DEPLOYER-01', desc: 'Staging environment refreshed', icon: '🚀', detail: 'Fresh deployment from main branch.' },
        ],
        schedule: [
            { day: 'Today', time: '15:00', desc: 'Deploy auth module to staging', agent: 'DEPLOYER-01', status: 'pending' },
            { day: 'Today', time: '17:00', desc: 'Code review: API endpoints', agent: 'REVIEWER-01', status: 'scheduled' },
            { day: 'Tomorrow', time: '09:00', desc: 'Sprint 4 standup', agent: 'FORGE', status: 'scheduled' },
        ],
        delegation_map: [
            { match: /code|implement|build|create|generate/i, agent: 'CODER-01', ack: 'Code task queued.', del: 'Begin implementation.' },
            { match: /review|audit|check/i, agent: 'REVIEWER-01', ack: 'Review requested.', del: 'Perform thorough code review.' },
            { match: /test|qa|verify|validate/i, agent: 'TESTER-01', ack: 'Test task received.', del: 'Run test suite.' },
            { match: /deploy|ship|release|push/i, agent: 'DEPLOYER-01', ack: 'Deployment task logged.', del: 'Prepare deployment pipeline.' },
        ],
        alerts: 1, lastActivity: 45,
    },
    {
        pod_id: 'pod_003', pod_name: 'Research & Intelligence Pod', status: 'active',
        head_node: { codename: 'ORACLE', accent: '#f59e0b' },
        agents: [
            { id: 'nexus', name: 'ORACLE', role: 'Team Lead · Head Node', status: 'active', task: 'Synthesizing research outputs', progress: 100, color: '#f59e0b' },
            { id: 'crawler-01', name: 'CRAWLER-01', role: 'Web Crawler', status: 'active', task: 'Indexing AI regulation sources', progress: 67, color: '#3fb950' },
            { id: 'synth-01', name: 'SYNTH-01', role: 'Research Synthesizer', status: 'active', task: 'Compiling quarterly trends', progress: 35, color: '#a855f7' },
            { id: 'monitor-01', name: 'MONITOR-01', role: 'News Monitor', status: 'idle', task: 'Listening for breaking news', progress: 0, color: '#42a5f5' },
        ],
        tasks_today: 6, mcp: 5, uptime: 3600,
        dependencies: { receives_from: [], sends_to: ['pod_001'] },
        logs: [
            { time: '09:00:00', from: 'ORACLE', to: 'ALL', msg: 'Research batch initiated.', type: 'delegate' },
            { time: '09:15:30', from: 'CRAWLER-01', to: 'ORACLE', msg: '14 sources indexed on AI regulation.', type: 'report' },
            { time: '09:30:00', from: 'ORACLE', to: 'SYNTH-01', msg: 'Compile quarterly trends from indexed sources.', type: 'delegate' },
            { time: '10:00:00', from: 'SYNTH-01', to: 'ORACLE', msg: 'Trend compilation 35% complete.', type: 'report' },
        ],
        accomplishments: [
            { time: '09:15:30', agent: 'CRAWLER-01', desc: 'AI regulation sources indexed', icon: '🔍', detail: '14 sources from 5 jurisdictions indexed.' },
            { time: '08:45:00', agent: 'MONITOR-01', desc: 'Morning news digest compiled', icon: '📰', detail: '32 articles scanned, 5 flagged as high-relevance.' },
        ],
        schedule: [
            { day: 'Today', time: '13:00', desc: 'Deliver research summary to HERALD', agent: 'SYNTH-01', status: 'scheduled' },
            { day: 'Today', time: '16:00', desc: 'Evening news scan', agent: 'MONITOR-01', status: 'pending' },
            { day: 'Tomorrow', time: '08:00', desc: 'Morning intelligence briefing', agent: 'ORACLE', status: 'scheduled' },
        ],
        delegation_map: [
            { match: /research|find|search|look up|investigate/i, agent: 'CRAWLER-01', ack: 'Research task queued.', del: 'Begin web crawl and indexation.' },
            { match: /summarize|compile|synthesize|analyze|report/i, agent: 'SYNTH-01', ack: 'Synthesis task received.', del: 'Compile findings into report.' },
            { match: /monitor|watch|track|alert/i, agent: 'MONITOR-01', ack: 'Monitoring task set.', del: 'Set up real-time tracking.' },
        ],
        alerts: 0, lastActivity: 120,
    }
];

const PIPELINES = [
    {
        id: 'pipe_001', name: 'Research → Write → Publish', status: 'idle',
        steps: [
            { pod_id: 'pod_003', instruction: 'Research trending topic', output_key: 'research', status: 'idle' },
            { pod_id: 'pod_001', instruction: 'Write posts from @research', output_key: 'drafts', status: 'idle' },
            { pod_id: 'pod_001', instruction: 'Schedule and publish @drafts', output_key: null, status: 'idle' },
        ]
    }
];

const DEPENDENCIES = [
    { waiting: 'ORACLE (research)', blocked: 'HERALD', task: 'LinkedIn draft pending source data', status: 'waiting' },
    { waiting: 'FORGE (build)', blocked: 'HERALD', task: 'Support docs pending release notes', status: 'resolved' },
];

// ─── STATE ─────────────────────────────────────────────────────────────────
let currentView = 'fleet'; // fleet | pod | orchestration
let activePodId = null;
let fleetFeedFilter = 'all';
let fleetFeed = [];
let podState = {}; // per-pod: commsFilter, selectedAgent

FLEET.forEach(p => {
    podState[p.pod_id] = { commsFilter: 'all', selectedAgent: null, isPaused: false, chatHistory: [] };
});

// ─── UTILITIES ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function ts() { return new Date().toTimeString().slice(0, 8) }
function fmt(s) { const h = String(Math.floor(s / 3600)).padStart(2, '0'), m = String(Math.floor((s % 3600) / 60)).padStart(2, '0'), sec = String(s % 60).padStart(2, '0'); return `${h}:${m}:${sec}` }
function getPod(id) { return FLEET.find(p => p.pod_id === id) }
function getAgentColor(pod, name) { const a = pod.agents.find(x => x.name === name); return a ? a.color : '#7d8590' }
function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

// ─── VIEW ROUTER ───────────────────────────────────────────────────────────
function switchView(view, podId) {
    currentView = view;
    activePodId = view === 'pod' ? podId : null;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    $(view === 'fleet' ? 'fleetView' : view === 'pod' ? 'podView' : 'orchestrationView').classList.add('active');
    // Update sidebar
    $('fleetBtn').classList.toggle('active', view === 'fleet');
    document.querySelectorAll('.nav-pod').forEach(el => {
        el.classList.toggle('active', el.dataset.pod === podId);
    });
    if (view === 'fleet') renderFleet();
    else if (view === 'pod') renderPodView(podId);
    else if (view === 'orchestration') renderOrchestration();
}

// ─── POD NAVIGATOR SIDEBAR ─────────────────────────────────────────────────
function renderNavPods() {
    const c = $('navPods');
    c.innerHTML = FLEET.map(p => {
        const dotClass = p.status === 'active' ? 'active' : p.status === 'error' ? 'error' : 'idle';
        const isActive = activePodId === p.pod_id;
        return `<div class="nav-pod ${isActive ? 'active' : ''}" data-pod="${p.pod_id}" style="${isActive ? 'border-left-color:' + p.head_node.accent : ''}">
      <div class="nav-pod-avatar" style="border-color:${p.head_node.accent};color:${p.head_node.accent};background:${p.head_node.accent}18">${p.head_node.codename.slice(0, 2)}</div>
      <div class="nav-pod-info nav-label">
        <div class="nav-pod-code" style="color:${p.head_node.accent}">${p.head_node.codename}</div>
        <div class="nav-pod-name">${p.pod_name}</div>
        <div class="nav-pod-meta">${p.agents.filter(a => a.status === 'active').length} active</div>
      </div>
      <span class="status-dot" style="background:var(--${dotClass === 'active' ? 'green' : dotClass === 'error' ? 'red' : 'idle'})"></span>
      ${p.alerts > 0 ? `<span class="alert-badge">${p.alerts}</span>` : ''}
    </div>`;
    }).join('');
    c.querySelectorAll('.nav-pod').forEach(el => {
        el.addEventListener('click', () => switchView('pod', el.dataset.pod));
    });
    // Health
    const totalAgents = FLEET.reduce((s, p) => s + p.agents.filter(a => a.status === 'active').length, 0);
    const totalTasks = FLEET.reduce((s, p) => s + p.tasks_today, 0);
    $('navHealth').innerHTML = `${FLEET.length} pods · ${totalAgents} agents · ${totalTasks} tasks today`;
}

// ─── FLEET VIEW ────────────────────────────────────────────────────────────
function renderFleet() {
    renderFleetStats();
    renderFleetGrid();
    renderFeedFilters();
    renderFleetFeed();
}

function renderFleetStats() {
    const active = FLEET.filter(p => p.status === 'active').length;
    const agents = FLEET.reduce((s, p) => s + p.agents.filter(a => a.status === 'active').length, 0);
    const tasks = FLEET.reduce((s, p) => s + p.tasks_today, 0);
    const errs = FLEET.reduce((s, p) => s + p.alerts, 0);
    $('fleetStats').innerHTML = `
    <div class="fleet-stat"><span>PODS</span><span class="val">${active}</span></div>
    <div class="fleet-stat"><span>AGENTS</span><span class="val">${agents}</span></div>
    <div class="fleet-stat"><span>TASKS</span><span class="val">${tasks}</span></div>
    <div class="fleet-stat ${errs > 0 ? 'err' : ''}"><span>ALERTS</span><span class="val">${errs}</span></div>`;
}

function renderFleetGrid() {
    $('fleetGrid').innerHTML = FLEET.map(p => {
        const activeCount = p.agents.filter(a => a.status === 'active').length;
        const runningTasks = p.agents.filter(a => a.status === 'active' && a.id !== 'nexus').length;
        const queuedTasks = p.agents.filter(a => a.status === 'queued').length;
        const focusAgents = p.agents.filter(a => a.status === 'active' && a.id !== 'nexus').slice(0, 2);
        const statusClass = p.status;
        const ago = p.lastActivity < 60 ? p.lastActivity + 's ago' : Math.floor(p.lastActivity / 60) + 'm ago';
        return `<div class="pod-card" data-pod="${p.pod_id}">
      <div class="pod-card-head">
        <div class="pod-card-id">
          <div class="pod-card-avatar" style="border:2px solid ${p.head_node.accent};color:${p.head_node.accent};background:${p.head_node.accent}10">${p.head_node.codename.slice(0, 2)}</div>
          <div><div class="pod-card-codename" style="color:${p.head_node.accent}">${p.head_node.codename}</div><div class="pod-card-title">${p.pod_name}</div></div>
        </div>
        <span class="pod-card-status ${statusClass}"><span class="dot" style="width:5px;height:5px;border-radius:50%;background:currentColor"></span>${statusClass.toUpperCase()}</span>
      </div>
      <div class="pod-card-stats">
        <div class="pcs"><div class="pcs-val">${activeCount}/${p.agents.length}</div><div class="pcs-lbl">Agents</div></div>
        <div class="pcs"><div class="pcs-val">${runningTasks}·${queuedTasks}</div><div class="pcs-lbl">Run·Queue</div></div>
        <div class="pcs"><div class="pcs-val">${p.tasks_today}</div><div class="pcs-lbl">Today</div></div>
      </div>
      <div class="pod-card-focus">
        <div class="pcf-title">Current Focus</div>
        ${focusAgents.map(a => `<div class="pcf-line"><span class="dot" style="background:${a.color}"></span>${a.name} ${esc(a.task.toLowerCase())}</div>`).join('')}
        ${focusAgents.length === 0 ? '<div class="pcf-line" style="color:var(--text-muted)">All agents idle</div>' : ''}
      </div>
      <div class="pod-card-foot">
        <span class="pcf-ago">${ago}</span>
        <div class="pcf-actions">
          <button class="pcf-btn primary" onclick="switchView('pod','${p.pod_id}')">Open Pod</button>
          <button class="pcf-btn qt-toggle" data-pod="${p.pod_id}">Quick Task →</button>
        </div>
      </div>
      <div class="quick-task" id="qt-${p.pod_id}">
        <input type="text" placeholder="Task for ${p.head_node.codename}..." id="qti-${p.pod_id}">
        <button onclick="sendQuickTask('${p.pod_id}')">⏎</button>
      </div>
    </div>`;
    }).join('');
    // Quick task toggles
    document.querySelectorAll('.qt-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const qt = $('qt-' + btn.dataset.pod);
            qt.classList.toggle('open');
            if (qt.classList.contains('open')) $('qti-' + btn.dataset.pod).focus();
        });
    });
    // Quick task enter key
    FLEET.forEach(p => {
        const input = $('qti-' + p.pod_id);
        if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') sendQuickTask(p.pod_id) });
    });
}

function sendQuickTask(podId) {
    const input = $('qti-' + podId);
    const text = input.value.trim(); if (!text) return;
    input.value = '';
    const pod = getPod(podId);
    const target = pod.agents.find(a => a.id !== 'nexus' && a.status !== 'error') || pod.agents[1];
    addFleetFeedEntry(pod, `${pod.head_node.codename} delegated to ${target.name}: "${text}"`, ts());
    addAlert('info', pod, `Quick task sent → ${target.name}`);
    $('qt-' + podId).classList.remove('open');
}

// Fleet Activity Feed
function addFleetFeedEntry(pod, msg, time) {
    fleetFeed.unshift({ pod_id: pod.pod_id, codename: pod.head_node.codename, accent: pod.head_node.accent, msg, time });
    if (fleetFeed.length > 50) fleetFeed.pop();
    if (currentView === 'fleet') renderFleetFeed();
}

function renderFeedFilters() {
    const filters = [{ label: 'All Pods', val: 'all' }, ...FLEET.map(p => ({ label: p.head_node.codename, val: p.pod_id }))];
    $('feedFilters').innerHTML = filters.map(f => `<button class="feed-filter ${fleetFeedFilter === f.val ? 'active' : ''}" data-f="${f.val}">${f.label}</button>`).join('');
    $('feedFilters').querySelectorAll('.feed-filter').forEach(btn => {
        btn.addEventListener('click', () => { fleetFeedFilter = btn.dataset.f; renderFeedFilters(); renderFleetFeed() });
    });
}

function renderFleetFeed() {
    const filtered = fleetFeedFilter === 'all' ? fleetFeed : fleetFeed.filter(e => e.pod_id === fleetFeedFilter);
    $('fleetFeed').innerHTML = filtered.slice(0, 30).map(e => `<div class="feed-entry">
    <span class="feed-pod-tag" style="background:${e.accent}18;color:${e.accent}">${e.codename}</span>
    <span class="feed-msg">${esc(e.msg)}</span>
    <span class="feed-ts">${e.time}</span>
  </div>`).join('');
}

// ─── POD VIEW ──────────────────────────────────────────────────────────────
function renderPodView(podId) {
    const pod = getPod(podId); if (!pod) return;
    const st = podState[podId];
    const hn = pod.head_node;
    // Breadcrumb
    $('pvBcPod').textContent = pod.pod_name;
    $('pvBcPod').style.color = hn.accent;
    // Head node
    $('headAvatar').textContent = hn.codename;
    $('headAvatar').style.borderColor = hn.accent;
    $('headAvatar').style.color = hn.accent;
    $('headName').textContent = hn.codename;
    $('headName').style.color = hn.accent;
    // Meta
    $('pvMeta').innerHTML = `
    <div class="pv-meta"><span>UPTIME</span><span class="val" id="pvUptime">${fmt(pod.uptime)}</span></div>
    <div class="pv-meta"><span>AGENTS</span><span class="val">${pod.agents.length}</span></div>
    <div class="pv-meta"><span>MCP</span><span class="val">${pod.mcp}</span></div>
    <div class="pv-meta"><span>TASKS</span><span class="val" id="pvTasksDone">${pod.tasks_today}</span></div>`;
    // Dependencies
    const deps = pod.dependencies;
    if (deps.receives_from.length || deps.sends_to.length) {
        $('pvDepBar').style.display = 'flex';
        let html = '';
        deps.receives_from.forEach(id => { const dp = getPod(id); if (dp) html += `<span>📥 Receiving from <span class="dep-pod" style="color:${dp.head_node.accent}">${dp.head_node.codename}</span></span>` });
        deps.sends_to.forEach(id => { const dp = getPod(id); if (dp) html += `<span>📤 Sending to <span class="dep-pod" style="color:${dp.head_node.accent}">${dp.head_node.codename}</span></span>` });
        $('pvDepBar').innerHTML = html;
    } else $('pvDepBar').style.display = 'none';
    // Render sub-sections
    renderRoster(pod);
    renderCommsFilters(pod);
    renderCommsLog(pod);
    renderAccom(pod);
    renderSched(pod);
    populateAgentSelector(pod);
    // Restore chat history
    const ch = $('chatHistory');
    ch.innerHTML = `<div class="chat-msg head"><div class="msg-label">${hn.codename}</div>Pod initialized. All agents ready. Awaiting directive.</div>`;
    st.chatHistory.forEach(m => {
        const div = document.createElement('div'); div.className = `chat-msg ${m.type}`;
        if (m.label) div.innerHTML = `<div class="msg-label">${m.label}</div>${esc(m.text)}`;
        else div.textContent = m.text; ch.appendChild(div);
    });
    ch.scrollTop = ch.scrollHeight;
}

// -- Roster
function renderRoster(pod) {
    const st = podState[pod.pod_id];
    $('rosterList').innerHTML = pod.agents.filter(a => a.id !== 'nexus').map(a => `
    <div class="agent-row ${st.selectedAgent === a.id ? 'selected' : ''}" data-id="${a.id}">
      <div class="agent-row-top"><div><span class="agent-name">${a.name}</span><span class="agent-role"> · ${a.role}</span></div><span class="agent-dot ${a.status}"></span></div>
      <div class="agent-task">${a.task}</div>
      <div class="agent-progress"><div class="agent-progress-bar" style="width:${a.progress}%;background:${a.color}"></div></div>
    </div>`).join('');
    $('rosterList').querySelectorAll('.agent-row').forEach(row => {
        row.addEventListener('click', () => {
            st.selectedAgent = st.selectedAgent === row.dataset.id ? null : row.dataset.id;
            renderRoster(pod); renderCommsLog(pod);
        });
    });
}

// -- Comms
function renderCommsFilters(pod) {
    const st = podState[pod.pod_id];
    const filters = ['All', 'Head Only', ...pod.agents.filter(a => a.id !== 'nexus').map(a => a.name)];
    const c = $('commsFilters');
    c.innerHTML = filters.map(f => {
        const val = f === 'All' ? 'all' : f === 'Head Only' ? 'head' : f;
        return `<button class="comms-filter ${st.commsFilter === val ? 'active' : ''}" data-f="${val}">${f}</button>`;
    }).join('');
    c.querySelectorAll('.comms-filter').forEach(btn => {
        btn.addEventListener('click', () => { st.commsFilter = btn.dataset.f; st.selectedAgent = null; renderRoster(pod); renderCommsFilters(pod); renderCommsLog(pod) });
    });
}

function renderCommsLog(pod) {
    const st = podState[pod.pod_id];
    const headName = pod.head_node.codename;
    let filtered = pod.logs;
    if (st.selectedAgent) { const a = pod.agents.find(x => x.id === st.selectedAgent); if (a) filtered = pod.logs.filter(l => l.from === a.name || l.to === a.name) }
    else if (st.commsFilter === 'head') filtered = pod.logs.filter(l => l.from === headName || l.to === headName);
    else if (st.commsFilter !== 'all') filtered = pod.logs.filter(l => l.from === st.commsFilter || l.to === st.commsFilter);
    $('commsLog').innerHTML = filtered.map(l => `<div class="log-entry ${l.type}">
    <span class="log-ts">${l.time}</span>
    <span class="log-route"><span style="color:${getAgentColor(pod, l.from)}">${l.from}</span> → <span style="color:${getAgentColor(pod, l.to)}">${l.to}</span></span>
    <span class="log-msg">${esc(l.msg)}</span>
  </div>`).join('');
    $('commsLog').scrollTop = $('commsLog').scrollHeight;
}

function addPodLog(pod, from, to, msg, type = 'report') {
    pod.logs.push({ time: ts(), from, to, msg, type });
    if (currentView === 'pod' && activePodId === pod.pod_id) renderCommsLog(pod);
    addFleetFeedEntry(pod, `${from} → ${to}: ${msg}`, ts());
}

// -- Accomplishments
function renderAccom(pod) {
    $('accomList').innerHTML = pod.accomplishments.map(a => `
    <div class="accom-item"><div class="accom-top"><span class="accom-ts">${a.time}</span><span class="accom-agent">${a.agent}</span></div>
    <div class="accom-desc"><span class="accom-icon">${a.icon}</span>${esc(a.desc)}</div>
    <div class="accom-detail">${esc(a.detail)}</div></div>`).join('');
    $('accomList').querySelectorAll('.accom-item').forEach(i => i.addEventListener('click', () => i.classList.toggle('expanded')));
}

// -- Scheduler
function renderSched(pod) {
    let html = '', cur = '';
    pod.schedule.forEach(s => {
        if (s.day !== cur) { cur = s.day; html += `<div class="sched-day-label">${s.day}</div>` }
        html += `<div class="sched-item"><span class="sched-time">${s.time}</span><span class="sched-desc">${esc(s.desc)}</span><span class="sched-agent">${s.agent}</span><span class="sched-status ${s.status}">${s.status}</span></div>`;
    });
    $('schedList').innerHTML = html;
}

function populateAgentSelector(pod) {
    $('newTaskAgent').innerHTML = pod.agents.filter(a => a.id !== 'nexus').map(a => `<option value="${a.name}">${a.name}</option>`).join('');
}

// -- Chat
function handleChatSend() {
    const pod = getPod(activePodId); if (!pod) return;
    const text = $('chatInput').value.trim(); if (!text) return;
    $('chatInput').value = '';
    const st = podState[pod.pod_id];
    const hn = pod.head_node.codename;
    // Check @mention
    const mentionMatch = text.match(/@(\w+)\s+(.+)/);
    if (mentionMatch) {
        const target = mentionMatch[1].toUpperCase();
        const instruction = mentionMatch[2];
        const targetPod = FLEET.find(p => p.head_node.codename === target);
        if (targetPod) {
            appendChat(pod, 'user', 'YOU', text);
            setTimeout(() => {
                appendChat(pod, 'head', hn, `Cross-pod request routed to ${target}.`);
                addPodLog(pod, hn, target, `Cross-pod: ${instruction}`, 'delegate');
                addPodLog(targetPod, hn, target, instruction, 'delegate');
                addAlert('info', pod, `Cross-pod task sent to ${target}`);
            }, 800);
            return;
        }
    }
    appendChat(pod, 'user', 'YOU', text);
    const map = pod.delegation_map;
    const match = map.find(d => d.match.test(text)) || { agent: pod.agents[1].name, ack: 'Directive received. Analyzing.', del: 'Execute directive.' };
    const targetAgent = pod.agents.find(a => a.name === match.agent) || pod.agents[1];
    setTimeout(() => { appendChat(pod, 'head', hn, match.ack); $('headStatus').textContent = '● PROCESSING DIRECTIVE' }, 600);
    setTimeout(() => {
        appendChat(pod, 'delegate', '', `→ Assigned to ${targetAgent.name}`);
        addPodLog(pod, hn, targetAgent.name, match.del, 'delegate');
        $('headStatus').textContent = '● ONLINE — AWAITING ORDERS';
        targetAgent.status = 'active'; targetAgent.task = text.length > 40 ? text.slice(0, 40) + '…' : text; targetAgent.progress = 5;
        if (currentView === 'pod') renderRoster(pod);
        simulateAgentWork(pod, targetAgent, text);
    }, 1500);
}

function appendChat(pod, type, label, text) {
    const st = podState[pod.pod_id];
    st.chatHistory.push({ type, label, text });
    if (currentView === 'pod' && activePodId === pod.pod_id) {
        const div = document.createElement('div'); div.className = `chat-msg ${type}`;
        if (label) div.innerHTML = `<div class="msg-label">${label}</div>${esc(text)}`;
        else div.textContent = text;
        $('chatHistory').appendChild(div); $('chatHistory').scrollTop = $('chatHistory').scrollHeight;
    }
}

function simulateAgentWork(pod, agent, taskDesc) {
    let prog = 10;
    const interval = setInterval(() => {
        prog += rnd(10, 20);
        if (prog >= 100) {
            prog = 100; clearInterval(interval);
            agent.progress = 100; agent.status = 'idle'; agent.task = 'Awaiting next task';
            addPodLog(pod, agent.name, pod.head_node.codename, `Task complete: "${taskDesc.slice(0, 50)}"`, 'report');
            pod.tasks_today++;
            pod.accomplishments.unshift({ time: ts(), agent: agent.name, desc: taskDesc.slice(0, 60), icon: '✅', detail: 'Task completed successfully.' });
            if (currentView === 'pod' && activePodId === pod.pod_id) { renderRoster(pod); renderAccom(pod); $('pvTasksDone').textContent = pod.tasks_today }
            addAlert('success', pod, `${agent.name} completed: ${taskDesc.slice(0, 40)}`);
        } else { agent.progress = prog; if (currentView === 'pod' && activePodId === pod.pod_id) renderRoster(pod) }
    }, 1200);
}

// ─── ORCHESTRATION ─────────────────────────────────────────────────────────
function renderOrchestration() {
    renderBroadcastPods();
    renderPipeline();
    renderDepTracker();
}

function renderBroadcastPods() {
    $('broadcastPods').innerHTML = FLEET.map(p => `<button class="broadcast-pod" data-pod="${p.pod_id}"><span class="bp-dot" style="background:${p.head_node.accent}"></span>${p.head_node.codename}</button>`).join('');
    $('broadcastPods').querySelectorAll('.broadcast-pod').forEach(btn => {
        btn.addEventListener('click', () => btn.classList.toggle('selected'));
    });
}

function renderPipeline() {
    $('pipelineSteps').innerHTML = PIPELINES[0].steps.map((s, i) => {
        const pod = getPod(s.pod_id);
        return `<div class="pipe-step"><div class="pipe-avatar" style="background:${pod.head_node.accent}18;color:${pod.head_node.accent};border:1px solid ${pod.head_node.accent}">${pod.head_node.codename.slice(0, 2)}</div>
    <div class="pipe-info"><div class="pipe-pod-name" style="color:${pod.head_node.accent}">${pod.head_node.codename}</div><div class="pipe-instr">${s.instruction}</div></div>
    <span class="pipe-status ${s.status}">${s.status}</span></div>`;
    }).join('');
}

function renderDepTracker() {
    $('depTableBody').innerHTML = DEPENDENCIES.map(d => `<tr>
    <td class="dep-${d.status}">${d.waiting}</td>
    <td>${d.blocked}</td>
    <td>${d.task}</td>
  </tr>`).join('');
}

// ─── ALERT SYSTEM ──────────────────────────────────────────────────────────
function addAlert(type, pod, msg) {
    const icons = { error: '🔴', warning: '🟡', success: '🟢', info: '🔵' };
    const toast = document.createElement('div');
    toast.className = `alert-toast ${type}`;
    toast.innerHTML = `<span class="alert-toast-icon">${icons[type]}</span>
    <div class="alert-toast-body">
      <div class="alert-toast-head">${pod.head_node.codename} · ${ts()}</div>
      <div class="alert-toast-msg">${esc(msg)}</div>
    </div><button class="alert-dismiss" onclick="this.parentElement.remove()">×</button>`;
    $('alertStack').appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove() }, 6000);
}

// ─── EVENT LISTENERS ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Nav
    $('fleetBtn').addEventListener('click', () => switchView('fleet'));
    $('orchBtn').addEventListener('click', () => switchView('orchestration'));
    $('orchBack').addEventListener('click', () => switchView('fleet'));
    $('pvBack').addEventListener('click', () => switchView('fleet'));
    $('pvBcFleet').addEventListener('click', e => { e.preventDefault(); switchView('fleet') });
    // Pin
    $('navPin').addEventListener('click', () => { $('podNav').classList.toggle('pinned'); $('navPin').classList.toggle('pinned') });
    // Mobile toggle
    $('mobToggle').addEventListener('click', () => $('podNav').classList.toggle('pinned'));
    // Chat
    $('chatSend').addEventListener('click', handleChatSend);
    $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') handleChatSend() });
    // Scheduler
    $('addTaskBtn').addEventListener('click', () => $('addTaskForm').classList.toggle('open'));
    $('confirmTask').addEventListener('click', () => {
        const pod = getPod(activePodId); if (!pod) return;
        const time = $('newTaskTime').value || '12:00', desc = $('newTaskDesc').value.trim(), agent = $('newTaskAgent').value;
        if (!desc) return;
        pod.schedule.push({ day: 'Today', time, desc, agent, status: 'pending' });
        renderSched(pod); $('newTaskDesc').value = ''; $('addTaskForm').classList.remove('open');
        addPodLog(pod, 'USER', pod.head_node.codename, `Scheduled: "${desc}" → ${agent} at ${time}`, 'delegate');
    });
    // Pause in pod view
    $('pvPauseBtn').addEventListener('click', () => {
        const pod = getPod(activePodId); if (!pod) return;
        const st = podState[pod.pod_id]; st.isPaused = !st.isPaused;
        const pill = $('pvStatusPill'), lbl = $('pvStatusLabel');
        if (st.isPaused) { pill.className = 'pv-status-pill idle'; lbl.textContent = 'PAUSED'; $('pvPauseBtn').textContent = '▶ RESUME' }
        else { pill.className = 'pv-status-pill running'; lbl.textContent = 'RUNNING'; $('pvPauseBtn').textContent = '⏸ PAUSE' }
    });
    // Mobile tabs
    $('pvMobileTabs').querySelectorAll('.mob-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $('pvMobileTabs').querySelectorAll('.mob-tab').forEach(t => t.classList.remove('active')); tab.classList.add('active');
            document.querySelectorAll('.cc-panel').forEach(p => p.classList.remove('mobile-active'));
            $('panel' + capitalize(tab.dataset.tab)).classList.add('mobile-active');
        });
    });
    // Broadcast
    $('broadcastBtn').addEventListener('click', () => switchView('orchestration'));
    $('broadcastSendBtn').addEventListener('click', () => {
        const text = $('broadcastInput').value.trim(); if (!text) return;
        const selected = Array.from($('broadcastPods').querySelectorAll('.broadcast-pod.selected')).map(b => b.dataset.pod);
        if (!selected.length) { addAlert('warning', FLEET[0], 'Select at least one pod to broadcast.'); return }
        selected.forEach(pid => { const pod = getPod(pid); addPodLog(pod, 'BROADCAST', pod.head_node.codename, text, 'delegate'); addAlert('info', pod, 'Broadcast received') });
        $('broadcastInput').value = ''; $('broadcastPods').querySelectorAll('.broadcast-pod').forEach(b => b.classList.remove('selected'));
    });
    // Run pipeline
    $('runPipeBtn').addEventListener('click', () => {
        const pipe = PIPELINES[0];
        pipe.steps.forEach((s, i) => {
            setTimeout(() => {
                s.status = 'running'; renderPipeline();
                const pod = getPod(s.pod_id); addPodLog(pod, 'PIPELINE', pod.head_node.codename, s.instruction, 'delegate');
                setTimeout(() => { s.status = 'done'; renderPipeline(); addAlert('success', pod, `Pipeline step ${i + 1} complete`) }, rnd(2000, 4000));
            }, i * 3000);
        });
    });
    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.key === '0') switchView('fleet');
        else if (e.key >= '1' && e.key <= '9') { const idx = parseInt(e.key) - 1; if (FLEET[idx]) switchView('pod', FLEET[idx].pod_id) }
    });
    // Pause All / Resume All
    $('pauseAllBtn').addEventListener('click', () => { FLEET.forEach(p => p.status = 'idle'); renderFleet(); renderNavPods(); addAlert('warning', FLEET[0], 'All pods paused') });
    $('resumeAllBtn').addEventListener('click', () => { FLEET.forEach(p => p.status = 'active'); renderFleet(); renderNavPods(); addAlert('success', FLEET[0], 'All pods resumed') });
    // Settings
    $('pvSettingsBtn').addEventListener('click', () => addAlert('info', getPod(activePodId) || FLEET[0], 'Settings panel coming soon.'));
    // Launch
    $('launchPodBtn').addEventListener('click', () => addAlert('info', FLEET[0], 'Pod marketplace coming soon.'));
    // Pipe add step
    $('pipeAddBtn').addEventListener('click', () => {
        PIPELINES[0].steps.push({ pod_id: FLEET[rnd(0, FLEET.length - 1)].pod_id, instruction: 'New step — define instruction', output_key: null, status: 'idle' });
        renderPipeline();
    });

    // INIT
    renderNavPods();
    renderFleet();
    startSimulation();
    // Seed fleet feed
    FLEET.forEach(p => p.logs.forEach(l => fleetFeed.push({ pod_id: p.pod_id, codename: p.head_node.codename, accent: p.head_node.accent, msg: `${l.from} → ${l.to}: ${l.msg}`, time: l.time })));
    fleetFeed.sort((a, b) => b.time.localeCompare(a.time));
    renderFleetFeed();
});

// ─── SIMULATION ENGINE ─────────────────────────────────────────────────────
function startSimulation() {
    // Uptime tickers
    setInterval(() => {
        FLEET.forEach(p => { if (p.status === 'active') p.uptime++ });
        if (currentView === 'pod' && activePodId) { const el = $('pvUptime'); if (el) { const pod = getPod(activePodId); if (pod) el.textContent = fmt(pod.uptime) } }
    }, 1000);
    // Random comms per pod
    const simMsgs = [
        ['{hn}', '{a1}', 'Priority approved. Proceed.', 'delegate'],
        ['{a1}', '{hn}', 'Task progress update: {pct}% complete.', 'report'],
        ['{a2}', '{hn}', 'Output ready for review.', 'report'],
        ['{hn}', '{a2}', 'Acknowledged. Queueing next phase.', 'delegate'],
        ['{a1}', '{a2}', 'Need input on section 3.', 'report'],
        ['{a2}', '{a1}', 'Sending data now.', 'report'],
    ];
    FLEET.forEach(pod => {
        let idx = 0;
        setInterval(() => {
            if (pod.status !== 'active') return;
            const agents = pod.agents.filter(a => a.id !== 'nexus');
            if (agents.length < 2) return;
            const tpl = simMsgs[idx % simMsgs.length];
            const msg = tpl[2].replace('{pct}', rnd(30, 95));
            const from = tpl[0].replace('{hn}', pod.head_node.codename).replace('{a1}', agents[0].name).replace('{a2}', agents[1].name);
            const to = tpl[1].replace('{hn}', pod.head_node.codename).replace('{a1}', agents[0].name).replace('{a2}', agents[1].name);
            addPodLog(pod, from, to, msg, tpl[3]);
            idx++;
            // Progress tick
            agents.forEach(a => {
                if (a.status === 'active' && a.progress < 100) { a.progress = Math.min(100, a.progress + rnd(2, 8)); if (a.progress >= 100) { a.status = 'idle'; a.task = 'Awaiting next task' } }
            });
            if (currentView === 'pod' && activePodId === pod.pod_id) renderRoster(pod);
            pod.lastActivity = 0;
        }, rnd(5000, 9000));
    });
    // Last activity counter
    setInterval(() => { FLEET.forEach(p => p.lastActivity++); if (currentView === 'fleet') renderFleetGrid() }, 10000);
    // Random alerts
    setTimeout(() => { addAlert('warning', FLEET[1], 'TESTER-01: 2 edge-case failures detected') }, 8000);
    setTimeout(() => { addAlert('success', FLEET[2], 'CRAWLER-01: Source indexation batch complete') }, 15000);
}
