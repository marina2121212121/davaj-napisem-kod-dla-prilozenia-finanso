/**
 * Synchronous Family Finance Web Application
 * Features:
 * - Real-time cloud sync across devices (api.restful-api.dev + ntfy SSE)
 * - Offline persistence (localStorage)
 * - Conflict-free transaction log merging
 * - QR Code & 1-click URL sharing
 * - Partner contribution tracking & category analytics
 */

// Configuration & Default Room
const DEFAULT_ROOM_ID = 'ff808181a09d98f701a130ae7c884ae2';
const API_BASE = 'https://api.restful-api.dev/objects';
const NTFY_BASE = 'https://ntfy.sh';

// Categories Configuration
const CATEGORIES = {
  expense: [
    { name: 'Продукты', icon: '🛒', color: '#10b981' },
    { name: 'Кафе и еда', icon: '☕', color: '#f59e0b' },
    { name: 'Транспорт', icon: '🚗', color: '#3b82f6' },
    { name: 'Жильё и ЖКХ', icon: '🏠', color: '#8b5cf6' },
    { name: 'Покупки', icon: '🛍️', color: '#ec4899' },
    { name: 'Здоровье', icon: '💊', color: '#ef4444' },
    { name: 'Досуг', icon: '🎬', color: '#06b6d4' },
    { name: 'Другое', icon: '📦', color: '#64748b' },
  ],
  income: [
    { name: 'Зарплата', icon: '💰', color: '#10b981' },
    { name: 'Подработка', icon: '💼', color: '#3b82f6' },
    { name: 'Подарок', icon: '🎁', color: '#ec4899' },
    { name: 'Инвестиции', icon: '📈', color: '#f59e0b' },
    { name: 'Другое', icon: '💵', color: '#64748b' },
  ]
};

// Global App State
let state = {
  roomId: '',
  budgetTitle: 'Семейный бюджет',
  currentUser: localStorage.getItem('finance_user_name') || 'Марина',
  transactions: [],
  activeFilter: 'all',
  activeAuthorFilter: 'all',
  currentType: 'expense', // 'expense' or 'income'
  selectedCategory: CATEGORIES.expense[0],
  isSyncing: false,
  lastSyncTime: null,
  chartInstance: null
};

// DOM References
const el = {
  budgetTitle: document.getElementById('budgetTitle'),
  btnEditTitle: document.getElementById('btnEditTitle'),
  syncBadge: document.getElementById('syncBadge'),
  syncStatusText: document.getElementById('syncStatusText'),
  syncTimeBadge: document.getElementById('syncTimeBadge'),
  syncIcon: document.getElementById('syncIcon'),
  btnSyncRefresh: document.getElementById('btnSyncRefresh'),
  currentUserNameLabel: document.getElementById('currentUserNameLabel'),
  btnSwitchUser: document.getElementById('btnSwitchUser'),
  
  totalBalanceVal: document.getElementById('totalBalanceVal'),
  totalIncomeVal: document.getElementById('totalIncomeVal'),
  totalExpenseVal: document.getElementById('totalExpenseVal'),

  txListContainer: document.getElementById('txListContainer'),
  authorFilter: document.getElementById('authorFilter'),

  // Tabs
  navTabs: document.querySelectorAll('.nav-tab'),
  tabPanes: document.querySelectorAll('.tab-pane'),

  // Modals
  addModal: document.getElementById('addModal'),
  btnOpenAddModal: document.getElementById('btnOpenAddModal'),
  btnCloseAddModal: document.getElementById('btnCloseAddModal'),
  btnSaveTransaction: document.getElementById('btnSaveTransaction'),
  typeExpenseBtn: document.getElementById('typeExpenseBtn'),
  typeIncomeBtn: document.getElementById('typeIncomeBtn'),
  txAmount: document.getElementById('txAmount'),
  txTitle: document.getElementById('txTitle'),
  txAuthor: document.getElementById('txAuthor'),
  txDate: document.getElementById('txDate'),
  categoryGrid: document.getElementById('categoryGrid'),

  shareModal: document.getElementById('shareModal'),
  btnShareModal: document.getElementById('btnShareModal'),
  btnCloseShareModal: document.getElementById('btnCloseShareModal'),
  qrCodeContainer: document.getElementById('qrCodeContainer'),
  btnCopyShareUrl: document.getElementById('btnCopyShareUrl'),
  btnNativeShare: document.getElementById('btnNativeShare'),
  displayRoomId: document.getElementById('displayRoomId'),
  btnCopyShareLink2: document.getElementById('btnCopyShareLink2'),
  btnShowQrCode2: document.getElementById('btnShowQrCode2'),

  // Member Tab elements
  inputCustomUserName: document.getElementById('inputCustomUserName'),
  btnSaveUserName: document.getElementById('btnSaveUserName'),
  inputJoinRoomId: document.getElementById('inputJoinRoomId'),
  btnJoinRoom: document.getElementById('btnJoinRoom'),
  btnCreateNewBudget: document.getElementById('btnCreateNewBudget'),
  btnExportJson: document.getElementById('btnExportJson'),
  btnClearData: document.getElementById('btnClearData'),

  // Analytics elements
  categoryChart: document.getElementById('categoryChart'),
  chartNoData: document.getElementById('chartNoData'),
  authorStatsContainer: document.getElementById('authorStatsContainer'),
  categoryBreakdownList: document.getElementById('categoryBreakdownList'),

  toast: document.getElementById('toast')
};

// ==========================================
// 1. Initialization
// ==========================================
function initApp() {
  resolveRoomId();
  loadLocalState();
  renderUserLabel();
  renderCategoryGrid();
  attachEventListeners();
  
  // Set default transaction date to today
  el.txDate.value = new Date().toISOString().split('T')[0];
  el.txAuthor.value = state.currentUser;
  el.inputCustomUserName.value = state.currentUser;

  // Initial render
  updateUI();

  // Connect cloud sync
  fetchRemoteData();
  setupRealtimeSSE();
  startSyncPolling();
}

/**
 * Resolve Room ID from URL (e.g. ?room=xyz or #room=xyz) or localStorage or fallback
 */
function resolveRoomId() {
  const urlParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.replace('#', '');
  
  let rid = urlParams.get('room') || (hash.startsWith('room=') ? hash.replace('room=', '') : null);
  
  if (rid) {
    state.roomId = rid.trim();
    localStorage.setItem('finance_active_room_id', state.roomId);
  } else {
    const saved = localStorage.getItem('finance_active_room_id');
    state.roomId = saved || DEFAULT_ROOM_ID;
  }

  el.displayRoomId.textContent = state.roomId;
}

/**
 * Load offline cached transactions & settings
 */
function loadLocalState() {
  try {
    const cached = localStorage.getItem(`finance_data_${state.roomId}`);
    if (cached) {
      const parsed = jsonParseSafe(cached);
      if (parsed && Array.isArray(parsed.transactions)) {
        state.transactions = parsed.transactions;
        if (parsed.title) state.budgetTitle = parsed.title;
      }
    }
  } catch (err) {
    console.error('Error loading local state:', err);
  }
}

function saveLocalState() {
  try {
    localStorage.setItem(`finance_data_${state.roomId}`, JSON.stringify({
      title: state.budgetTitle,
      transactions: state.transactions,
      updatedAt: Date.now()
    }));
  } catch (err) {
    console.warn('LocalStorage save error:', err);
  }
}

// ==========================================
// 2. Cloud Sync (api.restful-api.dev + ntfy)
// ==========================================
let sseConnection = null;

async function fetchRemoteData(isSilent = false) {
  if (state.isSyncing) return;
  state.isSyncing = true;
  setSyncStatus('Синхронизация...', 'syncing');

  try {
    const res = await fetch(`${API_BASE}/${state.roomId}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!res.ok) {
      if (res.status === 404) {
        // Room not found in cloud yet, initialize it!
        await pushStateToRemote();
        setSyncStatus('В сети', 'online');
        return;
      }
      throw new Error(`HTTP error ${res.status}`);
    }

    const obj = await res.json();
    if (obj && obj.data) {
      mergeRemoteData(obj.data);
      setSyncStatus('В сети', 'online');
      state.lastSyncTime = new Date();
      el.syncTimeBadge.textContent = 'Обновлено только что';
    }
  } catch (err) {
    console.warn('Cloud sync fetch warning:', err);
    setSyncStatus('Офлайн режим', 'offline');
  } finally {
    state.isSyncing = false;
  }
}

function mergeRemoteData(remoteData) {
  if (!remoteData || !Array.isArray(remoteData.transactions)) return;

  if (remoteData.title && remoteData.title !== state.budgetTitle) {
    state.budgetTitle = remoteData.title;
  }

  // Map of local transactions
  const localMap = new Map();
  state.transactions.forEach(tx => localMap.set(tx.id, tx));

  let hasChanges = false;

  remoteData.transactions.forEach(remoteTx => {
    const localTx = localMap.get(remoteTx.id);
    if (!localTx) {
      localMap.set(remoteTx.id, remoteTx);
      hasChanges = true;
    } else {
      // Conflict resolution: higher updatedAt wins
      const remoteUpdated = remoteTx.updatedAt || 0;
      const localUpdated = localTx.updatedAt || 0;
      if (remoteUpdated > localUpdated) {
        localMap.set(remoteTx.id, remoteTx);
        hasChanges = true;
      }
    }
  });

  state.transactions = Array.from(localMap.values())
    .filter(tx => !tx.isDeleted)
    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt) || b.updatedAt - a.updatedAt);

  saveLocalState();
  updateUI();

  if (hasChanges) {
    showToast('Обновлено с другого устройства ⚡');
  }
}

async function pushStateToRemote() {
  try {
    setSyncStatus('Сохранение...', 'syncing');

    const payload = {
      name: `FinanceRoom_${state.roomId}`,
      data: {
        version: 1,
        title: state.budgetTitle,
        updatedAt: Date.now(),
        transactions: state.transactions
      }
    };

    const res = await fetch(`${API_BASE}/${state.roomId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.status === 404) {
      // Room object doesn't exist on server yet, create new with POST
      await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `FinanceRoom_${state.roomId}`,
          data: payload.data
        })
      });
    }

    setSyncStatus('В сети', 'online');
    
    // Broadcast instant SSE notification via ntfy
    broadcastNtfySignal();

  } catch (err) {
    console.warn('Error pushing state to remote:', err);
    setSyncStatus('Офлайн режим', 'offline');
  }
}

function broadcastNtfySignal() {
  try {
    fetch(`${NTFY_BASE}/finance-sync-${state.roomId}`, {
      method: 'POST',
      body: JSON.stringify({ room: state.roomId, at: Date.now() })
    }).catch(() => {});
  } catch (e) {}
}

function setupRealtimeSSE() {
  if (sseConnection) {
    sseConnection.close();
  }

  try {
    const sseTopic = `finance-sync-${state.roomId}`;
    sseConnection = new EventSource(`${NTFY_BASE}/${sseTopic}/sse`);
    
    sseConnection.onmessage = (event) => {
      // Trigger instant background sync
      fetchRemoteData(true);
    };

    sseConnection.onerror = () => {
      // In case of error, polling will take care of it
    };
  } catch (err) {
    console.warn('SSE Setup notice:', err);
  }
}

function startSyncPolling() {
  // Poll every 5 seconds for robust background sync
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetchRemoteData(true);
    }
  }, 5000);

  // Sync on tab active
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchRemoteData(true);
    }
  });
}

function setSyncStatus(text, status) {
  el.syncStatusText.textContent = text;
  
  if (status === 'syncing') {
    el.syncBadge.className = 'flex items-center space-x-1 text-sky-400 font-medium';
    el.syncIcon.classList.add('syncing-spin');
  } else if (status === 'online') {
    el.syncBadge.className = 'flex items-center space-x-1 text-emerald-400 font-medium';
    el.syncIcon.classList.remove('syncing-spin');
  } else {
    el.syncBadge.className = 'flex items-center space-x-1 text-amber-400 font-medium';
    el.syncIcon.classList.remove('syncing-spin');
  }
}

// ==========================================
// 3. UI Rendering & Interactions
// ==========================================
function updateUI() {
  renderHeaderAndBalance();
  renderAuthorFilter();
  renderTransactionsList();
  renderAnalytics();
}

function renderHeaderAndBalance() {
  el.budgetTitle.textContent = state.budgetTitle;

  let totalIncome = 0;
  let totalExpense = 0;

  state.transactions.forEach(tx => {
    if (tx.isDeleted) return;
    const amount = Number(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amount;
    } else {
      totalExpense += amount;
    }
  });

  const balance = totalIncome - totalExpense;

  el.totalBalanceVal.textContent = formatMoney(balance);
  el.totalIncomeVal.textContent = formatMoney(totalIncome);
  el.totalExpenseVal.textContent = formatMoney(totalExpense);

  if (balance < 0) {
    el.totalBalanceVal.parentElement.classList.add('text-rose-400');
    el.totalBalanceVal.parentElement.classList.remove('text-white');
  } else {
    el.totalBalanceVal.parentElement.classList.remove('text-rose-400');
    el.totalBalanceVal.parentElement.classList.add('text-white');
  }
}

function renderAuthorFilter() {
  // Collect unique authors
  const authors = new Set();
  state.transactions.forEach(tx => {
    if (tx.author && !tx.isDeleted) authors.add(tx.author.trim());
  });

  const currentVal = el.authorFilter.value;
  el.authorFilter.innerHTML = '<option value="all">Все участники</option>';
  
  authors.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === currentVal) opt.selected = true;
    el.authorFilter.appendChild(opt);
  });
}

function renderTransactionsList() {
  const container = el.txListContainer;
  container.innerHTML = '';

  let filtered = state.transactions.filter(tx => !tx.isDeleted);

  // Filter by Type
  if (state.activeFilter === 'expense') {
    filtered = filtered.filter(tx => tx.type === 'expense');
  } else if (state.activeFilter === 'income') {
    filtered = filtered.filter(tx => tx.type === 'income');
  }

  // Filter by Author
  if (state.activeAuthorFilter !== 'all') {
    filtered = filtered.filter(tx => tx.author === state.activeAuthorFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 px-4 rounded-3xl bg-slate-900/40 border border-dashed border-slate-800">
        <div class="text-4xl mb-2">💸</div>
        <p class="text-slate-300 font-semibold text-sm">Здесь пока нет операций</p>
        <p class="text-slate-500 text-xs mt-1">Нажмите кнопку «+ Добавить операцию» ниже</p>
      </div>
    `;
    return;
  }

  // Group transactions by Date
  const groups = {};
  filtered.forEach(tx => {
    const dateKey = tx.date || (tx.createdAt ? tx.createdAt.split('T')[0] : 'Без даты');
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(tx);
  });

  const sortedDates = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

  sortedDates.forEach(dateStr => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'space-y-1.5';

    // Date header
    const header = document.createElement('div');
    header.className = 'text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 pt-2';
    header.textContent = formatDateHeader(dateStr);
    groupDiv.appendChild(header);

    // Items
    groups[dateStr].forEach(tx => {
      const card = document.createElement('div');
      const isExpense = tx.type === 'expense';
      const sign = isExpense ? '-' : '+';
      const amountColor = isExpense ? 'text-rose-400' : 'text-emerald-400';

      card.className = 'flex items-center justify-between p-3.5 bg-slate-900/80 hover:bg-slate-900 border border-slate-800/80 rounded-2xl transition-all shadow-sm';
      card.innerHTML = `
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl shrink-0 shadow-inner">
            ${tx.categoryIcon || (isExpense ? '🛒' : '💰')}
          </div>
          <div class="min-w-0">
            <div class="font-bold text-sm text-slate-100 truncate">${escapeHtml(tx.title || tx.category || 'Операция')}</div>
            <div class="flex items-center space-x-1.5 text-[11px] text-slate-400 mt-0.5">
              <span>${escapeHtml(tx.category || 'Общее')}</span>
              <span>•</span>
              <span class="inline-flex items-center px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-300 font-medium text-[10px]">
                👤 ${escapeHtml(tx.author || 'Марина')}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2.5 shrink-0 pl-2">
          <div class="text-right">
            <div class="font-bold text-sm ${amountColor}">
              ${sign} ${formatMoney(tx.amount)} ₽
            </div>
          </div>
          <button class="delete-btn text-slate-600 hover:text-rose-400 p-1 rounded-lg transition-colors" data-id="${tx.id}" title="Удалить">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      `;

      groupDiv.appendChild(card);
    });

    container.appendChild(groupDiv);
  });
}

function renderCategoryGrid() {
  const categories = CATEGORIES[state.currentType];
  el.categoryGrid.innerHTML = '';

  categories.forEach((cat, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const isSelected = state.selectedCategory.name === cat.name;

    btn.className = `category-btn flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs transition-all ${isSelected ? 'active' : ''}`;
    btn.innerHTML = `
      <span class="text-xl mb-1">${cat.icon}</span>
      <span class="text-[10px] text-slate-300 truncate w-full text-center font-medium">${cat.name}</span>
    `;

    btn.onclick = () => {
      state.selectedCategory = cat;
      renderCategoryGrid();
    };

    el.categoryGrid.appendChild(btn);
  });
}

function renderAnalytics() {
  const expenseTransactions = state.transactions.filter(tx => tx.type === 'expense' && !tx.isDeleted);
  
  // Category totals
  const categoryTotals = {};
  let totalExpenses = 0;

  expenseTransactions.forEach(tx => {
    const cat = tx.category || 'Другое';
    const amount = Number(tx.amount) || 0;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + amount;
    totalExpenses += amount;
  });

  const catEntries = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);

  // Render Breakdown List
  el.categoryBreakdownList.innerHTML = '';
  if (catEntries.length === 0) {
    el.categoryBreakdownList.innerHTML = '<div class="text-slate-500 text-center py-4">Нет данных о расходах</div>';
    el.chartNoData.classList.remove('hidden');
    if (state.chartInstance) {
      state.chartInstance.destroy();
      state.chartInstance = null;
    }
  } else {
    el.chartNoData.classList.add('hidden');
    catEntries.forEach(([cat, amount]) => {
      const percent = totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'space-y-1';
      row.innerHTML = `
        <div class="flex justify-between items-center text-xs">
          <span class="font-medium text-slate-200">${cat}</span>
          <span class="text-slate-400 font-semibold">${formatMoney(amount)} ₽ (${percent}%)</span>
        </div>
        <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div class="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full rounded-full" style="width: ${percent}%"></div>
        </div>
      `;
      el.categoryBreakdownList.appendChild(row);
    });

    // Render Doughnut Chart
    renderChart(catEntries);
  }

  // Render Author Contributions
  renderAuthorStats();
}

function renderChart(catEntries) {
  if (typeof Chart === 'undefined') return;

  const labels = catEntries.map(e => e[0]);
  const data = catEntries.map(e => e[1]);
  const colors = [
    '#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#ef4444', '#64748b'
  ];

  if (state.chartInstance) {
    state.chartInstance.destroy();
  }

  const ctx = el.categoryChart.getContext('2d');
  state.chartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '70%',
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function(item) {
              return ` ${item.label}: ${formatMoney(item.raw)} ₽`;
            }
          }
        }
      }
    }
  });
}

function renderAuthorStats() {
  const container = el.authorStatsContainer;
  container.innerHTML = '';

  const authorExpenses = {};
  let totalExpense = 0;

  state.transactions.filter(tx => !tx.isDeleted && tx.type === 'expense').forEach(tx => {
    const author = tx.author || 'Не указан';
    const amount = Number(tx.amount) || 0;
    authorExpenses[author] = (authorExpenses[author] || 0) + amount;
    totalExpense += amount;
  });

  const entries = Object.entries(authorExpenses);
  if (entries.length === 0) {
    container.innerHTML = '<div class="text-slate-500 text-center py-2">Нет данных</div>';
    return;
  }

  entries.forEach(([author, amount]) => {
    const percent = totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0;
    const div = document.createElement('div');
    div.className = 'p-3 bg-slate-950/50 rounded-2xl border border-slate-800 space-y-1.5';
    div.innerHTML = `
      <div class="flex justify-between items-center text-xs">
        <span class="font-bold text-slate-200">👤 ${escapeHtml(author)}</span>
        <span class="font-bold text-rose-400">${formatMoney(amount)} ₽ <span class="text-slate-500 font-normal">(${percent}%)</span></span>
      </div>
      <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
        <div class="bg-indigo-500 h-full rounded-full" style="width: ${percent}%"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

function renderUserLabel() {
  el.currentUserNameLabel.textContent = state.currentUser;
  el.txAuthor.value = state.currentUser;
}

// ==========================================
// 4. Modal Handlers & Actions
// ==========================================
function openAddModal() {
  el.addModal.classList.remove('hidden');
  setTimeout(() => el.addModal.classList.add('open'), 10);
  el.txAmount.focus();
}

function closeAddModal() {
  el.addModal.classList.remove('open');
  setTimeout(() => el.addModal.classList.add('hidden'), 200);
  el.txAmount.value = '';
  el.txTitle.value = '';
}

function openShareModal() {
  el.shareModal.classList.remove('hidden');
  setTimeout(() => el.shareModal.classList.add('open'), 10);
  generateQrCode();
}

function closeShareModal() {
  el.shareModal.classList.remove('open');
  setTimeout(() => el.shareModal.classList.add('hidden'), 200);
}

function generateQrCode() {
  const container = el.qrCodeContainer;
  container.innerHTML = '';

  const shareUrl = getShareUrl();

  try {
    if (typeof QRCode !== 'undefined') {
      new QRCode(container, {
        text: shareUrl,
        width: 170,
        height: 170,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } else {
      // Fallback to QR server API image
      const img = document.createElement('img');
      img.src = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(shareUrl)}`;
      img.className = 'w-[170px] h-[170px]';
      container.appendChild(img);
    }
  } catch (err) {
    console.error('QR Generation error:', err);
  }
}

function getShareUrl() {
  const base = window.location.origin + window.location.pathname;
  return `${base}?room=${encodeURIComponent(state.roomId)}`;
}

async function handleCopyShareUrl() {
  const url = getShareUrl();
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    showToast('Ссылка скопирована в буфер обмена! 📋');
  } catch (err) {
    showToast('Скопируйте: ' + url);
  }
}

async function handleNativeShare() {
  const url = getShareUrl();
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Семейный бюджет',
        text: 'Давай вести бюджет вместе! Открой ссылку:',
        url: url
      });
    } catch (err) {}
  } else {
    handleCopyShareUrl();
  }
}

function handleAddTransaction() {
  const amount = parseFloat(el.txAmount.value);
  if (isNaN(amount) || amount <= 0) {
    showToast('Пожалуйста, укажите корректную сумму');
    el.txAmount.focus();
    return;
  }

  const category = state.selectedCategory;
  const title = el.txTitle.value.trim() || category.name;
  const author = el.txAuthor.value.trim() || state.currentUser;
  const date = el.txDate.value || new Date().toISOString().split('T')[0];

  const newTx = {
    id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    title: title,
    amount: amount,
    type: state.currentType,
    category: category.name,
    categoryIcon: category.icon,
    author: author,
    date: date,
    createdAt: new Date().toISOString(),
    updatedAt: Date.now(),
    isDeleted: false
  };

  state.transactions.unshift(newTx);
  saveLocalState();
  updateUI();
  closeAddModal();
  showToast(`${state.currentType === 'expense' ? 'Расход' : 'Доход'} добавлен! ✅`);

  // Push to cloud
  pushStateToRemote();
}

function handleDeleteTransaction(id) {
  const idx = state.transactions.findIndex(t => t.id === id);
  if (idx !== -1) {
    state.transactions[idx].isDeleted = true;
    state.transactions[idx].updatedAt = Date.now();
    saveLocalState();
    updateUI();
    showToast('Операция удалена');
    pushStateToRemote();
  }
}

// ==========================================
// 5. Event Listeners Binding
// ==========================================
function attachEventListeners() {
  // Navigation Tabs
  el.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      el.navTabs.forEach(t => t.classList.remove('active', 'text-white'));
      tab.classList.add('active', 'text-white');

      const targetTabId = tab.dataset.tab;
      el.tabPanes.forEach(pane => {
        if (pane.id === targetTabId) {
          pane.classList.remove('hidden');
        } else {
          pane.classList.add('hidden');
        }
      });

      if (targetTabId === 'tab-analytics') {
        renderAnalytics();
      }
    });
  });

  // Filter Buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter;
      renderTransactionsList();
    });
  });

  // Author Filter
  el.authorFilter.addEventListener('change', (e) => {
    state.activeAuthorFilter = e.target.value;
    renderTransactionsList();
  });

  // Sync Refresh button
  el.btnSyncRefresh.addEventListener('click', () => {
    fetchRemoteData();
  });

  // Modals Open/Close
  el.btnOpenAddModal.addEventListener('click', openAddModal);
  el.btnCloseAddModal.addEventListener('click', closeAddModal);
  el.btnShareModal.addEventListener('click', openShareModal);
  el.btnCloseShareModal.addEventListener('click', closeShareModal);
  el.btnShowQrCode2.addEventListener('click', openShareModal);

  // Type Selector (Расход / Доход)
  el.typeExpenseBtn.addEventListener('click', () => {
    state.currentType = 'expense';
    el.typeExpenseBtn.className = 'type-toggle active px-4 py-1.5 rounded-lg text-rose-400 bg-rose-950/60 transition-all font-bold';
    el.typeIncomeBtn.className = 'type-toggle px-4 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all font-bold';
    state.selectedCategory = CATEGORIES.expense[0];
    renderCategoryGrid();
  });

  el.typeIncomeBtn.addEventListener('click', () => {
    state.currentType = 'income';
    el.typeIncomeBtn.className = 'type-toggle active px-4 py-1.5 rounded-lg text-emerald-400 bg-emerald-950/60 transition-all font-bold';
    el.typeExpenseBtn.className = 'type-toggle px-4 py-1.5 rounded-lg text-slate-400 hover:text-white transition-all font-bold';
    state.selectedCategory = CATEGORIES.income[0];
    renderCategoryGrid();
  });

  // Quick sum increment buttons
  document.querySelectorAll('.quick-sum').forEach(btn => {
    btn.addEventListener('click', () => {
      const sum = parseFloat(btn.dataset.sum) || 0;
      const current = parseFloat(el.txAmount.value) || 0;
      el.txAmount.value = current + sum;
    });
  });

  // Save Transaction
  el.btnSaveTransaction.addEventListener('click', handleAddTransaction);

  // Copy & Native Share
  el.btnCopyShareUrl.addEventListener('click', handleCopyShareUrl);
  el.btnCopyShareLink2.addEventListener('click', handleCopyShareUrl);
  el.btnNativeShare.addEventListener('click', handleNativeShare);

  // Delete transaction delegate
  el.txListContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-btn');
    if (btn) {
      const id = btn.dataset.id;
      if (confirm('Удалить эту операцию?')) {
        handleDeleteTransaction(id);
      }
    }
  });

  // Rename Budget Title
  el.btnEditTitle.addEventListener('click', () => {
    const newTitle = prompt('Введите название бюджета:', state.budgetTitle);
    if (newTitle && newTitle.trim()) {
      state.budgetTitle = newTitle.trim();
      saveLocalState();
      updateUI();
      pushStateToRemote();
    }
  });

  // Profile / Username settings
  el.btnSwitchUser.addEventListener('click', () => {
    const newName = prompt('Как вас зовут? (отображается в операциях):', state.currentUser);
    if (newName && newName.trim()) {
      setUser(newName.trim());
    }
  });

  el.btnSaveUserName.addEventListener('click', () => {
    const val = el.inputCustomUserName.value.trim();
    if (val) setUser(val);
  });

  document.querySelectorAll('.name-quick-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      setUser(tag.textContent.trim());
    });
  });

  // Join Room
  el.btnJoinRoom.addEventListener('click', () => {
    const code = el.inputJoinRoomId.value.trim();
    if (code) {
      switchRoom(code);
    }
  });

  // Create New Budget Room
  el.btnCreateNewBudget.addEventListener('click', async () => {
    if (!confirm('Создать новый отдельный бюджет?')) return;
    
    showToast('Создание нового бюджета...');
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'FinanceRoom_Custom',
          data: {
            title: 'Наш бюджет',
            version: 1,
            transactions: [],
            updatedAt: Date.now()
          }
        })
      });
      const obj = await res.json();
      if (obj && obj.id) {
        switchRoom(obj.id);
        showToast('Новый бюджет успешно создан! 🎉');
      }
    } catch (err) {
      showToast('Ошибка при создании комнаты');
    }
  });

  // Export JSON
  el.btnExportJson.addEventListener('click', () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.transactions, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `budget_${state.roomId}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  // Clear data
  el.btnClearData.addEventListener('click', () => {
    if (confirm('Внимание! Это удалит все операции текущего бюджета на всех устройствах. Продолжить?')) {
      state.transactions = [];
      saveLocalState();
      updateUI();
      pushStateToRemote();
      showToast('Все операции очищены');
    }
  });
}

function setUser(name) {
  state.currentUser = name;
  localStorage.setItem('finance_user_name', name);
  renderUserLabel();
  el.inputCustomUserName.value = name;
  showToast(`Имя изменено на: ${name} 👤`);
}

function switchRoom(newRoomId) {
  state.roomId = newRoomId;
  localStorage.setItem('finance_active_room_id', newRoomId);
  
  // Update URL without reload
  const newUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(newRoomId)}`;
  window.history.replaceState({}, '', newUrl);

  el.displayRoomId.textContent = newRoomId;
  state.transactions = [];
  loadLocalState();
  updateUI();
  fetchRemoteData();
  setupRealtimeSSE();
  showToast('Подключено к бюджету: ' + newRoomId.slice(0, 8) + '... 🔄');
}

// ==========================================
// 6. Helpers
// ==========================================
function formatMoney(num) {
  return Math.abs(num).toLocaleString('ru-RU');
}

function formatDateHeader(dateStr) {
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  
  if (dateStr === today) return 'Сегодня';
  if (dateStr === yesterday) return 'Вчера';

  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' });
  } catch (e) {
    return dateStr;
  }
}

function showToast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    el.toast.classList.add('opacity-0', 'pointer-events-none');
  }, 2500);
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function jsonParseSafe(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);
