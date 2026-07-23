const STORAGE_KEY = 'poolCafeManagerState';

class PoolCafeManager {
  constructor() {
    this.defaultState = {
      cafeName: 'Pool Cafe Manager',
      currency: '₹',
      pricingMethod: 'minute',
      priceMinute: 5,
      priceHour: 300,
      theme: 'neon',
      autoSave: true,
      defaultTables: 4,
      tables: [],
      players: [],
      history: [],
      activity: [],
      quickPlayers: [],
      walkInOrders: [],
      menuItems: [
        { id: 'tea', name: 'Tea', price: 40, category: 'Drink' },
        { id: 'coffee', name: 'Coffee', price: 60, category: 'Drink' },
        { id: 'burger', name: 'Burger', price: 120, category: 'Food' },
        { id: 'chips', name: 'Chips', price: 80, category: 'Snack' }
      ]
    };
    this.state = this.loadState();
    this.pendingEndId = null;
    this.pendingBillItems = [];
    this.timerInterval = null;
    this.init();
  }

  getDefaultState() {
    return JSON.parse(JSON.stringify(this.defaultState));
  }

  init() {
    this.ensureTables();
    this.bindEvents();
    this.renderAll();
    this.startTimerLoop();
    if (location.protocol === 'file:') {
      this.showNotification('Open via http://localhost:8000 to keep data after browser close.');
      this.showFileProtocolNotice();
    }
  }

  ensureTables() {
    if (!this.state.tables.length) {
      this.state.tables = Array.from({ length: this.state.defaultTables }, (_, index) => ({
        id: index + 1,
        name: `Table ${index + 1}`,
        status: 'available',
        playerName: '',
        phone: '',
        startTime: null,
        elapsedSeconds: 0,
        currentBill: 0,
        gameType: 'Practice',
        totalPlayers: 1,
        notes: ''
      }));
    }
  }

  bindEvents() {
    document.getElementById('playerForm').addEventListener('submit', (e) => this.handleStartGame(e));
    document.getElementById('addTableBtn').addEventListener('click', () => this.addTable());
    document.getElementById('removeTableBtn').addEventListener('click', () => this.removeTable());
    document.getElementById('settingsBtn').addEventListener('click', () => this.openSettings());
    document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
    document.getElementById('addMenuItemBtn').addEventListener('click', () => this.addMenuItem());
    document.getElementById('menuSearchInput').addEventListener('input', () => this.renderMenuItems());
    document.getElementById('endItemSelect').addEventListener('change', () => this.syncSelectedMenuPrice());
    document.getElementById('resetDataBtn').addEventListener('click', () => this.resetData());
    document.getElementById('backupExportBtn').addEventListener('click', () => this.exportBackup());
    document.getElementById('backupImportBtn').addEventListener('click', () => this.importBackup());
    document.getElementById('confirmEndBtn').addEventListener('click', () => this.confirmEndGame());
    document.getElementById('cancelEndBtn').addEventListener('click', () => this.closeModal('confirmModal'));
    document.getElementById('addBillItemBtn').addEventListener('click', () => this.addBillItem());
    document.getElementById('walkInItemSelect').addEventListener('change', () => this.syncWalkInSelectedMenuPrice());
    document.getElementById('walkInItemSearch').addEventListener('input', () => this.filterWalkInMenuSelect());
    document.getElementById('addWalkInItemBtn').addEventListener('click', () => this.addWalkInItem());
    document.getElementById('saveWalkInOrderBtn').addEventListener('click', () => this.saveWalkInOrder());
    document.getElementById('walkInDiscount').addEventListener('input', () => this.updateWalkInTotals());
    document.getElementById('endDiscount').addEventListener('input', () => this.updateEndModalTotals());
    document.getElementById('closeReceiptBtn').addEventListener('click', () => this.closeModal('receiptModal'));
    document.getElementById('printReceiptBtn').addEventListener('click', () => this.printReceipt());
    document.getElementById('historySearch').addEventListener('input', () => this.renderHistory());
    document.getElementById('historyFilter').addEventListener('change', () => this.renderHistory());
    document.getElementById('exportCsvBtn').addEventListener('click', () => this.exportCsv());
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        document.getElementById('playerName').focus();
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        document.getElementById('historySearch').focus();
      }
      if (e.key === 'Escape') {
        this.closeModal('confirmModal');
        this.closeModal('settingsModal');
      }
    });
  }

  loadState() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return this.getDefaultState();
    try {
      const parsed = JSON.parse(stored);
      const fallback = this.getDefaultState();
      return {
        ...fallback,
        ...parsed,
        menuItems: Array.isArray(parsed.menuItems)
          ? parsed.menuItems.map((item) => ({
              id: item.id || `menu-${Date.now()}-${Math.random()}`,
              name: item.name || 'Item',
              price: Number(item.price) || 0,
              category: item.category || 'General'
            }))
          : fallback.menuItems
      };
    } catch {
      return this.getDefaultState();
    }
  }

  saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  addTable() {
    const maxId = this.state.tables.reduce((max, table) => Math.max(max, table.id), 0);
    const newId = maxId + 1;
    this.state.tables.push({
      id: newId,
      name: `Table ${newId}`,
      status: 'available',
      playerName: '',
      phone: '',
      startTime: null,
      elapsedSeconds: 0,
      currentBill: 0,
      gameType: 'Practice',
      totalPlayers: 1,
      notes: ''
    });
    this.saveState();
    this.renderAll();
    this.showNotification('Table added successfully');
  }

  removeTable() {
    const occupied = this.state.tables.find((table) => table.status === 'occupied');
    if (occupied) {
      this.showNotification('Finish the occupied table first');
      return;
    }
    const lastTable = this.state.tables[this.state.tables.length - 1];
    if (!lastTable) return;
    this.state.tables.pop();
    this.saveState();
    this.renderAll();
    this.showNotification('Table removed');
  }

  renameTable(tableId, name) {
    const target = this.state.tables.find((table) => table.id === tableId);
    if (!target) return;
    target.name = name || `Table ${tableId}`;
    this.saveState();
    this.renderAll();
  }

  handleStartGame(event) {
    event.preventDefault();
    const playerName = document.getElementById('playerName').value.trim();
    const phone = document.getElementById('playerPhone').value.trim();
    const totalPlayers = Number(document.getElementById('playerCount').value);
    const tableId = Number(document.getElementById('tableSelect').value);
    const gameType = document.getElementById('gameType').value;
    const notes = document.getElementById('playerNotes').value.trim();

    if (!playerName) {
      this.showNotification('Player name is required');
      return;
    }

    const table = this.state.tables.find((item) => item.id === tableId);
    if (!table || table.status === 'occupied') {
      this.showNotification('Choose an available table');
      return;
    }

    const now = Date.now();
    table.status = 'occupied';
    table.playerName = playerName;
    table.phone = phone;
    table.startTime = now;
    table.elapsedSeconds = 0;
    table.gameType = gameType;
    table.notes = notes;
    table.totalPlayers = totalPlayers;

    const playerRecord = {
      id: `${now}-${playerName}`,
      name: playerName,
      phone,
      favorite: false,
      notes,
      totalPlayers
    };

    this.state.players.push(playerRecord);
    this.state.activity.unshift({
      message: `${playerName} started ${table.name}`,
      at: new Date(now).toLocaleTimeString()
    });

    this.state.quickPlayers = this.state.quickPlayers.filter((item) => item !== playerName);
    this.state.quickPlayers.unshift(playerName);
    this.state.quickPlayers = [...new Set(this.state.quickPlayers)].slice(0, 6);

    this.saveState();
    this.renderAll();
    this.showNotification('Game started');
    event.currentTarget.reset();
  }

  updateBill(table) {
    if (!table || table.status !== 'occupied' || !table.startTime) {
      table.currentBill = 0;
      return 0;
    }

    const durationMinutes = Math.max(0, Math.floor(table.elapsedSeconds / 60));
    if (this.state.pricingMethod === 'hour') {
      table.currentBill = Math.round((durationMinutes / 60) * this.state.priceHour);
    } else {
      table.currentBill = durationMinutes * this.state.priceMinute;
    }
    return table.currentBill;
  }

  startTimerLoop() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.state.tables.forEach((table) => {
        if (table.status === 'occupied' && table.startTime) {
          table.elapsedSeconds = Math.floor((Date.now() - table.startTime) / 1000);
          this.updateBill(table);
        }
      });
      this.renderTables();
      this.renderDashboard();
    }, 1000);
  }

  renderAll() {
    this.renderTables();
    this.renderDashboard();
    this.renderHistory();
    this.renderQuickPlayers();
    this.renderActivity();
    this.updateSettingsForm();
    this.renderStats();
    this.populateSelects();
    this.populateMenuSelect();
    this.populateWalkInMenuSelect();
    this.renderMenuItems();
    this.renderWalkInItems();
    this.saveState();
  }

  renderTables() {
    const grid = document.getElementById('tablesGrid');
    grid.innerHTML = this.state.tables.map((table) => {
      const isOccupied = table.status === 'occupied';
      const elapsed = table.elapsedSeconds || 0;
      const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const progress = Math.min(100, Math.round((elapsed / 3600) * 100));
      const billValue = this.updateBill(table);
      const bill = this.state.currency + billValue.toLocaleString('en-IN');
      const actionBtn = isOccupied
        ? `<button class="danger-btn end-game-btn" data-table-id="${table.id}">End Game</button>`
        : `<button class="primary-btn" data-table-id="${table.id}">Start Game</button>`;

      return `
        <article class="table-card ${isOccupied ? 'occupied' : 'available'}">
          <header>
            <strong>${table.name}</strong>
            <span class="table-status">${isOccupied ? 'Occupied' : 'Available'}</span>
          </header>
          <div class="timer-ring-wrap">
            <div class="timer-ring" style="--progress:${progress};">
              <span>${hh}:${mm}:${ss}</span>
            </div>
          </div>
          <div class="table-info">
            <div>Status: ${isOccupied ? 'Occupied' : 'Available'}</div>
            <div>Current Player: ${table.playerName || '—'}</div>
            <div>Time Started: ${table.startTime ? new Date(table.startTime).toLocaleTimeString() : '—'}</div>
            <div>Duration: ${Math.floor(elapsed / 60)} min</div>
            <div>Current Bill: ${bill}</div>
            <div>Game Type: ${table.gameType || 'Practice'}</div>
          </div>
          <div class="control-row">
            ${actionBtn}
            <button class="ghost-btn rename-btn" data-table-id="${table.id}">Rename</button>
          </div>
        </article>
      `;
    }).join('');

    grid.querySelectorAll('.end-game-btn').forEach((button) => {
      button.addEventListener('click', () => this.openEndModal(Number(button.dataset.tableId)));
    });

    grid.querySelectorAll('.rename-btn').forEach((button) => {
      button.addEventListener('click', () => {
        const tableId = Number(button.dataset.tableId);
        const name = prompt('Rename table', this.state.tables.find((t) => t.id === tableId)?.name || `Table ${tableId}`);
        if (name) this.renameTable(tableId, name);
      });
    });

    grid.querySelectorAll('[data-table-id]').forEach((button) => {
      if (!button.classList.contains('end-game-btn') && !button.classList.contains('rename-btn')) {
        button.addEventListener('click', () => {
          const tableId = Number(button.dataset.tableId);
          const table = this.state.tables.find((item) => item.id === tableId);
          if (table && table.status === 'available') {
            document.getElementById('tableSelect').value = tableId;
            document.getElementById('playerName').focus();
          }
        });
      }
    });
  }

  renderDashboard() {
    const activeTables = this.state.tables.filter((table) => table.status === 'occupied').length;
    const playersPlaying = this.state.tables.filter((table) => table.status === 'occupied').reduce((sum, table) => sum + (table.totalPlayers || 1), 0);
    const availableTables = this.state.tables.length - activeTables;
    const totalToday = this.state.history.filter((record) => this.isToday(record.endTime)).reduce((sum, record) => sum + record.totalBill, 0);

    document.getElementById('activeTablesCount').textContent = String(activeTables);
    document.getElementById('playersPlayingCount').textContent = String(playersPlaying);
    document.getElementById('todayEarnings').textContent = `${this.state.currency}${totalToday.toLocaleString('en-IN')}`;
    document.getElementById('availableTablesCount').textContent = String(availableTables);
  }

  renderQuickPlayers() {
    const quick = document.getElementById('quickPlayers');
    const mergedPlayers = [...new Set(this.state.quickPlayers.concat(this.state.players.map((player) => player.name)))].slice(0, 12);
    const ordered = mergedPlayers.sort((a, b) => {
      const favA = this.getPlayerRecord(a)?.favorite ? 1 : 0;
      const favB = this.getPlayerRecord(b)?.favorite ? 1 : 0;
      return favB - favA || a.localeCompare(b);
    });

    quick.innerHTML = ordered.map((name) => {
      const player = this.getPlayerRecord(name);
      const favoriteIcon = player?.favorite ? '★' : '☆';
      return `<button class="chip ${player?.favorite ? 'favorite-chip' : ''}" data-player-name="${name}"><span class="chip-star" data-player-name="${name}">${favoriteIcon}</span><span>${name}</span></button>`;
    }).join('');

    quick.querySelectorAll('.chip').forEach((button) => {
      button.addEventListener('click', (event) => {
        const star = event.target.closest('.chip-star');
        if (star) {
          event.stopPropagation();
          this.toggleFavorite(star.dataset.playerName);
          return;
        }
        document.getElementById('playerName').value = button.dataset.playerName;
        document.getElementById('playerName').focus();
      });
    });
  }

  renderHistory() {
    const search = document.getElementById('historySearch').value.trim().toLowerCase();
    const filter = document.getElementById('historyFilter').value;
    const historyRows = this.state.history
      .filter((entry) => {
        const matchSearch = !search || [entry.playerName, entry.phone, entry.tableName, entry.endTime, String(entry.totalBill)].join(' ').toLowerCase().includes(search);
        const matchFilter = this.filterByDate(entry, filter);
        return matchSearch && matchFilter;
      })
      .sort((a, b) => Number(b.endTime) - Number(a.endTime));

    const tbody = document.getElementById('historyTableBody');
    tbody.innerHTML = historyRows.map((entry) => `
      <tr>
        <td>${entry.playerName}</td>
        <td>${entry.tableName}</td>
        <td>${new Date(entry.startTime).toLocaleString()}</td>
        <td>${new Date(entry.endTime).toLocaleString()}</td>
        <td>${entry.duration}</td>
        <td>${this.state.currency}${entry.totalBill}</td>
        <td>${entry.gameType}</td>
        <td><span class="badge ${entry.paymentStatus}">${entry.paymentStatus}</span></td>
        <td>
          <button class="ghost-btn" data-history-receipt="${entry.id}">Receipt</button>
          <button class="ghost-btn" data-history-toggle="${entry.id}">${entry.paymentStatus === 'paid' ? 'Pending' : 'Paid'}</button>
          <button class="danger-btn" data-history-delete="${entry.id}">Delete</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-history-receipt]').forEach((button) => {
      button.addEventListener('click', () => this.showReceipt(button.dataset.historyReceipt));
    });
    tbody.querySelectorAll('[data-history-toggle]').forEach((button) => {
      button.addEventListener('click', () => this.togglePaymentStatus(button.dataset.historyToggle));
    });
    tbody.querySelectorAll('[data-history-delete]').forEach((button) => {
      button.addEventListener('click', () => this.deleteHistoryRecord(button.dataset.historyDelete));
    });
  }

  renderActivity() {
    const list = document.getElementById('activityList');
    list.innerHTML = this.state.activity.slice(0, 8).map((item) => `<div class="activity-item">${item.message} • ${item.at}</div>`).join('');
  }

  renderStats() {
    const history = this.state.history;
    const today = new Date();
    const dailyData = Array.from({ length: 7 }, (_, idx) => {
      const day = new Date(today);
      day.setDate(today.getDate() - (6 - idx));
      return {
        label: day.toLocaleDateString('en-US', { weekday: 'short' }),
        value: history.filter((entry) => this.isSameDay(new Date(entry.endTime), day)).reduce((sum, entry) => sum + entry.totalBill, 0)
      };
    });

    const weeklyData = Array.from({ length: 4 }, (_, idx) => ({
      label: `W${idx + 1}`,
      value: history.filter((entry) => this.isCurrentWeek(entry.endTime, idx)).reduce((sum, entry) => sum + entry.totalBill, 0)
    }));

    const tableCounts = {};
    history.forEach((entry) => {
      tableCounts[entry.tableName] = (tableCounts[entry.tableName] || 0) + 1;
    });
    const topTable = Object.entries(tableCounts).sort((a, b) => b[1] - a[1])[0];
    const avg = history.length ? Math.round(history.reduce((sum, entry) => sum + this.getDurationMinutes(entry.duration), 0) / history.length) : 0;
    const gamesToday = history.filter((entry) => this.isToday(entry.endTime)).length;

    document.getElementById('mostUsedTable').textContent = topTable ? topTable[0] : '-';
    document.getElementById('avgGameTime').textContent = `${avg} min`;
    document.getElementById('totalGamesToday').textContent = String(gamesToday);

    this.drawChart('dailyChart', dailyData, '#00BFFF');
    this.drawChart('weeklyChart', weeklyData, '#00E676');
  }

  drawChart(canvasId, data, color) {
    const canvas = document.getElementById(canvasId);
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    const maxValue = Math.max(...data.map((item) => item.value), 1);

    context.strokeStyle = 'rgba(255,255,255,0.1)';
    for (let i = 0; i < 4; i++) {
      const y = 20 + i * 30;
      context.beginPath();
      context.moveTo(20, y);
      context.lineTo(width - 20, y);
      context.stroke();
    }

    context.beginPath();
    data.forEach((item, idx) => {
      const x = 30 + idx * ((width - 60) / Math.max(data.length - 1, 1));
      const y = height - 20 - (item.value / maxValue) * (height - 40);
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.stroke();

    data.forEach((item, idx) => {
      const x = 30 + idx * ((width - 60) / Math.max(data.length - 1, 1));
      const y = height - 20 - (item.value / maxValue) * (height - 40);
      context.fillStyle = color;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    });
  }

  populateSelects() {
    const select = document.getElementById('tableSelect');
    select.innerHTML = this.state.tables
      .filter((table) => table.status === 'available')
      .map((table) => `<option value="${table.id}">${table.name}</option>`)
      .join('');
    if (!select.value && this.state.tables.length) {
      select.value = this.state.tables[0]?.id || '';
    }
  }

  populateMenuSelect() {
    const menuSelect = document.getElementById('endItemSelect');
    menuSelect.innerHTML = this.state.menuItems.map((item) => `<option value="${item.id}">${item.name} [${item.category || 'General'}] — ${this.state.currency}${item.price}</option>`).join('');
    if (this.state.menuItems.length) {
      const first = this.state.menuItems[0];
      menuSelect.value = first.id;
      document.getElementById('endItemPrice').value = first.price;
    }
  }

  populateWalkInMenuSelect(searchTerm = '') {
    const menuSelect = document.getElementById('walkInItemSelect');
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredItems = this.state.menuItems
      .filter((item) => !normalizedSearch || [item.name, item.category || 'General'].join(' ').toLowerCase().includes(normalizedSearch))
      .sort((a, b) => (a.category || 'General').localeCompare(b.category || 'General') || a.name.localeCompare(b.name));

    menuSelect.innerHTML = filteredItems.map((item) => `<option value="${item.id}">${item.name} [${item.category || 'General'}] — ${this.state.currency}${item.price}</option>`).join('');
    if (filteredItems.length) {
      const first = filteredItems[0];
      menuSelect.value = first.id;
      document.getElementById('walkInItemPrice').value = first.price;
    } else {
      document.getElementById('walkInItemPrice').value = 0;
    }
  }

  filterWalkInMenuSelect() {
    const searchTerm = document.getElementById('walkInItemSearch')?.value || '';
    this.populateWalkInMenuSelect(searchTerm);
  }

  syncSelectedMenuPrice() {
    const select = document.getElementById('endItemSelect');
    const item = this.state.menuItems.find((entry) => entry.id === select.value);
    if (item) {
      document.getElementById('endItemPrice').value = item.price;
    }
  }

  syncWalkInSelectedMenuPrice() {
    const select = document.getElementById('walkInItemSelect');
    const item = this.state.menuItems.find((entry) => entry.id === select.value);
    if (item) {
      document.getElementById('walkInItemPrice').value = item.price;
    }
  }

  openEndModal(tableId) {
    this.pendingEndId = tableId;
    this.pendingBillItems = [];
    const table = this.state.tables.find((item) => item.id === tableId);
    const calculatedBill = Number(table?.currentBill || 0);
    this.pendingBillItems = [];
    document.getElementById('endCalculatedBill').value = calculatedBill;
    document.getElementById('endDiscount').value = 0;
    document.getElementById('endFinalBill').value = calculatedBill;
    document.getElementById('endReason').value = '';
    document.getElementById('billItemsList').innerHTML = '';
    this.populateMenuSelect();
    document.getElementById('confirmModal').classList.remove('hidden');
  }

  addBillItem() {
    const select = document.getElementById('endItemSelect');
    const selectedId = select.value;
    const qty = Number(document.getElementById('endItemQty').value) || 1;
    const price = Number(document.getElementById('endItemPrice').value) || 0;
    const item = this.state.menuItems.find((entry) => entry.id === selectedId);

    if (!item && !selectedId) {
      this.showNotification('Choose a menu item first');
      return;
    }

    const chosenItem = item || { id: `${Date.now()}`, name: selectedId, price };
    if (!chosenItem.price || chosenItem.price <= 0) {
      this.showNotification('Enter a valid item price');
      return;
    }

    this.pendingBillItems.push({ id: `${Date.now()}-${Math.random()}`, name: chosenItem.name, qty, price: chosenItem.price });
    document.getElementById('endItemQty').value = 1;
    document.getElementById('endItemPrice').value = chosenItem.price;
    this.updateEndModalTotals();
  }

  removeBillItem(itemId) {
    this.pendingBillItems = this.pendingBillItems.filter((item) => item.id !== itemId);
    this.updateEndModalTotals();
  }

  updateEndModalTotals() {
    const table = this.state.tables.find((item) => item.id === this.pendingEndId);
    const tableCharge = Number(table?.currentBill || 0);
    const itemTotal = this.pendingBillItems.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = Number(document.getElementById('endDiscount').value) || 0;
    const total = Math.max(0, tableCharge + itemTotal - discount);
    document.getElementById('endCalculatedBill').value = tableCharge + itemTotal;
    document.getElementById('endFinalBill').value = total;

    const list = document.getElementById('billItemsList');
    list.innerHTML = this.pendingBillItems.map((item) => `
      <div class="bill-item-row">
        <span>${item.qty}× ${item.name} — ${this.state.currency}${item.qty * item.price}</span>
        <button class="danger-btn small-btn" data-remove-item="${item.id}">Remove</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-remove-item]').forEach((button) => {
      button.addEventListener('click', () => this.removeBillItem(button.dataset.removeItem));
    });
  }

  addWalkInItem() {
    const select = document.getElementById('walkInItemSelect');
    const selectedId = select.value;
    const qty = Number(document.getElementById('walkInItemQty').value) || 1;
    const price = Number(document.getElementById('walkInItemPrice').value) || 0;
    const item = this.state.menuItems.find((entry) => entry.id === selectedId);
    if (!item) {
      this.showNotification('Choose a menu item first');
      return;
    }
    if (price <= 0) {
      this.showNotification('Menu item price must be greater than zero');
      return;
    }

    this.pendingWalkInItems = this.pendingWalkInItems || [];
    this.pendingWalkInItems.push({ id: `${Date.now()}-${Math.random()}`, name: item.name, qty, price: Number(price) });
    document.getElementById('walkInItemQty').value = 1;
    this.updateWalkInTotals();
  }

  removeWalkInItem(itemId) {
    this.pendingWalkInItems = (this.pendingWalkInItems || []).filter((item) => item.id !== itemId);
    this.updateWalkInTotals();
  }

  updateWalkInTotals() {
    const discount = Number(document.getElementById('walkInDiscount').value) || 0;
    const itemTotal = (this.pendingWalkInItems || []).reduce((sum, item) => sum + item.qty * item.price, 0);
    const total = Math.max(0, itemTotal - discount);
    document.getElementById('walkInTotalBill').textContent = `${this.state.currency}${total.toLocaleString('en-IN')}`;

    const list = document.getElementById('walkInBillList');
    list.innerHTML = (this.pendingWalkInItems || []).map((item) => `
      <div class="bill-item-row">
        <span>${item.qty}× ${item.name} — ${this.state.currency}${item.qty * item.price}</span>
        <button class="danger-btn small-btn" data-remove-walkin-item="${item.id}">Remove</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-remove-walkin-item]').forEach((button) => {
      button.addEventListener('click', () => this.removeWalkInItem(button.dataset.removeWalkinItem));
    });
  }

  saveWalkInOrder() {
    const customerName = document.getElementById('walkInCustomerName').value.trim();
    const phone = document.getElementById('walkInPhone').value.trim();
    const discount = Number(document.getElementById('walkInDiscount').value) || 0;
    const items = this.pendingWalkInItems || [];

    if (!customerName) {
      this.showNotification('Customer name is required');
      return;
    }
    if (!items.length) {
      this.showNotification('Add at least one menu item');
      return;
    }

    const orderTime = Date.now();
    const totalBill = Math.max(0, items.reduce((sum, item) => sum + item.qty * item.price, 0) - discount);
    const order = {
      id: `${orderTime}-${customerName}`,
      customerName,
      phone,
      tableName: 'Walk-in Cafe',
      startTime: orderTime,
      endTime: orderTime,
      duration: 'Walk-in',
      totalBill,
      discount,
      lineItems: items.map((item) => ({ ...item })),
      gameType: 'Walk-in',
      paymentStatus: 'pending',
      playerName: customerName,
      reason: 'Cafe-only order'
    };

    this.state.walkInOrders.push(order);
    this.state.history.push(order);
    this.pendingWalkInItems = [];
    document.getElementById('walkInCustomerName').value = '';
    document.getElementById('walkInPhone').value = '';
    document.getElementById('walkInItemQty').value = 1;
    document.getElementById('walkInDiscount').value = 0;
    this.saveState();
    this.renderAll();
    this.showNotification('Walk-in order saved');
    this.showReceipt(order.id);
  }

  renderWalkInItems() {
    const list = document.getElementById('walkInBillList');
    list.innerHTML = (this.pendingWalkInItems || []).map((item) => `
      <div class="bill-item-row">
        <span>${item.qty}× ${item.name} — ${this.state.currency}${item.qty * item.price}</span>
        <button class="danger-btn small-btn" data-remove-walkin-item="${item.id}">Remove</button>
      </div>
    `).join('');

    list.querySelectorAll('[data-remove-walkin-item]').forEach((button) => {
      button.addEventListener('click', () => this.removeWalkInItem(button.dataset.removeWalkinItem));
    });
  }

  closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
  }

  confirmEndGame() {
    if (!this.pendingEndId) return;
    const table = this.state.tables.find((item) => item.id === this.pendingEndId);
    if (!table || table.status !== 'occupied') return;

    const endTime = Date.now();
    const durationMinutes = Math.max(1, Math.floor(table.elapsedSeconds / 60));
    const calculatedBill = this.state.pricingMethod === 'hour'
      ? Math.round((durationMinutes / 60) * this.state.priceHour)
      : durationMinutes * this.state.priceMinute;
    const itemTotal = this.pendingBillItems.reduce((sum, item) => sum + item.qty * item.price, 0);
    const discount = Number(document.getElementById('endDiscount').value) || 0;
    const finalBill = Math.max(0, Number(document.getElementById('endFinalBill').value) || calculatedBill + itemTotal - discount);
    const reason = document.getElementById('endReason').value.trim();

    const record = {
      id: `${table.id}-${endTime}`,
      playerName: table.playerName,
      phone: table.phone,
      tableName: table.name,
      startTime: table.startTime,
      endTime,
      duration: `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`,
      totalBill: finalBill,
      discount,
      reason,
      lineItems: this.pendingBillItems.map((item) => ({ ...item })),
      gameType: table.gameType,
      paymentStatus: 'pending'
    };

    this.state.history.push(record);
    this.state.activity.unshift({ message: `${table.playerName} ended ${table.name}`, at: new Date(endTime).toLocaleTimeString() });

    table.status = 'available';
    table.playerName = '';
    table.phone = '';
    table.startTime = null;
    table.elapsedSeconds = 0;
    table.currentBill = 0;
    table.gameType = 'Practice';
    table.notes = '';
    table.totalPlayers = 1;

    this.pendingEndId = null;
    this.pendingBillItems = [];
    this.saveState();
    this.renderAll();
    this.closeModal('confirmModal');
    this.showNotification('Game ended');
  }

  togglePaymentStatus(recordId) {
    const record = this.state.history.find((item) => item.id === recordId);
    if (!record) return;
    record.paymentStatus = record.paymentStatus === 'paid' ? 'pending' : 'paid';
    this.saveState();
    this.renderHistory();
    this.renderDashboard();
  }

  deleteHistoryRecord(recordId) {
    this.state.history = this.state.history.filter((record) => record.id !== recordId);
    this.state.activity.unshift({ message: 'Record deleted', at: new Date().toLocaleTimeString() });
    this.saveState();
    this.renderHistory();
    this.renderDashboard();
    this.renderStats();
    this.showNotification('Record deleted');
  }

  exportCsv() {
    const header = ['Player', 'Table', 'Start Time', 'End Time', 'Duration', 'Total Bill', 'Game Type', 'Payment Status'];
    const rows = this.state.history.map((entry) => [entry.playerName, entry.tableName, entry.startTime, entry.endTime, entry.duration, entry.totalBill, entry.gameType, entry.paymentStatus]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pool-cafe-history.csv';
    link.click();
    this.showNotification('CSV exported');
  }

  getPlayerRecord(playerName) {
    return this.state.players.find((player) => player.name === playerName) || null;
  }

  toggleFavorite(playerName) {
    const player = this.getPlayerRecord(playerName);
    if (!player) {
      this.state.players.push({ name: playerName, phone: '', favorite: true, notes: '', totalPlayers: 1 });
    } else {
      player.favorite = !player.favorite;
    }
    this.state.quickPlayers = [...new Set(this.state.quickPlayers.concat(playerName))];
    this.saveState();
    this.renderQuickPlayers();
    this.showNotification(playerName + (this.getPlayerRecord(playerName)?.favorite ? ' marked favorite' : ' removed from favorites'));
  }

  showReceipt(recordId) {
    const record = this.state.history.find((entry) => entry.id === recordId);
    if (!record) return;
    const itemRows = (record.lineItems || []).map((item) => `<div>${item.qty}× ${item.name} — ${this.state.currency}${item.qty * item.price}</div>`).join('');
    const receipt = `
      <div class="receipt-sheet">
        <h2>${this.state.cafeName}</h2>
        <p><strong>Player:</strong> ${record.playerName}</p>
        <p><strong>Table:</strong> ${record.tableName}</p>
        <p><strong>Duration:</strong> ${record.duration}</p>
        <div class="receipt-items"><strong>Cafe Items:</strong>${itemRows || '<div>No items added</div>'}</div>
        <p><strong>Discount:</strong> ${this.state.currency}${record.discount || 0}</p>
        <p><strong>Final Bill:</strong> ${this.state.currency}${record.totalBill}</p>
        <p><strong>Date:</strong> ${new Date(record.endTime).toLocaleString()}</p>
        <div class="qr-placeholder">QR Placeholder</div>
      </div>
    `;
    document.getElementById('receiptContent').innerHTML = receipt;
    document.getElementById('receiptModal').classList.remove('hidden');
  }

  printReceipt() {
    const content = document.getElementById('receiptContent').innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>body{font-family:Arial,sans-serif;padding:24px;} .receipt-sheet{border:1px solid #ddd;padding:18px;border-radius:12px;} .qr-placeholder{margin-top:12px;padding:12px;border:1px dashed #aaa;text-align:center;}</style></head><body>${content}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  addMenuItem() {
    const name = document.getElementById('menuItemName').value.trim();
    const category = document.getElementById('menuItemCategory').value;
    const price = Number(document.getElementById('menuItemPrice').value) || 0;
    if (!name || price <= 0) {
      this.showNotification('Use a valid menu item name and price');
      return;
    }

    const existing = this.state.menuItems.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.price = price;
      existing.category = category;
    } else {
      this.state.menuItems.push({ id: `menu-${Date.now()}`, name, price, category });
    }

    document.getElementById('menuItemName').value = '';
    document.getElementById('menuItemPrice').value = 0;
    document.getElementById('menuItemCategory').value = 'Drink';
    this.saveState();
    this.renderAll();
    this.showNotification('Menu item saved');
  }

  renderMenuItems() {
    const list = document.getElementById('menuItemsList');
    const searchTerm = document.getElementById('menuSearchInput')?.value.trim().toLowerCase() || '';
    const filtered = this.state.menuItems
      .filter((item) => !searchTerm || [item.name, item.category || 'General'].join(' ').toLowerCase().includes(searchTerm))
      .sort((a, b) => (a.category || 'General').localeCompare(b.category || 'General') || a.name.localeCompare(b.name));

    const grouped = filtered.reduce((accumulator, item) => {
      const category = item.category || 'General';
      if (!accumulator[category]) accumulator[category] = [];
      accumulator[category].push(item);
      return accumulator;
    }, {});

    list.innerHTML = Object.entries(grouped).map(([category, items]) => `
      <div class="menu-category-group">
        <div class="menu-category-title">${category}</div>
        ${items.map((item) => `
          <div class="bill-item-row">
            <div class="menu-item-meta">
              <span>${item.name}</span>
              <small>${this.state.currency}${item.price}</small>
            </div>
            <button class="ghost-btn small-btn" data-menu-remove="${item.id}">Remove</button>
          </div>
        `).join('')}
      </div>
    `).join('');

    list.querySelectorAll('[data-menu-remove]').forEach((button) => {
      button.addEventListener('click', () => this.removeMenuItem(button.dataset.menuRemove));
    });
  }

  removeMenuItem(itemId) {
    this.state.menuItems = this.state.menuItems.filter((item) => item.id !== itemId);
    this.saveState();
    this.renderAll();
    this.showNotification('Menu item removed');
  }

  exportBackup() {
    const blob = new Blob([JSON.stringify(this.state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'pool-cafe-backup.json';
    link.click();
  }

  importBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        this.state = { ...this.getDefaultState(), ...parsed };
        this.ensureTables();
        this.saveState();
        this.renderAll();
        this.showNotification('Backup imported');
      } catch {
        this.showNotification('Invalid backup file');
      }
    });
    input.click();
  }

  saveSettings() {
    this.state.cafeName = document.getElementById('settingCafeName').value.trim() || this.state.cafeName;
    this.state.currency = document.getElementById('settingCurrency').value.trim() || this.state.currency;
    this.state.pricingMethod = document.getElementById('settingPricingMethod').value;
    this.state.priceMinute = Number(document.getElementById('settingPriceMinute').value) || 0;
    this.state.priceHour = Number(document.getElementById('settingPriceHour').value) || 0;
    this.state.theme = document.getElementById('settingTheme').value;
    this.state.defaultTables = Number(document.getElementById('settingDefaultTables').value) || this.state.defaultTables;
    this.state.autoSave = document.getElementById('settingAutoSave').checked;
    this.saveState();
    this.renderAll();
    this.closeModal('settingsModal');
    this.showNotification('Settings updated');
  }

  updateSettingsForm() {
    document.getElementById('settingCafeName').value = this.state.cafeName;
    document.getElementById('settingCurrency').value = this.state.currency;
    document.getElementById('settingPricingMethod').value = this.state.pricingMethod;
    document.getElementById('settingPriceMinute').value = this.state.priceMinute;
    document.getElementById('settingPriceHour').value = this.state.priceHour;
    document.getElementById('settingTheme').value = this.state.theme;
    document.getElementById('settingDefaultTables').value = this.state.defaultTables;
    document.getElementById('settingAutoSave').checked = this.state.autoSave;
  }

  openSettings() {
    this.updateSettingsForm();
    document.getElementById('settingsModal').classList.remove('hidden');
  }

  resetData() {
    if (!confirm('Reset all data?')) return;
    this.state = this.getDefaultState();
    this.ensureTables();
    this.saveState();
    this.renderAll();
    this.showNotification('All data reset');
  }

  getDurationMinutes(duration) {
    if (!duration || typeof duration !== 'string') return 0;
    const hourMatch = duration.match(/(\d+)h/);
    const minuteMatch = duration.match(/(\d+)m/);
    const hours = Number(hourMatch?.[1] || 0);
    const minutes = Number(minuteMatch?.[1] || 0);
    return hours * 60 + minutes;
  }

  filterByDate(entry, filter) {
    const now = new Date();
    if (filter === 'today') return this.isToday(entry.endTime);
    if (filter === 'yesterday') return this.isYesterday(entry.endTime);
    if (filter === 'week') return this.isCurrentWeek(entry.endTime, 0);
    if (filter === 'month') return this.isCurrentMonth(entry.endTime);
    return true;
  }

  isToday(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  isYesterday(timestamp) {
    const date = new Date(timestamp);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return date.toDateString() === yesterday.toDateString();
  }

  isSameDay(a, b) {
    return a.toDateString() === b.toDateString();
  }

  isCurrentWeek(timestamp, idx) {
    const current = new Date();
    const weekStart = new Date(current);
    const end = new Date(current);
    weekStart.setDate(current.getDate() - (current.getDay() || 7) + 1);
    end.setDate(weekStart.getDate() + 6);
    const date = new Date(timestamp);
    return date >= weekStart && date <= end;
  }

  isCurrentMonth(timestamp) {
    const date = new Date(timestamp);
    const current = new Date();
    return date.getMonth() === current.getMonth() && date.getFullYear() === current.getFullYear();
  }

  showFileProtocolNotice() {
    const existing = document.querySelector('.notice-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.className = 'notice-banner';
    banner.textContent = 'Open this app with the local server URL to keep your pool cafe data after closing the browser.';
    document.querySelector('.app-shell').prepend(banner);
  }

  showNotification(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.getElementById('toastContainer').appendChild(toast);
    setTimeout(() => toast.remove(), 2200);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.poolCafeManager = new PoolCafeManager();
  document.getElementById('liveClock').textContent = new Date().toLocaleTimeString();
  document.getElementById('currentDate').textContent = new Date().toLocaleDateString();
});

setInterval(() => {
  if (!window.poolCafeManager) return;
  const now = new Date();
  document.getElementById('liveClock').textContent = now.toLocaleTimeString();
  document.getElementById('currentDate').textContent = now.toLocaleDateString();
}, 1000);
