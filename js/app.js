/**
 * MicroSense Mini 3 - Main Application Orchestrator
 * Avatar-first landing page with integrated chat and background scanning
 */

(function() {
'use strict';

// ============================================
// CONFIGURATION + PERSISTENCE
// ============================================
const STORAGE_KEY = 'ms3-settings';
const HISTORY_KEY = 'ms3-history';

const DEFAULTS = {
  theme: 'dark',
  avatarGender: 'female',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
  scanDuration: 33,
  ttsEnabled: true,
  ttsSpeed: 1.0,
  language: 'en',
};

let settings = loadSettings();
let scanHistory = loadHistory();

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...DEFAULTS, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULTS };
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(scanHistory.slice(0, 10)));
}

// ============================================
// TOAST
// ============================================
let toastTimer;
function showToast(msg, type) {
  type = type || 'info';
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ============================================
// THEME
// ============================================
function initTheme() { setTheme(settings.theme); }

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  settings.theme = theme;
  saveSettings();
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.setAttribute('aria-checked', theme === 'light' ? 'true' : 'false');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'light' ? '#f2f2f7' : '#0a0a1a';
}

function toggleTheme() {
  setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
}

// ============================================
// ENGINE INSTANCES
// ============================================
let threatEngine, deceptionEngine, neuroAnalyzer, voiceStressEngine;
let ollamaClient, therapyEngine, avatarEngine;
let cameraStream = null;
let audioStream = null;
let isScanning = false;
let scanTimer = null;
let scanStartTime = null;
let frameCount = 0;
let lastProfile = null;
let modelsLoaded = false;
let chatMessages = [];
let monitorInterval = null;
let lipSyncInterval = null;

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  initTheme();
  initNav();
  initChat();
  initGenderToggle();

  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Engines
  threatEngine = new ThreatEngine();
  deceptionEngine = new DeceptionEngine();
  neuroAnalyzer = new NeuroAnalyzer();
  voiceStressEngine = new VoiceStressEngine();
  therapyEngine = new TherapyEngine();
  ollamaClient = new OllamaClient(settings.ollamaUrl, settings.ollamaModel);

  // Avatar
  avatarEngine = new AvatarEngine();
  avatarEngine.setGender(settings.avatarGender);
  avatarEngine.init(document.getElementById('avatarCanvas'));

  // Sync gender toggle UI
  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.gender === settings.avatarGender);
  });

  // Rescan button
  document.getElementById('btnRescan').addEventListener('click', () => {
    triggerScan();
  });

  // Load face-api models
  await loadFaceModels();

  // Check Ollama (background)
  checkOllamaConnection();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Start greeting sequence after models are loaded
  startGreeting();
}

// ============================================
// FACE-API MODELS
// ============================================
async function loadFaceModels() {
  appendSystemMessage('Loading face detection models...');
  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    modelsLoaded = true;
  } catch (err) {
    console.error('Model load error:', err);
    appendSystemMessage('Face detection failed to load. Some features unavailable.');
  }
}

// ============================================
// CAMERA (Hidden)
// ============================================
async function startCamera() {
  if (cameraStream) return true;
  const video = document.getElementById('cameraVideo');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = cameraStream;
    await video.play();
    const overlay = document.getElementById('cameraOverlay');
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;
    return true;
  } catch (err) {
    console.error('Camera error:', err);
    return false;
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

// ============================================
// MICROPHONE
// ============================================
async function startMicrophone() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await voiceStressEngine.initAudioContext(audioStream);
    return true;
  } catch (err) {
    console.warn('Microphone denied:', err);
    return false;
  }
}

function stopMicrophone() {
  if (audioStream) {
    audioStream.getTracks().forEach(t => t.stop());
    audioStream = null;
  }
}

// ============================================
// GREETING SEQUENCE
// ============================================
function startGreeting() {
  // Step 1: Initial greeting
  setTimeout(() => {
    avatarSpeak("Hi! I'm MicroSense, your AI companion.");
    appendChatBubble('assistant', "Hi! I'm MicroSense, your AI companion. I can read your mental state and provide personalized therapeutic guidance.");
  }, 800);

  // Step 2: Trigger scan
  setTimeout(() => {
    if (modelsLoaded) {
      avatarSpeak("Let me read you...");
      appendChatBubble('assistant', "Let me take a look at you... Hold still for a moment.");
      setTimeout(() => triggerScan(), 1500);
    } else {
      appendChatBubble('assistant', "Feel free to chat with me anytime! I'm here to help.");
    }
  }, 4500);
}

// ============================================
// AVATAR SPEECH + LIP SYNC
// ============================================
function avatarSpeak(text) {
  // Show speech bubble
  const bubble = document.getElementById('avatarSpeech');
  bubble.textContent = text;
  bubble.classList.add('visible');

  // Hide after delay
  const hideDelay = Math.max(3000, text.length * 60);
  setTimeout(() => bubble.classList.remove('visible'), hideDelay);

  // TTS with lip sync
  if (settings.ttsEnabled && window.speechSynthesis) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = settings.ttsSpeed;
    utterance.pitch = 1.0;
    if (settings.language === 'ja') utterance.lang = 'ja-JP';
    else if (settings.language === 'zh') utterance.lang = 'zh-CN';
    else utterance.lang = 'en-US';

    utterance.onstart = () => {
      avatarEngine.setState('speaking');
      lipSyncInterval = setInterval(() => {
        avatarEngine.setMouthOpen(Math.random() * 0.5 + 0.15);
      }, 110);
    };

    utterance.onend = () => {
      clearInterval(lipSyncInterval);
      lipSyncInterval = null;
      avatarEngine.setMouthOpen(0);
      avatarEngine.setState('idle');
    };

    utterance.onerror = () => {
      clearInterval(lipSyncInterval);
      lipSyncInterval = null;
      avatarEngine.setMouthOpen(0);
      avatarEngine.setState('idle');
    };

    window.speechSynthesis.speak(utterance);
  }
}

// ============================================
// SCAN FLOW (Background)
// ============================================
async function triggerScan() {
  if (isScanning) return;
  if (!modelsLoaded) {
    showToast('Face detection not ready', 'error');
    return;
  }

  // Start camera
  const camOk = await startCamera();
  if (!camOk) {
    showToast('Camera access required for scanning', 'error');
    appendChatBubble('assistant', "I couldn't access your camera. Please allow camera access and try again.");
    return;
  }

  // Start microphone
  await startMicrophone();

  // Reset engines
  threatEngine = new ThreatEngine();
  deceptionEngine = new DeceptionEngine();

  isScanning = true;
  frameCount = 0;
  scanStartTime = Date.now();

  // Update UI
  avatarEngine.setState('scanning');
  avatarEngine.setScanProgress(0);
  document.getElementById('scanIndicator').classList.add('active');
  document.getElementById('scanIndicatorBar').style.width = '0%';
  document.getElementById('btnRescan').classList.remove('visible');
  document.getElementById('ollamaStatus').classList.add('scanning');

  // Detection loop
  detectLoop();

  // Countdown
  const duration = settings.scanDuration * 1000;
  scanTimer = setInterval(() => {
    const elapsed = Date.now() - scanStartTime;
    const remaining = Math.max(0, duration - elapsed);
    const progress = 1 - remaining / duration;

    // Update indicators
    document.getElementById('scanIndicatorBar').style.width = (progress * 100) + '%';
    document.getElementById('scanIndicatorText').textContent = Math.ceil(remaining / 1000) + 's';
    avatarEngine.setScanProgress(progress);

    if (remaining <= 0) {
      completeScan();
    }
  }, 200);
}

function stopScan() {
  isScanning = false;
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  document.getElementById('scanIndicator').classList.remove('active');
  avatarEngine.setState('idle');
  avatarEngine.setScanProgress(0);
  document.getElementById('ollamaStatus').classList.remove('scanning');
  stopCamera();
  stopMicrophone();
}

async function completeScan() {
  isScanning = false;
  if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
  document.getElementById('scanIndicator').classList.remove('active');
  document.getElementById('ollamaStatus').classList.remove('scanning');

  try {
    const vsaResult = voiceStressEngine.fullAnalysis();
    const threatResult = threatEngine.fullAnalysis('user');
    const deceptionResult = deceptionEngine.fullAnalysis('user', vsaResult);
    const frameHistory = threatEngine.frameHistory ? threatEngine.frameHistory.get('user') : [];
    const neuroResult = neuroAnalyzer.analyze(frameHistory || [], 30);

    lastProfile = AlphaEye.compute(threatResult, deceptionResult, neuroResult, vsaResult);

    // Save to history
    scanHistory.unshift({
      timestamp: Date.now(),
      params: lastProfile.params,
      stateOfMind: lastProfile.stateOfMind,
      dominantState: AlphaEye.getDominantState(lastProfile.params)
    });
    saveHistory();

    // Avatar announces results
    avatarEngine.setState('idle');
    const state = AlphaEye.getDominantState(lastProfile.params);
    const dir = therapyEngine.getDirection(state);
    const quadrant = lastProfile.stateOfMind.quadrant;

    avatarSpeak("I've read you. You seem " + quadrant.toLowerCase() + ".");

    appendChatBubble('assistant', "I've completed your reading! Your state of mind: " + quadrant + ". I'm here with " + dir.label.toLowerCase() + " guidance. Check the Results tab for your full profile, or let's talk about how you're feeling.");

    // Update therapy badge
    updateTherapyBadge(state);

    // Show rescan button
    document.getElementById('btnRescan').classList.add('visible');

    // Render results
    showResults();

    // Start background monitoring
    startMonitoring();

  } catch (err) {
    console.error('Analysis error:', err);
    avatarEngine.setState('idle');
    appendChatBubble('assistant', "I had trouble reading you this time. Let's just chat instead!");
    document.getElementById('btnRescan').classList.add('visible');
  }

  stopCamera();
  stopMicrophone();
}

// ============================================
// FACE DETECTION LOOP (Background)
// ============================================
async function detectLoop() {
  if (!isScanning) return;
  const video = document.getElementById('cameraVideo');

  try {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceExpressions();

    if (detections.length > 0) {
      frameCount++;
      threatEngine.processFrame('user', detections[0]);
      deceptionEngine.processFrame('user', detections[0]);

      if (audioStream) {
        try { voiceStressEngine.processAudioFrame(); } catch (e) {}
      }
    }
  } catch (e) {}

  if (isScanning) requestAnimationFrame(detectLoop);
}

// ============================================
// BACKGROUND MONITORING (5fps during chat)
// ============================================
function startMonitoring() {
  if (monitorInterval) return;

  startCamera().then(ok => {
    if (!ok) return;
    monitorInterval = setInterval(async () => {
      const video = document.getElementById('cameraVideo');
      if (!video || video.readyState < 2) return;

      try {
        const dets = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
          .withFaceLandmarks()
          .withFaceExpressions();

        if (dets.length > 0) {
          threatEngine.processFrame('user', dets[0]);
          deceptionEngine.processFrame('user', dets[0]);
          const quick = threatEngine.fullAnalysis('user');
          if (quick && quick.metrics) {
            updateTherapyBadge(AlphaEye.getDominantState(quick.metrics));
          }
        }
      } catch (e) {}
    }, 200);
  });
}

function stopMonitoring() {
  if (monitorInterval) { clearInterval(monitorInterval); monitorInterval = null; }
  stopCamera();
}

function updateTherapyBadge(state) {
  const badge = document.getElementById('therapyBadge');
  const dot = document.getElementById('badgeDot');
  const text = document.getElementById('badgeText');
  if (!badge) return;
  const dir = therapyEngine.getDirection(state);
  badge.style.display = 'flex';
  dot.style.background = dir.color;
  text.textContent = dir.label;
}

// ============================================
// RESULTS
// ============================================
function showResults() {
  if (!lastProfile) return;
  Charts.renderAllResults(lastProfile, document.getElementById('resultsContent'));
}

// ============================================
// CHAT
// ============================================
function initChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('btnSend');
  const micBtn = document.getElementById('btnMic');

  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);
  micBtn.addEventListener('click', toggleSpeechRecognition);
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  document.getElementById('btnSend').disabled = true;

  chatMessages.push({ role: 'user', content: text });
  appendChatBubble('user', text);

  // Check for scan trigger keywords
  const lower = text.toLowerCase();
  if (lower.includes('scan me') || lower.includes('read me') || lower.includes('analyze me')) {
    appendChatBubble('assistant', "Of course! Let me take another look at you...");
    avatarSpeak("Let me read you...");
    setTimeout(() => triggerScan(), 1500);
    return;
  }

  // Check Ollama
  if (!ollamaClient.connected) {
    const ok = await ollamaClient.testConnection();
    if (!ok) {
      appendChatBubble('assistant', 'I cannot connect to Ollama. Please check that Ollama is running on ' + settings.ollamaUrl);
      return;
    }
  }

  // System prompt
  let systemPrompt = 'You are MicroSense, a warm and caring AI companion. Keep responses brief (2-3 sentences).';
  if (lastProfile) {
    systemPrompt = therapyEngine.buildSystemPrompt(lastProfile);
  }

  // Typing indicator
  const typingEl = appendTypingIndicator();

  try {
    let fullResponse = '';
    for await (const token of ollamaClient.chat(chatMessages, systemPrompt)) {
      fullResponse += token;
      if (typingEl) typingEl.innerHTML = fullResponse;
    }

    if (typingEl) typingEl.remove();
    chatMessages.push({ role: 'assistant', content: fullResponse });
    appendChatBubble('assistant', fullResponse);

    // Avatar speaks the response
    if (fullResponse) avatarSpeak(fullResponse);

  } catch (err) {
    if (typingEl) typingEl.remove();
    if (err.name !== 'AbortError') {
      appendChatBubble('assistant', 'Sorry, I encountered an error. Please try again.');
      console.error('Chat error:', err);
    }
  }
}

function appendChatBubble(role, text) {
  const container = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble ' + role;
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

function appendSystemMessage(text) {
  const container = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble system';
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
  const container = document.getElementById('chatMessages');
  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble typing';
  bubble.id = 'typingIndicator';
  bubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
}

// ============================================
// SPEECH RECOGNITION
// ============================================
let recognition = null;
let isListening = false;

function toggleSpeechRecognition() {
  if (isListening) { stopListening(); return; }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Speech recognition not supported', 'error'); return; }

  recognition = new SR();
  recognition.lang = settings.language === 'ja' ? 'ja-JP' : settings.language === 'zh' ? 'zh-CN' : 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  document.getElementById('btnMic').classList.add('recording');
  isListening = true;

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('chatInput').value = transcript;
    document.getElementById('btnSend').disabled = !transcript.trim();
  };

  recognition.onend = () => {
    stopListening();
    if (document.getElementById('chatInput').value.trim()) sendMessage();
  };

  recognition.onerror = () => stopListening();
  recognition.start();
}

function stopListening() {
  isListening = false;
  document.getElementById('btnMic').classList.remove('recording');
  if (recognition) { try { recognition.stop(); } catch (e) {} recognition = null; }
}

// ============================================
// OLLAMA CONNECTION
// ============================================
async function checkOllamaConnection() {
  const dot = document.getElementById('ollamaStatus');
  const ok = await ollamaClient.testConnection();
  dot.className = ok ? 'status-dot' : 'status-dot offline';
  dot.title = ok ? 'Ollama: connected' : 'Ollama: disconnected';
}

// ============================================
// GENDER TOGGLE
// ============================================
function initGenderToggle() {
  document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.avatarGender = btn.dataset.gender;
      saveSettings();
      avatarEngine.setGender(settings.avatarGender);
    });
  });
}

// ============================================
// NAVIGATION
// ============================================
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      if (!tab) return;

      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById(tab);
      if (panel) panel.classList.add('active');

      if (tab === 'panelSettings') renderSettings();
      if (tab === 'panelResults' && lastProfile) showResults();

      // Monitoring only on home tab with profile
      if (tab === 'panelHome' && lastProfile) {
        startMonitoring();
      } else if (tab !== 'panelHome') {
        stopMonitoring();
      }

      if (tab !== 'panelHome') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
}

// ============================================
// SETTINGS
// ============================================
function renderSettings() {
  const content = document.getElementById('settingsContent');
  if (!content) return;

  content.innerHTML = `
    <div class="settings-group">
      <div class="settings-group-title">Appearance</div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-purple)">&#127769;</div><span class="setting-label">Dark Mode</span></div>
        <button class="setting-toggle ${settings.theme==='dark'?'on':''}" data-setting="theme"></button>
      </div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-pink)">&#128100;</div><span class="setting-label">Avatar</span></div>
        <div class="duration-selector">
          <button class="duration-btn ${settings.avatarGender==='female'?'active':''}" data-avatar="female">Female</button>
          <button class="duration-btn ${settings.avatarGender==='male'?'active':''}" data-avatar="male">Male</button>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Scan</div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-teal)">&#9201;</div><span class="setting-label">Duration</span></div>
        <div class="duration-selector">
          <button class="duration-btn ${settings.scanDuration===33?'active':''}" data-dur="33">33s</button>
          <button class="duration-btn ${settings.scanDuration===60?'active':''}" data-dur="60">60s</button>
          <button class="duration-btn ${settings.scanDuration===120?'active':''}" data-dur="120">120s</button>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Ollama AI</div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-blue)">&#129302;</div><span class="setting-label">URL</span></div>
        <input type="text" class="setting-input" id="ollamaUrlInput" value="${settings.ollamaUrl}" placeholder="http://localhost:11434">
      </div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-green)">&#129504;</div><span class="setting-label">Model</span></div>
        <select class="setting-select" id="ollamaModelSelect">
          <option value="${settings.ollamaModel}">${settings.ollamaModel}</option>
        </select>
      </div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-orange)">&#128268;</div><span class="setting-label">Connection</span></div>
        <button class="btn-test" id="btnTestOllama">Test</button>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Voice</div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-pink)">&#128483;</div><span class="setting-label">Text-to-Speech</span></div>
        <button class="setting-toggle ${settings.ttsEnabled?'on':''}" data-setting="tts"></button>
      </div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-warm)">&#9193;</div><span class="setting-label">Speed</span></div>
        <div class="duration-selector">
          <button class="duration-btn ${settings.ttsSpeed===0.8?'active':''}" data-speed="0.8">Slow</button>
          <button class="duration-btn ${settings.ttsSpeed===1.0?'active':''}" data-speed="1.0">Normal</button>
          <button class="duration-btn ${settings.ttsSpeed===1.2?'active':''}" data-speed="1.2">Fast</button>
        </div>
      </div>
    </div>

    <div class="settings-group">
      <div class="settings-group-title">Scan History (${scanHistory.length})</div>
      <div id="historyList"></div>
      ${scanHistory.length === 0 ? '<div class="setting-item"><span class="setting-label" style="color:var(--text-muted)">No scans yet</span></div>' : ''}
    </div>

    <div class="settings-group">
      <div class="settings-group-title">About</div>
      <div class="setting-item"><div class="setting-left"><div class="setting-icon" style="background:var(--text-muted)">&#9881;</div><span class="setting-label">Version</span></div><span class="setting-value">3.0.0</span></div>
      <div class="setting-item" id="resetAll"><div class="setting-left"><div class="setting-icon" style="background:var(--accent-red)">&#128260;</div><span class="setting-label" style="color:var(--accent-red)">Reset All Data</span></div><span class="setting-value">&#8250;</span></div>
    </div>
  `;

  // History
  const historyList = document.getElementById('historyList');
  if (historyList && scanHistory.length > 0) {
    historyList.innerHTML = scanHistory.map((scan, i) => {
      const d = new Date(scan.timestamp);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const state = scan.dominantState || 'balanced';
      const dir = therapyEngine.getDirection(state);
      return `<div class="history-item" data-idx="${i}">
        <div class="history-icon">${dir.emoji}</div>
        <div class="history-info">
          <div class="history-date">${dateStr}</div>
          <div class="history-summary">${scan.stateOfMind?.quadrant || 'Unknown'}</div>
        </div>
        <div class="history-state" style="background:${dir.color}20;color:${dir.color}">${dir.label}</div>
      </div>`;
    }).join('');
  }

  // Wire events
  wireSettingsEvents(content);
}

function wireSettingsEvents(content) {
  // Toggles
  content.querySelectorAll('.setting-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
      this.classList.toggle('on');
      const key = this.dataset.setting;
      if (key === 'theme') toggleTheme();
      else if (key === 'tts') {
        settings.ttsEnabled = this.classList.contains('on');
        saveSettings();
        showToast(settings.ttsEnabled ? 'TTS enabled' : 'TTS disabled', 'info');
      }
    });
  });

  // Avatar gender
  content.querySelectorAll('[data-avatar]').forEach(btn => {
    btn.addEventListener('click', function() {
      content.querySelectorAll('[data-avatar]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      settings.avatarGender = this.dataset.avatar;
      saveSettings();
      avatarEngine.setGender(settings.avatarGender);
      // Sync home page toggle
      document.querySelectorAll('.gender-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.gender === settings.avatarGender);
      });
    });
  });

  // Duration
  content.querySelectorAll('[data-dur]').forEach(btn => {
    btn.addEventListener('click', function() {
      content.querySelectorAll('[data-dur]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      settings.scanDuration = parseInt(this.dataset.dur);
      saveSettings();
      showToast('Scan duration: ' + settings.scanDuration + 's', 'info');
    });
  });

  // Speed
  content.querySelectorAll('[data-speed]').forEach(btn => {
    btn.addEventListener('click', function() {
      content.querySelectorAll('[data-speed]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      settings.ttsSpeed = parseFloat(this.dataset.speed);
      saveSettings();
    });
  });

  // Ollama URL
  const urlInput = document.getElementById('ollamaUrlInput');
  if (urlInput) {
    urlInput.addEventListener('change', function() {
      settings.ollamaUrl = this.value.trim();
      ollamaClient.baseUrl = settings.ollamaUrl;
      saveSettings();
      showToast('Ollama URL updated', 'info');
    });
  }

  // Test Ollama
  const testBtn = document.getElementById('btnTestOllama');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      testBtn.textContent = 'Testing...';
      const ok = await ollamaClient.testConnection();
      testBtn.textContent = ok ? 'Connected!' : 'Failed';
      setTimeout(() => { testBtn.textContent = 'Test'; }, 2000);

      if (ok) {
        showToast('Ollama connected!', 'success');
        checkOllamaConnection();
        const models = await ollamaClient.listModels();
        const select = document.getElementById('ollamaModelSelect');
        if (select && models.length > 0) {
          select.innerHTML = models.map(m => `<option value="${m}" ${m === settings.ollamaModel ? 'selected' : ''}>${m}</option>`).join('');
        }
      } else {
        showToast('Cannot connect to Ollama', 'error');
      }
    });
  }

  // Model select
  const modelSelect = document.getElementById('ollamaModelSelect');
  if (modelSelect) {
    modelSelect.addEventListener('change', function() {
      settings.ollamaModel = this.value;
      ollamaClient.model = settings.ollamaModel;
      saveSettings();
    });
  }

  // Reset
  const resetBtn = document.getElementById('resetAll');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (confirm('Reset all settings and scan history?')) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(HISTORY_KEY);
        settings = { ...DEFAULTS };
        scanHistory = [];
        setTheme(settings.theme);
        avatarEngine.setGender(settings.avatarGender);
        renderSettings();
        showToast('All data reset', 'info');
      }
    });
  }

  // History items
  content.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const idx = parseInt(item.dataset.idx);
      const scan = scanHistory[idx];
      if (scan) {
        lastProfile = {
          params: scan.params,
          stateOfMind: scan.stateOfMind,
          vitalityIndex: AlphaEye.computeVitality(scan.params.energy, scan.params.stress, scan.params.neuroticism),
          concentrationIndex: AlphaEye.computeConcentration(100 - scan.params.inhibition, scan.params.inhibition, scan.params.stress),
          emotionalVariation: AlphaEye.computeEmotionalVariation(scan.params),
          voiceStress: 0,
          deceptionProb: 0,
          conditions: [],
          deceptionTimeline: [],
          timestamp: scan.timestamp
        };
        showResults();
        document.querySelector('[data-tab="panelResults"]')?.click();
      }
    });
  });
}

// ============================================
// INIT
// ============================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
