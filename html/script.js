/* ======= UTILITIES ======= */
function postData(endpoint, data) {
    return fetch(`https://${GetParentResourceName()}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(data)
    }).catch(err => {
        console.warn(`[mafin_banking] NUI callback failed: ${endpoint}`, err);
        return {
            ok: false,
            json: () => Promise.resolve({ success: false, valid: false, error: 'fetch_failed' })
        };
    });
}

let currentTranslations = {};
let currentBalance = 0;
let bankLoadingTimer = null;
let bankSearchTerm = '';
let bankSortMode = 'newest';
window.currentRecentLogs = [];

function normalizeBankData(message) {
    const data = message.playerData || message.data || {};
    const logs = Array.isArray(data.recentLogs) ? data.recentLogs
        : Array.isArray(data.logs) ? data.logs
        : Array.isArray(data.history) ? data.history
        : [];

    return {
        ...data,
        balance: Number(data.balance || data.bank || 0),
        cardNumber: data.cardNumber || data.account || 'MAFIN-0001',
        cardHolder: data.cardHolder || data.name || 'Mafin Client',
        cardExpiry: data.cardExpiry || '12/30',
        recentLogs: logs,
        logs,
        history: logs
    };
}

function cleanPin(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function isPinResultValid(result) {
    if (result === true) return true;
    if (!result || typeof result !== 'object') return false;
    return result.success === true || result.valid === true;
}

function animateValue(obj, start, end, duration, prefix) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(start + (end - start) * easeOutQuart);
        obj.innerText = prefix + Number(current).toLocaleString('cs-CZ');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = prefix + Number(end).toLocaleString('cs-CZ');
        }
    };
    window.requestAnimationFrame(step);
}

/* ======= MESSAGE LISTENER ======= */
window.addEventListener('message', function(event) {
    const data = event.data;

    // ---- OPEN ----
    if (data.action === 'open') {
        const wrapper = document.getElementById('tablet-wrapper');
        const frame   = document.getElementById('tablet-frame');
        const loader  = document.getElementById('bank-loading-screen');
        const app     = document.getElementById('app-screen');

        if (bankLoadingTimer) {
            clearTimeout(bankLoadingTimer);
            bankLoadingTimer = null;
        }

        wrapper.style.display = 'flex';
        frame.classList.remove('tablet-anim-close');
        frame.classList.add('tablet-anim-open');
        app.style.display = 'none';
        loader.style.display = 'flex';

        if (data.translations) {
            currentTranslations = data.translations;
            applyTranslations(data.translations);
        }

        applyPlayerData(normalizeBankData(data));

        postData('fetchData', {});

        bankLoadingTimer = setTimeout(() => {
            loader.style.display = 'none';
            app.style.display = 'grid';
            switchPage('home');
            bankLoadingTimer = null;
        }, 950);
        return;
    }

    // ---- CLOSE ----
    if (data.action === 'close') {
        closeUI();
        closeAtm();
        return;
    }

    // ---- OPEN ATM ----
    if (data.action === 'open_atm') {
        const atm = document.getElementById('atm-wrapper');
        if (atm) {
            atm.style.display = 'flex';
            document.getElementById('atm-pin-screen').style.display = 'flex';
            document.getElementById('atm-loading-screen').style.display = 'none';
            document.getElementById('atm-main-screen').style.display = 'none';
            atmPin = '';
            updatePinDots();
        }
        if (data.translations) {
            currentTranslations = data.translations;
            applyTranslations(data.translations);
        }
        applyPlayerData(normalizeBankData(data));
        return;
    }

    // ---- UPDATE DATA (after action) ----
    if (data.action === 'update_data') {
        applyPlayerData(normalizeBankData(data));
        return;
    }

    // ---- UPDATE HISTORY ----
    if (data.action === 'update_history') {
        window.currentHistory = Array.isArray(data.logs) ? data.logs
            : Array.isArray(data.data) ? data.data
            : Array.isArray(data.history) ? data.history
            : [];
        renderHistory(currentHistoryFilter || 'all');
        return;
    }
});

/* ======= CLOSE UI ======= */
function closeUI() {
    const wrapper = document.getElementById('tablet-wrapper');
    const frame   = document.getElementById('tablet-frame');
    const loader  = document.getElementById('bank-loading-screen');
    const app     = document.getElementById('app-screen');

    if (bankLoadingTimer) {
        clearTimeout(bankLoadingTimer);
        bankLoadingTimer = null;
    }

    if (loader) loader.style.display = 'none';
    if (app) app.style.display = 'none';

    frame.classList.remove('tablet-anim-open');
    frame.classList.add('tablet-anim-close');
    setTimeout(() => {
        wrapper.style.display = 'none';
        frame.classList.remove('tablet-anim-close');
    }, 300);
}

/* ======= ESCAPE KEY ======= */
document.addEventListener('keyup', function(e) {
    if (e.key === 'Escape') {
        // Close modals if they are open
        const md = document.getElementById('modal-deposit');
        const mw = document.getElementById('modal-withdraw');
        if (md && md.style.display !== 'none') md.style.display = 'none';
        if (mw && mw.style.display !== 'none') mw.style.display = 'none';

        const atm = document.getElementById('atm-wrapper');
        if (atm && atm.style.display !== 'none') {
            closeAtm();
        } else {
            closeUI();
        }
        postData('close', {});
    }
});

/* ======= CLOSE BUTTONS ======= */
['close-btn', 'sidebar-close-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', function() {
        closeUI();
        postData('close', {});
    });
});

function sortLogs(logs) {
    const sorted = [...(logs || [])];
    sorted.sort((a, b) => {
        if (bankSortMode === 'highest') return Number(b.amount || 0) - Number(a.amount || 0);
        if (bankSortMode === 'lowest') return Number(a.amount || 0) - Number(b.amount || 0);

        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bankSortMode === 'oldest' ? aTime - bTime : bTime - aTime;
    });
    return sorted;
}

function applyTransactionControls(logs) {
    const term = bankSearchTerm.trim().toLowerCase();
    const filtered = term
        ? (logs || []).filter(log => {
            const haystack = [
                log.type,
                log.description,
                log.amount,
                log.created_at
            ].join(' ').toLowerCase();
            return haystack.includes(term);
        })
        : logs || [];

    return sortLogs(filtered);
}

const bankSearchInput = document.getElementById('bank-search');
if (bankSearchInput) {
    bankSearchInput.addEventListener('input', () => {
        bankSearchTerm = bankSearchInput.value;
        renderRecentTransactions(window.currentRecentLogs || []);
        renderHistory(currentHistoryFilter || 'all');
    });
}

const bankSortSelect = document.getElementById('bank-sort');
if (bankSortSelect) {
    bankSortSelect.addEventListener('change', () => {
        bankSortMode = bankSortSelect.value;
        renderRecentTransactions(window.currentRecentLogs || []);
        renderHistory(currentHistoryFilter || 'all');
    });
}

/* ======= APPLY TRANSLATIONS ======= */
function applyTranslations(t) {
    window.translations = t;
    const map = {
        'ui-sidebar-brand':         null, // handled via innerHTML below
        'ui-menu-home':             'menu_home',
        'ui-menu-history':          'menu_history',
        'ui-menu-transfer':         'menu_transfer',
        'ui-menu-close':            'menu_close',

        'ui-home-balance-label':    'home_balance_label',
        'ui-home-chart-title':      null,
        'ui-home-recent-tx':        null,

        'ui-btn-deposit':           'btn_deposit',
        'ui-btn-withdraw':          'btn_withdraw',
        'ui-btn-transfer':          'btn_transfer',
        'ui-btn-history':           'btn_history',

        'ui-history-title':         'history_title',
        'ui-history-btn-all':       'history_filter_all',
        'ui-history-btn-dep':       'history_filter_dep',
        'ui-history-btn-wit':       'history_filter_wit',
        'ui-history-btn-tra':       'history_filter_tra',

        'ui-transfer-title':        'menu_transfer',
        'ui-transfer-card-desc':    'transfer_desc',

        'ui-modal-deposit-title':   'deposit_title',
        'ui-modal-deposit-desc':    'deposit_desc',
        'ui-modal-withdraw-title':  'withdraw_title',
        'ui-modal-withdraw-desc':   'withdraw_desc',

        'btn-cancel-deposit':       'modal_cancel',
        'btn-confirm-deposit':      'deposit_btn',
        'btn-cancel-withdraw':      'modal_cancel',
        'btn-confirm-withdraw':     'withdraw_btn',
        'ui-btn-transfer-text':     'transfer_btn',

        'ui-menu-settings':         'menu_settings',
        'ui-settings-title':        'settings_title',
        'ui-settings-desc':         'settings_desc',
        'ui-settings-btn-change':   'settings_btn_change',

        'ui-atm-pin-title':         'atm_pin_title',
        'btn-atm-exit-pin':         'atm_cancel_leave',
        'btn-atm-exit-main':        'atm_cancel_leave',
        'ui-atm-verifying':         'atm_verifying',
        'ui-atm-title':             'atm_title',
        'ui-atm-balance-label':     'atm_balance_label',
        'ui-atm-quick-withdraw':    'atm_quick_withdraw',
        'ui-atm-recent-tx':         'atm_recent_tx',
    };

    for (const [id, key] of Object.entries(map)) {
        if (!key) continue;
        const el = document.getElementById(id);
        if (el && t[key]) el.innerText = t[key];
    }

    // InnerHTML for icon-bearing titles
    const brandEl = document.getElementById('ui-sidebar-brand');
    if (brandEl && t.sidebar_brand) brandEl.innerHTML = t.sidebar_brand;

    const chartTitle = document.getElementById('ui-home-chart-title');
    if (chartTitle) chartTitle.innerHTML = '<i class="fa-solid fa-chart-area"></i> ' + (t.home_chart_title || 'Balance History');

    const recentTx = document.getElementById('ui-home-recent-tx');
    if (recentTx) recentTx.innerHTML = '<i class="fa-solid fa-clock-rotate-left"></i> ' + (t.home_recent_tx || 'Recent Transactions');

    // ATM innerHTML / texts requiring manual update
    const atmAccountStr = document.getElementById('ui-atm-account-number');
    if (atmAccountStr && t.atm_account_number) atmAccountStr.innerText = t.atm_account_number;

    const atmWithdrawBtn = document.getElementById('btn-atm-withdraw');
    if (atmWithdrawBtn && t.atm_withdraw) atmWithdrawBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i> ' + t.atm_withdraw;

    const atmDepositBtn = document.getElementById('btn-atm-deposit');
    if (atmDepositBtn && t.atm_deposit) atmDepositBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i> ' + t.atm_deposit;

    // Placeholders
    const depInput = document.getElementById('deposit-amount');
    if (depInput && t.deposit_input) depInput.placeholder = t.deposit_input;
    const witInput = document.getElementById('withdraw-amount');
    if (witInput && t.withdraw_input) witInput.placeholder = t.withdraw_input;
    const trfId = document.getElementById('transfer-target-id');
    if (trfId && t.transfer_target_id) trfId.placeholder = t.transfer_target_id;
    const trfAmt = document.getElementById('transfer-amount');
    if (trfAmt && t.transfer_input) trfAmt.placeholder = t.transfer_input;
    const oldPin = document.getElementById('settings-old-pin');
    if (oldPin && t.settings_old_pin) oldPin.placeholder = t.settings_old_pin;
    const newPin = document.getElementById('settings-new-pin');
    if (newPin && t.settings_new_pin) newPin.placeholder = t.settings_new_pin;
}

/* ======= APPLY PLAYER DATA ======= */
function applyPlayerData(data) {
    // Balance
    const balEl = document.getElementById('home-balance');
    if (balEl) animateValue(balEl, currentBalance, data.balance || 0, 1000, '$');
    currentBalance = data.balance || 0;

    // Transfer page own balance
    const ownBalEl = document.getElementById('transfer-own-balance');
    if (ownBalEl) ownBalEl.innerText = '$' + Number(currentBalance).toLocaleString('cs-CZ');

    // ATM balance
    const atmBalEl = document.getElementById('atm-balance');
    if (atmBalEl) atmBalEl.innerText = '$' + Number(currentBalance).toLocaleString('cs-CZ');

    // Card info
    const cardNumEl = document.getElementById('home-card-number');
    if (cardNumEl && data.cardNumber) cardNumEl.innerText = data.cardNumber;
    const cardExpEl = document.getElementById('home-card-expiry');
    if (cardExpEl && data.cardExpiry) cardExpEl.innerText = data.cardExpiry;
    const cardHolderEl = document.getElementById('home-card-holder');
    if (cardHolderEl && data.cardHolder) cardHolderEl.innerText = data.cardHolder;

    const atmAccEl = document.getElementById('atm-account');
    if (atmAccEl && data.cardNumber) atmAccEl.innerText = data.cardNumber;

    // Recent transactions
    if (data.recentLogs) {
        window.currentRecentLogs = data.recentLogs;
        renderRecentTransactions(data.recentLogs);
        renderAtmRecentTransactions(data.recentLogs);
    }

    // Balance history chart
    if (data.balanceHistory) {
        updateBalanceChart(data.balanceHistory);
    }
}

function renderAtmRecentTransactions(logs) {
    const list = document.getElementById('atm-recent-tx');
    if (!list) return;
    list.innerHTML = '';

    if (!logs || logs.length === 0) {
        list.innerHTML = `<li class="no-data" style="font-size:12px; padding:10px 0;">${currentTranslations.no_data || 'No transactions'}</li>`;
        return;
    }

    const recent = logs.slice(0, 3);
    recent.forEach(log => {
        const type = (log.type || '').toLowerCase();
        const iconMap = {
            deposit:      { icon: 'fa-arrow-down', cls: 'deposit',      sign: '+' },
            withdraw:     { icon: 'fa-arrow-up',   cls: 'withdraw',     sign: '-' },
            transfer_out: { icon: 'fa-paper-plane',       cls: 'transfer_out', sign: '-' },
            transfer_in:  { icon: 'fa-inbox',             cls: 'transfer_in',  sign: '+' },
        };
        const info = iconMap[type] || { icon: 'fa-circle', cls: 'other', sign: '' };

        const labelMap = {
            deposit:      currentTranslations.log_deposit      || 'Deposit',
            withdraw:     currentTranslations.log_withdraw      || 'Withdraw',
            transfer_out: currentTranslations.log_transfer_out || 'Outgoing Transfer',
            transfer_in:  currentTranslations.log_transfer_in  || 'Incoming Transfer',
        };
        const label = labelMap[type] || type;

        const d = log.created_at ? new Date(log.created_at) : new Date();
        const dateStr = d.toLocaleDateString('cs-CZ') + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

        const li = document.createElement('li');
        li.className = 'tx-item';
        li.innerHTML = `
            <div class="tx-info" style="gap:8px;">
                <div class="tx-icon ${info.cls}" style="width:24px; height:24px; font-size:10px;"><i class="fa-solid ${info.icon}"></i></div>
                <div class="tx-text">
                    <div class="tx-label" style="font-size:12px;">${label}</div>
                    <div class="tx-date" style="font-size:10px;">${dateStr}</div>
                </div>
            </div>
            <div class="tx-amount ${info.cls}" style="font-size:12px;">${info.sign}$${Number(log.amount).toLocaleString('cs-CZ')}</div>
        `;
        list.appendChild(li);
    });
}

/* ======= NAVIGATION ======= */
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        const pageId = this.getAttribute('data-page');
        switchPage(pageId);
        if (pageId === 'history') {
            postData('fetchHistory', {});
        }
    });
});

function switchPage(pageId) {
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    const pg = document.getElementById('page-' + pageId);
    if (pg) {
        pg.classList.add('active');
        pg.style.display = '';
    }

    // Sync nav highlight
    document.querySelectorAll('.nav-item').forEach(i => {
        i.classList.toggle('active', i.getAttribute('data-page') === pageId);
    });
}

/* ======= ACTION BUTTONS (Home) ======= */
document.getElementById('btn-open-deposit').addEventListener('click', () => {
    document.getElementById('deposit-amount').value = '';
    document.getElementById('modal-deposit').style.display = 'flex';
});

document.getElementById('btn-open-withdraw').addEventListener('click', () => {
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('modal-withdraw').style.display = 'flex';
});

document.getElementById('btn-open-transfer').addEventListener('click', () => {
    switchPage('transfer');
});

document.getElementById('btn-go-history').addEventListener('click', () => {
    switchPage('history');
    postData('fetchHistory', {});
});

/* ======= MODAL CLOSE HELPER ======= */
function closeModal(id) {
    const m = document.getElementById(id);
    if (!m) return;
    m.classList.add('closing');
    setTimeout(() => {
        m.style.display = 'none';
        m.classList.remove('closing');
    }, 250);
}

/* ======= MODAL CONTEXT (ATM vs Bank) ======= */
let modalContext = 'bank'; // 'bank' | 'atm'

/* ======= DEPOSIT MODAL ======= */
document.getElementById('btn-cancel-deposit').onclick = () => {
    closeModal('modal-deposit');
};
document.getElementById('btn-confirm-deposit').onclick = () => {
    const amount = parseInt(document.getElementById('deposit-amount').value);
    if (!amount || amount <= 0) return;
    const endpoint = modalContext === 'atm' ? 'atmDeposit' : 'deposit';
    postData(endpoint, { amount });
    closeModal('modal-deposit');
};

/* ======= WITHDRAW MODAL ======= */
document.getElementById('btn-cancel-withdraw').onclick = () => {
    closeModal('modal-withdraw');
};
document.getElementById('btn-confirm-withdraw').onclick = () => {
    const amount = parseInt(document.getElementById('withdraw-amount').value);
    if (!amount || amount <= 0) return;
    const endpoint = modalContext === 'atm' ? 'atmWithdraw' : 'withdraw';
    postData(endpoint, { amount });
    closeModal('modal-withdraw');
};

/* ======= TRANSFER PAGE ======= */
document.getElementById('btn-transfer').addEventListener('click', () => {
    const targetId = parseInt(document.getElementById('transfer-target-id').value);
    const amount   = parseInt(document.getElementById('transfer-amount').value);
    if (!targetId || !amount || amount <= 0) return;
    postData('transfer', { targetId, amount });
    document.getElementById('transfer-target-id').value = '';
    document.getElementById('transfer-amount').value = '';
});

/* ======= SETTINGS PAGE ======= */
document.getElementById('btn-change-pin').addEventListener('click', () => {
    const oldPin = cleanPin(document.getElementById('settings-old-pin').value);
    const newPin = cleanPin(document.getElementById('settings-new-pin').value);
    if (!oldPin || !newPin || newPin.length !== 4) return;
    postData('changePin', { oldPin, newPin })
        .then(res => res.json())
        .then(result => {
            if (isPinResultValid(result)) {
                document.getElementById('settings-old-pin').value = '';
                document.getElementById('settings-new-pin').value = '';
            }
        })
        .catch(() => {});
});

['settings-old-pin', 'settings-new-pin'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => {
        input.value = cleanPin(input.value);
    });
});

/* ======= QUICK AMOUNT BUTTONS ======= */
document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const targetId = this.getAttribute('data-target');
        const amount   = this.getAttribute('data-amount');
        const el = document.getElementById(targetId);
        if (el) el.value = amount;
    });
});

/* ======= RECENT TRANSACTIONS ======= */
function renderRecentTransactions(logs) {
    const list = document.getElementById('recent-transactions');
    if (!list) return;
    list.innerHTML = '';

    const visibleLogs = applyTransactionControls(logs);

    if (!visibleLogs || visibleLogs.length === 0) {
        list.innerHTML = `<li class="no-data">${currentTranslations.no_data || 'No transactions'}</li>`;
        return;
    }

    const recent = visibleLogs.slice(0, 4);
    recent.forEach(log => {
        const type = (log.type || '').toLowerCase();
        const iconMap = {
            deposit:      { icon: 'fa-arrow-trend-down', cls: 'deposit',      sign: '+' },
            withdraw:     { icon: 'fa-arrow-trend-up',   cls: 'withdraw',     sign: '-' },
            transfer_out: { icon: 'fa-paper-plane',       cls: 'transfer_out', sign: '-' },
            transfer_in:  { icon: 'fa-inbox',             cls: 'transfer_in',  sign: '+' },
        };
        const info = iconMap[type] || { icon: 'fa-circle', cls: 'other', sign: '' };

        const labelMap = {
            deposit:      currentTranslations.log_deposit      || 'Deposit',
            withdraw:     currentTranslations.log_withdraw      || 'Withdraw',
            transfer_out: currentTranslations.log_transfer_out || 'Outgoing Transfer',
            transfer_in:  currentTranslations.log_transfer_in  || 'Incoming Transfer',
        };
        const label = labelMap[type] || type;

        const d = log.created_at ? new Date(log.created_at) : new Date();
        const dateStr = d.toLocaleDateString('cs-CZ') + ' ' + d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });

        const li = document.createElement('li');
        li.className = 'tx-item';
        li.innerHTML = `
            <div class="tx-info">
                <div class="tx-icon ${info.cls}"><i class="fa-solid ${info.icon}"></i></div>
                <div class="tx-text">
                    <div class="tx-label">${label}</div>
                    <div class="tx-date">${dateStr}</div>
                </div>
            </div>
            <div class="tx-amount ${info.cls}">${info.sign}$${Number(log.amount).toLocaleString('cs-CZ')}</div>
        `;
        list.appendChild(li);
    });
}

/* ======= HISTORY PAGE ======= */
let currentHistoryFilter = 'all';

function renderHistory(filter) {
    currentHistoryFilter = filter;
    const list = document.getElementById('history-list-view');
    if (!list) return;
    list.innerHTML = '';

    // Sync tab buttons
    document.querySelectorAll('.log-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });

    const logs = window.currentHistory || [];
    const filtered = applyTransactionControls(logs.filter(log => {
        const t = (log.type || '').toLowerCase();
        if (filter === 'all')     return true;
        if (filter === 'deposit') return t === 'deposit';
        if (filter === 'withdraw')return t === 'withdraw';
        if (filter === 'transfer')return t === 'transfer_in' || t === 'transfer_out';
        return false;
    }));

    if (filtered.length === 0) {
        list.innerHTML = `<li class="no-data" style="padding:20px 0;">${currentTranslations.history_no_data || 'No transactions found.'}</li>`;
        return;
    }

    filtered.forEach(log => {
        const type = (log.type || '').toLowerCase();
        const iconMap = {
            deposit:      { icon: 'fa-arrow-down',  cls: 'deposit',      badge: currentTranslations.log_deposit_badge || 'DEPOSIT', sign: '+' },
            withdraw:     { icon: 'fa-arrow-up',    cls: 'withdraw',     badge: currentTranslations.log_withdraw_badge || 'WITHDRAW', sign: '-' },
            transfer_out: { icon: 'fa-paper-plane',  cls: 'transfer_out', badge: currentTranslations.log_transfer_badge || 'TRANSFER', sign: '-' },
            transfer_in:  { icon: 'fa-inbox',        cls: 'transfer_in',  badge: currentTranslations.log_transfer_badge || 'TRANSFER', sign: '+' },
        };
        const info = iconMap[type] || { icon: 'fa-circle', cls: 'other', badge: type.toUpperCase(), sign: '' };

        const labelMap = {
            deposit:      currentTranslations.log_deposit      || 'Deposit',
            withdraw:     currentTranslations.log_withdraw      || 'Withdraw',
            transfer_out: currentTranslations.log_transfer_out || 'Outgoing Transfer',
            transfer_in:  currentTranslations.log_transfer_in  || 'Incoming Transfer',
        };
        const label = labelMap[type] || (log.description || type);

        const d = log.created_at ? new Date(log.created_at) : new Date();
        const dateStr = d.toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: '2-digit' });

        const li = document.createElement('li');
        li.className = 'logs-act-item';
        li.innerHTML = `
            <div class="logs-act-icon ${info.cls}"><i class="fa-solid ${info.icon}"></i></div>
            <div class="logs-act-body">
                <div class="logs-act-desc">${label}${log.description && log.description !== label ? ' - ' + log.description : ''}</div>
                <div class="logs-act-meta">${dateStr}</div>
            </div>
            <div class="logs-act-amount ${info.cls}">${info.sign}$${Number(log.amount).toLocaleString('cs-CZ')}</div>
            <span class="logs-act-badge">${info.badge}</span>
        `;
        list.appendChild(li);
    });
}

document.querySelectorAll('.log-tab-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        renderHistory(this.getAttribute('data-filter'));
    });
});

/* ======= BALANCE CHART ======= */
let balanceChart = null;

function updateBalanceChart(historyData) {
    const ctx = document.getElementById('balanceChart');
    if (!ctx) return;

    const t = currentTranslations;
    const dayMap = [
        t.days_sun || 'Sun',
        t.days_mon || 'Mon',
        t.days_tue || 'Tue',
        t.days_wed || 'Wed',
        t.days_thu || 'Thu',
        t.days_fri || 'Fri',
        t.days_sat || 'Sat',
    ];

    // Build last 7 days labels
    const labels  = [];
    const income  = [];
    const expenses = [];

    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const year  = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day   = String(d.getDate()).padStart(2, '0');
        const dayStr = `${year}-${month}-${day}`;
        labels.push(dayMap[d.getDay()]);

        const found = (historyData || []).find(r => r.day && String(r.day).startsWith(dayStr));
        income.push(found ? parseFloat(found.income)   || 0 : 0);
        expenses.push(found ? parseFloat(found.expenses) || 0 : 0);
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#1c1d21',
                titleColor: '#fff',
                bodyColor: '#9ca3af',
                borderColor: 'rgba(255,255,255,0.08)',
                borderWidth: 1,
                callbacks: {
                    label: ctx => ' $' + Number(ctx.parsed.y).toLocaleString('cs-CZ')
                }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.04)' },
                ticks: { color: '#9ca3af', font: { family: 'Inter', size: 11 } }
            }
        }
    };

    if (balanceChart) {
        balanceChart.data.labels = labels;
        balanceChart.data.datasets[0].data = income;
        balanceChart.data.datasets[1].data = expenses;
        balanceChart.update();
    } else {
        balanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: t.log_deposit || 'Deposits',
                        data: income,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#3b82f6'
                    },
                    {
                        label: t.log_withdraw || 'Withdrawals',
                        data: expenses,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true,
                        pointRadius: 3,
                        pointBackgroundColor: '#ef4444'
                    }
                ]
            },
            options: chartOptions
        });
    }
}

/* ======= ATM UI LOGIC ======= */
let atmPin = '';

function updatePinDots() {
    for (let i = 1; i <= 4; i++) {
        const dot = document.getElementById(`pin-dot-${i}`);
        if (!dot) continue;
        if (i <= atmPin.length) {
            dot.classList.add('filled');
        } else {
            dot.classList.remove('filled');
        }
    }
}

document.querySelectorAll('.atm-key').forEach(btn => {
    btn.addEventListener('click', function() {
        const key = this.getAttribute('data-key');

        if (key === 'C') {
            atmPin = '';
            updatePinDots();
        } else if (key === 'E') {
            if (atmPin.length === 4) {
                // Verify PIN
                fetch(`https://${GetParentResourceName()}/verifyPin`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pin: atmPin })
                })
                .then(res => res.json())
                .then(result => {
                    const valid = isPinResultValid(result);
                    if (valid) {
                        const pinScreen = document.getElementById('atm-pin-screen');
                        const loadScreen = document.getElementById('atm-loading-screen');
                        const mainScreen = document.getElementById('atm-main-screen');

                        // Switch to main screen (which contains the loading overlay)
                        pinScreen.style.display = 'none';
                        mainScreen.style.display = 'flex';
                        mainScreen.style.animation = 'none';
                        void mainScreen.offsetWidth; // trigger reflow
                        mainScreen.style.animation = 'pageFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards';
                        
                        // Show loader overlay
                        loadScreen.style.display = 'flex';
                        loadScreen.style.animation = 'none';

                        setTimeout(() => {
                            // Fade out loader
                            loadScreen.style.animation = 'overlayFadeOut 0.3s ease forwards';
                            setTimeout(() => {
                                loadScreen.style.display = 'none';
                                loadScreen.style.animation = 'none';
                            }, 300);
                        }, 1200);

                    } else {
                        // Error shake
                        const display = document.querySelector('.atm-pin-display');
                        display.classList.add('error');
                        document.querySelectorAll('.pin-dot.filled').forEach(d => d.classList.add('error'));

                        setTimeout(() => {
                            display.classList.remove('error');
                            document.querySelectorAll('.pin-dot').forEach(d => d.classList.remove('error'));
                            atmPin = '';
                            updatePinDots();
                        }, 400);
                    }
                })
                .catch(() => {});
            }
        } else {
            if (atmPin.length < 4) {
                atmPin += key;
                updatePinDots();
            }
        }
    });
});

function closeAtm() {
    const atm = document.getElementById('atm-wrapper');
    if (!atm || atm.style.display === 'none') return;
    
    atm.classList.add('closing');
    setTimeout(() => {
        atm.style.display = 'none';
        atm.classList.remove('closing');
    }, 250);
}

document.getElementById('btn-atm-exit-pin').addEventListener('click', () => {
    closeAtm();
    postData('close', {});
});
document.getElementById('btn-atm-exit-main').addEventListener('click', () => {
    closeAtm();
    postData('close', {});
});

document.getElementById('btn-atm-withdraw').addEventListener('click', () => {
    modalContext = 'atm';
    document.getElementById('withdraw-amount').value = '';
    document.getElementById('modal-withdraw').style.display = 'flex';
});
document.getElementById('btn-atm-deposit').addEventListener('click', () => {
    modalContext = 'atm';
    document.getElementById('deposit-amount').value = '';
    document.getElementById('modal-deposit').style.display = 'flex';
});

// Reset context when bank modals are opened
document.getElementById('btn-open-deposit').addEventListener('click', () => { modalContext = 'bank'; });
document.getElementById('btn-open-withdraw').addEventListener('click', () => { modalContext = 'bank'; });

document.querySelectorAll('.atm-quick').forEach(btn => {
    btn.addEventListener('click', function() {
        const amt = this.getAttribute('data-amount');
        if (amt) {
            postData('atmWithdraw', { amount: parseInt(amt) });
        }
    });
});
