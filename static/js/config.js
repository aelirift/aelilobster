// Config functionality
const configForm = document.getElementById('configForm');
const minimaxApiKeyInput = document.getElementById('minimaxApiKey');
const openaiApiKeyInput = document.getElementById('openaiApiKey');
const defaultModelSelect = document.getElementById('defaultModel');
const statusMessage = document.getElementById('statusMessage');

// Load current config
async function loadConfig() {
    try {
        const response = await fetch('/config');
        const config = await response.json();
        
        // Set default model
        if (config.default_model) {
            defaultModelSelect.value = config.default_model;
        }
        
        // Show that API keys are configured (without revealing them)
        if (config.has_minimax_key) {
            minimaxApiKeyInput.placeholder = "•••••••••••• (configured)";
        }
        if (config.has_openai_key) {
            openaiApiKeyInput.placeholder = "•••••••••••• (configured)";
        }
    } catch (error) {
        showStatus('Failed to load configuration', 'error');
    }
}

// Save config
async function saveConfig(event) {
    event.preventDefault();
    
    const saveButton = configForm.querySelector('.save-button');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';
    
    try {
        const response = await fetch('/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                minimax_api_key: minimaxApiKeyInput.value || null,
                openai_api_key: openaiApiKeyInput.value || null,
                default_model: defaultModelSelect.value
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to save configuration');
        }
        
        showStatus('Settings saved successfully!', 'success');
        
        // Clear the API key fields after saving
        minimaxApiKeyInput.value = '';
        openaiApiKeyInput.value = '';
        
    } catch (error) {
        showStatus('Error: ' + error.message, 'error');
    }
    
    saveButton.disabled = false;
    saveButton.textContent = 'Save Settings';
}

// Show status message
function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = 'config-status ' + type;
    statusMessage.style.display = 'block';
    
    // Hide after 5 seconds
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

// Event listeners
configForm.addEventListener('submit', saveConfig);

// Load config on page load
loadConfig();
