// ═══════════════════════════════════════════════════════════════════════════
// Agents Marketplace — agents.js
// ═══════════════════════════════════════════════════════════════════════════

const API = '/api/agents';

// ── Category color map ──────────────────────────────────────────────────────
const CAT_COLORS = {
    'Social Media': '#e94560',
    'Development': '#42a5f5',
    'Research': '#66bb6a',
    'E-Commerce': '#ff7043',
    'Finance': '#ffc107',
    'Operations': '#ab47bc',
    'Community': '#26c6da',
};
const CATEGORIES = ['All', ...Object.keys(CAT_COLORS)];

// ── Seed pods ───────────────────────────────────────────────────────────────
const SEED_PODS = [
    {
        id: 'social-content-team',
        name: 'Social Media Content Team',
        category: 'Social Media',
        badge: 'popular',
        description: 'Full-stack social media management — content creation, scheduling, analytics, and engagement tracking across all platforms.',
        agents: [
            { name: 'Content Writer', color: '#e94560' },
            { name: 'Designer', color: '#ab47bc' },
            { name: 'Scheduler', color: '#42a5f5' },
            { name: 'Analyst', color: '#66bb6a' },
        ],
        mcpConnections: [
            { name: 'Twitter/X', icon: '𝕏', connected: false },
            { name: 'Instagram', icon: '📷', connected: false },
            { name: 'LinkedIn', icon: 'in', connected: false },
            { name: 'Buffer', icon: '🔄', connected: false },
        ],
        skills: ['Copywriting', 'Image Gen', 'Analytics', 'A/B Testing'],
        inputs: [
            { key: 'brand_voice', label: 'Brand Voice', type: 'textarea', placeholder: 'Describe your brand\'s tone and personality...' },
            { key: 'target_audience', label: 'Target Audience', type: 'text', placeholder: 'e.g. Small business owners, ages 28–45' },
        ],
    },
    {
        id: 'dev-ops-crew',
        name: 'DevOps Deployment Crew',
        category: 'Development',
        badge: 'official',
        description: 'Automated CI/CD pipelines, container orchestration, monitoring, and incident response all wired together.',
        agents: [
            { name: 'Build Agent', color: '#42a5f5' },
            { name: 'Deploy Agent', color: '#66bb6a' },
            { name: 'Monitor', color: '#ffc107' },
        ],
        mcpConnections: [
            { name: 'GitHub', icon: '🐙', connected: false },
            { name: 'Docker Hub', icon: '🐳', connected: false },
            { name: 'AWS', icon: '☁️', connected: false },
        ],
        skills: ['CI/CD', 'Kubernetes', 'Monitoring', 'Rollbacks'],
        inputs: [
            { key: 'repo_url', label: 'Repository URL', type: 'text', placeholder: 'https://github.com/your-org/your-repo' },
        ],
    },
    {
        id: 'research-analyst',
        name: 'Research & Analysis Pod',
        category: 'Research',
        badge: 'new',
        description: 'Deep-dive research with web scraping, summarization, fact-checking, and structured report generation.',
        agents: [
            { name: 'Researcher', color: '#66bb6a' },
            { name: 'Fact Checker', color: '#ffc107' },
            { name: 'Report Writer', color: '#42a5f5' },
        ],
        mcpConnections: [
            { name: 'Brave Search', icon: '🦁', connected: false },
            { name: 'Notion', icon: '📝', connected: false },
        ],
        skills: ['Web Scraping', 'Summarization', 'Citations', 'Reports'],
        inputs: [
            { key: 'research_topic', label: 'Research Topic', type: 'text', placeholder: 'e.g. Competitive landscape for EV charging stations' },
            { key: 'depth', label: 'Research Depth', type: 'text', placeholder: 'e.g. Surface / Detailed / Exhaustive' },
        ],
    },
    {
        id: 'ecommerce-ops',
        name: 'E-Commerce Operations',
        category: 'E-Commerce',
        badge: 'popular',
        description: 'Product listing optimization, inventory sync, pricing intelligence, and order management across marketplaces.',
        agents: [
            { name: 'Listing Agent', color: '#ff7043' },
            { name: 'Pricing Agent', color: '#ffc107' },
            { name: 'Inventory Sync', color: '#66bb6a' },
            { name: 'Order Manager', color: '#42a5f5' },
            { name: 'Review Agent', color: '#ab47bc' },
        ],
        mcpConnections: [
            { name: 'Shopify', icon: '🛍️', connected: false },
            { name: 'Amazon', icon: '📦', connected: false },
            { name: 'Stripe', icon: '💳', connected: false },
        ],
        skills: ['SEO', 'Pricing', 'Inventory', 'Reviews'],
        inputs: [
            { key: 'store_url', label: 'Store URL', type: 'text', placeholder: 'https://your-store.myshopify.com' },
        ],
    },
    {
        id: 'finance-advisor',
        name: 'Financial Analysis Team',
        category: 'Finance',
        badge: 'official',
        description: 'Real-time market data analysis, portfolio tracking, risk assessment, and automated reporting.',
        agents: [
            { name: 'Market Analyst', color: '#ffc107' },
            { name: 'Risk Assessor', color: '#e94560' },
            { name: 'Reporter', color: '#42a5f5' },
        ],
        mcpConnections: [
            { name: 'Bloomberg', icon: '📊', connected: false },
            { name: 'Plaid', icon: '🏦', connected: false },
        ],
        skills: ['Market Data', 'Risk Models', 'Forecasting', 'Compliance'],
        inputs: [
            { key: 'portfolio', label: 'Portfolio Focus', type: 'text', placeholder: 'e.g. Tech equities, crypto, bonds' },
        ],
    },
    {
        id: 'ops-automation',
        name: 'Operations Automation Hub',
        category: 'Operations',
        badge: 'community',
        description: 'Workflow automation, document processing, email triage, and internal tool orchestration.',
        agents: [
            { name: 'Workflow Bot', color: '#ab47bc' },
            { name: 'Doc Processor', color: '#42a5f5' },
            { name: 'Email Triage', color: '#66bb6a' },
        ],
        mcpConnections: [
            { name: 'Slack', icon: '💬', connected: false },
            { name: 'Google Drive', icon: '📁', connected: false },
            { name: 'Zapier', icon: '⚡', connected: false },
        ],
        skills: ['Automation', 'OCR', 'Routing', 'Notifications'],
        inputs: [
            { key: 'workspace', label: 'Workspace Name', type: 'text', placeholder: 'Your team or organization name' },
        ],
    },
    {
        id: 'code-review-pod',
        name: 'Code Review & QA Pod',
        category: 'Development',
        badge: 'new',
        description: 'Automated code reviews, security scanning, test generation, and merge-readiness checks.',
        agents: [
            { name: 'Reviewer', color: '#42a5f5' },
            { name: 'Security Scanner', color: '#e94560' },
            { name: 'Test Writer', color: '#66bb6a' },
        ],
        mcpConnections: [
            { name: 'GitHub', icon: '🐙', connected: false },
            { name: 'SonarQube', icon: '🔍', connected: false },
        ],
        skills: ['Linting', 'Security', 'Testing', 'PR Comments'],
        inputs: [
            { key: 'repo_url', label: 'Repository URL', type: 'text', placeholder: 'https://github.com/your-org/your-repo' },
            { key: 'lang', label: 'Primary Language', type: 'text', placeholder: 'e.g. Python, TypeScript, Go' },
        ],
    },
    {
        id: 'community-manager',
        name: 'Community Manager Pod',
        category: 'Community',
        badge: 'community',
        description: 'Discord and forum moderation, welcome flows, engagement tracking, and community health reporting.',
        agents: [
            { name: 'Moderator', color: '#26c6da' },
            { name: 'Welcomer', color: '#66bb6a' },
            { name: 'Analytics', color: '#ffc107' },
        ],
        mcpConnections: [
            { name: 'Discord', icon: '🎮', connected: false },
            { name: 'Discourse', icon: '💭', connected: false },
        ],
        skills: ['Moderation', 'Onboarding', 'Sentiment', 'Reports'],
        inputs: [
            { key: 'server_id', label: 'Discord Server ID', type: 'text', placeholder: 'e.g. 123456789012345678' },
        ],
    },
    {
        id: 'content-repurposing',
        name: 'Content Repurposing Engine',
        category: 'Social Media',
        badge: 'new',
        description: 'Turn one long-form piece into threads, reels scripts, newsletters, and carousel decks automatically.',
        agents: [
            { name: 'Splitter', color: '#e94560' },
            { name: 'Adapter', color: '#ab47bc' },
            { name: 'Publisher', color: '#42a5f5' },
        ],
        mcpConnections: [
            { name: 'YouTube', icon: '▶️', connected: false },
            { name: 'Medium', icon: '✍️', connected: false },
            { name: 'Canva', icon: '🎨', connected: false },
        ],
        skills: ['Summarization', 'Reformatting', 'Scheduling', 'Design'],
        inputs: [
            { key: 'content_source', label: 'Content Source URL', type: 'text', placeholder: 'Link to blog post, video, or article' },
        ],
    },
    {
        id: 'seo-backlink',
        name: 'SEO & Backlink Builder',
        category: 'E-Commerce',
        badge: 'official',
        description: 'Keyword research, on-page optimization, backlink prospecting, and rank tracking on autopilot.',
        agents: [
            { name: 'Keyword Agent', color: '#ff7043' },
            { name: 'On-Page Agent', color: '#66bb6a' },
            { name: 'Outreach Agent', color: '#42a5f5' },
        ],
        mcpConnections: [
            { name: 'Ahrefs', icon: '🔗', connected: false },
            { name: 'Google Search Console', icon: '🔎', connected: false },
        ],
        skills: ['Keywords', 'SERP Analysis', 'Link Building', 'Audits'],
        inputs: [
            { key: 'domain', label: 'Domain', type: 'text', placeholder: 'e.g. example.com' },
        ],
    },
    {
        id: 'data-pipeline',
        name: 'Data Pipeline Architect',
        category: 'Development',
        badge: 'popular',
        description: 'ETL pipeline design, data quality checks, schema management, and dashboard generation.',
        agents: [
            { name: 'Extractor', color: '#42a5f5' },
            { name: 'Transformer', color: '#ffc107' },
            { name: 'Loader', color: '#66bb6a' },
            { name: 'Dashboard Builder', color: '#ab47bc' },
        ],
        mcpConnections: [
            { name: 'PostgreSQL', icon: '🐘', connected: false },
            { name: 'BigQuery', icon: '📊', connected: false },
            { name: 'dbt', icon: '🔧', connected: false },
        ],
        skills: ['SQL', 'ETL', 'Data Quality', 'Visualization'],
        inputs: [
            { key: 'db_url', label: 'Database Connection', type: 'text', placeholder: 'postgresql://user:pass@host:5432/db' },
        ],
    },
    {
        id: 'compliance-pod',
        name: 'Compliance & Audit Bot',
        category: 'Finance',
        badge: 'community',
        description: 'Regulatory compliance checking, audit trail generation, and policy document management.',
        agents: [
            { name: 'Policy Agent', color: '#ffc107' },
            { name: 'Auditor', color: '#e94560' },
        ],
        mcpConnections: [
            { name: 'DocuSign', icon: '📄', connected: false },
        ],
        skills: ['Compliance', 'Auditing', 'Documentation'],
        inputs: [
            { key: 'industry', label: 'Industry', type: 'text', placeholder: 'e.g. Healthcare, Finance, SaaS' },
        ],
    },
];

// ── State ───────────────────────────────────────────────────────────────────
let pods = [...SEED_PODS];
let activeFilter = 'All';
let searchQuery = '';
let sortMode = 'popular';
let drawerPod = null;
let drawerInputs = {};

// ── DOM refs ────────────────────────────────────────────────────────────────
const filterRow = document.getElementById('filterRow');
const cardGrid = document.getElementById('cardGrid');
const resultCount = document.getElementById('resultCount');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const noResults = document.getElementById('noResults');
const drawerOverlay = document.getElementById('drawerOverlay');
const drawer = document.getElementById('drawer');
const drawerIcon = document.getElementById('drawerIcon');
const drawerTitle = document.getElementById('drawerTitle');
const drawerBody = document.getElementById('drawerBody');
const drawerClose = document.getElementById('drawerClose');
const launchBtn = document.getElementById('launchBtn');
const launchLabel = document.getElementById('launchLabel');
const toast = document.getElementById('toast');
const clearBtn = document.getElementById('clearFiltersBtn');

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    renderFilters();
    render();

    searchInput.addEventListener('input', e => { searchQuery = e.target.value.toLowerCase(); render(); });
    sortSelect.addEventListener('change', e => { sortMode = e.target.value; render(); });
    drawerClose.addEventListener('click', closeDrawer);
    drawerOverlay.addEventListener('click', closeDrawer);
    clearBtn.addEventListener('click', () => {
        searchQuery = ''; searchInput.value = '';
        activeFilter = 'All'; renderFilters(); render();
    });
});

// ── Filters ─────────────────────────────────────────────────────────────────
function renderFilters() {
    filterRow.innerHTML = CATEGORIES.map(c =>
        `<button class="filter-pill ${c === activeFilter ? 'active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
    filterRow.querySelectorAll('.filter-pill').forEach(btn => {
        btn.addEventListener('click', () => { activeFilter = btn.dataset.cat; renderFilters(); render(); });
    });
}

// ── Sorting & Filtering ─────────────────────────────────────────────────────
function getFilteredPods() {
    let list = pods.filter(p => {
        const matchCat = activeFilter === 'All' || p.category === activeFilter;
        const matchSearch = !searchQuery
            || p.name.toLowerCase().includes(searchQuery)
            || p.description.toLowerCase().includes(searchQuery)
            || p.skills.some(s => s.toLowerCase().includes(searchQuery))
            || p.category.toLowerCase().includes(searchQuery);
        return matchCat && matchSearch;
    });

    const badgeOrder = { popular: 0, official: 1, new: 2, community: 3 };
    if (sortMode === 'popular') list.sort((a, b) => (badgeOrder[a.badge] ?? 9) - (badgeOrder[b.badge] ?? 9));
    else if (sortMode === 'newest') list.sort((a, b) => (a.badge === 'new' ? -1 : 1));
    else if (sortMode === 'az') list.sort((a, b) => a.name.localeCompare(b.name));

    return list;
}

// ── Render cards ────────────────────────────────────────────────────────────
function render() {
    const filtered = getFilteredPods();
    resultCount.textContent = `Showing ${filtered.length} Agent Pod${filtered.length !== 1 ? 's' : ''}`;

    // Remove old cards (keep noResults div)
    cardGrid.querySelectorAll('.pod-card').forEach(c => c.remove());

    if (filtered.length === 0) {
        noResults.classList.add('visible');
        return;
    }
    noResults.classList.remove('visible');

    filtered.forEach(pod => {
        const catColor = CAT_COLORS[pod.category] || '#e94560';
        const card = document.createElement('div');
        card.className = 'pod-card';
        card.innerHTML = `
            <div class="card-accent" style="background:${catColor}"></div>
            <div class="card-body">
                <div class="card-top">
                    <div class="pod-icon" style="background:${catColor}22;color:${catColor}">${pod.agents[0]?.name?.[0] || '?'}</div>
                    <div class="card-top-right">
                        <span class="status-badge badge-${pod.badge}">● ${capitalize(pod.badge)}</span>
                    </div>
                </div>
                <p class="pod-name">${esc(pod.name)}</p>
                <p class="pod-desc">${esc(pod.description)}</p>
                <hr class="card-divider">
                <div>
                    <div class="card-section-label">Agents in this Pod</div>
                    <div class="agent-chips">
                        ${pod.agents.slice(0, 3).map(a => `
                            <span class="agent-chip"><span class="agent-chip-dot" style="background:${a.color}"></span>${esc(a.name)}</span>
                        `).join('')}
                        ${pod.agents.length > 3 ? `<span class="agent-chip agent-chip-more">+${pod.agents.length - 3} more</span>` : ''}
                    </div>
                </div>
                <div>
                    <div class="card-section-label">MCP Connections</div>
                    <div class="mcp-row">
                        ${pod.mcpConnections.map(m => `<span class="mcp-icon" title="${esc(m.name)}">${m.icon}</span>`).join('')}
                    </div>
                </div>
                <div>
                    <div class="card-section-label">Skills</div>
                    <div class="skill-tags">
                        ${pod.skills.map(s => `<span class="skill-tag">${esc(s)}</span>`).join('')}
                    </div>
                </div>
            </div>
            <div class="card-footer">
                <span class="inputs-info needed">⚙ ${pod.inputs.length} input${pod.inputs.length !== 1 ? 's' : ''} required</span>
                <div class="card-actions">
                    <button class="btn-download" data-pod="${pod.id}">Download</button>
                    <button class="btn-connect" style="background:${catColor}" data-pod="${pod.id}">Connect & Launch</button>
                </div>
            </div>
        `;
        cardGrid.insertBefore(card, noResults);
    });

    // Bind buttons
    cardGrid.querySelectorAll('.btn-connect').forEach(btn => btn.addEventListener('click', () => openDrawer(btn.dataset.pod)));
    cardGrid.querySelectorAll('.btn-download').forEach(btn => btn.addEventListener('click', () => downloadPod(btn.dataset.pod)));
}

// ── Drawer ──────────────────────────────────────────────────────────────────
function openDrawer(podId) {
    drawerPod = pods.find(p => p.id === podId);
    if (!drawerPod) return;
    drawerInputs = {};

    const catColor = CAT_COLORS[drawerPod.category] || '#e94560';
    drawerIcon.style.background = catColor + '22';
    drawerIcon.style.color = catColor;
    drawerIcon.textContent = drawerPod.agents[0]?.name?.[0] || '?';
    drawerTitle.textContent = drawerPod.name;

    // Build body
    let html = '';

    // Required inputs
    if (drawerPod.inputs.length) {
        html += `<div class="drawer-section"><h4>Required Inputs</h4>`;
        drawerPod.inputs.forEach(inp => {
            const tag = inp.type === 'textarea'
                ? `<textarea id="dinput_${inp.key}" placeholder="${esc(inp.placeholder)}" data-key="${inp.key}"></textarea>`
                : `<input type="text" id="dinput_${inp.key}" placeholder="${esc(inp.placeholder)}" data-key="${inp.key}">`;
            html += `<div class="drawer-field"><label>${esc(inp.label)}</label>${tag}</div>`;
        });
        html += `</div>`;
    }

    // MCP connections
    html += `<div class="drawer-section"><h4>MCP Connections</h4>`;
    drawerPod.mcpConnections.forEach((m, i) => {
        html += `
            <div class="mcp-status-row" data-idx="${i}">
                <div class="mcp-status-left">
                    <span class="mcp-status-icon">${m.icon}</span>
                    <span>${esc(m.name)}</span>
                </div>
                ${m.connected
                ? `<span class="mcp-connected">✅ Connected</span>`
                : `<button class="mcp-authorize-btn" data-idx="${i}">🔗 Authorize</button>`
            }
            </div>
        `;
    });
    html += `</div>`;

    drawerBody.innerHTML = html;

    // Bind input tracking
    drawerBody.querySelectorAll('input[data-key], textarea[data-key]').forEach(el => {
        el.addEventListener('input', () => { drawerInputs[el.dataset.key] = el.value.trim(); updateLaunch(); });
    });

    // Bind MCP authorize
    drawerBody.querySelectorAll('.mcp-authorize-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            drawerPod.mcpConnections[idx].connected = true;
            btn.closest('.mcp-status-row').innerHTML = `
                <div class="mcp-status-left">
                    <span class="mcp-status-icon">${drawerPod.mcpConnections[idx].icon}</span>
                    <span>${esc(drawerPod.mcpConnections[idx].name)}</span>
                </div>
                <span class="mcp-connected">✅ Connected</span>
            `;
            updateLaunch();
        });
    });

    updateLaunch();
    drawerOverlay.classList.add('open');
    drawer.classList.add('open');
}

function closeDrawer() {
    drawerOverlay.classList.remove('open');
    drawer.classList.remove('open');
    drawerPod = null;
}

function updateLaunch() {
    if (!drawerPod) return;
    const allInputsFilled = drawerPod.inputs.every(inp => !!drawerInputs[inp.key]);
    const allMcpConnected = drawerPod.mcpConnections.every(m => m.connected);
    const ready = allInputsFilled && allMcpConnected;

    launchBtn.className = `btn-launch ${ready ? 'ready' : 'disabled'}`;
    launchBtn.onclick = ready ? launchPod : null;
}

async function launchPod() {
    launchBtn.className = 'btn-launch launching';
    launchLabel.textContent = '⏳ Initializing pod...';

    await sleep(800);
    launchLabel.textContent = '🔌 Connecting MCP servers...';
    await sleep(1000);
    launchLabel.textContent = '✅ Ready.';
    launchBtn.className = 'btn-launch ready';
    await sleep(600);

    // Save to backend
    try {
        await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: drawerPod.name,
                role: drawerPod.category.toLowerCase(),
                status: 'active',
                description: drawerPod.description,
            }),
        });
    } catch (e) { console.warn('Save failed:', e); }

    showToast(`🚀 ${drawerPod.name} is now running!`);
    closeDrawer();

    // Navigate to Command Center
    setTimeout(() => {
        location.href = `/command.html?pod=${encodeURIComponent(drawerPod.name)}`;
    }, 800);
}

// ── Download ────────────────────────────────────────────────────────────────
function downloadPod(podId) {
    const pod = pods.find(p => p.id === podId);
    if (!pod) return;

    const config = {
        version: '1.0',
        pod: {
            name: pod.name,
            category: pod.category,
            agents: pod.agents.map(a => ({ name: a.name })),
            mcp_connections: pod.mcpConnections.map(m => ({ name: m.name })),
            skills: pod.skills,
            inputs: pod.inputs.map(i => ({ key: i.key, label: i.label, type: i.type })),
        },
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${pod.id}.json`; a.click();
    URL.revokeObjectURL(url);

    showToast('Pod config downloaded — run with podman-compose up');
}

// ── Utilities ───────────────────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}
