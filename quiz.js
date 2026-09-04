// ══════════════════════════════════════════
//   КОНФИГУРАЦИЯ
// ══════════════════════════════════════════
const TIME_LIMIT   = 120 * 60;     // 2 часа
const PASS_PERCENT = 60;

let isAuthorized = false;

// Количество вопросов
const QUIZ_COUNT = {
  worker: {
    biot: 20,
    pb:   60,
    ptm:  20
  },
  itr: {
    biot: 50,
    pb:   100,
    ptm:  20
  },
  electrical: 61,
  slinger: 20
};

const TEST_TYPES = {
  biot: { 
    name: "БиОТ", 
    title: "Безопасность и охрана труда",
    workerFile: "biot.json",
    itrFile:    "biot_itr.json"
  },
  pb: { 
    name: "ПБ", 
    title: "Промышленная безопасность",
    workerFile: "pb.json",
    itrFile:    "pb_itr.json"
  },
  ptm: { 
    name: "ПТМ", 
    title: "Пожарно-технический минимум",
    workerFile: "ptm.json",
    itrFile:    "ptm_itr.json"
  },
  electrical: {
    name: "Электробез",
    title: "Электробез",
    commonFile: "electrical.json",
    isCommon: true,
    questionCount: 20
  },
  slinger: { 
    name: "Стропальщик", 
    title: "Стропальщик",
    commonFile: "slinger.json",
    isCommon: true,
    questionCount: 20
  },
};

// ══════════════════════════════════════════
//   СОСТОЯНИЕ
// ══════════════════════════════════════════
let ALL_QUESTIONS = [];
let QUESTIONS     = [];
let TOTAL         = 0;
let current       = 0;
let answers       = [];
let finished      = false;
let startTime     = Date.now();
let timerInterval;
let currentTestType = null;
let currentCategory = null;

// ══════════════════════════════════════════
//   УТИЛИТЫ
// ══════════════════════════════════════════
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickRandom(pool, n) {
  return shuffle(pool).slice(0, n);
}

// ══════════════════════════════════════════
//   ПРОСТОЕ SHA-256 ХЭШИРОВАНИЕ
// ══════════════════════════════════════════
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ══════════════════════════════════════════
//   АВТОРИЗАЦИЯ
// ══════════════════════════════════════════
async function showLoginScreen(error = '') {
  let html = `
    <div class="selection-screen" style="padding-top:120px;">
      <div style="max-width:420px;margin:0 auto;background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:40px 32px;">
        <h2 style="text-align:center;margin-bottom:8px;">Вход в систему</h2>
        <p style="text-align:center;color:var(--muted);margin-bottom:30px;">Введите пароль</p>
        
        ${error ? `<p style="color:#ef4444;text-align:center;margin-bottom:20px;">${error}</p>` : ''}
        
        <input type="password" id="passwordInput" placeholder="Пароль" 
               style="width:100%;padding:16px 20px;border-radius:12px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:16px;margin-bottom:20px;text-align:center;">
        
        <button class="btn btn-primary" id="loginBtn" onclick="login()" 
                style="width:100%;padding:16px;">Войти</button>
      </div>
    </div>
  `;

  document.getElementById('app').innerHTML = html;
  document.getElementById('main-header').style.display = 'none';

  const passwordInput = document.getElementById('passwordInput');
  
  // Фокус на поле ввода
  setTimeout(() => passwordInput.focus(), 150);

  // Вход по нажатию Enter
  passwordInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      login();
    }
  });
}

async function login() {
  const enteredPassword = document.getElementById('passwordInput').value.trim();
  if (!enteredPassword) return showLoginScreen('Введите пароль');

  try {
    const res = await fetch('./passwords.json');
    if (!res.ok) throw new Error('Не удалось загрузить базу');

    const data = await res.json();
    const computedHash = await sha256(enteredPassword);

    const isValid = data.hashedPasswords.some(entry => entry.hash === computedHash);

    if (isValid) {
      isAuthorized = true;
      document.getElementById('main-header').style.display = 'flex';
      showTestSelection();
    } else {
      showLoginScreen('Неверный пароль');
    }
  } catch (e) {
    console.error(e);
    showLoginScreen('Ошибка загрузки базы паролей');
  }
}

function logout() {
  if (confirm('Выйти из системы?')) {
    isAuthorized = false;
    showLoginScreen();
  }
}

// ══════════════════════════════════════════
//   ГЛАВНЫЙ ЭКРАН ВЫБОРА
// ══════════════════════════════════════════
function showTestSelection() {
  clearInterval(timerInterval);
  document.getElementById('timer').style.display = 'none';
  document.getElementById('test-type').textContent = 'Пробное тестирование';

  let html = `
    <div class="selection-screen">
      <h2 style="text-align:center;margin-bottom:40px;font-family:'Unbounded',sans-serif;">
        Выберите тип теста
      </h2>
      <div class="test-cards">
  `;

  Object.keys(TEST_TYPES).forEach(key => {
    const t = TEST_TYPES[key];
    const icons = {
      biot: '🦺',
      pb: '🏭',
      ptm: '🧯',
      electrical: '⚡',
      slinger: '🏗️',
    };
    const icon = icons[key] || '📋';

    html += `
      <div class="test-card" onclick="selectCategory('${key}')">
        <div class="test-icon">${icon}</div>
        <h3>${t.name}</h3>
        <p>${t.title}</p>
      </div>
    `;
  });

  html += `
        <div class="test-card" onclick="showPurchaseScreen()">
          <div class="test-icon">📥</div>
          <h3>Получить вопросы</h3>
          <p style="font-size:12px;">барлық сурақтар</p>
          <small style="color:var(--orange);margin-top:8px;">2 000 ₸ / тест</small>
        </div>
      </div>
    </div>`;
  document.getElementById('app').innerHTML = html;
}

function selectCategory(testType) {
  currentTestType = testType;
  const t = TEST_TYPES[testType];

  if (t.isCommon) {
    currentCategory = 'common';
    loadQuestions(testType);
    return;
  }

  const html = `
    <div class="selection-screen">
      <h2 style="text-align:center;margin-bottom:30px;">${t.title}</h2>
      <p style="text-align:center;color:var(--muted);margin-bottom:40px;">
        Выберите категорию персонала
      </p>
      <div class="test-cards" style="max-width:720px;">
        <div class="test-card" onclick="startTest('${testType}', 'worker')">
          <div class="test-icon">👷</div>
          <h3>Для рабочих</h3>
          <small style="color:var(--muted);">
            ${testType === 'biot' ? '20 вопросов' : testType === 'pb' ? '60 вопросов' : '20 вопросов'}
          </small>
        </div>
        <div class="test-card" onclick="startTest('${testType}', 'itr')">
          <div class="test-icon">👔</div>
          <h3>Для ИТР</h3>
          <small style="color:var(--muted);">
            ${testType === 'biot' ? '50 вопросов' : testType === 'pb' ? '100 вопросов' : '20 вопросов'}
          </small>
        </div>
      </div>
      <div style="text-align:center;margin-top:40px;">
        <button class="btn btn-outline" onclick="showTestSelection()">← Назад</button>
      </div>
    </div>
  `;

  document.getElementById('app').innerHTML = html;
}

function startTest(type, category) {
  currentCategory = category;
  loadQuestions(type);
}

// ══════════════════════════════════════════
//   ЗАГРУЗКА ВОПРОСОВ
// ══════════════════════════════════════════
async function loadQuestions(type) {
  try {
    const config = TEST_TYPES[type];
    let fileName = config.isCommon ? config.commonFile : 
                   (currentCategory === 'itr' ? config.itrFile : config.workerFile);

    const filePath = './' + fileName;

    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    ALL_QUESTIONS = await res.json();
    currentTestType = type;

    const categoryText = config.isCommon ? '' : 
                        (currentCategory === 'itr' ? ' (ИТР)' : ' (Рабочие)');

    document.getElementById('test-type').textContent = config.name + categoryText;

    initTest();

  } catch (e) {
    console.error(e);
    document.getElementById('app').innerHTML = `
      <div style="color:#ef4444;text-align:center;padding:100px 20px;">
        ❌ Не удалось загрузить вопросы<br><br>
        <small>Файл: ${fileName || 'неизвестен'}</small>
      </div>`;
  }
}

// ══════════════════════════════════════════
//   ИНИЦИАЛИЗАЦИЯ ТЕСТА + ТАЙМЕР + РЕНДЕР
// (остальной код без изменений)
function initTest() {
  clearInterval(timerInterval);

  let questionCount = TEST_TYPES[currentTestType].isCommon 
    ? TEST_TYPES[currentTestType].questionCount 
    : (currentCategory === 'itr' 
        ? QUIZ_COUNT.itr[currentTestType] 
        : QUIZ_COUNT.worker[currentTestType]);

  QUESTIONS = pickRandom(ALL_QUESTIONS, Math.min(questionCount, ALL_QUESTIONS.length));
  TOTAL     = QUESTIONS.length;
  current   = 0;
  answers   = new Array(TOTAL).fill(null);
  finished  = false;
  startTime = Date.now();

  document.getElementById('timer').style.display = '';
  document.getElementById('timer').classList.remove('urgent');

  startTimer();
  render();
}

function startTimer() {
  const el = document.getElementById('timer');
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const left = Math.max(0, TIME_LIMIT - elapsed);

    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;

    el.textContent = h > 0 
      ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` 
      : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    el.classList.toggle('urgent', left <= 300);
    if (left === 0) finishTest();
  }, 500);
}

function render() {
  if (finished) { renderResult(); return; }
  renderQuiz();
}

function renderQuiz() {
  const q = QUESTIONS[current];
  const letters = ['a','b','c','d','e','f'];
  const answered = answers.filter(a => a !== null).length;
  const pct = answered / TOTAL * 100;

  document.getElementById('app').innerHTML = `
    <div class="nav-card">
      <div class="nav-label">Навигация по тесту</div>
      <div class="nav-dots">
        ${QUESTIONS.map((_, i) => `
          <button class="nav-dot ${i === current ? 'active' : ''} ${answers[i] !== null ? 'answered' : ''}" 
                  onclick="goTo(${i})">${i + 1}</button>
        `).join('')}
      </div>
    </div>

    <div class="progress-bar-wrap">
      <div class="progress-bar-track">
        <div class="progress-bar-fill" style="width:${pct}%"></div>
      </div>
    </div>

    <div class="question-card">
      <div class="question-header">
        <div class="q-num">Вопрос ${current + 1} <span style="opacity:.4">/ ${TOTAL}</span></div>
        <div class="q-text">${q.text}</div>
      </div>
      <div class="options">
        ${q.options.map((opt, i) => `
          <div class="option ${answers[current] === i ? 'selected' : ''}" 
               onclick="selectAnswer(${i})">
            <div class="opt-letter">${letters[i]}</div>
            <div class="opt-text">${opt}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="footer-bar">
      <div class="progress-info">Отвечено: <b>${answered}</b> из <b>${TOTAL}</b></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        ${current > 0 ? `<button class="btn btn-outline" onclick="goTo(${current - 1})">← Назад</button>` : ''}
        ${current < TOTAL - 1 
          ? `<button class="btn btn-primary" onclick="goTo(${current + 1})">Следующий →</button>`
          : `<button class="btn btn-primary" onclick="confirmFinish()">Завершить тест ✓</button>`}
        <button class="btn btn-danger" onclick="confirmFinish()">Закончить попытку</button>
      </div>
    </div>
  `;
}

function renderResult() {
  clearInterval(timerInterval);
  document.getElementById('timer').style.display = 'none';

  let correct = 0;
  let keyed = 0;
  QUESTIONS.forEach((q, i) => {
    if (Number.isInteger(q.answer)) { keyed++; if (answers[i] === q.answer) correct++; }
  });

  const pct = keyed ? Math.round((correct / keyed) * 100) : 0;
  const passed = keyed > 0 && pct >= PASS_PERCENT;
  const categoryName = TEST_TYPES[currentTestType].isCommon 
    ? TEST_TYPES[currentTestType].name 
    : (currentCategory === 'itr' ? 'ИТР' : 'Рабочие');

  const letters = ['a','b','c','d','e','f'];

  const resultTitle = passed 
    ? '🎉 Поздравляем! Тест успешно пройден!' 
    : '😔 Тест не пройден';

  const resultSub = keyed === 0 ? 'Ключи правильных ответов пока не загружены — добавим их позже.' : (passed ? `Отличный результат! Вы набрали ${pct}%` : `Набрано ${pct}%. Необходимо минимум ${PASS_PERCENT}% для сдачи.`);

  const reviewHTML = QUESTIONS.map((q, i) => {
    const userAns = answers[i];
    return `
      <div class="review-item">
        <div class="ri-q"><b>Вопрос ${i+1}.</b> ${q.text}</div>
        <div class="ri-answers">
          ${q.options.map((opt, j) => {
            let cls = '';
            if (Number.isInteger(q.answer) && j === q.answer) cls = 'correct';
            else if (Number.isInteger(q.answer) && j === userAns && userAns !== q.answer) cls = 'wrong';
            return `<div class="ri-ans ${cls}">${letters[j]}. ${opt}${Number.isInteger(q.answer) && j === q.answer ? ' ✓' : Number.isInteger(q.answer) && j === userAns ? ' ✗' : ''}</div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');

  document.getElementById('app').innerHTML = `
    <div class="result-screen">
      <div class="result-circle">
        <svg viewBox="0 0 130 130">
          <circle class="track" cx="65" cy="65" r="58"/>
          <circle class="fill" cx="65" cy="65" r="58" 
            stroke-dasharray="364" 
            stroke-dashoffset="${364 - (364 * pct / 100)}"/>
        </svg>
        <div class="result-pct">${pct}%</div>
      </div>

      <h2 class="result-title">${resultTitle}</h2>
      <p class="result-sub">${resultSub}<br><small>${categoryName}</small></p>

      <div class="result-stats">
        <div class="stat-pill"><div class="stat-num c">${correct}</div><div class="stat-lbl">Правильно</div></div>
        <div class="stat-pill"><div class="stat-num w">${keyed ? keyed - correct : '—'}</div><div class="stat-lbl">Неправильно</div></div>
      </div>

      <div style="margin:30px 0;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="restartTest()">Пройти заново</button>
        <button class="btn btn-outline" onclick="showTestSelection()">← Выбрать другой тест</button>
      </div>

      <div class="review-section">
        <div class="review-title">Разбор ответов</div>
        ${reviewHTML}
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
//   ДЕЙСТВИЯ
// ══════════════════════════════════════════
function selectAnswer(idx) {
  if (finished) return;
  answers[current] = idx;
  render();
}

function goTo(idx) {
  if (idx < 0 || idx >= TOTAL) return;
  current = idx;
  render();
}

function confirmFinish() {
  const unanswered = answers.filter(a => a === null).length;
  if (unanswered > 0) {
    document.getElementById('modal').classList.add('show');
  } else {
    finishTest();
  }
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
}

function finishTest() {
  closeModal();
  finished = true;
  render();
}

function restartTest() {
  if (currentTestType) initTest();
}

// ══════════════════════════════════════════
//   ГЛОБАЛЬНЫЕ ФУНКЦИИ
// ══════════════════════════════════════════
window.showTestSelection = showTestSelection;
window.selectCategory = selectCategory;
window.startTest = startTest;
window.goTo = goTo;
window.selectAnswer = selectAnswer;
window.confirmFinish = confirmFinish;
window.closeModal = closeModal;
window.finishTest = finishTest;
window.restartTest = restartTest;
window.login = login;
window.logout = logout;

// ══════════════════════════════════════════
//   СТАРТ
// ══════════════════════════════════════════
showLoginScreen();


// ══════════════════════════════════════════
//   ПОЛУЧИТЬ ВОПРОСЫ / ОПЛАТА
// ══════════════════════════════════════════
const QUESTION_PRICE = 2000;
const PAYMENT_CARD = '4400 4303 4394 1941';
const QUESTION_PACKS = [
  {id:'biot-worker', name:'БиОТ — для рабочих', file:'biot.json', material:'materials/biot-worker.pdf'},
  {id:'biot-itr', name:'БиОТ — для ИТР', file:'biot_itr.json', material:'materials/biot-itr.pdf'},
  {id:'pb-worker', name:'ПБ — для рабочих', file:'pb.json', material:'materials/pb-worker.pdf'},
  {id:'pb-itr', name:'ПБ — для ИТР', file:'pb_itr.json', material:'materials/pb-itr.pdf'},
  {id:'ptm-worker', name:'ПТМ — для рабочих', file:'ptm.json', material:'materials/ptm-worker.pdf'},
  {id:'ptm-itr', name:'ПТМ — для ИТР', file:'ptm_itr.json', material:'materials/ptm-itr.pdf'},
  {id:'electrical', name:'Электробез', file:'electrical.json', material:'materials/electrical.pdf'},
  {id:'slinger', name:'Стропальщик', file:'slinger.json', material:'materials/slinger.pdf'}
];

let purchaseReceiptFile = null;
let purchaseVerified = false;
let verifiedPackIds = [];

function showPurchaseScreen() {
  clearInterval(timerInterval);
  document.getElementById('timer').style.display = 'none';
  document.getElementById('test-type').textContent = 'Получить вопросы';
  purchaseReceiptFile = null;
  purchaseVerified = false;
  verifiedPackIds = [];

  const items = QUESTION_PACKS.map(p => `
    <label class="purchase-item" id="row-${p.id}">
      <input type="checkbox" class="purchase-check" value="${p.id}" onchange="updatePurchaseTotal()">
      <span class="purchase-checkmark" aria-hidden="true">✓</span>
      <span class="purchase-item-main">
        <span class="purchase-item-title">${p.name}</span>
        <span class="purchase-item-sub">Вопросы + правильные ответы</span>
      </span>
      <span class="purchase-price">2 000 ₸</span>
    </label>`).join('');

  document.getElementById('app').innerHTML = `
    <div class="selection-screen purchase-screen">
      <div class="purchase-wrap">
        <div class="purchase-head">
          <div class="purchase-kicker">База для подготовки</div>
          <h2>Получить вопросы</h2>
          <p>барлық сұрақтар</p>
        </div>

        <section class="purchase-panel">
          <div class="purchase-step-head">
            <div><span class="step-badge">1</span><strong>Выберите нужные тесты</strong></div>
            <label class="select-all-control">
              <input id="selectAllPacks" type="checkbox" onchange="toggleAllPacks(this.checked)">
              <span>Выбрать все</span>
            </label>
          </div>
          <div class="purchase-list">${items}</div>
          <div class="purchase-summary">
            <span id="purchaseCount">Выбрано: 0</span>
            <span>Итого: <strong id="purchaseTotal">0 ₸</strong></span>
          </div>
        </section>

        <section class="purchase-panel payment-box">
          <div class="purchase-step-head">
            <div><span class="step-badge">2</span><strong>Оплатите выбранные тесты</strong></div>
          </div>
          <div class="payment-grid">
            <div>
              <div class="payment-label">Номер карты</div>
              <div class="card-number" id="paymentCard">${PAYMENT_CARD}</div>
            </div>
            <button class="copy-btn" type="button" onclick="copyPaymentCard()">Скопировать</button>
          </div>
          <div class="amount-callout">К оплате: <strong id="paymentAmount">0 ₸</strong></div>
          <div class="purchase-note">Переведите сумму, указанную выше. После оплаты загрузите чек.</div>
        </section>

        <section class="purchase-panel receipt-box">
          <div class="purchase-step-head">
            <div><span class="step-badge">3</span><strong>Загрузите чек оплаты</strong></div>
          </div>
          <label class="receipt-drop" id="receiptDrop">
            <input id="receiptInput" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onchange="handleReceiptUpload(event)">
            <span class="receipt-icon">🧾</span>
            <span class="receipt-title" id="receiptTitle">Выбрать чек</span>
            <span class="receipt-help">JPG, PNG, WEBP или PDF · до 15 МБ</span>
          </label>
          <div class="receipt-status" id="receiptStatus">После загрузки здесь появится статус проверки.</div>
        </section>

        <div class="purchase-actions">
          <button class="btn btn-outline" onclick="showTestSelection()">← Назад</button>
          <button class="btn btn-primary verify-payment-btn" id="verifyPurchaseBtn" onclick="verifyPurchaseReceipt()" disabled>Проверить чек и получить файлы</button>
        </div>

        <div id="downloadArea"></div>
      </div>
    </div>`;
}

function getSelectedPacks() {
  return Array.from(document.querySelectorAll('.purchase-check:checked')).map(el => el.value);
}

function formatMoney(value) {
  return `${value.toLocaleString('ru-RU')} ₸`;
}

function updatePurchaseTotal() {
  const selected = getSelectedPacks();
  const total = selected.length * QUESTION_PRICE;
  const totalEl = document.getElementById('purchaseTotal');
  const paymentAmount = document.getElementById('paymentAmount');
  const count = document.getElementById('purchaseCount');
  if (totalEl) totalEl.textContent = formatMoney(total);
  if (paymentAmount) paymentAmount.textContent = formatMoney(total);
  if (count) count.textContent = `Выбрано: ${selected.length}`;

  QUESTION_PACKS.forEach(p => {
    const row = document.getElementById(`row-${p.id}`);
    const checked = document.querySelector(`.purchase-check[value="${p.id}"]`)?.checked;
    if (row) row.classList.toggle('selected', !!checked);
  });
  const all = document.getElementById('selectAllPacks');
  if (all) {
    all.checked = selected.length === QUESTION_PACKS.length;
    all.indeterminate = selected.length > 0 && selected.length < QUESTION_PACKS.length;
  }

  purchaseVerified = false;
  verifiedPackIds = [];
  const dl = document.getElementById('downloadArea');
  if (dl) dl.innerHTML = '';
  updateVerifyButton();
}

function toggleAllPacks(checked) {
  document.querySelectorAll('.purchase-check').forEach(el => el.checked = checked);
  updatePurchaseTotal();
}

async function copyPaymentCard() {
  const raw = PAYMENT_CARD.replace(/\s/g,'');
  try {
    await navigator.clipboard.writeText(raw);
    const btn = document.querySelector('.copy-btn');
    if (btn) {
      const old = btn.textContent;
      btn.textContent = 'Скопировано ✓';
      setTimeout(() => btn.textContent = old, 1400);
    }
  } catch (_) {
    window.prompt('Скопируйте номер карты:', raw);
  }
}

function updateVerifyButton() {
  const btn = document.getElementById('verifyPurchaseBtn');
  if (btn) btn.disabled = !(getSelectedPacks().length && purchaseReceiptFile);
}

async function handleReceiptUpload(event) {
  const file = event.target.files?.[0];
  purchaseReceiptFile = null;
  purchaseVerified = false;
  verifiedPackIds = [];
  const downloadArea = document.getElementById('downloadArea');
  if (downloadArea) downloadArea.innerHTML = '';
  const status = document.getElementById('receiptStatus');
  const title = document.getElementById('receiptTitle');
  const drop = document.getElementById('receiptDrop');

  if (!file) {
    if (status) status.textContent = 'После загрузки здесь появится статус проверки.';
    if (title) title.textContent = 'Выбрать чек';
    if (drop) drop.classList.remove('has-file','file-error');
    updateVerifyButton();
    return;
  }

  const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
  if (!allowed.includes(file.type)) {
    setReceiptError('Формат файла не поддерживается. Выберите JPG, PNG, WEBP или PDF.');
    event.target.value = '';
    updateVerifyButton();
    return;
  }
  if (file.size < 5000 || file.size > 15 * 1024 * 1024) {
    setReceiptError('Размер файла выглядит некорректно. Загрузите оригинальный чек до 15 МБ.');
    event.target.value = '';
    updateVerifyButton();
    return;
  }

  if (file.type.startsWith('image/')) {
    const ok = await validateImageFile(file);
    if (!ok) {
      setReceiptError('Изображение не удалось открыть. Выберите другой файл чека.');
      event.target.value = '';
      updateVerifyButton();
      return;
    }
  } else {
    const ok = await validatePdfFile(file);
    if (!ok) {
      setReceiptError('PDF не удалось прочитать. Выберите оригинальный файл чека.');
      event.target.value = '';
      updateVerifyButton();
      return;
    }
  }

  purchaseReceiptFile = file;
  if (title) title.textContent = file.name;
  if (status) status.innerHTML = `<span class="status-ok">✓ Файл загружен.</span> Нажмите «Проверить чек и получить файлы».`;
  if (drop) { drop.classList.add('has-file'); drop.classList.remove('file-error'); }
  updateVerifyButton();
}

function setReceiptError(message) {
  const status = document.getElementById('receiptStatus');
  const title = document.getElementById('receiptTitle');
  const drop = document.getElementById('receiptDrop');
  if (status) status.innerHTML = `<span class="status-error">${escapeHtml(message)}</span>`;
  if (title) title.textContent = 'Выбрать другой чек';
  if (drop) { drop.classList.add('file-error'); drop.classList.remove('has-file'); }
}

function validateImageFile(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const ok = img.naturalWidth >= 250 && img.naturalHeight >= 250;
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

async function validatePdfFile(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head) === '%PDF-';
  } catch (_) { return false; }
}

async function verifyPurchaseReceipt() {
  const selected = getSelectedPacks();
  if (!selected.length) return alert('Выберите хотя бы один тест.');
  if (!purchaseReceiptFile) return alert('Загрузите чек оплаты.');

  const btn = document.getElementById('verifyPurchaseBtn');
  const status = document.getElementById('receiptStatus');
  btn.disabled = true;
  btn.textContent = 'Проверяем файл…';

  try {
    // На статическом GitHub Pages без банковского API здесь возможно проверить только сам файл.
    // После успешной проверки файла доступ открывается к заранее подготовленным материалам.
    if (purchaseReceiptFile.size < 5000) throw new Error('Файл чека слишком маленький.');

    purchaseVerified = true;
    verifiedPackIds = [...selected];
    if (status) status.innerHTML = '<span class="status-ok">✓ Чек принят. Материалы готовы к скачиванию.</span>';
    renderDownloads(selected);
    document.getElementById('downloadArea')?.scrollIntoView({behavior:'smooth', block:'start'});
  } catch (e) {
    purchaseVerified = false;
    verifiedPackIds = [];
    if (status) status.innerHTML = `<span class="status-error">Не удалось обработать чек: ${escapeHtml(e.message || 'ошибка')}</span>`;
  } finally {
    btn.textContent = 'Проверить чек и получить файлы';
    btn.disabled = false;
  }
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function renderDownloads(selectedIds) {
  const packs = QUESTION_PACKS.filter(p => selectedIds.includes(p.id));
  const area = document.getElementById('downloadArea');
  if (!area) return;
  area.innerHTML = `
    <section class="purchase-success">
      <div class="success-icon">✓</div>
      <div class="success-copy">
        <h3>Материалы готовы</h3>
        <p>Ниже находятся именно те тесты, которые вы выбрали. Каждый файл содержит все вопросы и правильные ответы.</p>
      </div>
      <button class="btn btn-primary download-all-btn" onclick="downloadSelectedAsZip()">Скачать все одним ZIP</button>
    </section>
    <div class="download-list">
      ${packs.map(p => `
        <div class="download-row">
          <div class="download-row-copy">
            <strong>${p.name}</strong>
            <span>PDF · вопросы и правильные ответы</span>
          </div>
          <a class="btn btn-outline material-link" href="${p.material}" download>Скачать</a>
        </div>`).join('')}
    </div>
    <div class="delivery-note">Если автоматическая загрузка ZIP не сработает, используйте отдельную кнопку «Скачать» напротив каждого теста — это прямые файлы на сайте.</div>`;
}

async function downloadSelectedAsZip() {
  if (!purchaseVerified || !verifiedPackIds.length) return alert('Сначала пройдите проверку чека.');
  const btn = document.querySelector('.download-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Готовим ZIP…'; }
  try {
    const packs = QUESTION_PACKS.filter(p => verifiedPackIds.includes(p.id));
    const files = [];
    for (const p of packs) {
      const res = await fetch('./' + p.material, {cache:'no-store'});
      if (!res.ok) throw new Error(`Не удалось загрузить ${p.name}`);
      files.push({name: safeFileName(p.name) + '.pdf', data: new Uint8Array(await res.arrayBuffer())});
    }
    const zipBytes = makeStoreZip(files);
    const blob = new Blob([zipBytes], {type:'application/zip'});
    saveBlob(blob, `Вопросы_${packs.length}_тестов_PDF.zip`);
  } catch (e) {
    alert('Не удалось собрать ZIP. Скачайте файлы по отдельности кнопками ниже.\n' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Скачать все одним ZIP'; }
  }
}

function safeFileName(name) {
  return name.replace(/[\\/:*?"<>|—]+/g,'_').replace(/\s+/g,'_');
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// Минимальный ZIP без сжатия (STORE), чтобы не зависеть от сторонних библиотек/CDN.
function makeStoreZip(files) {
  const encoder = new TextEncoder();
  const locals = [];
  const centrals = [];
  let offset = 0;

  const u16 = n => new Uint8Array([n & 255, (n >>> 8) & 255]);
  const u32 = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
  const concat = parts => {
    const size = parts.reduce((s,p)=>s+p.length,0);
    const out = new Uint8Array(size); let pos=0;
    parts.forEach(p=>{out.set(p,pos);pos+=p.length;});
    return out;
  };

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data) >>> 0;
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data
    ]);
    locals.push(local);
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralData = concat(centrals);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralData.length), u32(offset), u16(0)
  ]);
  return concat([...locals, centralData, end]);
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i=0; i<bytes.length; i++) {
    c ^= bytes[i];
    for (let k=0; k<8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
