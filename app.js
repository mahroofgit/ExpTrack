/* =========================================================================
   WAYLOG — app logic
   -------------------------------------------------------------------------
   Everything lives in localStorage under STORAGE_KEY. There is no network
   call anywhere in this file — the app works fully offline once loaded,
   and none of your trip or expense data ever leaves the phone.

   State shape:
   {
     trips:    [{ id, name, createdAt }],
     expenses: [{ id, tripId, title, amount, currency, category, date,
                   notes, createdAt, updatedAt }],
     activeTripId: 'all' | <tripId>
   }
   ========================================================================= */

const STORAGE_KEY = "waylog.v1";

const CURRENCIES = [
  "USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "CHF",
  "CNY", "SGD", "THB", "AED", "HKD", "NZD", "MXN", "IDR",
];

const CATEGORIES = [
  { key: "Food", emoji: "🍜" },
  { key: "Transport", emoji: "🚕" },
  { key: "Lodging", emoji: "🏨" },
  { key: "Shopping", emoji: "🛍️" },
  { key: "Activities", emoji: "🎟️" },
  { key: "Other", emoji: "✨" },
];

/* ---------------------------- storage ---------------------------- */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { trips: [], expenses: [], activeTripId: "all" };
    const parsed = JSON.parse(raw);
    return {
      trips: Array.isArray(parsed.trips) ? parsed.trips : [],
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      activeTripId: parsed.activeTripId || "all",
    };
  } catch (e) {
    console.error("Waylog: failed to read storage, starting fresh.", e);
    return { trips: [], expenses: [], activeTripId: "all" };
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/* runtime-only filters (not persisted) */
let filters = { search: "", category: "all" };

/* ---------------------------- helpers ---------------------------- */

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function todayISO() {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d - tzOffset).toISOString().slice(0, 10);
}

function formatAmount(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function categoryInfo(key) {
  return CATEGORIES.find((c) => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
}

function tripById(id) {
  return state.trips.find((t) => t.id === id) || null;
}

function dayLabel(iso) {
  const today = todayISO();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const yesterday = y.toISOString().slice(0, 10);
  if (iso === today) return "Today";
  if (iso === yesterday) return "Yesterday";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: iso.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------------------------- scoped data ---------------------------- */

function getScopedExpenses() {
  let list = state.expenses.filter((e) =>
    state.activeTripId === "all" ? true : e.tripId === state.activeTripId
  );
  if (filters.category !== "all") {
    list = list.filter((e) => e.category === filters.category);
  }
  if (filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q)
    );
  }
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

/* ---------------------------- rendering ---------------------------- */

function render() {
  renderTripPill();
  renderSummary();
  renderCategoryChips();
  renderList();
}

function renderTripPill() {
  const label = document.getElementById("tripPillLabel");
  const summaryLabel = document.getElementById("summaryLabel");
  if (state.activeTripId === "all") {
    label.textContent = "All trips";
    summaryLabel.textContent = "All trips";
  } else {
    const trip = tripById(state.activeTripId);
    const name = trip ? trip.name : "All trips";
    label.textContent = name;
    summaryLabel.textContent = name;
    if (!trip) state.activeTripId = "all";
  }
}

function renderSummary() {
  const scoped = getScopedExpenses();
  const totalsByCurrency = {};
  scoped.forEach((e) => {
    totalsByCurrency[e.currency] = (totalsByCurrency[e.currency] || 0) + Number(e.amount);
  });
  const currencies = Object.keys(totalsByCurrency).sort(
    (a, b) => totalsByCurrency[b] - totalsByCurrency[a]
  );

  const amountEl = document.getElementById("summaryAmount");
  const codeEl = document.getElementById("summaryCode");
  const metaEl = document.getElementById("summaryMeta");
  const chipsEl = document.getElementById("summaryCurrencies");

  if (currencies.length === 0) {
    amountEl.textContent = "0.00";
    codeEl.textContent = "—";
  } else {
    const top = currencies[0];
    amountEl.textContent = formatAmount(totalsByCurrency[top]);
    codeEl.textContent = top;
  }

  metaEl.textContent = `${scoped.length} expense${scoped.length === 1 ? "" : "s"}`;

  chipsEl.innerHTML = "";
  currencies.slice(1).forEach((cur) => {
    const chip = document.createElement("span");
    chip.className = "currency-chip";
    chip.textContent = `${formatAmount(totalsByCurrency[cur])} ${cur}`;
    chipsEl.appendChild(chip);
  });
  if (currencies.length === 0) {
    const chip = document.createElement("span");
    chip.className = "currency-chip";
    chip.textContent = "No expenses yet";
    chipsEl.appendChild(chip);
  }
}

function renderCategoryChips() {
  const wrap = document.getElementById("categoryChips");
  wrap.innerHTML = "";
  const all = document.createElement("button");
  all.type = "button";
  all.className = "chip" + (filters.category === "all" ? " active" : "");
  all.textContent = "All";
  all.onclick = () => {
    filters.category = "all";
    render();
  };
  wrap.appendChild(all);

  CATEGORIES.forEach((c) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (filters.category === c.key ? " active" : "");
    chip.textContent = `${c.emoji} ${c.key}`;
    chip.onclick = () => {
      filters.category = filters.category === c.key ? "all" : c.key;
      render();
    };
    wrap.appendChild(chip);
  });
}

function renderList() {
  const wrap = document.getElementById("listWrap");
  const scoped = getScopedExpenses();
  wrap.innerHTML = "";

  if (scoped.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="glyph">🧭</div>
        <p>${state.expenses.length === 0
          ? "No expenses yet. Tap the + button to log your first one."
          : "Nothing matches this filter. Try clearing the search or category."}</p>
      </div>`;
    return;
  }

  let lastDay = null;
  scoped.forEach((e) => {
    if (e.date !== lastDay) {
      lastDay = e.date;
      const h = document.createElement("div");
      h.className = "day-heading";
      h.textContent = dayLabel(e.date);
      wrap.appendChild(h);
    }
    const cat = categoryInfo(e.category);
    const row = document.createElement("button");
    row.type = "button";
    row.className = "expense-row";
    row.onclick = () => openExpenseSheet(e);

    const trip = e.tripId ? tripById(e.tripId) : null;
    const subParts = [];
    if (state.activeTripId === "all" && trip) subParts.push(trip.name);
    if (e.notes) subParts.push(e.notes);
    const sub = subParts.length ? subParts.join(" · ") : cat.key;

    row.innerHTML = `
      <div class="expense-icon">${cat.emoji}</div>
      <div class="expense-main">
        <div class="expense-title"></div>
        <div class="expense-sub"></div>
      </div>
      <div class="expense-amount">${formatAmount(e.amount)}<span class="cur"></span></div>
    `;
    row.querySelector(".expense-title").textContent = e.title;
    row.querySelector(".expense-sub").textContent = sub;
    row.querySelector(".cur").textContent = e.currency;
    wrap.appendChild(row);
  });
}

/* ---------------------------- currency + category selects ---------------------------- */

function populateCurrencySelect(select, selected) {
  select.innerHTML = "";
  CURRENCIES.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    select.appendChild(opt);
  });
  select.value = selected && CURRENCIES.includes(selected) ? selected : CURRENCIES[0];
}

function populateTripSelect(select, selectedTripId) {
  select.innerHTML = "";
  const noneOpt = document.createElement("option");
  noneOpt.value = "";
  noneOpt.textContent = "No trip";
  select.appendChild(noneOpt);
  state.trips.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    select.appendChild(opt);
  });
  select.value = selectedTripId || (state.activeTripId !== "all" ? state.activeTripId : "");
}

function renderCategoryGrid(selected) {
  const grid = document.getElementById("categoryGrid");
  grid.innerHTML = "";
  CATEGORIES.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "category-option" + (c.key === selected ? " active" : "");
    btn.innerHTML = `<span class="g">${c.emoji}</span>${c.key}`;
    btn.onclick = () => {
      document.getElementById("expenseCategory").value = c.key;
      renderCategoryGrid(c.key);
    };
    grid.appendChild(btn);
  });
}

/* ---------------------------- sheets: expense ---------------------------- */

const overlay = document.getElementById("overlay");
const expenseSheet = document.getElementById("expenseSheet");
const tripSheet = document.getElementById("tripSheet");

function openSheet(sheetEl) {
  overlay.classList.add("open");
  sheetEl.classList.add("open");
}

function closeSheets() {
  overlay.classList.remove("open");
  expenseSheet.classList.remove("open");
  tripSheet.classList.remove("open");
}

overlay.addEventListener("click", closeSheets);
document.getElementById("expenseSheetClose").addEventListener("click", closeSheets);
document.getElementById("tripSheetClose").addEventListener("click", closeSheets);

function openExpenseSheet(existing) {
  const form = document.getElementById("expenseForm");
  form.reset();
  document.getElementById("expenseSheetTitle").textContent = existing ? "Edit expense" : "Add expense";
  document.getElementById("expenseId").value = existing ? existing.id : "";
  document.getElementById("expenseTitle").value = existing ? existing.title : "";
  document.getElementById("expenseAmount").value = existing ? existing.amount : "";
  document.getElementById("expenseDate").value = existing ? existing.date : todayISO();
  document.getElementById("expenseNotes").value = existing ? existing.notes || "" : "";
  document.getElementById("expenseDeleteBtn").style.display = existing ? "block" : "none";

  populateCurrencySelect(document.getElementById("expenseCurrency"), existing ? existing.currency : lastUsedCurrency());
  populateTripSelect(document.getElementById("expenseTrip"), existing ? existing.tripId : null);
  renderCategoryGrid(existing ? existing.category : "Other");
  document.getElementById("expenseCategory").value = existing ? existing.category : "Other";

  openSheet(expenseSheet);
  setTimeout(() => document.getElementById("expenseTitle").focus(), 300);
}

function lastUsedCurrency() {
  const sorted = [...state.expenses].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.length ? sorted[0].currency : "USD";
}

document.getElementById("fabAdd").addEventListener("click", () => openExpenseSheet(null));

document.getElementById("expenseForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const id = document.getElementById("expenseId").value;
  const title = document.getElementById("expenseTitle").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  const currency = document.getElementById("expenseCurrency").value;
  const category = document.getElementById("expenseCategory").value;
  const date = document.getElementById("expenseDate").value;
  const tripId = document.getElementById("expenseTrip").value || null;
  const notes = document.getElementById("expenseNotes").value.trim();

  if (!title || isNaN(amount) || amount < 0 || !date) {
    showToast("Please fill in title, amount and date.");
    return;
  }

  if (id) {
    const idx = state.expenses.findIndex((e) => e.id === id);
    if (idx !== -1) {
      state.expenses[idx] = {
        ...state.expenses[idx],
        title, amount, currency, category, date, tripId, notes,
        updatedAt: Date.now(),
      };
    }
    showToast("Expense updated");
  } else {
    state.expenses.push({
      id: uid(), title, amount, currency, category, date, tripId, notes,
      createdAt: Date.now(), updatedAt: Date.now(),
    });
    showToast("Expense added");
  }
  saveState();
  closeSheets();
  render();
});

document.getElementById("expenseDeleteBtn").addEventListener("click", () => {
  const id = document.getElementById("expenseId").value;
  openConfirm("Delete this expense?", "This can't be undone.", () => {
    state.expenses = state.expenses.filter((e) => e.id !== id);
    saveState();
    closeSheets();
    render();
    showToast("Expense deleted");
  });
});

/* ---------------------------- sheet: trips ---------------------------- */

document.getElementById("tripPillBtn").addEventListener("click", () => {
  renderTripSheet();
  openSheet(tripSheet);
});

function renderTripSheet() {
  const wrap = document.getElementById("tripList");
  wrap.innerHTML = "";

  const allRow = document.createElement("div");
  allRow.className = "trip-row" + (state.activeTripId === "all" ? " selected" : "");
  allRow.innerHTML = `
    <button type="button" class="trip-row-main">
      <span class="name">All trips</span>
      <span class="count">${state.expenses.length} expense${state.expenses.length === 1 ? "" : "s"}</span>
    </button>`;
  allRow.querySelector(".trip-row-main").addEventListener("click", () => {
    state.activeTripId = "all";
    saveState();
    closeSheets();
    render();
  });
  wrap.appendChild(allRow);

  state.trips.forEach((t) => {
    const count = state.expenses.filter((e) => e.tripId === t.id).length;
    const row = document.createElement("div");
    row.className = "trip-row" + (state.activeTripId === t.id ? " selected" : "");
    row.innerHTML = `
      <button type="button" class="trip-row-main">
        <span class="name"></span>
        <span class="count">${count} expense${count === 1 ? "" : "s"}</span>
      </button>
      <button type="button" class="icon-btn" data-action="rename">✏️</button>
      <button type="button" class="icon-btn" data-action="delete">🗑️</button>
    `;
    row.querySelector(".name").textContent = t.name;
    row.querySelector(".trip-row-main").addEventListener("click", () => {
      state.activeTripId = t.id;
      saveState();
      closeSheets();
      render();
    });
    row.querySelector('[data-action="rename"]').addEventListener("click", () => {
      const next = prompt("Rename trip", t.name);
      if (next && next.trim()) {
        t.name = next.trim();
        saveState();
        renderTripSheet();
        render();
      }
    });
    row.querySelector('[data-action="delete"]').addEventListener("click", () => {
      openConfirm(
        `Delete "${t.name}"?`,
        count > 0
          ? `${count} expense${count === 1 ? "" : "s"} in this trip will move to "No trip", not be deleted.`
          : "This can't be undone.",
        () => {
          state.trips = state.trips.filter((x) => x.id !== t.id);
          state.expenses.forEach((e) => {
            if (e.tripId === t.id) e.tripId = null;
          });
          if (state.activeTripId === t.id) state.activeTripId = "all";
          saveState();
          renderTripSheet();
          render();
          showToast("Trip deleted");
        }
      );
    });
    wrap.appendChild(row);
  });
}

document.getElementById("addTripBtn").addEventListener("click", () => {
  const input = document.getElementById("newTripName");
  const name = input.value.trim();
  if (!name) return;
  const trip = { id: uid(), name, createdAt: Date.now() };
  state.trips.push(trip);
  state.activeTripId = trip.id;
  input.value = "";
  saveState();
  closeSheets();
  render();
  showToast(`"${name}" created`);
});

/* ---------------------------- confirm dialog ---------------------------- */

const confirmBox = document.getElementById("confirmBox");
let confirmCallback = null;

function openConfirm(title, text, onConfirm) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmText").textContent = text;
  confirmCallback = onConfirm;
  confirmBox.classList.add("open");
}

document.getElementById("confirmCancel").addEventListener("click", () => {
  confirmBox.classList.remove("open");
  confirmCallback = null;
});

document.getElementById("confirmOk").addEventListener("click", () => {
  confirmBox.classList.remove("open");
  if (confirmCallback) confirmCallback();
  confirmCallback = null;
});

/* ---------------------------- search ---------------------------- */

document.getElementById("searchInput").addEventListener("input", (ev) => {
  filters.search = ev.target.value;
  renderSummary();
  renderList();
});

/* ---------------------------- backup: export / import ---------------------------- */

document.getElementById("exportBtn").addEventListener("click", () => {
  const payload = JSON.stringify(state, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = todayISO();
  a.href = url;
  a.download = `waylog-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast("Backup file ready");
});

document.getElementById("importBtn").addEventListener("click", () => {
  document.getElementById("importFile").click();
});

document.getElementById("importFile").addEventListener("change", (ev) => {
  const file = ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const incoming = JSON.parse(reader.result);
      if (!Array.isArray(incoming.trips) || !Array.isArray(incoming.expenses)) {
        throw new Error("File doesn't look like a Waylog backup.");
      }
      openConfirm(
        "Replace all data?",
        "Importing will overwrite everything currently in Waylog with this backup file.",
        () => {
          state = {
            trips: incoming.trips,
            expenses: incoming.expenses,
            activeTripId: "all",
          };
          saveState();
          closeSheets();
          render();
          showToast("Backup restored");
        }
      );
    } catch (e) {
      showToast("Couldn't read that file — is it a Waylog backup?");
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
});

/* ---------------------------- offline support ---------------------------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline caching is a nice-to-have; ignore failures silently */
    });
  });
}

/* ---------------------------- boot ---------------------------- */

render();
