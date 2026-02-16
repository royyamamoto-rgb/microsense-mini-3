/**
 * MicroSense Mini 3 - Main Application Orchestrator
 * Manages scan flow, tab navigation, settings, chat, and engine coordination
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
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULTS, ...parsed };
    }
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
function initTheme() {
  setTheme(settings.theme);
}

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
  const current = document.documentElement.getAttribute('data-theme');
  setTheme(current === 'light' ? 'dark' : 'light');
}

// ============================================
// STATE MACHINE
// ============================================
const State = {
  IDLE: 'idle',
  LOADING_MODELS: 'loading_models',
  READY: 'ready',
  SCANNING: 'scanning',
  ANALYZING: 'analyzing',
  RESULTS: 'results'
};

let appState = State.IDLE;
let modelsLoaded = false;

// ============================================
// ENGINE INSTANCES
// ============================================
let threatEngine, deceptionEngine, neuroAnalyzer, voiceStressEngine;
let cameraStream = null;
let audioStream = null;
let scanTimer = null;
let scanStartTime = null;
let isScanning = false;
let frameCount = 0;
let lastProfile = null;
let chatMonitorInterval = null;

// Ollama + Therapy
let ollamaClient = null;
let therapyEngine = null;
let chatMessages = [];

// ============================================
// INITIALIZATION
// ============================================
async function init() {
  initTheme();
  initNav();

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // Init engines
  threatEngine = new ThreatEngine();
  deceptionEngine = new DeceptionEngine();
  neuroAnalyzer = new NeuroAnalyzer();
  voiceStressEngine = new VoiceStressEngine();
  therapyEngine = new TherapyEngine();
  ollamaClient = new OllamaClient(settings.ollamaUrl, settings.ollamaModel);

  // Load face-api models
  await loadFaceModels();

  // Check Ollama connection (background)
  checkOllamaConnection();

  // Init chat
  initChat();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// ============================================
// FACE-API MODEL LOADING
// ============================================
async function loadFaceModels() {
  appState = State.LOADING_MODELS;
  updateScanUI();

  try {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
    modelsLoaded = true;
    appState = State.READY;
    updateScanUI();
  } catch (err) {
    console.error('Model load error:', err);
    appState = State.IDLE;
    document.getElementById('scanStatus').textContent = 'Failed to load models. Refresh to retry.';
  }
}

// ============================================
// CAMERA
// ============================================
async function startCamera() {
  const video = document.getElementById('cameraVideo');
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false
    });
    video.srcObject = cameraStream;
    await video.play();

    // Sync overlay canvas size
    const overlay = document.getElementById('cameraOverlay');
    overlay.width = video.videoWidth || 640;
    overlay.height = video.videoHeight || 480;

    document.getElementById('cameraDot').classList.add('active');
    document.getElementById('cameraLabel').textContent = 'Camera ready';
    return true;
  } catch (err) {
    console.error('Camera error:', err);
    showToast('Camera access denied', 'error');
    document.getElementById('cameraLabel').textContent = 'Camera denied';
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
  document.getElementById('cameraDot')?.classList.remove('active');
  document.getElementById('cameraLabel').textContent = 'Camera off';
}

// ============================================
// MICROPHONE (for VoiceStressEngine)
// ============================================
async function startMicrophone() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    await voiceStressEngine.initAudioContext(audioStream);
    return true;
  } catch (err) {
    console.warn('Microphone access denied:', err);
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
// SCAN FLOW
// ============================================
async function startScan() {
  if (appState === State.SCANNING) {
    stopScan();
    return;
  }

  // Start camera
  const camOk = await startCamera();
  if (!camOk) return;

  // Start microphone
  await startMicrophone();

  // Reset engines
  threatEngine = new ThreatEngine();
  deceptionEngine = new DeceptionEngine();

  appState = State.SCANNING;
  isScanning = true;
  frameCount = 0;
  scanStartTime = Date.now();

  document.getElementById('cameraContainer').classList.add('scanning');
  updateScanUI();

  // Start detection loop
  detectLoop();

  // Start countdown
  const duration = settings.scanDuration * 1000;
  scanTimer = setInterval(() => {
    const elapsed = Date.now() - scanStartTime;
    const remaining = Math.max(0, duration - elapsed);
    updateScanTimer(remaining, duration);

    if (remaining <= 0) {
      completeScan();
    }
  }, 100);
}

function stopScan() {
  isScanning = false;
  clearInterval(scanTimer);
  scanTimer = null;
  document.getElementById('cameraContainer').classList.remove('scanning');
  appState = State.READY;
  updateScanUI();
  stopCamera();
  stopMicrophone();
}

async function completeScan() {
  isScanning = false;
  clearInterval(scanTimer);
  scanTimer = null;
  appState = State.ANALYZING;
  updateScanUI();
  document.getElementById('cameraContainer').classList.remove('scanning');

  // Run full analysis on all engines
  try {
    const vsaResult = voiceStressEngine.fullAnalysis();
    const threatResult = threatEngine.fullAnalysis('user');
    const deceptionResult = deceptionEngine.fullAnalysis('user', vsaResult);

    // Get frame history from threat engine for NeuroAnalyzer
    const frameHistory = threatEngine.frameHistory ? threatEngine.frameHistory.get('user') : [];
    const fps = 30;
    const neuroResult = neuroAnalyzer.analyze(frameHistory || [], fps);

    // Compute AlphaEye profile
    lastProfile = AlphaEye.compute(threatResult, deceptionResult, neuroResult, vsaResult);

    // Save to history
    scanHistory.unshift({
      timestamp: Date.now(),
      params: lastProfile.params,
      stateOfMind: lastProfile.stateOfMind,
      dominantState: AlphaEye.getDominantState(lastProfile.params)
    });
    saveHistory();

    // Show results
    appState = State.RESULTS;
    showResults();
    showToast('Scan complete! Viewing results.', 'success');

    // Navigate to results tab
    setTimeout(() => {
      document.querySelector('[data-tab="panelResults"]')?.click();
    }, 500);

  } catch (err) {
    console.error('Analysis error:', err);
    showToast('Analysis error: ' + err.message, 'error');
    appState = State.READY;
  }

  updateScanUI();
  stopCamera();
  stopMicrophone();
}

// ============================================
// FACE DETECTION LOOP
// ============================================
async function detectLoop() {
  if (!isScanning) return;

  const video = document.getElementById('cameraVideo');
  const overlay = document.getElementById('cameraOverlay');
  const ctx = overlay.getContext('2d');

  try {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceExpressions();

    // Clear overlay
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (detections.length > 0) {
      const det = detections[0];
      frameCount++;

      // Feed to engines
      threatEngine.processFrame('user', det);
      deceptionEngine.processFrame('user', det);

      // Process audio
      if (audioStream) {
        try { voiceStressEngine.processAudioFrame(); } catch (e) {}
      }

      // Draw face overlay
      drawFaceOverlay(ctx, det, overlay.width, overlay.height);

      // Update face count
      const fc = document.getElementById('faceCount');
      fc.style.display = 'block';
      document.getElementById('faceCountText').textContent = `${detections.length} face${detections.length > 1 ? 's' : ''} | ${frameCount} frames`;
    } else {
      const fc = document.getElementById('faceCount');
      fc.style.display = 'block';
      document.getElementById('faceCountText').textContent = 'No face detected';
    }
  } catch (err) {
    // Detection error, skip frame
  }

  if (isScanning) {
    requestAnimationFrame(detectLoop);
  }
}

/**
 * Draw face mesh overlay on canvas
 */
function drawFaceOverlay(ctx, detection, w, h) {
  const landmarks = detection.landmarks;
  if (!landmarks) return;

  const pts = landmarks.positions;
  const box = detection.detection.box;

  // Scale factors (video may differ from canvas)
  const scaleX = w / (document.getElementById('cameraVideo').videoWidth || w);
  const scaleY = h / (document.getElementById('cameraVideo').videoHeight || h);

  // Draw bounding box
  ctx.strokeStyle = 'rgba(124, 77, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(box.x * scaleX, box.y * scaleY, box.width * scaleX, box.height * scaleY);

  // Draw landmark points
  ctx.fillStyle = 'rgba(124, 77, 255, 0.8)';
  pts.forEach(pt => {
    ctx.beginPath();
    ctx.arc(pt.x * scaleX, pt.y * scaleY, 1.5, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Draw landmark connections (jaw, eyes, nose, mouth)
  ctx.strokeStyle = 'rgba(0, 229, 255, 0.4)';
  ctx.lineWidth = 1;

  // Jaw line (0-16)
  drawPath(ctx, pts, scaleX, scaleY, Array.from({length: 17}, (_, i) => i));
  // Left eyebrow (17-21)
  drawPath(ctx, pts, scaleX, scaleY, [17,18,19,20,21]);
  // Right eyebrow (22-26)
  drawPath(ctx, pts, scaleX, scaleY, [22,23,24,25,26]);
  // Nose bridge (27-30)
  drawPath(ctx, pts, scaleX, scaleY, [27,28,29,30]);
  // Left eye (36-41, closed)
  drawPath(ctx, pts, scaleX, scaleY, [36,37,38,39,40,41,36]);
  // Right eye (42-47, closed)
  drawPath(ctx, pts, scaleX, scaleY, [42,43,44,45,46,47,42]);
  // Outer lip (48-59, closed)
  drawPath(ctx, pts, scaleX, scaleY, [48,49,50,51,52,53,54,55,56,57,58,59,48]);
}

function drawPath(ctx, pts, sx, sy, indices) {
  ctx.beginPath();
  indices.forEach((idx, i) => {
    const p = pts[idx];
    if (i === 0) ctx.moveTo(p.x * sx, p.y * sy);
    else ctx.lineTo(p.x * sx, p.y * sy);
  });
  ctx.stroke();
}

// ============================================
// SCAN UI UPDATES
// ============================================
function updateScanUI() {
  const btn = document.getElementById('btnScan');
  const status = document.getElementById('scanStatus');
  const ringWrap = document.getElementById('scanRingWrap');

  switch (appState) {
    case State.LOADING_MODELS:
      btn.disabled = true;
      btn.textContent = 'Loading...';
      btn.className = 'btn-scan';
      status.textContent = 'Loading face detection models...';
      ringWrap.classList.remove('active');
      break;
    case State.READY:
      btn.disabled = false;
      btn.textContent = 'Start Scan';
      btn.className = 'btn-scan';
      status.textContent = `Ready for ${settings.scanDuration}-second neural scan`;
      ringWrap.classList.remove('active');
      break;
    case State.SCANNING:
      btn.disabled = false;
      btn.textContent = 'Stop';
      btn.className = 'btn-scan stop';
      status.textContent = 'Scanning... Hold still and look at the camera';
      ringWrap.classList.add('active');
      break;
    case State.ANALYZING:
      btn.disabled = true;
      btn.textContent = 'Analyzing...';
      btn.className = 'btn-scan';
      status.textContent = 'Processing scan data...';
      ringWrap.classList.remove('active');
      break;
    case State.RESULTS:
      btn.disabled = false;
      btn.textContent = 'New Scan';
      btn.className = 'btn-scan';
      status.textContent = 'Scan complete. View your results.';
      ringWrap.classList.remove('active');
      break;
  }
}

function updateScanTimer(remainingMs, totalMs) {
  const seconds = Math.ceil(remainingMs / 1000);
  document.getElementById('scanTimerValue').textContent = seconds;

  const progress = 1 - (remainingMs / totalMs);
  const circumference = 2 * Math.PI * 45; // r=45
  const offset = circumference * (1 - progress);
  document.getElementById('scanRingProgress').style.strokeDashoffset = offset;
}

// ============================================
// RESULTS
// ============================================
function showResults() {
  if (!lastProfile) return;
  const container = document.getElementById('resultsContent');
  Charts.renderAllResults(lastProfile, container);
}

// ============================================
// CHAT
// ============================================
function initChat() {
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('btnSend');
  const micBtn = document.getElementById('btnMic');

  // Enable send when there's text
  input.addEventListener('input', () => {
    sendBtn.disabled = !input.value.trim();
  });

  // Send on enter
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && input.value.trim()) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Send button
  sendBtn.addEventListener('click', sendMessage);

  // Mic button (speech recognition)
  micBtn.addEventListener('click', toggleSpeechRecognition);
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  document.getElementById('btnSend').disabled = true;

  // Add user message
  chatMessages.push({ role: 'user', content: text });
  appendChatBubble('user', text);

  // Check Ollama connection
  if (!ollamaClient.connected) {
    const ok = await ollamaClient.testConnection();
    if (!ok) {
      appendChatBubble('assistant', 'I cannot connect to Ollama. Please check that Ollama is running on ' + settings.ollamaUrl);
      return;
    }
  }

  // Build system prompt with scan data
  let systemPrompt = 'You are MicroSense, a warm and caring AI companion. Keep responses brief (2-3 sentences).';
  if (lastProfile) {
    systemPrompt = therapyEngine.buildSystemPrompt(lastProfile);
  }

  // Show typing indicator
  const typingEl = appendTypingIndicator();

  try {
    let fullResponse = '';
    for await (const token of ollamaClient.chat(chatMessages, systemPrompt)) {
      fullResponse += token;
      // Update typing indicator with streamed text
      if (typingEl) {
        typingEl.innerHTML = fullResponse;
      }
    }

    // Remove typing, add final bubble
    if (typingEl) typingEl.remove();
    chatMessages.push({ role: 'assistant', content: fullResponse });
    appendChatBubble('assistant', fullResponse);

    // TTS
    if (settings.ttsEnabled && fullResponse) {
      speak(fullResponse);
    }

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
  bubble.className = `chat-bubble ${role}`;
  bubble.textContent = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  return bubble;
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
  if (isListening) {
    stopListening();
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('Speech recognition not supported', 'error');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = settings.language === 'ja' ? 'ja-JP' : settings.language === 'zh' ? 'zh-CN' : 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;

  const micBtn = document.getElementById('btnMic');
  micBtn.classList.add('recording');
  isListening = true;

  recognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join('');
    document.getElementById('chatInput').value = transcript;
    document.getElementById('btnSend').disabled = !transcript.trim();
  };

  recognition.onend = () => {
    stopListening();
    // Auto-send if we have text
    const input = document.getElementById('chatInput');
    if (input.value.trim()) {
      sendMessage();
    }
  };

  recognition.onerror = () => {
    stopListening();
  };

  recognition.start();
}

function stopListening() {
  isListening = false;
  document.getElementById('btnMic').classList.remove('recording');
  if (recognition) {
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
}

// ============================================
// TTS (Text-to-Speech)
// ============================================
function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = settings.ttsSpeed;
  utterance.pitch = 1.0;

  // Try to match language
  if (settings.language === 'ja') utterance.lang = 'ja-JP';
  else if (settings.language === 'zh') utterance.lang = 'zh-CN';
  else utterance.lang = 'en-US';

  window.speechSynthesis.speak(utterance);
}

// ============================================
// OLLAMA CONNECTION CHECK
// ============================================
async function checkOllamaConnection() {
  const dot = document.getElementById('ollamaStatus');
  const ok = await ollamaClient.testConnection();
  dot.className = ok ? 'status-dot' : 'status-dot offline';
  dot.title = ok ? 'Ollama: connected' : 'Ollama: disconnected';
}

// ============================================
// BACKGROUND FACE MONITORING (Chat tab)
// ============================================
function startChatMonitoring() {
  if (chatMonitorInterval) return;

  startCamera().then(ok => {
    if (!ok) return;

    chatMonitorInterval = setInterval(async () => {
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

          // Update therapy badge
          const quickResult = threatEngine.fullAnalysis('user');
          if (quickResult && quickResult.metrics) {
            const state = AlphaEye.getDominantState(quickResult.metrics);
            updateTherapyBadge(state);
          }
        }
      } catch (e) {}
    }, 200); // 5fps
  });
}

function stopChatMonitoring() {
  if (chatMonitorInterval) {
    clearInterval(chatMonitorInterval);
    chatMonitorInterval = null;
  }
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
// SETTINGS TAB
// ============================================
function renderSettings() {
  const content = document.getElementById('settingsContent');
  if (!content) return;

  content.innerHTML = `
    <!-- Appearance -->
    <div class="settings-group">
      <div class="settings-group-title">Appearance</div>
      <div class="setting-item">
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-purple)">&#127769;</div><span class="setting-label">Dark Mode</span></div>
        <button class="setting-toggle ${settings.theme==='dark'?'on':''}" data-setting="theme"></button>
      </div>
    </div>

    <!-- Scan -->
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

    <!-- Ollama -->
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
        <div class="setting-left"><div class="setting-icon" style="background:var(--accent-orange)">&#128268;</div><span class="setting-label">Test Connection</span></div>
        <button class="btn-test" id="btnTestOllama">Test</button>
      </div>
    </div>

    <!-- Voice -->
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

    <!-- Scan History -->
    <div class="settings-group">
      <div class="settings-group-title">Scan History (${scanHistory.length})</div>
      <div id="historyList"></div>
      ${scanHistory.length === 0 ? '<div class="setting-item"><span class="setting-label" style="color:var(--text-muted)">No scans yet</span></div>' : ''}
    </div>

    <!-- About -->
    <div class="settings-group">
      <div class="settings-group-title">About</div>
      <div class="setting-item"><div class="setting-left"><div class="setting-icon" style="background:var(--text-muted)">&#9881;</div><span class="setting-label">Version</span></div><span class="setting-value">3.0.0</span></div>
      <div class="setting-item" id="resetAll"><div class="setting-left"><div class="setting-icon" style="background:var(--accent-red)">&#128260;</div><span class="setting-label" style="color:var(--accent-red)">Reset All Data</span></div><span class="setting-value">&#8250;</span></div>
    </div>
  `;

  // Render history
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
  content.querySelectorAll('.setting-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
      this.classList.toggle('on');
      const key = this.dataset.setting;
      if (key === 'theme') {
        toggleTheme();
      } else if (key === 'tts') {
        settings.ttsEnabled = this.classList.contains('on');
        saveSettings();
        showToast(settings.ttsEnabled ? 'TTS enabled' : 'TTS disabled', 'info');
      }
    });
  });

  // Duration selector
  content.querySelectorAll('[data-dur]').forEach(btn => {
    btn.addEventListener('click', function() {
      content.querySelectorAll('[data-dur]').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      settings.scanDuration = parseInt(this.dataset.dur);
      saveSettings();
      showToast(`Scan duration: ${settings.scanDuration}s`, 'info');
    });
  });

  // Speed selector
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
        // Refresh models
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
        // Reconstruct a minimal profile for display
        lastProfile = {
          params: scan.params,
          stateOfMind: scan.stateOfMind,
          vitalityIndex: 0,
          concentrationIndex: 50,
          emotionalVariation: AlphaEye.computeEmotionalVariation(scan.params),
          voiceStress: 0,
          deceptionProb: 0,
          conditions: [],
          deceptionTimeline: [],
          timestamp: scan.timestamp
        };
        lastProfile.vitalityIndex = AlphaEye.computeVitality(scan.params.energy, scan.params.stress, scan.params.neuroticism);
        lastProfile.concentrationIndex = AlphaEye.computeConcentration(100 - scan.params.inhibition, scan.params.inhibition, scan.params.stress);
        showResults();
        document.querySelector('[data-tab="panelResults"]')?.click();
      }
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

      // Tab-specific actions
      if (tab === 'panelSettings') renderSettings();
      if (tab === 'panelResults' && lastProfile) showResults();

      // Start/stop chat monitoring
      if (tab === 'panelChat' && lastProfile) {
        startChatMonitoring();
      } else {
        stopChatMonitoring();
      }

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Scan button
  document.getElementById('btnScan').addEventListener('click', () => {
    if (appState === State.SCANNING) {
      stopScan();
    } else {
      startScan();
    }
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
