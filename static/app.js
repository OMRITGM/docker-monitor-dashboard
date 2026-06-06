// J.A.R.V.I.S. Core Javascript Control Module

// Settings & Global States
let ws = null;
let currentView = 'dashboard';
let containersData = [];
let selectedContainerId = '';
let logPollInterval = null;
let voiceEnabled = true;
let audioEnabled = true;
let logsBuffer = '';

// I18n & Speech custom preferences
let currentLanguage = localStorage.getItem('jarvis_lang') || 'en';
let voiceName = localStorage.getItem('jarvis_voice') || '';

// I18n Localization Dictionary
const TRANSLATIONS = {
    en: {
        modal_title: "COMMS ROUTE CHANNEL",
        modal_desc: "Route webhook alerts to N8N, Slack, or Discord endpoints when container cores fail.",
        modal_webhook_label: "RELAY WEBHOOK URL",
        modal_host_label: "DOCKER HOST URL (NAS / REMOTE)",
        modal_lang_label: "INTERFACE LANGUAGE",
        modal_voice_label: "J.A.R.V.I.S. SPEECH VOICE",
        modal_abort: "ABORT",
        modal_initiate: "INITIATE UPLINK",
        
        main_title: "SYSTEM DIAGNOSTICS HUD",
        secure_link: "SECURE LINK ESTABLISHED",
        system_status: "SYSTEM STATUS: ",
        btn_reconnect: "RECONNECT PROTOCOL",
        btn_comms_config: "COMMS CONFIG",
        
        stat_cores: "MONITORED CORES",
        stat_total_registry: "TOTAL REGISTRY",
        stat_active: "ACTIVE SUB-SYSTEMS",
        stat_online: "ONLINE",
        stat_offline_nodes: "OFFLINE NODES",
        stat_offline: "OFFLINE",
        stat_comms: "COMMS TRANSMITTER",
        stat_webhook_link: "WEBHOOK LINK",
        
        table_title: "VECTOR STREAM INDEX",
        th_node: "NODE ASSIGNMENT",
        th_status: "STATUS",
        th_vpu: "VPU LOAD",
        th_mem: "MEM UTILIZATION",
        th_net: "NET FLUX (IN/OUT)",
        th_actions: "COMMAND MATRIX",
        
        chart_title: "ANALYTICAL FLUX SENSORS",
        console_title: "SYSTEM DEBUG VECTOR",
        console_awaiting: "AWAITING COMPONENT TARGET",
        
        nav_dashboard: "SYSTEM HUD",
        nav_containers: "SUB-SYSTEMS",
        nav_webhooks: "COMMS LINK"
    },
    he: {
        modal_title: "ערוץ ניתוב תקשורת",
        modal_desc: "נתב התראות Webhook אל N8N, Slack, או Discord כאשר ליבות מכולה קורסות.",
        modal_webhook_label: "כתובת WEBHOOK ממסר",
        modal_host_label: "כתובת שרת DOCKER (NAS / מרוחק)",
        modal_lang_label: "שפת ממשק",
        modal_voice_label: "קול דיבור J.A.R.V.I.S.",
        modal_abort: "ביטול",
        modal_initiate: "אתחל תקשורת",
        
        main_title: "לוח בקרת דיאגנוסטיקה",
        secure_link: "ערוץ אבטחה פעיל",
        system_status: "מצב מערכת: ",
        btn_reconnect: "פרוטוקול התחברות",
        btn_comms_config: "הגדרות ערוץ",
        
        stat_cores: "ליבות במעקב",
        stat_total_registry: "רשם מכולות כולל",
        stat_active: "תתי-מערכות פעילות",
        stat_online: "פעיל",
        stat_offline_nodes: "צמתים לא מקוונים",
        stat_offline: "מנותק",
        stat_comms: "משדר התראות",
        stat_webhook_link: "חיבור WEBHOOK",
        
        table_title: "אינדקס זרם וקטורי",
        th_node: "צומת משויך",
        th_status: "סטטוס",
        th_vpu: "עומס מעבד (VPU)",
        th_mem: "ניצולת זיכרון",
        th_net: "תעבורת רשת (כניסה/יציאה)",
        th_actions: "מטריצת פקודות",
        
        chart_title: "חיישני שטף אנליטיים",
        console_title: "ערוץ דיבאג מערכת",
        console_awaiting: "ממתין לבחירת רכיב",
        
        nav_dashboard: "ממשק ראשי",
        nav_containers: "תתי-מערכות",
        nav_webhooks: "ערוץ תקשורת"
    }
};

function setLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) {
            // If it is a button or span, replace its text, but preserve icons
            const icon = el.querySelector('i');
            if (icon) {
                // Clear text nodes and insert text, keeping the icon
                const labelSpan = el.querySelector('span');
                if (labelSpan) {
                    labelSpan.textContent = TRANSLATIONS[lang][key];
                } else {
                    el.innerHTML = '';
                    el.appendChild(icon);
                    const textNode = document.createTextNode(' ' + TRANSLATIONS[lang][key]);
                    el.appendChild(textNode);
                }
            } else {
                el.textContent = TRANSLATIONS[lang][key];
            }
        }
    });
    
    // Toggle body class direction RTL/LTR
    if (lang === 'he') {
        document.body.classList.add('rtl-mode');
    } else {
        document.body.classList.remove('rtl-mode');
    }
}

// Populate browser Speech Synthesis voices dropdown
function populateVoiceList() {
    if (typeof speechSynthesis === 'undefined') return;
    
    const voices = speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('modal-voice-select');
    if (!voiceSelect) return;
    
    // Clear
    voiceSelect.innerHTML = '';
    
    voices.forEach(voice => {
        const option = document.createElement('option');
        option.textContent = `${voice.name} (${voice.lang})`;
        option.value = voice.name;
        
        if (voiceName === voice.name) {
            option.selected = true;
        } else if (!voiceName && voice.lang.startsWith('en') && (voice.name.includes('David') || voice.name.includes('Male') || voice.name.includes('Google US English'))) {
            option.selected = true;
            voiceName = voice.name;
        }
        
        voiceSelect.appendChild(option);
    });
}

if (typeof speechSynthesis !== 'undefined' && speechSynthesis.onvoiceschanged !== undefined) {
    speechSynthesis.onvoiceschanged = populateVoiceList;
}

// Charts references
let cpuChart = null;
let memChart = null;
let chartHistory = {}; // Key: containerId -> { cpu: [], mem: [], labels: [] }
const MAX_HISTORY_POINTS = 12;

// Web Audio API Synthesizer Context
let audioCtx = null;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Play Synthesized Sci-Fi Sound Effects (Web Audio API)
function playSfx(type) {
    if (!audioEnabled) return;
    try {
        initAudioContext();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        const now = audioCtx.currentTime;
        
        if (type === 'hover') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.05);
            gain.gain.setValueAtTime(0.02, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } 
        else if (type === 'click') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.setValueAtTime(900, now + 0.03);
            gain.gain.setValueAtTime(0.05, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } 
        else if (type === 'alert') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(400, now + 0.15);
            osc.frequency.linearRampToValueAtTime(100, now + 0.3);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        }
        else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, now); // C5
            osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
            osc.frequency.setValueAtTime(783.99, now + 0.12); // G5
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.linearRampToValueAtTime(0, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    } catch (e) {
        console.warn('Audio Context failed to play sound:', e);
    }
}

// JARVIS Speech System (Web Speech API)
function speak(text) {
    if (!voiceEnabled) return;
    try {
        window.speechSynthesis.cancel(); // Cancel active speech
        
        // Translate JARVIS alerts into Hebrew if selected
        if (currentLanguage === 'he') {
            if (text.includes("Uplink established")) text = "ערוץ תקשורת הופעל. זרימת הנתונים תקינה.";
            else if (text.includes("Warning. Subsystem offline")) text = "אזהרה. זוהה אירוע ירידת שרת מהרשת.";
            else if (text.includes("Subsystem initialized")) text = "תת-מערכת אותחלה בהצלחה.";
            else if (text.includes("Initiating")) {
                const action = text.split(" ")[1];
                const actHeb = action === "start" ? "הפעלה" : (action === "stop" ? "עצירה" : "אתחול מחדש");
                text = `מפעיל תהליך ${actHeb} עבור הרכיב הנבחר.`;
            }
            else if (text.includes("Diagnostics initiated")) text = "תהליך הדיאגנוסטיקה הופעל. כל הליבות מדווחות על פעילות תקינה.";
            else if (text.includes("Handshake successful")) text = "לחיצת היד הושלמה בהצלחה. מאזין לשרת מרוחק.";
            else if (text.includes("Warning. Host gateway offline")) text = "אזהרה. שרת היעד אינו זמין. עובר למצב סימולציה.";
            else if (text.includes("Configuration saved")) text = "ההגדרות נשמרו בהצלחה.";
            else if (text.includes("Transmission error")) text = "שגיאת שידור בחיבור לשרת ה-Backend.";
            else if (text.includes("System parameters modified")) text = "פרמטרי מערכת שונו. יוצר חיבור חדש.";
            else if (text.includes("Voice synthesizer active")) text = "סינתזת קול מופעלת.";
        }

        const utterance = new SpeechSynthesisUtterance(text);
        
        if (voiceName) {
            const voices = window.speechSynthesis.getVoices();
            const voiceObj = voices.find(v => v.name === voiceName);
            if (voiceObj) {
                utterance.voice = voiceObj;
                utterance.lang = voiceObj.lang;
            }
        } else {
            const voices = window.speechSynthesis.getVoices();
            let selectedVoice = voices.find(v => v.lang.startsWith(currentLanguage === 'he' ? 'he' : 'en'));
            if (selectedVoice) {
                utterance.voice = selectedVoice;
                utterance.lang = selectedVoice.lang;
            }
        }
        
        utterance.pitch = 0.85; // Slightly deeper, masculine voice
        utterance.rate = 1.05;  // Crisp, quick speech
        utterance.volume = 0.8;
        
        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('Speech synthesis failed:', e);
    }
}

// Ensure voices are loaded (Chrome loads them asynchronously)
window.speechSynthesis.onvoiceschanged = () => {
    populateVoiceList();
};

// Toast Notification System
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = 'ph-info';
    if (type === 'success') icon = 'ph-check-circle';
    if (type === 'error') icon = 'ph-warning-octagon';
    
    toast.innerHTML = `
        <i class="ph-bold ${icon}"></i>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${message}</p>
        </div>
    `;
    
    container.appendChild(toast);
    playSfx(type === 'error' ? 'alert' : 'click');
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Navigation between views
function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const views = document.querySelectorAll('.view-pane');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            playSfx('click');
            
            const targetId = item.getAttribute('href').substring(1);
            currentView = targetId;
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            views.forEach(view => {
                if (view.id === `view-${targetId}`) {
                    view.classList.remove('hidden');
                } else {
                    view.classList.add('hidden');
                }
            });
            
            // Update page title
            const titles = {
                en: {
                    'dashboard': 'SYSTEM DIAGNOSTICS HUD',
                    'containers': 'SUB-SYSTEM REGISTRY',
                    'webhooks': 'TELEMETRY BROADCASTER LINK'
                },
                he: {
                    'dashboard': 'לוח בקרת דיאגנוסטיקה',
                    'containers': 'אינדקס זרם וקטורי',
                    'webhooks': 'קישור שידור התראות'
                }
            };
            const activeTitle = (titles[currentLanguage] && titles[currentLanguage][targetId]) || titles['en'][targetId] || 'J.A.R.V.I.S.';
            const titleEl = document.getElementById('page-title');
            if (titleEl) {
                titleEl.textContent = activeTitle;
            }
        });
    });
}

// Websocket Connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/metrics`;
    
    document.getElementById('mode-text').textContent = 'CONNECTING UPLINK...';
    document.getElementById('mode-dot').className = 'pulse-dot';
    
    if (ws) {
        ws.close();
    }
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        showToast('Uplink Established', 'J.A.R.V.I.S. is connected to the core stream.', 'success');
        speak("Uplink established. All metrics streams online.");
        document.getElementById('mode-dot').className = 'pulse-dot running';
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            containersData = data.containers;
            
            // Set mock vs live mode text
            const modeText = data.is_mock ? 'SIMULATION CORE (MOCK)' : 'DOCKER SYSTEM LINKED';
            document.getElementById('mode-text').textContent = modeText;
            document.getElementById('mode-dot').className = data.is_mock ? 'pulse-dot mock' : 'pulse-dot running';
            
            updateMetricsSummary();
            renderContainersTable();
            updateChartsSelect();
            updateLiveCharts();
        } catch (e) {
            console.error('Failed to parse WebSocket data:', e);
        }
    };
    
    ws.onerror = (err) => {
        console.error('WS Error:', err);
    };
    
    ws.onclose = () => {
        document.getElementById('mode-text').textContent = 'UPLINK OFFLINE';
        document.getElementById('mode-dot').className = 'pulse-dot';
        document.getElementById('sys-status-text').textContent = 'OFFLINE';
        document.getElementById('sys-status-text').className = 'status-error';
        
        showToast('Uplink Offline', 'Uplink was terminated. Attempting reconnect...', 'error');
        
        // Reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
    };
}

// Update Dashboard Stat Cards
let lastRunningCount = -1;
function updateMetricsSummary() {
    const total = containersData.length;
    const running = containersData.filter(c => c.status === 'running').length;
    const stopped = total - running;
    
    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-running').textContent = running;
    document.getElementById('stat-stopped').textContent = stopped;
    
    // Status text details
    const statusText = document.getElementById('sys-status-text');
    const reactorBody = document.body;
    
    // Preserve status classes on body correctly without resetting rtl-mode
    reactorBody.classList.remove('status-warning', 'status-error');
    
    if (stopped > 0 && running > 0) {
        statusText.textContent = currentLanguage === 'he' ? 'מוגבל' : 'DEGRADED';
        statusText.className = 'status-warning';
        reactorBody.classList.add('status-warning');
    } else if (running === 0 && total > 0) {
        statusText.textContent = currentLanguage === 'he' ? 'קריטי' : 'CRITICAL';
        statusText.className = 'status-error';
        reactorBody.classList.add('status-error');
    } else {
        statusText.textContent = currentLanguage === 'he' ? 'תקין' : 'NOMINAL';
        statusText.className = 'status-ok';
    }

    // Voice triggers for status change detection
    if (lastRunningCount !== -1 && lastRunningCount !== running) {
        if (running < lastRunningCount) {
            speak(`Warning. Subsystem offline event detected.`);
        } else if (running > lastRunningCount) {
            speak(`Subsystem initialized successfully.`);
        }
    }
    lastRunningCount = running;
}

// Render Container Table
function renderContainersTable() {
    const tbody = document.getElementById('containers-tbody');
    const searchVal = document.getElementById('search-input').value.toLowerCase();
    
    const filtered = containersData.filter(c => 
        c.name.toLowerCase().includes(searchVal) || 
        c.image.toLowerCase().includes(searchVal)
    );
    
    if (filtered.length === 0) {
        tbody.innerHTML = `
            <tr class="placeholder-row">
                <td colspan="6" style="text-align: center; color: var(--text-hud-muted);">
                    NO MATCHING CHANNELS DETECTED
                </td>
            </tr>
        `;
        return;
    }
    
    let html = '';
    filtered.forEach(c => {
        const isRunning = c.status === 'running';
        const badgeClass = isRunning ? 'badge-running' : 'badge-stopped';
        
        // Action buttons based on state
        const actionBtn = isRunning ? `
            <button class="btn-action btn-stop" onclick="triggerAction('${c.id}', 'stop')" title="Terminate core">
                <i class="ph ph-stop"></i>
            </button>
        ` : `
            <button class="btn-action btn-start" onclick="triggerAction('${c.id}', 'start')" title="Initialize core">
                <i class="ph ph-play"></i>
            </button>
        `;
        
        html += `
            <tr class="${selectedContainerId === c.id ? 'active-row' : ''}">
                <td>
                    <div class="container-info">
                        <button class="container-name-btn" onclick="selectContainer('${c.id}', '${c.name}')">
                            ${c.name}
                        </button>
                        <span class="container-image">${c.image}</span>
                    </div>
                </td>
                <td>
                    <span class="badge ${badgeClass}">
                        <span class="status-dot"></span>
                        ${c.status.toUpperCase()}
                    </span>
                </td>
                <td class="hud-mono-val">${isRunning ? c.cpu_percent + '%' : '0.00%'}</td>
                <td class="hud-mono-val">
                    ${isRunning ? `${c.mem_usage_mb} MB / ${c.mem_limit_mb} MB (${c.mem_percent}%)` : '0.0 MB'}
                </td>
                <td class="hud-mono-val">
                    <span class="text-green"><i class="ph ph-arrow-down"></i> ${isRunning ? c.net_input_kb : '0.0'} KB</span> | 
                    <span class="text-orange"><i class="ph ph-arrow-up"></i> ${isRunning ? c.net_output_kb : '0.0'} KB</span>
                </td>
                <td>
                    <div class="actions-cell">
                        ${actionBtn}
                        <button class="btn-action btn-restart" onclick="triggerAction('${c.id}', 'restart')" title="Reboot core">
                            <i class="ph ph-arrows-clockwise"></i>
                        </button>
                        <button class="btn-action btn-logs" onclick="selectContainer('${c.id}', '${c.name}')" title="Inspect Telemetry Buffer">
                            <i class="ph ph-terminal"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

// Select Container for Logs and Charts
function selectContainer(id, name) {
    playSfx('click');
    selectedContainerId = id;
    document.getElementById('selected-log-container-name').textContent = name.toUpperCase();
    
    // Highlight table row
    renderContainersTable();
    
    // Switch chart selector
    const selector = document.getElementById('chart-container-select');
    selector.value = id;
    
    // Clear and fetch logs
    document.getElementById('logs-output').textContent = `INITIALIZING TELEMETRY PIPELINE FOR [${name.toUpperCase()}]...\n`;
    fetchLogs(id);
    
    // Start continuous log polling
    if (logPollInterval) {
        clearInterval(logPollInterval);
    }
    logPollInterval = setInterval(() => fetchLogs(id), 2500);
}

// Fetch Logs API
function fetchLogs(id) {
    fetch(`/api/containers/${id}/logs`)
        .then(res => {
            if (!res.ok) throw new Error('Failed to load logs');
            return res.json();
        })
        .then(data => {
            const consoleOutput = document.getElementById('logs-output');
            if (data.logs.trim() === '') {
                consoleOutput.textContent = '--- telemetry buffer is empty ---';
            } else {
                consoleOutput.textContent = data.logs;
                // Auto scroll
                consoleOutput.scrollTop = consoleOutput.scrollHeight;
            }
        })
        .catch(err => {
            console.error('Error fetching logs:', err);
        });
}

// Send Actions start/stop/restart
function triggerAction(id, action) {
    event.stopPropagation();
    playSfx('click');
    speak(`Initiating ${action} sequence.`);
    
    fetch(`/api/containers/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Protocol Executed', `Container command ${action} initiated.`, 'success');
            // Refresh logs if active
            if (selectedContainerId === id) {
                setTimeout(() => fetchLogs(id), 500);
            }
        } else {
            showToast('Protocol Failed', `Failed to execute ${action} protocol.`, 'error');
            speak(`Error. Command rejected.`);
        }
    })
    .catch(err => {
        showToast('Connection Error', 'REST API command failed.', 'error');
        speak(`Error. Target unreachable.`);
    });
}

// Populates dropdown box for charts selection
function updateChartsSelect() {
    const select = document.getElementById('chart-container-select');
    const currentVal = select.value;
    
    // If no selection yet, choose first running container automatically
    let selectedId = currentVal;
    if (!currentVal && containersData.length > 0) {
        const running = containersData.find(c => c.status === 'running');
        if (running) {
            selectedId = running.id;
            selectedContainerId = running.id;
            document.getElementById('selected-log-container-name').textContent = running.name.toUpperCase();
            // Start logs for this default
            selectContainer(running.id, running.name);
        }
    }
    
    // Re-fill options
    let html = '';
    containersData.forEach(c => {
        html += `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${c.name} [${c.status}]</option>`;
    });
    
    select.innerHTML = html;
}

// Update charts dataset history
function updateLiveCharts() {
    const select = document.getElementById('chart-container-select');
    const containerId = select.value;
    
    if (!containerId) return;
    
    const container = containersData.find(c => c.id === containerId);
    if (!container) return;
    
    // Initialize history store if empty
    if (!chartHistory[containerId]) {
        chartHistory[containerId] = {
            cpu: [],
            mem: [],
            labels: []
        };
    }
    
    const store = chartHistory[containerId];
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Append values
    store.labels.push(timeLabel);
    store.cpu.push(container.status === 'running' ? container.cpu_percent : 0.0);
    store.mem.push(container.status === 'running' ? container.mem_percent : 0.0);
    
    // Truncate size
    if (store.labels.length > MAX_HISTORY_POINTS) {
        store.labels.shift();
        store.cpu.shift();
        store.mem.shift();
    }
    
    // Update chart objects
    if (cpuChart && memChart) {
        cpuChart.data.labels = store.labels;
        cpuChart.data.datasets[0].data = store.cpu;
        cpuChart.update('none'); // Update without full animation for performance
        
        memChart.data.labels = store.labels;
        memChart.data.datasets[0].data = store.mem;
        memChart.update('none');
    }
}

// Initialize Chart.js HUD line charts
function initCharts() {
    const chartOptions = (label, color, maxVal = null) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(5, 12, 22, 0.95)',
                titleFont: { family: 'Orbitron', size: 10 },
                bodyFont: { family: 'Share Tech Mono', size: 12 },
                borderColor: color,
                borderWidth: 1
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(0, 229, 255, 0.03)' },
                ticks: { color: 'rgba(0, 229, 255, 0.6)', font: { family: 'Share Tech Mono', size: 9 } }
            },
            y: {
                min: 0,
                max: maxVal,
                grid: { color: 'rgba(0, 229, 255, 0.03)' },
                ticks: { color: 'rgba(0, 229, 255, 0.6)', font: { family: 'Share Tech Mono', size: 9 } }
            }
        }
    });

    const ctxCpu = document.getElementById('cpu-chart').getContext('2d');
    cpuChart = new Chart(ctxCpu, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#00e5ff',
                backgroundColor: 'rgba(0, 229, 255, 0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: chartOptions('CPU Load (%)', '#00e5ff', 100)
    });

    const ctxMem = document.getElementById('mem-chart').getContext('2d');
    memChart = new Chart(ctxMem, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#7c4dff',
                backgroundColor: 'rgba(124, 77, 255, 0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 0
            }]
        },
        options: chartOptions('MEM Load (%)', '#7c4dff', 100)
    });
}

// Fetch webhook config from backend
function fetchWebhookConfig() {
    fetch('/api/config')
        .then(res => res.json())
        .then(data => {
            const hasUrl = data.webhook_url && data.webhook_url.trim() !== '';
            
            // Update UI indicators
            const webhookStat = document.getElementById('stat-webhook');
            if (hasUrl) {
                webhookStat.textContent = 'ACTIVE';
                webhookStat.className = 'text-green';
            } else {
                webhookStat.textContent = 'OFFLINE';
                webhookStat.className = 'text-red';
            }
            
            // Populate inputs
            document.getElementById('webhook-url-input').value = data.webhook_url || '';
            document.getElementById('modal-webhook-input').value = data.webhook_url || '';
            document.getElementById('docker-host-input').value = data.docker_host || '';
            document.getElementById('modal-docker-host-input').value = data.docker_host || '';
        })
        .catch(err => console.error('Error fetching config:', err));
}

// Submit Webhook Config
function setupWebhookForm() {
    // Main form submission
    document.getElementById('webhook-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('webhook-url-input').value;
        const host = document.getElementById('docker-host-input').value;
        saveConfigData(url, host);
    });
    
    // Modal buttons
    document.getElementById('btn-modal-save').addEventListener('click', () => {
        const url = document.getElementById('modal-webhook-input').value;
        const host = document.getElementById('modal-docker-host-input').value;
        saveConfigData(url, host);
        closeModal();
    });
    
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    document.getElementById('btn-close-modal').addEventListener('click', closeModal);
}

function saveConfigData(url, dockerHost) {
    playSfx('success');
    
    // Parse language and voice selects
    const langSelect = document.getElementById('modal-lang-select');
    const voiceSelect = document.getElementById('modal-voice-select');
    
    if (langSelect) {
        const selectedLang = langSelect.value;
        localStorage.setItem('jarvis_lang', selectedLang);
        setLanguage(selectedLang);
    }
    if (voiceSelect) {
        const selectedVoice = voiceSelect.value;
        localStorage.setItem('jarvis_voice', selectedVoice);
        voiceName = selectedVoice;
    }
    
    speak("System parameters modified. Establishing handshake.");
    
    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: url, docker_host: dockerHost })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            if (data.docker_connected) {
                showToast(
                    currentLanguage === 'he' ? 'חיבור הופעל' : 'Uplink Established', 
                    currentLanguage === 'he' ? 'חיבור שרת Docker הוקם בהצלחה.' : 'Successfully linked to remote Docker host.', 
                    'success'
                );
                speak("Handshake successful. Monitoring live remote server nodes.");
            } else if (dockerHost.trim() !== '') {
                showToast(
                    currentLanguage === 'he' ? 'חיבור Docker נכשל' : 'Docker Link Failed', 
                    currentLanguage === 'he' ? `התחברות נכשלה: ${data.error_message || 'מכשיר היעד מנותק'}. חוזר למצב סימולציה.` : `Connection failed: ${data.error_message || 'Target host offline'}. Fallback to mock mode.`, 
                    'error'
                );
                speak("Warning. Host gateway offline. Initializing simulation fallback.");
            } else {
                showToast(
                    currentLanguage === 'he' ? 'הגדרות נשמרו' : 'Config Saved', 
                    currentLanguage === 'he' ? 'הגדרות מקומיות נשמרו בהצלחה.' : 'Local settings saved successfully.', 
                    'success'
                );
                speak("Configuration saved.");
            }
            fetchWebhookConfig();
        }
    })
    .catch(err => {
        showToast(
            currentLanguage === 'he' ? 'שגיאת הגדרה' : 'Config Error', 
            currentLanguage === 'he' ? 'שידור הנתונים נכשל.' : 'Failed to transmit parameters to core REST API.', 
            'error'
        );
        speak("Transmission error.");
    });
}

// Modal Toggle
function openModal() {
    playSfx('click');
    document.getElementById('settings-modal').classList.add('show');
}
function closeModal() {
    playSfx('click');
    document.getElementById('settings-modal').classList.remove('show');
}

// Setup Speech/Audio Toggles
function setupAudioToggles() {
    const voiceBtn = document.getElementById('btn-toggle-voice');
    const audioBtn = document.getElementById('btn-toggle-audio');
    
    voiceBtn.addEventListener('click', () => {
        voiceEnabled = !voiceEnabled;
        playSfx('click');
        if (voiceEnabled) {
            voiceBtn.classList.remove('muted');
            voiceBtn.querySelector('span').textContent = 'VOICE: ON';
            voiceBtn.querySelector('i').className = 'ph-bold ph-speaker-high';
            speak("Voice synthesizer active.");
        } else {
            voiceBtn.classList.add('muted');
            voiceBtn.querySelector('span').textContent = 'VOICE: OFF';
            voiceBtn.querySelector('i').className = 'ph-bold ph-speaker-x';
        }
    });
    
    audioBtn.addEventListener('click', () => {
        audioEnabled = !audioEnabled;
        playSfx('click');
        if (audioEnabled) {
            audioBtn.classList.remove('muted');
            audioBtn.querySelector('span').textContent = 'SFX: ON';
            audioBtn.querySelector('i').className = 'ph-bold ph-music-notes';
            playSfx('success');
        } else {
            audioBtn.classList.add('muted');
            audioBtn.querySelector('span').textContent = 'SFX: OFF';
            audioBtn.querySelector('i').className = 'ph-bold ph-music-notes-slash';
        }
    });
}

// Quick diagnostics when clicking the ARC Reactor core
function setupArcReactorInteractions() {
    const reactor = document.getElementById('arc-reactor');
    reactor.addEventListener('click', () => {
        playSfx('success');
        speak("Diagnostics initiated. All sub-system cores are reporting normal metrics telemetry.");
        showToast('HUD System Status', 'Telemetry diagnostics check initiated.', 'info');
    });
}

// Window Event Listeners Setup
window.addEventListener('DOMContentLoaded', () => {
    // Initial Setup
    setupNavigation();
    setupAudioToggles();
    setupWebhookForm();
    setupArcReactorInteractions();
    initCharts();
    
    // Apply saved I18n settings
    setLanguage(currentLanguage);
    const langSelect = document.getElementById('modal-lang-select');
    if (langSelect) {
        langSelect.value = currentLanguage;
    }
    
    // Load speech voices
    setTimeout(() => {
        populateVoiceList();
        if (voiceName) {
            const voiceSelect = document.getElementById('modal-voice-select');
            if (voiceSelect) voiceSelect.value = voiceName;
        }
    }, 500);
    
    // Connect Web Telemetry Streams
    connectWebSocket();
    fetchWebhookConfig();
    
    // Hook UI elements actions
    document.getElementById('btn-refresh').addEventListener('click', () => {
        playSfx('click');
        connectWebSocket();
    });
    
    document.getElementById('btn-open-settings').addEventListener('click', openModal);
    
    document.getElementById('btn-clear-logs').addEventListener('click', () => {
        playSfx('click');
        document.getElementById('logs-output').textContent = '--- buffer cleared ---';
    });
    
    // Trigger sound on metric change select
    document.getElementById('chart-container-select').addEventListener('change', (e) => {
        playSfx('click');
        const selectId = e.target.value;
        const contObj = containersData.find(c => c.id === selectId);
        if (contObj) {
            selectedContainerId = selectId;
            document.getElementById('selected-log-container-name').textContent = contObj.name.toUpperCase();
            selectContainer(selectId, contObj.name);
        }
    });
    
    // Search filter event
    document.getElementById('search-input').addEventListener('input', () => {
        renderContainersTable();
    });
});
