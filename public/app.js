/* ── Runtime state ───────────────────────────────────────────────────────── */
let appState = null;
let conversationMessages = [];
let lessonActive = false;
let speechEnabled = true;
let frenchVoice = null;
let recognition = null;
let isRecording = false;
let editingPatternId = null;

/* ── Elements ────────────────────────────────────────────────────────────── */
const chatArea       = document.getElementById('chatArea');
const inputArea      = document.getElementById('inputArea');
const welcomeScreen  = document.getElementById('welcomeScreen');
const userInput      = document.getElementById('userInput');
const sendBtn        = document.getElementById('sendBtn');
const micBtn         = document.getElementById('micBtn');
const micStatus      = document.getElementById('micStatus');
const startBtn       = document.getElementById('startLesson');
const saveExitBtn    = document.getElementById('saveAndExit');
const exitBtn        = document.getElementById('exitLesson');
const returnHomeBtn  = document.getElementById('returnHome');
const appTitle       = document.getElementById('appTitle');
const toggleSidebar  = document.getElementById('toggleSidebar');
const sidebarClose   = document.getElementById('sidebarClose');
const sidebar        = document.getElementById('sidebar');
const toggleSpeech   = document.getElementById('toggleSpeech');
const patternList    = document.getElementById('patternList');
if (window.innerWidth <= 700) sidebar.classList.add('hidden');
const modalOverlay   = document.getElementById('modalOverlay');
const modalClose     = document.getElementById('modalClose');
const modalCancel    = document.getElementById('modalCancel');
const modalSave      = document.getElementById('modalSave');
const modalStartHere = document.getElementById('modalStartHere');
const modalPatternName = document.getElementById('modalPatternName');
const patternNotes   = document.getElementById('patternNotes');
const modalExamples  = document.getElementById('modalExamples');
const statusOptions  = document.querySelectorAll('.status-opt');

/* ── State management ────────────────────────────────────────────────────── */
async function loadState() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  appState = await res.json();
  speechEnabled = appState.learner.tutorSpeechEnabled;
}

async function saveState() {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appState)
      });
      if (res.ok) return;
    } catch (_) {}
    if (attempt === 2) showToast('Could not save — check your connection.');
  }
}

function applyCheckpoint(checkpoint) {
  const now = new Date().toISOString();

  // Pattern statuses are user-controlled — Claudette suggests via the coach's note, never overrides
  // Still record lastPracticed so the sidebar knows when each pattern was last worked on
  if (checkpoint.patternsUpdate) {
    for (const update of checkpoint.patternsUpdate) {
      const pattern = appState.patterns.find(p => p.id === update.id);
      if (pattern) pattern.lastPracticed = now;
    }
  }

  if (checkpoint.newRecurringErrors && checkpoint.newRecurringErrors.length > 0) {
    for (const err of checkpoint.newRecurringErrors) {
      const existing = appState.recurringErrors.find(
        e => e.type === err.type && e.example === err.example
      );
      if (existing) {
        existing.frequency += 1;
        existing.lastSeen = now;
      } else {
        appState.recurringErrors.push({ ...err, lastSeen: now });
      }
    }
  }

  if (checkpoint.nextTarget) {
    appState.lessonState.nextTarget = checkpoint.nextTarget;
    appState.lessonState.currentPattern = checkpoint.nextTarget;
  }
  if (checkpoint.freeProductionLevel !== undefined) {
    appState.lessonState.freeProductionLevel = checkpoint.freeProductionLevel;
  }

  appState.sessionLog.push({
    lessonNumber: appState.learner.currentLesson,
    date: now,
    focus: appState.lessonState.currentPattern,
    covered: checkpoint.patternsUpdate ? checkpoint.patternsUpdate.map(u => u.id) : [],
    mastered: checkpoint.patternsUpdate
      ? checkpoint.patternsUpdate.filter(u => u.newStatus === 'mastered').map(u => u.id)
      : [],
    fragile: checkpoint.patternsUpdate
      ? checkpoint.patternsUpdate.filter(u => u.newStatus === 'fragile').map(u => u.id)
      : [],
    checkpoint: checkpoint.sessionSummary || '',
    notes: ''
  });

  appState.learner.currentLesson += 1;
  appState.lessonState.lastCheckpoint = now;
}

/* ── Init ────────────────────────────────────────────────────────────────── */
async function init() {
  await loadState();
  initVoices();
  initRecognition();
  renderSidebar();
  renderWelcome();
  applySpeechState();
}

/* ── Voice setup ─────────────────────────────────────────────────────────── */
function initVoices() {
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    const fr = voices.filter(v => v.lang.startsWith('fr'));
    frenchVoice = fr.find(v => v.lang === 'fr-FR') || fr[0] || null;
  }
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function speak(text) {
  if (!speechEnabled || !text.trim()) return;
  speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'fr-FR';
  utt.rate = 0.9;
  if (frenchVoice) utt.voice = frenchVoice;
  speechSynthesis.speak(utt);
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.opacity = '0.3';
    micBtn.title = 'Speech recognition not supported in this browser';
    micBtn.disabled = true;
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'fr-FR';
  recognition.continuous = false;
  recognition.interimResults = true;

  recognition.onresult = (e) => {
    let transcript = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    userInput.value = transcript;
    autoResize(userInput);
  };

  recognition.onend = () => {
    setRecording(false);
    if (userInput.value.trim()) micStatus.textContent = 'Tap send to submit, or edit first.';
  };

  recognition.onerror = (e) => {
    setRecording(false);
    if (e.error !== 'no-speech') micStatus.textContent = 'Recognition error. Try again.';
  };
}

function setRecording(state) {
  isRecording = state;
  micBtn.classList.toggle('recording', state);
  micStatus.textContent = state ? 'Listening…' : '';
  micStatus.classList.toggle('listening', state);
}

/* ── Sidebar ─────────────────────────────────────────────────────────────── */
function renderSidebar() {
  if (!appState) return;
  const { learner, lessonState, patterns } = appState;

  document.getElementById('metaLesson').textContent = learner.currentLesson;
  document.getElementById('metaBooklet').textContent = lessonState.currentBooklet || '—';
  document.getElementById('metaFocus').textContent = shortPatternLabel(lessonState.currentPattern);

  const groups = [
    { key: 'Paul Noble 1', label: 'Paul Noble Intro PDF (PN1)', prefix: 'PN1' },
    { key: 'Paul Noble Next Steps', label: 'Paul Noble Next Steps PDF (PN2)', prefix: 'PN2' },
  ];

  patternList.innerHTML = '';
  for (const group of groups) {
    const groupPatterns = patterns.filter(p => p.booklet === group.key);
    if (!groupPatterns.length) continue;

    const heading = document.createElement('div');
    heading.className = 'pattern-group-heading';
    heading.textContent = group.label;
    patternList.appendChild(heading);

    groupPatterns.forEach((p, i) => {
      const code = `${group.prefix}-${String(i + 1).padStart(2, '0')}`;
      const item = document.createElement('div');
      item.className = 'pattern-item';
      item.dataset.id = p.id;
      item.innerHTML = `
        <span class="dot dot--${dotClass(p.status)}"></span>
        <span class="pattern-code">${code}</span>
        <span class="pattern-name">${p.pattern}</span>
      `;
      item.addEventListener('click', () => openPatternModal(p.id));
      patternList.appendChild(item);
    });
  }
}

function shortPatternLabel(id) {
  if (!id || !appState) return '—';
  const p = appState.patterns.find(x => x.id === id);
  if (!p) return id;
  return p.pattern.length > 35 ? p.pattern.slice(0, 33) + '…' : p.pattern;
}

function dotClass(status) {
  if (status === 'mastered') return 'mastered';
  if (status === 'stabilizing' || status === 'fragile' || status === 'learning') return 'learning';
  return 'new';
}

toggleSidebar.addEventListener('click', () => sidebar.classList.toggle('hidden'));
sidebarClose.addEventListener('click', () => sidebar.classList.add('hidden'));

/* ── Speech toggle ───────────────────────────────────────────────────────── */
function applySpeechState() {
  toggleSpeech.classList.toggle('active', speechEnabled);
  document.body.classList.toggle('speech-muted', !speechEnabled);
}

toggleSpeech.addEventListener('click', async () => {
  speechEnabled = !speechEnabled;
  applySpeechState();
  if (appState) {
    appState.learner.tutorSpeechEnabled = speechEnabled;
    await saveState();
  }
});

/* ── Welcome screen ──────────────────────────────────────────────────────── */
function renderWelcome() {
  if (!appState) return;
  const { learner, lessonState, patterns } = appState;
  document.getElementById('welcomeSessionNum').textContent = learner.currentLesson;

  const current = patterns.find(p => p.id === lessonState.currentPattern);

  let label = 'up next';
  if (current) {
    if (current.status === 'fragile') label = 'needs a revisit';
    else if (current.status === 'stabilizing') label = 'keep building';
    else if (current.status === 'exposure only') label = 'ready to try';
  }

  document.getElementById('welcomeRecommendLabel').textContent = label;
  document.getElementById('welcomePatternName').textContent = current ? current.pattern : '—';
}

document.getElementById('welcomeChoose').addEventListener('click', () => {
  buildPickerList();
  document.getElementById('welcomeDefault').style.display = 'none';
  document.getElementById('welcomePicker').style.display = '';
});

document.getElementById('welcomePickerBack').addEventListener('click', () => {
  document.getElementById('welcomePicker').style.display = 'none';
  document.getElementById('welcomeDefault').style.display = '';
});

function buildPickerList() {
  const list = document.getElementById('pickerList');
  list.innerHTML = '';
  const currentId = appState.lessonState.currentPattern;

  const groups = [
    { label: 'Paul Noble 1', key: 'Paul Noble 1' },
    { label: 'Paul Noble Next Steps', key: 'Paul Noble Next Steps' }
  ];

  for (const group of groups) {
    const patterns = appState.patterns.filter(p => p.booklet === group.key);
    if (!patterns.length) continue;

    const groupLabel = document.createElement('div');
    groupLabel.className = 'picker-group-label';
    groupLabel.textContent = group.label;
    list.appendChild(groupLabel);

    patterns.forEach((p, i) => {
      const btn = document.createElement('button');
      btn.className = 'picker-item' + (p.id === currentId ? ' picker-item--current' : '');
      btn.innerHTML = `
        <span class="dot dot--${dotClass(p.status)}"></span>
        <span class="picker-item-name">${p.pattern}</span>
        <span class="picker-item-badge">${group.key === 'Paul Noble 1' ? 'PN1' : 'PN2'}-${String(i + 1).padStart(2, '0')}</span>
      `;
      btn.addEventListener('click', async () => {
        appState.lessonState.currentPattern = p.id;
        appState.lessonState.currentSection = p.section;
        appState.lessonState.currentBooklet = p.booklet;
        await saveState();
        renderSidebar();
        renderWelcome();
        document.getElementById('welcomePicker').style.display = 'none';
        document.getElementById('welcomeDefault').style.display = '';
      });
      list.appendChild(btn);
    });
  }
}

/* ── Chat rendering ──────────────────────────────────────────────────────── */
function makeChatInner() {
  let inner = document.querySelector('.chat-inner');
  if (!inner) {
    inner = document.createElement('div');
    inner.className = 'chat-inner';
    chatArea.appendChild(inner);
  }
  return inner;
}

function renderMessage(role, rawText, animate = false) {
  const inner = makeChatInner();
  const wrap = document.createElement('div');
  wrap.className = `message message--${role}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  if (role === 'tutor') {
    bubble.innerHTML = formatTutorMessage(rawText);
    if (animate) {
      const looksCorrect = /^correct\./i.test(rawText.trim());
      const looksWrong = /^not quite\./i.test(rawText.trim());
      if (looksCorrect) { bubble.classList.add('correct'); setTimeout(() => bubble.classList.add('flash-correct'), 10); }
      if (looksWrong) bubble.classList.add('incorrect');
    }
    bubble.querySelectorAll('.replay-btn').forEach(btn => {
      btn.addEventListener('click', () => speak(btn.dataset.text));
    });
    if (animate) {
      const frFragments = [...rawText.matchAll(/<fr>([\s\S]*?)<\/fr>/g)]
        .map(m => m[1].trim())
        .filter(f => f.includes(' '));
      if (frFragments.length > 0) {
        setTimeout(() => speak(frFragments.join('. ')), 300);
      }
    }
  } else {
    bubble.textContent = rawText;
  }

  wrap.appendChild(bubble);
  inner.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
  return bubble;
}

function formatTutorMessage(text) {
  text = text.replace(/:::CHECKPOINT:::[\s\S]*?:::CHECKPOINT:::/g, '').trim();
  text = text.replace(/<fr>([\s\S]*?)<\/fr>/g, (_, fr) => {
    const escaped = fr.replace(/"/g, '&quot;');
    return `<span class="fr-inline"><span class="fr-text">${fr}</span><button class="replay-btn" data-text="${escaped}" title="Replay">&#9654;</button></span>`;
  });
  const lines = text.split('\n');
  let html = '';
  let inPara = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      html += (inPara ? ' ' : '<p>') + trimmed;
      inPara = true;
    } else if (inPara) {
      html += '</p>';
      inPara = false;
    }
  }
  if (inPara) html += '</p>';
  return html || '<p>' + text + '</p>';
}

function renderCoachNote(text) {
  const inner = makeChatInner();
  const wrap = document.createElement('div');
  wrap.className = 'message message--coach';
  const note = document.createElement('div');
  note.className = 'coach-note';
  const header = document.createElement('div');
  header.className = 'coach-note-header';
  header.textContent = "Coach's note";
  const body = document.createElement('p');
  body.textContent = text;
  note.appendChild(header);
  note.appendChild(body);
  wrap.appendChild(note);
  inner.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function showTyping() {
  const inner = makeChatInner();
  const indicator = document.createElement('div');
  indicator.className = 'typing-indicator';
  indicator.id = 'typingIndicator';
  indicator.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
  inner.appendChild(indicator);
  chatArea.scrollTop = chatArea.scrollHeight;
}

function hideTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

/* ── Lesson flow ─────────────────────────────────────────────────────────── */
startBtn.addEventListener('click', startLesson);

function showToast(message) {
  const existing = document.getElementById('toastMsg');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'toastMsg';
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

function goHome() {
  lessonActive = false;
  conversationMessages = [];
  sendBtn.disabled = false;
  const inner = document.querySelector('.chat-inner');
  if (inner) inner.remove();
  document.getElementById('lessonInputPanel').style.display = '';
  document.getElementById('postLessonPanel').style.display = 'none';
  inputArea.style.display = 'none';
  welcomeScreen.style.display = '';
  renderSidebar();
  renderWelcome();
}

async function startLesson() {
  lessonActive = true;
  welcomeScreen.style.display = 'none';
  inputArea.style.display = '';

  const existing = document.querySelector('.chat-inner');
  if (existing) existing.remove();
  const chatInner = document.createElement('div');
  chatInner.className = 'chat-inner';
  chatArea.appendChild(chatInner);

  showTyping();
  const greeting = await sendToTutor([{ role: 'user', content: 'Start the lesson. Give me the brief orientation, then the first prompt.' }]);
  hideTyping();
  conversationMessages.push({ role: 'user', content: 'Start the lesson. Give me the brief orientation, then the first prompt.' });
  conversationMessages.push({ role: 'assistant', content: greeting });
  renderMessage('tutor', greeting, true);
  userInput.focus();
}

async function sendMessage() {
  const text = userInput.value.trim();
  if (!text || !lessonActive) return;

  renderMessage('learner', text);
  userInput.value = '';
  autoResize(userInput);
  sendBtn.disabled = true;
  micStatus.textContent = '';

  conversationMessages.push({ role: 'user', content: text });
  showTyping();

  try {
    const reply = await sendToTutor(conversationMessages);
    hideTyping();
    conversationMessages.push({ role: 'assistant', content: reply });
    renderMessage('tutor', reply, true);
  } catch (e) {
    hideTyping();
    renderMessage('tutor', 'Something went wrong. Please try again.');
  }

  sendBtn.disabled = false;
  userInput.focus();
}

async function sendToTutor(messages) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, state: appState })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.reply;
}

async function saveAndExit() {
  if (!lessonActive) return;

  const realResponses = conversationMessages.filter(
    m => m.role === 'user' && m.content !== 'Start the lesson. Give me the brief orientation, then the first prompt.'
  );
  if (realResponses.length < 3) {
    showToast('Short session — picking up here next time.');
    goHome();
    return;
  }

  lessonActive = false;
  sendBtn.disabled = true;
  showTyping();

  try {
    const res = await fetch('/api/end-lesson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationMessages, state: appState })
    });
    const data = await res.json();
    hideTyping();

    const checkpointMatch = data.reply.match(/:::CHECKPOINT:::([\s\S]*?):::CHECKPOINT:::/);
    if (checkpointMatch) {
      try {
        applyCheckpoint(JSON.parse(checkpointMatch[1].trim()));
      } catch (e) {
        console.error('Checkpoint parse error:', e);
        appState.learner.currentLesson += 1;
        appState.lessonState.lastCheckpoint = new Date().toISOString();
      }
    } else {
      appState.learner.currentLesson += 1;
      appState.lessonState.lastCheckpoint = new Date().toISOString();
    }

    await saveState();
    renderSidebar();

    const coachNote = data.reply
      .replace(/:::CHECKPOINT:::[\s\S]*?:::CHECKPOINT:::/g, '')
      .trim();
    if (coachNote) renderCoachNote(coachNote);

    document.getElementById('lessonInputPanel').style.display = 'none';
    document.getElementById('postLessonPanel').style.display = '';
  } catch (e) {
    hideTyping();
    lessonActive = true;
    sendBtn.disabled = false;
    renderMessage('tutor', "Claudette couldn't save this session. Please try again, or use Exit to leave without saving.");
  }
}

function exitLesson() {
  if (!lessonActive) return;
  goHome();
}

saveExitBtn.addEventListener('click', saveAndExit);
exitBtn.addEventListener('click', exitLesson);
returnHomeBtn.addEventListener('click', goHome);
appTitle.addEventListener('click', goHome);

/* ── Input controls ──────────────────────────────────────────────────────── */
sendBtn.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

userInput.addEventListener('input', () => autoResize(userInput));

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
    setRecording(false);
  } else {
    speechSynthesis.cancel();
    userInput.value = '';
    recognition.start();
    setRecording(true);
    micStatus.textContent = 'Listening…';
  }
});

/* ── Pattern modal ───────────────────────────────────────────────────────── */
function openPatternModal(id) {
  const pattern = appState.patterns.find(p => p.id === id);
  if (!pattern) return;
  editingPatternId = id;

  modalPatternName.textContent = pattern.pattern;
  patternNotes.value = pattern.notes || '';

  statusOptions.forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.status === pattern.status);
  });

  modalExamples.innerHTML = '';
  for (const ex of pattern.examples) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="ex-french">${ex.french}</span><span class="ex-english">${ex.english}</span>`;
    modalExamples.appendChild(li);
  }

  const isCurrent = appState.lessonState.currentPattern === id;
  modalStartHere.textContent = isCurrent ? '✓ Current focus' : 'Start here next lesson';
  modalStartHere.classList.toggle('set', isCurrent);

  modalOverlay.style.display = 'flex';
}

statusOptions.forEach(btn => {
  btn.addEventListener('click', async () => {
    statusOptions.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    if (!editingPatternId) return;
    const pattern = appState.patterns.find(p => p.id === editingPatternId);
    if (pattern) {
      pattern.status = btn.dataset.status;
      await saveState();
      renderSidebar();
    }
  });
});

function closeModal() {
  modalOverlay.style.display = 'none';
  editingPatternId = null;
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

modalStartHere.addEventListener('click', async () => {
  if (!editingPatternId) return;
  const p = appState.patterns.find(x => x.id === editingPatternId);
  if (!p) return;
  appState.lessonState.currentPattern = p.id;
  appState.lessonState.currentSection = p.section;
  appState.lessonState.currentBooklet = p.booklet;
  await saveState();
  renderSidebar();
  renderWelcome();
  modalStartHere.textContent = '✓ Set as next lesson';
  modalStartHere.classList.add('set');
  setTimeout(closeModal, 800);
});

modalSave.addEventListener('click', async () => {
  if (!editingPatternId) return;
  const pattern = appState.patterns.find(p => p.id === editingPatternId);
  if (pattern) {
    pattern.notes = patternNotes.value.trim();
    await saveState();
    renderSidebar();
  }
  closeModal();
});

/* ── Boot ────────────────────────────────────────────────────────────────── */
init();
