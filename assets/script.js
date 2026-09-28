/**
 * MahasiswaKit — PABWE Praktikum 3
 * Manuel Santana Sirait (11S24016)
 *
 * Urutan bagian:
 * Utilitas -> Modal -> Tab (state di query URL) -> Expense -> Bookmark -> Hapus -> Quiz -> Inisialisasi
 * Key localStorage (satu per fitur): pabwe-p3-expenses, pabwe-p3-bookmarks, pabwe-p3-quiz-high-score
 */

/* ========== UTILITAS ========== */

/** Ambil elemen; lempar error jika tidak ada (membantu debug DOM) */
function $(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`Elemen tidak ditemukan: ${selector}`);
  return node;
}

function $all(selector) {
  return document.querySelectorAll(selector);
}

/** Buat elemen dengan class & teks (textContent -> aman dari XSS) */
function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Markup ikon SVG dari sprite di index.html */
function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

/** Baca & simpan JSON di localStorage */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

const rupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");
const makeId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Tanggal hari ini (zona waktu lokal) format YYYY-MM-DD */
function todayISO() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function formatDate(iso) {
  return new Date(iso + "T00:00:00").toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Tombol aksi kecil (Ubah / Hapus) */
function actionButton(iconName, label, variantClass, handler) {
  const btn = el("button", `btn btn--sm ${variantClass}`);
  btn.type = "button";
  btn.innerHTML = `${icon(iconName)} ${label}`;
  btn.addEventListener("click", handler);
  return btn;
}

/** Atur tampilan empty state vs daftar, lalu kosongkan daftar sebelum dirender ulang */
function toggleEmptyState(emptyEl, listEl, isEmpty) {
  emptyEl.classList.toggle("hidden", !isEmpty);
  listEl.classList.toggle("hidden", isEmpty);
  listEl.innerHTML = "";
}

/** Catatan di dalam daftar (mis. hasil pencarian kosong) */
function appendNote(listEl, text) {
  listEl.appendChild(el("li", "list-note", text));
}

/* ========== MODAL (dipakai semua fitur) ========== */

function openModal(modal) {
  modal.classList.remove("hidden");
  document.body.classList.add("no-scroll");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  document.body.classList.remove("no-scroll");
}

// Tutup lewat tombol X / Batal / klik backdrop
$all(".modal").forEach((modal) => {
  modal
    .querySelector(".modal-backdrop")
    .addEventListener("click", () => closeModal(modal));
  modal
    .querySelectorAll("[data-close]")
    .forEach((btn) => btn.addEventListener("click", () => closeModal(modal)));
});

// Escape menutup modal yang terbuka
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  $all(".modal").forEach((modal) => {
    if (!modal.classList.contains("hidden")) closeModal(modal);
  });
});

/* ========== TAB SWITCHER (state tab disimpan di query URL ?tab=...) ========== */

const TAB_PARAM = "tab";
const DEFAULT_TAB = "expense";
const tabButtons = $all(".tab-btn");
const panels = {
  expense: $("#panel-expense"),
  bookmark: $("#panel-bookmark"),
  quiz: $("#panel-quiz"),
};

/** Baca nama tab dari query string; nilai kosong/tidak valid -> tab default */
function getTabFromUrl() {
  const name = new URLSearchParams(window.location.search).get(TAB_PARAM);
  return panels[name] ? name : DEFAULT_TAB;
}

/** Tulis nama tab ke query string tanpa reload (parameter lain tetap dipertahankan) */
function setTabInUrl(name, { replace = false } = {}) {
  const params = new URLSearchParams(window.location.search);
  params.set(TAB_PARAM, name);
  const url = `${window.location.pathname}?${params}`;
  if (replace) history.replaceState({ tab: name }, "", url);
  else history.pushState({ tab: name }, "", url);
}

/** Tampilkan satu panel & tandai tab aktif (murni UI; gaya tab aktif diatur CSS lewat aria-selected) */
function showTab(name) {
  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== name);
  });
  tabButtons.forEach((btn) => {
    btn.setAttribute("aria-selected", String(btn.dataset.tab === name));
  });
}

// Klik tab -> ganti panel + perbarui URL (pushState agar tombol Back/Forward bekerja)
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const name = btn.dataset.tab;
    if (name === getTabFromUrl()) return;
    showTab(name);
    setTabInUrl(name);
  });
});

// Tombol Back/Forward browser -> ikuti query URL
window.addEventListener("popstate", () => showTab(getTabFromUrl()));

/* ========== EXPENSE TRACKER ========== */

const EXPENSE_KEY = "pabwe-p3-expenses";
const TYPE_INCOME = "Pemasukan";
const CATEGORIES = [
  "Makan & Minum",
  "Transport",
  "Belanja",
  "Tagihan",
  "Pendidikan",
  "Hiburan",
  "Gaji",
  "Lainnya",
];

let expenses = loadJSON(EXPENSE_KEY, []);
let editingExpenseId = null;

const expenseForm = $("#expense-form");
const expenseError = $("#ex-error");
const expenseSearch = $("#ex-search");
const expenseFilterType = $("#ex-filter-type");
const expenseFilterCategory = $("#ex-filter-cat");
const expenseSort = $("#ex-sort");
const expenseList = $("#ex-list");
const expenseEmpty = $("#ex-empty");
const modalEditExpense = $("#modal-edit-expense");
const editExpenseForm = $("#edit-ex-form");

// Isi semua <select data-categories> dari array CATEGORIES
$all("select[data-categories]").forEach((select) => {
  CATEGORIES.forEach((category) => {
    const option = el("option", "", category);
    option.value = category;
    select.appendChild(option);
  });
});
$("#ex-date").value = todayISO();

function saveExpenses() {
  saveJSON(EXPENSE_KEY, expenses);
}

/** Baca field form transaksi; prefix "ex" (form tambah) atau "ee" (modal ubah) */
function readExpenseFields(prefix) {
  return {
    title: $(`#${prefix}-title`).value,
    category: $(`#${prefix}-category`).value,
    amount: $(`#${prefix}-amount`).value,
    type: $(`#${prefix}-type`).value,
    date: $(`#${prefix}-date`).value,
  };
}

/** Validasi: field wajib, jumlah angka valid dan > 0. Return pesan error ("" = valid) */
function validateExpense(data) {
  if (
    !data.title.trim() ||
    !data.category ||
    !data.type ||
    !data.date ||
    !String(data.amount).trim()
  ) {
    return "Semua field wajib diisi.";
  }
  const amount = Number(String(data.amount).trim());
  if (!Number.isFinite(amount))
    return "Jumlah harus berupa angka yang valid (contoh: 25000).";
  if (amount <= 0) return "Jumlah harus lebih besar dari 0.";
  return "";
}

/** Hitung ringkasan dari semua transaksi */
function renderSummary() {
  let income = 0;
  let outcome = 0;
  expenses.forEach((t) => {
    if (t.type === TYPE_INCOME) income += t.amount;
    else outcome += t.amount;
  });
  $("#sum-income").textContent = rupiah(income);
  $("#sum-expense").textContent = rupiah(outcome);
  $("#sum-balance").textContent = rupiah(income - outcome);
}

/** Bandingkan dua transaksi sesuai pilihan urutan */
function compareExpenses(a, b, sortBy) {
  switch (sortBy) {
    case "oldest":
      return a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
    case "largest":
      return b.amount - a.amount;
    case "smallest":
      return a.amount - b.amount;
    default: // newest
      return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
  }
}

/** Bangun satu baris transaksi lewat DOM */
function buildExpenseItem(t) {
  const isIncome = t.type === TYPE_INCOME;
  const li = el("li", "item");

  const main = el("div", "item-main");
  main.appendChild(el("p", "item-title", t.title));
  const meta = el("div", "item-meta");
  meta.append(
    el("span", `badge ${isIncome ? "badge--in" : "badge--out"}`, t.type),
    el("span", "badge badge--neutral", t.category),
    el("span", "", formatDate(t.date)),
  );
  main.appendChild(meta);

  const amount = el(
    "p",
    `item-amount ${isIncome ? "amount--in" : "amount--out"}`,
    `${isIncome ? "+" : "-"} ${rupiah(t.amount)}`,
  );

  const actions = el("div", "item-actions");
  actions.append(
    actionButton("pencil", "Ubah", "btn--ghost", () => openEditExpense(t.id)),
    actionButton("trash", "Hapus", "btn--danger-ghost", () =>
      askDelete("expense", t.id, t.title),
    ),
  );

  li.append(main, amount, actions);
  return li;
}

/** Cari + filter + sort, lalu render daftar ke DOM */
function renderExpenses() {
  renderSummary();

  const query = expenseSearch.value.trim().toLowerCase();
  const typeFilter = expenseFilterType.value;
  const categoryFilter = expenseFilterCategory.value;

  const items = expenses
    .filter(
      (t) =>
        t.title.toLowerCase().includes(query) &&
        (typeFilter === "all" || t.type === typeFilter) &&
        (categoryFilter === "all" || t.category === categoryFilter),
    )
    .sort((a, b) => compareExpenses(a, b, expenseSort.value));

  const noData = expenses.length === 0;
  toggleEmptyState(expenseEmpty, expenseList, noData);
  if (noData) return;

  if (items.length === 0) {
    appendNote(
      expenseList,
      "Tidak ada transaksi yang cocok dengan pencarian/filter.",
    );
    return;
  }
  items.forEach((t) => expenseList.appendChild(buildExpenseItem(t)));
}

/** CREATE: tambah transaksi */
expenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readExpenseFields("ex");
  const error = validateExpense(data);
  expenseError.textContent = error;
  if (error) return;

  expenses.push({
    id: makeId(),
    title: data.title.trim(),
    category: data.category,
    amount: Number(data.amount),
    type: data.type,
    date: data.date,
    createdAt: Date.now(),
  });
  saveExpenses();
  expenseForm.reset();
  $("#ex-date").value = todayISO();
  renderExpenses();
});

/** UPDATE: buka modal dan isi dengan data lama */
function openEditExpense(id) {
  const t = expenses.find((item) => item.id === id);
  if (!t) return;
  editingExpenseId = id;
  $("#ee-title").value = t.title;
  $("#ee-category").value = t.category;
  $("#ee-amount").value = t.amount;
  $("#ee-type").value = t.type;
  $("#ee-date").value = t.date;
  $("#ee-error").textContent = "";
  openModal(modalEditExpense);
  $("#ee-title").focus();
}

editExpenseForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readExpenseFields("ee");
  const error = validateExpense(data);
  $("#ee-error").textContent = error;
  if (error) return;

  const t = expenses.find((item) => item.id === editingExpenseId);
  if (t) {
    t.title = data.title.trim();
    t.category = data.category;
    t.amount = Number(data.amount);
    t.type = data.type;
    t.date = data.date;
    saveExpenses();
    renderExpenses();
  }
  editingExpenseId = null;
  closeModal(modalEditExpense);
});

expenseSearch.addEventListener("input", renderExpenses);
[expenseFilterType, expenseFilterCategory, expenseSort].forEach((control) => {
  control.addEventListener("change", renderExpenses);
});

/* ========== BOOKMARK MANAGER ========== */

const BOOKMARK_KEY = "pabwe-p3-bookmarks";

let bookmarks = loadJSON(BOOKMARK_KEY, []);
let editingBookmarkId = null;

const bookmarkForm = $("#bookmark-form");
const bookmarkError = $("#bm-error");
const bookmarkSearch = $("#bm-search");
const bookmarkSort = $("#bm-sort");
const bookmarkList = $("#bm-list");
const bookmarkEmpty = $("#bm-empty");
const modalEditBookmark = $("#modal-edit-bookmark");
const editBookmarkForm = $("#edit-bm-form");

function saveBookmarks() {
  saveJSON(BOOKMARK_KEY, bookmarks);
}

/** Baca field form bookmark; prefix "bm" (form tambah) atau "eb" (modal ubah) */
function readBookmarkFields(prefix) {
  return {
    title: $(`#${prefix}-title`).value,
    url: $(`#${prefix}-url`).value,
    category: $(`#${prefix}-category`).value,
    note: $(`#${prefix}-note`).value,
  };
}

/** Validasi URL: harus diawali http:// atau https:// dan bisa di-parse oleh new URL */
function isValidUrl(value) {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    return new URL(value).hostname.includes(".");
  } catch {
    return false;
  }
}

/** Return pesan error ("" = valid) */
function validateBookmark(data) {
  if (!data.title.trim() || !data.url.trim() || !data.category.trim()) {
    return "Nama, URL, dan kategori wajib diisi.";
  }
  if (!isValidUrl(data.url.trim())) {
    return "URL tidak valid. Harus diawali http:// atau https:// (contoh: https://www.w3schools.com).";
  }
  return "";
}

/** Link yang terbuka di tab baru */
function makeLink(className, text, href) {
  const a = el("a", className, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

/** Bandingkan dua bookmark sesuai pilihan urutan */
function compareBookmarks(a, b, sortBy) {
  if (sortBy === "az") return a.title.localeCompare(b.title, "id");
  if (sortBy === "za") return b.title.localeCompare(a.title, "id");
  return b.createdAt - a.createdAt; // terbaru
}

/** Bangun satu baris bookmark lewat DOM */
function buildBookmarkItem(b) {
  const li = el("li", "item");

  const main = el("div", "item-main");
  main.appendChild(makeLink("link", b.title, b.url));
  main.appendChild(makeLink("link-url", b.url, b.url));
  const meta = el("div", "item-meta");
  meta.appendChild(el("span", "badge badge--tag", b.category));
  if (b.note) meta.appendChild(el("span", "", b.note));
  main.appendChild(meta);

  const openButton = makeLink("btn btn--sm btn--primary", "", b.url);
  openButton.innerHTML = `${icon("external")} Buka`;

  const actions = el("div", "item-actions");
  actions.append(
    openButton,
    actionButton("pencil", "Ubah", "btn--ghost", () => openEditBookmark(b.id)),
    actionButton("trash", "Hapus", "btn--danger-ghost", () =>
      askDelete("bookmark", b.id, b.title),
    ),
  );

  li.append(main, actions);
  return li;
}

/** Cari (nama/URL/kategori) + sort, lalu render daftar ke DOM */
function renderBookmarks() {
  const query = bookmarkSearch.value.trim().toLowerCase();

  const items = bookmarks
    .filter(
      (b) =>
        b.title.toLowerCase().includes(query) ||
        b.url.toLowerCase().includes(query) ||
        b.category.toLowerCase().includes(query),
    )
    .sort((a, b) => compareBookmarks(a, b, bookmarkSort.value));

  const noData = bookmarks.length === 0;
  toggleEmptyState(bookmarkEmpty, bookmarkList, noData);
  if (noData) return;

  if (items.length === 0) {
    appendNote(bookmarkList, "Tidak ada bookmark yang cocok dengan pencarian.");
    return;
  }
  items.forEach((b) => bookmarkList.appendChild(buildBookmarkItem(b)));
}

/** CREATE: tambah bookmark */
bookmarkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readBookmarkFields("bm");
  const error = validateBookmark(data);
  bookmarkError.textContent = error;
  if (error) return;

  bookmarks.push({
    id: makeId(),
    title: data.title.trim(),
    url: data.url.trim(),
    category: data.category.trim(),
    note: data.note.trim(),
    createdAt: Date.now(),
  });
  saveBookmarks();
  bookmarkForm.reset();
  renderBookmarks();
});

/** UPDATE: buka modal dan isi dengan data lama */
function openEditBookmark(id) {
  const b = bookmarks.find((item) => item.id === id);
  if (!b) return;
  editingBookmarkId = id;
  $("#eb-title").value = b.title;
  $("#eb-url").value = b.url;
  $("#eb-category").value = b.category;
  $("#eb-note").value = b.note || "";
  $("#eb-error").textContent = "";
  openModal(modalEditBookmark);
  $("#eb-title").focus();
}

editBookmarkForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = readBookmarkFields("eb");
  const error = validateBookmark(data);
  $("#eb-error").textContent = error;
  if (error) return;

  const b = bookmarks.find((item) => item.id === editingBookmarkId);
  if (b) {
    b.title = data.title.trim();
    b.url = data.url.trim();
    b.category = data.category.trim();
    b.note = data.note.trim();
    saveBookmarks();
    renderBookmarks();
  }
  editingBookmarkId = null;
  closeModal(modalEditBookmark);
});

bookmarkSearch.addEventListener("input", renderBookmarks);
bookmarkSort.addEventListener("change", renderBookmarks);

/* ========== HAPUS (modal konfirmasi bersama Expense & Bookmark) ========== */

const modalDelete = $("#modal-delete");
let pendingDelete = null; // { type: "expense" | "bookmark", id }

function askDelete(type, id, title) {
  pendingDelete = { type, id };
  $("#delete-title").textContent = `"${title}"`;
  openModal(modalDelete);
}

/** DELETE: hapus dengan filter lalu simpan ulang */
$("#delete-confirm").addEventListener("click", () => {
  if (!pendingDelete) return;
  const { type, id } = pendingDelete;

  if (type === "expense") {
    expenses = expenses.filter((t) => t.id !== id);
    saveExpenses();
    renderExpenses();
  } else {
    bookmarks = bookmarks.filter((b) => b.id !== id);
    saveBookmarks();
    renderBookmarks();
  }
  pendingDelete = null;
  closeModal(modalDelete);
});

/* ========== QUIZ APP ========== */

const QUIZ_KEY = "pabwe-p3-quiz-high-score";

// Soal disimpan sebagai array of object (answer = index opsi yang benar)
const questions = [
  {
    question:
      "Method JavaScript untuk mengambil elemen pertama berdasarkan CSS selector adalah...",
    options: [
      "getElementById()",
      "querySelector()",
      "getElementsByClassName()",
      "createElement()",
    ],
    answer: 1,
    explanation:
      "querySelector() mengembalikan elemen pertama yang cocok dengan selector.",
  },
  {
    question:
      "Fungsi untuk mengubah array/object menjadi string sebelum disimpan ke localStorage adalah...",
    options: [
      "JSON.parse()",
      "JSON.stringify()",
      "Object.keys()",
      "Array.from()",
    ],
    answer: 1,
    explanation:
      "localStorage hanya menyimpan string, jadi data diubah dengan JSON.stringify().",
  },
  {
    question:
      "Tag HTML5 semantik yang tepat untuk area navigasi utama adalah...",
    options: ["<div>", "<nav>", "<span>", "<section>"],
    answer: 1,
    explanation: "<nav> dipakai untuk kelompok tautan navigasi utama.",
  },
  {
    question:
      "Method array yang mengembalikan array baru berisi elemen yang lolos kondisi adalah...",
    options: ["map()", "push()", "filter()", "find()"],
    answer: 2,
    explanation: "filter() menyaring elemen berdasarkan fungsi kondisi.",
  },
  {
    question:
      "Properti CSS untuk membuat sudut elemen menjadi membulat adalah...",
    options: ["border-style", "box-shadow", "outline", "border-radius"],
    answer: 3,
    explanation: "border-radius mengatur kelengkungan sudut elemen.",
  },
  {
    question: "Event yang terjadi saat sebuah form dikirim adalah...",
    options: ["click", "submit", "input", "change"],
    answer: 1,
    explanation:
      "Event submit dipicu saat form dikirim; gunakan preventDefault() agar halaman tidak reload.",
  },
];

// State aplikasi kuis
const quiz = { index: 0, score: 0, answered: false, active: false };

const quizIntro = $("#quiz-intro");
const quizPlay = $("#quiz-play");
const quizResult = $("#quiz-result");
const quizStart = $("#quiz-start");
const quizQuestion = $("#quiz-question");
const quizOptions = $("#quiz-options");
const quizFeedback = $("#quiz-feedback");
const quizNext = $("#quiz-next");
const quizBar = $("#quiz-bar");

/** Tampilkan high score dari localStorage */
function showHighScore() {
  const highScore = loadJSON(QUIZ_KEY, null);
  $("#quiz-high").textContent = highScore
    ? `${highScore.score} / ${highScore.total}`
    : "—";
}

/** Update progres, skor, dan progress bar */
function updateQuizStats() {
  const total = questions.length;
  const shown = quiz.active ? quiz.index + 1 : 0;
  const finished = quiz.active ? quiz.index + (quiz.answered ? 1 : 0) : 0;
  $("#quiz-progress").textContent = `${shown} / ${total}`;
  $("#quiz-score").textContent = String(quiz.score);
  quizBar.style.width = `${(finished / total) * 100}%`;
}

/** Mulai / reset kuis */
function startQuiz() {
  quiz.index = 0;
  quiz.score = 0;
  quiz.answered = false;
  quiz.active = true;
  quizIntro.classList.add("hidden");
  quizResult.classList.add("hidden");
  quizPlay.classList.remove("hidden");
  quizStart.innerHTML = `${icon("refresh")} Reset Quiz`;
  renderQuestion();
}

/** Render satu soal + opsi lewat DOM */
function renderQuestion() {
  const q = questions[quiz.index];
  quiz.answered = false;
  quizQuestion.textContent = `${quiz.index + 1}. ${q.question}`;
  quizFeedback.className = "feedback hidden";
  quizNext.classList.add("hidden");

  quizOptions.innerHTML = "";
  const buttons = q.options.map((text, i) => {
    const btn = el("button", "option");
    btn.type = "button";
    btn.append(
      el("span", "option-letter", `${String.fromCharCode(65 + i)}.`),
      document.createTextNode(text),
    );
    btn.addEventListener("click", () => answerQuestion(i));
    return btn;
  });
  quizOptions.append(...buttons);
  updateQuizStats();
}

/** Bandingkan jawaban user dengan kunci, hitung skor, beri feedback */
function answerQuestion(chosen) {
  if (quiz.answered) return;
  quiz.answered = true;

  const q = questions[quiz.index];
  const isCorrect = chosen === q.answer;
  if (isCorrect) quiz.score += 1;

  $all("#quiz-options .option").forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.answer) btn.classList.add("is-correct");
    else if (i === chosen) btn.classList.add("is-wrong");
  });

  quizFeedback.className = `feedback ${isCorrect ? "feedback--ok" : "feedback--bad"}`;
  quizFeedback.textContent = isCorrect
    ? `Benar! ${q.explanation}`
    : `Salah. Jawaban yang benar: ${q.options[q.answer]}. ${q.explanation}`;

  quizNext.textContent =
    quiz.index === questions.length - 1 ? "Lihat Hasil" : "Soal Berikutnya";
  quizNext.classList.remove("hidden");
  updateQuizStats();
}

/** Selesai: tampilkan skor akhir + update high score jika lebih tinggi */
function finishQuiz() {
  const total = questions.length;
  quiz.active = false;
  quizPlay.classList.add("hidden");
  quizResult.classList.remove("hidden");

  $("#quiz-final").textContent = `${quiz.score} / ${total}`;
  let message = `Kamu menjawab benar ${Math.round((quiz.score / total) * 100)}% soal.`;

  const highScore = loadJSON(QUIZ_KEY, null);
  if (!highScore || quiz.score > highScore.score) {
    saveJSON(QUIZ_KEY, { score: quiz.score, total });
    message += " High score baru!";
  }
  $("#quiz-result-msg").textContent = message;
  quizBar.style.width = "100%";
  $("#quiz-score").textContent = String(quiz.score);
  showHighScore();
}

quizStart.addEventListener("click", startQuiz);
$("#quiz-again").addEventListener("click", startQuiz);
quizNext.addEventListener("click", () => {
  quiz.index += 1;
  if (quiz.index >= questions.length) finishQuiz();
  else renderQuestion();
});

/* ========== INISIALISASI ========== */

// Pulihkan tab dari URL, lalu rapikan URL menjadi ?tab=...
const initialTab = getTabFromUrl();
showTab(initialTab);
setTabInUrl(initialTab, { replace: true });

renderExpenses();
renderBookmarks();
showHighScore();
updateQuizStats();
