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
     activeTripId: 'all' | 'none' | <tripId>
   }
   'all'  -> dashboard view, shows a card per trip with its own total
   'none' -> the view of expenses that aren't assigned to any trip
   <id>   -> a single trip's expense list
   ========================================================================= */

const STORAGE_KEY = "waylog.v1";

const CURRENCIES = [
  "CAD", "USD", "EUR", "GBP", "INR", "JPY", "AUD", "CHF",
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

function isSearching() {
  return filters.search.trim().length > 0;
}

/* ---------------------------- scoped data ---------------------------- */

/* Expenses belonging to the current trip/none/all scope, with NO other
   filters applied — this is what the small corner total is based on, so
   a trip's total doesn't change just because a category chip is active. */
function scopeExpenses(scopeId) {
  return state.expenses.filter((e) => {
    if (scopeId === "all") return true;
    if (scopeId === "none") return !e.tripId;
    return e.tripId === scopeId;
  });
}

/* Expenses for the currently open trip/none view, with the category
   filter applied. Not used for "all" (that view shows trip cards). */
function getExpensesForActiveScope() {
  let list = scopeExpenses(state.activeTripId);
  if (filters.category !== "all") {
    list = list.filter((e) => e.category === filters.category);
  }
  return list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

/* Search is global and ignores trip scope / category filter on purpose,
   so you can always find a past expense no matter which trip it's in. */
function getSearchResults() {
  const q = filters.search.trim().toLowerCase();
  return state.expenses
    .filter((e) => e.title.toLowerCase().includes(q) || (e.notes || "").toLowerCase().includes(q))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

function totalsByCurrency(list) {
  const totals = {};
  list.forEach((e) => {
    totals[e.currency] = (totals[e.currency] || 0) + Number(e.amount);
  });
  return totals;
}

function compactTotalsText(list) {
  const totals = totalsByCurrency(list);
  const codes = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  if (codes.length === 0) return "No expenses yet";
  const parts = codes.slice(0, 2).map((c) => `${formatAmount(totals[c])} ${c}`);
  if (codes.length > 2) parts.push(`+${codes.length - 2} more`);
  return parts.join(" · ");
}

/* ---------------------------- rendering ---------------------------- */

function render() {
  renderTripPill();
  renderScopeBar();

  const searching = isSearching();
  const isAll = state.activeTripId === "all";

  document.getElementById("categoryToolbar").style.display = !searching && !isAll ? "block" : "none";
  document.getElementById("tripCardsWrap").style.display = !searching && isAll ? "flex" : "none";
  document.getElementById("listWrap").style.display = searching || !isAll ? "block" : "none";

  if (searching) {
    renderExpenseRows(getSearchResults(), { showTrip: true, emptyMessage: "No expenses match your search." });
  } else if (isAll) {
    renderTripCards();
  } else {
    renderCategoryChips();
    renderExpenseRows(getExpensesForActiveScope(), {
      showTrip: false,
      emptyMessage: state.expenses.length === 0
        ? "No expenses yet. Tap the + button to log your first one."
        : "Nothing matches this filter. Try clearing the category filter.",
    });
  }
}

function scopeName(scopeId) {
  if (scopeId === "all") return "All trips";
  if (scopeId === "none") return "No trip";
  const t = tripById(scopeId);
  return t ? t.name : "All trips";
}

function renderTripPill() {
  document.getElementById("tripPillLabel").textContent = scopeName(state.activeTripId);
  if (state.activeTripId !== "all" && state.activeTripId !== "none" && !tripById(state.activeTripId)) {
    state.activeTripId = "all";
  }
}

function renderScopeBar() {
  document.getElementById("scopeLabel").textContent = scopeName(state.activeTripId);
  document.getElementById("backToAllBtn").style.display = state.activeTripId === "all" ? "none" : "inline-flex";
  document.getElementById("scopeTotal").textContent = compactTotalsText(scopeExpenses(state.activeTripId));
}

document.getElementById("backToAllBtn").addEventListener("click", () => {
  state.activeTripId = "all";
  saveState();
  render();
});

/* ---------------------------- trip cards (dashboard) ---------------------------- */

function renderTripCards() {
  const wrap = document.getElementById("tripCardsWrap");
  wrap.innerHTML = "";

  const cards = state.trips.map((t) => ({ id: t.id, name: t.name }));
  const hasUnassigned = state.expenses.some((e) => !e.tripId);
  if (hasUnassigned) cards.push({ id: "none", name: "No trip" });

  if (cards.length === 0 && state.trips.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<div class="glyph">🧭</div><p>Create your first trip to start logging expenses.</p>`;
    wrap.appendChild(empty);
  }

  cards.forEach((c) => {
    const list = scopeExpenses(c.id);
    const totals = totalsByCurrency(list);
    const codes = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "trip-card";
    card.innerHTML = `
      <div class="trip-card-top">
        <span class="trip-card-name"></span>
        <span class="trip-card-count">${list.length} expense${list.length === 1 ? "" : "s"}</span>
      </div>
      <div class="trip-card-totals"></div>
    `;
    card.querySelector(".trip-card-name").textContent = c.name;
    const totalsEl = card.querySelector(".trip-card-totals");
    if (codes.length === 0) {
      const chip = document.createElement("span");
      chip.className = "currency-chip";
      chip.textContent = "No expenses yet";
      totalsEl.appendChild(chip);
    } else {
      codes.forEach((code) => {
        const chip = document.createElement("span");
        chip.className = "currency-chip";
        chip.textContent = `${formatAmount(totals[code])} ${code}`;
        totalsEl.appendChild(chip);
      });
    }
    card.addEventListener("click", () => {
      state.activeTripId = c.id;
      saveState();
      render();
    });
    wrap.appendChild(card);
  });

  const addCard = document.createElement("button");
  addCard.type = "button";
  addCard.className = "trip-card trip-card-add";
  addCard.textContent = "+ New trip";
  addCard.addEventListener("click", () => {
    renderTripSheet();
    openSheet(tripSheet);
  });
  wrap.appendChild(addCard);
}

/* ---------------------------- category chips ---------------------------- */

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

/* ---------------------------- expense list (swipeable rows) ---------------------------- */

const SWIPE_OPEN_X = -84;
let openSwipeRow = null;

function closeSwipeRow(rowEl) {
  if (!rowEl) return;
  const inner = rowEl.querySelector(".expense-row-inner");
  inner.style.transform = "translateX(0)";
  rowEl._openX = 0;
  if (openSwipeRow === rowEl) openSwipeRow = null;
}

function renderExpenseRows(list, { showTrip, emptyMessage }) {
  const wrap = document.getElementById("listWrap");
  wrap.innerHTML = "";
  openSwipeRow = null;

  if (list.length === 0) {
    wrap.innerHTML = `<div class="empty-state"><div class="glyph">🧭</div><p>${emptyMessage}</p></div>`;
    return;
  }

  let lastDay = null;
  list.forEach((e) => {
    if (e.date !== lastDay) {
      lastDay = e.date;
      const h = document.createElement("div");
      h.className = "day-heading";
      h.textContent = dayLabel(e.date);
      wrap.appendChild(h);
    }

    const cat = categoryInfo(e.category);
    const trip = e.tripId ? tripById(e.tripId) : null;
    const subParts = [];
    if (showTrip) subParts.push(trip ? trip.name : "No trip");
    if (e.notes) subParts.push(e.notes);
    const sub = subParts.length ? subParts.join(" · ") : cat.key;

    const item = document.createElement("div");
    item.className = "expense-item";
    item.innerHTML = `
      <div class="swipe-delete-bg">
        <button type="button" class="swipe-delete-btn"><span class="g">🗑️</span>Delete</button>
      </div>
      <div class="expense-row-inner">
        <div class="expense-icon">${cat.emoji}</div>
        <div class="expense-main">
          <div class="expense-title"></div>
          <div class="expense-sub"></div>
        </div>
        <div class="expense-amount">${formatAmount(e.amount)}<span class="cur"></span></div>
      </div>
    `;
    item.querySelector(".expense-title").textContent = e.title;
    item.querySelector(".expense-sub").textContent = sub;
    item.querySelector(".cur").textContent = e.currency;

    attachSwipeHandlers(item, e.id);
    wrap.appendChild(item);
  });
}

function attachSwipeHandlers(item, expenseId) {
  const inner = item.querySelector(".expense-row-inner");
  const deleteBtn = item.querySelector(".swipe-delete-btn");
  let startX = 0;
  let baseX = 0;
  let dragging = false;
  let moved = false;
  item._openX = 0;

  function setX(x) {
    const clamped = Math.min(0, Math.max(SWIPE_OPEN_X, x));
    inner.style.transform = `translateX(${clamped}px)`;
    item._openX = clamped;
    return clamped;
  }

  item.addEventListener("touchstart", (ev) => {
    if (openSwipeRow && openSwipeRow !== item) closeSwipeRow(openSwipeRow);
    startX = ev.touches[0].clientX;
    baseX = item._openX || 0;
    dragging = true;
    moved = false;
    inner.style.transition = "none";
  }, { passive: true });

  item.addEventListener("touchmove", (ev) => {
    if (!dragging) return;
    const dx = ev.touches[0].clientX - startX;
    if (Math.abs(dx) > 6) moved = true;
    setX(baseX + dx);
  }, { passive: true });

  item.addEventListener("touchend", () => {
    dragging = false;
    inner.style.transition = "";
    if (item._openX < SWIPE_OPEN_X / 2) {
      setX(SWIPE_OPEN_X);
      openSwipeRow = item;
    } else {
      setX(0);
      if (openSwipeRow === item) openSwipeRow = null;
    }
  });

  inner.addEventListener("click", () => {
    if (moved) return;
    if (item._openX < 0) {
      item._openX = setX(0);
      if (openSwipeRow === item) openSwipeRow = null;
      return;
    }
    const expense = state.expenses.find((x) => x.id === expenseId);
    if (expense) openExpenseSheet(expense);
  });

  deleteBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    openConfirm("Delete this expense?", "This can't be undone.", () => {
      state.expenses = state.expenses.filter((x) => x.id !== expenseId);
      saveState();
      render();
      showToast("Expense deleted");
    });
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

  let def = selectedTripId || "";
  if (!def && state.activeTripId !== "all" && state.activeTripId !== "none") {
    def = state.activeTripId;
  }
  select.value = def;
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
  return sorted.length ? sorted[0].currency : "CAD";
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

  const allCount = state.expenses.length;
  const allRow = document.createElement("div");
  allRow.className = "trip-row" + (state.activeTripId === "all" ? " selected" : "");
  allRow.innerHTML = `
    <button type="button" class="trip-row-main">
      <span class="name">All trips</span>
      <span class="count">${allCount} expense${allCount === 1 ? "" : "s"}</span>
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

  const unassignedCount = state.expenses.filter((e) => !e.tripId).length;
  if (unassignedCount > 0) {
    const noneRow = document.createElement("div");
    noneRow.className = "trip-row" + (state.activeTripId === "none" ? " selected" : "");
    noneRow.innerHTML = `
      <button type="button" class="trip-row-main">
        <span class="name">No trip</span>
        <span class="count">${unassignedCount} expense${unassignedCount === 1 ? "" : "s"}</span>
      </button>`;
    noneRow.querySelector(".trip-row-main").addEventListener("click", () => {
      state.activeTripId = "none";
      saveState();
      closeSheets();
      render();
    });
    wrap.appendChild(noneRow);
  }
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

/* ---------------------------- search (global, always available) ---------------------------- */

document.getElementById("searchInput").addEventListener("input", (ev) => {
  filters.search = ev.target.value;
  render();
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
