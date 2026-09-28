/**
 * MahasiswaKit — PABWE Praktikum 3
 * Manuel Santana Sirait (11S24016)
 * Fitur: Tab, Expense Tracker, Bookmark Manager, Quiz App
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

/** Tombol aksi kecil (Ubah / Hapus / dll.) */
function actionBtn(icon, label, extraClass, handler) {
  const btn = el("button", `btn btn-sm ${extraClass}`);
  btn.type = "button";
  btn.innerHTML = `<i class="ti ${icon}"></i> ${label}`;
  btn.addEventListener("click", handler);
  return btn;
}

/* ========== MODAL (dipakai semua fitur) ========== */

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.body.classList.add("overflow-hidden");
}
function closeModal(modal) {
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  document.body.classList.remove("overflow-hidden");
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
  $all(".modal").forEach((m) => {
    if (!m.classList.contains("hidden")) closeModal(m);
  });
});

/* ========== TAB SWITCHER ========== */

const TAB_KEY = "pabwe-p3-active-tab";
const tabButtons = $all(".tab-btn");
const panels = {
  expense: $("#panel-expense"),
  bookmark: $("#panel-bookmark"),
  quiz: $("#panel-quiz"),
};

/** Ganti tab: tampilkan 1 panel, highlight tombol, simpan ke localStorage */
function switchTab(name) {
  if (!panels[name]) name = "expense";

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== name);
  });

  tabButtons.forEach((btn) => {
    const active = btn.dataset.tab === name;
    btn.setAttribute("aria-selected", String(active));
    btn.classList.toggle("bg-sky-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("shadow", active);
    btn.classList.toggle("text-slate-600", !active);
    btn.classList.toggle("hover:bg-slate-100", !active);
  });

  localStorage.setItem(TAB_KEY, name);
}

tabButtons.forEach((btn) =>
  btn.addEventListener("click", () => switchTab(btn.dataset.tab)),
);
switchTab(localStorage.getItem(TAB_KEY) || "expense"); // pulihkan tab terakhir

/* ========== EXPENSE TRACKER ========== */

const EXPENSE_KEY = "pabwe-p3-expenses";
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

const exForm = $("#expense-form");
const exError = $("#ex-error");
const exSearch = $("#ex-search");
const exFilterType = $("#ex-filter-type");
const exFilterCat = $("#ex-filter-cat");
const exSort = $("#ex-sort");
const exList = $("#ex-list");
const exEmpty = $("#ex-empty");
const modalEditExpense = $("#modal-edit-expense");
const editExForm = $("#edit-ex-form");

// Isi semua <select data-categories> dari array CATEGORIES
$all("select[data-categories]").forEach((sel) => {
  CATEGORIES.forEach((c) => {
    const opt = el("option", "", c);
    opt.value = c;
    sel.appendChild(opt);
  });
});
$("#ex-date").value = todayISO();

function saveExpenses() {
  saveJSON(EXPENSE_KEY, expenses);
}

/** Validasi: field wajib, jumlah angka valid dan > 0. Return pesan error ("" = valid) */
function validateExpense(d) {
  if (
    !d.title.trim() ||
    !d.category ||
    !d.type ||
    !d.date ||
    !String(d.amount).trim()
  ) {
    return "Semua field wajib diisi.";
  }
  const n = Number(String(d.amount).trim());
  if (!Number.isFinite(n))
    return "Jumlah harus berupa angka yang valid (contoh: 25000).";
  if (n <= 0) return "Jumlah harus lebih besar dari 0.";
  return "";
}

/** Hitung ringkasan dari semua transaksi */
function renderSummary() {
  let income = 0;
  let outcome = 0;
  expenses.forEach((t) => {
    if (t.type === "Pemasukan") income += t.amount;
    else outcome += t.amount;
  });
  $("#sum-income").textContent = rupiah(income);
  $("#sum-expense").textContent = rupiah(outcome);
  $("#sum-balance").textContent = rupiah(income - outcome);
}

/** Filter + cari + sort, lalu render ke DOM */
function renderExpenses() {
  renderSummary();

  const query = exSearch.value.trim().toLowerCase();
  const ft = exFilterType.value;
  const fc = exFilterCat.value;

  let items = expenses.filter(
    (t) =>
      t.title.toLowerCase().includes(query) &&
      (ft === "all" || t.type === ft) &&
      (fc === "all" || t.category === fc),
  );

  items = [...items].sort((a, b) => {
    switch (exSort.value) {
      case "oldest":
        return a.date.localeCompare(b.date) || a.createdAt - b.createdAt;
      case "largest":
        return b.amount - a.amount;
      case "smallest":
        return a.amount - b.amount;
      default: // newest
        return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    }
  });

  // Empty state jika belum ada data sama sekali
  const noData = expenses.length === 0;
  exEmpty.classList.toggle("hidden", !noData);
  exList.classList.toggle("hidden", noData);
  exList.innerHTML = "";
  if (noData) return;

  if (items.length === 0) {
    exList.appendChild(
      el(
        "li",
        "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600",
        "Tidak ada transaksi yang cocok dengan pencarian/filter.",
      ),
    );
    return;
  }

  items.forEach((t) => {
    const isIn = t.type === "Pemasukan";
    const li = el(
      "li",
      "flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 px-4 py-3",
    );

    const info = el("div", "flex-1 min-w-0");
    info.appendChild(
      el("p", "font-medium text-slate-900 break-words", t.title),
    );
    const meta = el("div", "flex flex-wrap items-center gap-1.5 mt-1");
    meta.append(
      el(
        "span",
        `badge ${isIn ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`,
        t.type,
      ),
      el("span", "badge bg-slate-100 text-slate-700", t.category),
      el("span", "text-xs text-slate-500", formatDate(t.date)),
    );
    info.appendChild(meta);

    const amount = el(
      "p",
      `font-display font-bold ${isIn ? "text-emerald-700" : "text-rose-700"}`,
      `${isIn ? "+" : "-"} ${rupiah(t.amount)}`,
    );

    const actions = el("div", "flex gap-1.5 shrink-0");
    actions.append(
      actionBtn("ti-pencil", "Ubah", "btn-ghost", () => openEditExpense(t.id)),
      actionBtn(
        "ti-trash",
        "Hapus",
        "btn-ghost text-rose-700 border-rose-200",
        () => askDelete("expense", t.id, t.title),
      ),
    );

    li.append(info, amount, actions);
    exList.appendChild(li);
  });
}

/** CREATE: tambah transaksi */
exForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#ex-title").value,
    category: $("#ex-category").value,
    amount: $("#ex-amount").value,
    type: $("#ex-type").value,
    date: $("#ex-date").value,
  };
  const err = validateExpense(data);
  exError.textContent = err;
  if (err) return;

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
  exForm.reset();
  $("#ex-date").value = todayISO();
  renderExpenses();
});

/** UPDATE: buka modal dan isi dengan data lama */
function openEditExpense(id) {
  const t = expenses.find((x) => x.id === id);
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

editExForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#ee-title").value,
    category: $("#ee-category").value,
    amount: $("#ee-amount").value,
    type: $("#ee-type").value,
    date: $("#ee-date").value,
  };
  const err = validateExpense(data);
  $("#ee-error").textContent = err;
  if (err) return;

  const t = expenses.find((x) => x.id === editingExpenseId);
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

exSearch.addEventListener("input", renderExpenses);
[exFilterType, exFilterCat, exSort].forEach((c) =>
  c.addEventListener("change", renderExpenses),
);

/* ========== BOOKMARK MANAGER ========== */

const BOOKMARK_KEY = "pabwe-p3-bookmarks";

let bookmarks = loadJSON(BOOKMARK_KEY, []);
let editingBookmarkId = null;

const bmForm = $("#bookmark-form");
const bmError = $("#bm-error");
const bmSearch = $("#bm-search");
const bmSort = $("#bm-sort");
const bmList = $("#bm-list");
const bmEmpty = $("#bm-empty");
const modalEditBookmark = $("#modal-edit-bookmark");
const editBmForm = $("#edit-bm-form");

function saveBookmarks() {
  saveJSON(BOOKMARK_KEY, bookmarks);
}

/** Validasi URL sederhana: harus diawali http:// atau https:// + domain */
function isValidUrl(url) {
  if (!/^https?:\/\/[^\s.\/]+\.[^\s]{2,}$/i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** Return pesan error ("" = valid) */
function validateBookmark(d) {
  if (!d.title.trim() || !d.url.trim() || !d.category.trim())
    return "Nama, URL, dan kategori wajib diisi.";
  if (!isValidUrl(d.url.trim()))
    return "URL tidak valid. Harus diawali http:// atau https:// (contoh: https://www.w3schools.com).";
  return "";
}

/** Buat link yang terbuka di tab baru */
function makeLink(className, text, href) {
  const a = el("a", className, text);
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function renderBookmarks() {
  const query = bmSearch.value.trim().toLowerCase();

  // Cari berdasarkan nama / URL / kategori
  let items = bookmarks.filter(
    (b) =>
      b.title.toLowerCase().includes(query) ||
      b.url.toLowerCase().includes(query) ||
      b.category.toLowerCase().includes(query),
  );

  items = [...items].sort((a, b) => {
    if (bmSort.value === "az") return a.title.localeCompare(b.title, "id");
    if (bmSort.value === "za") return b.title.localeCompare(a.title, "id");
    return b.createdAt - a.createdAt; // terbaru
  });

  const noData = bookmarks.length === 0;
  bmEmpty.classList.toggle("hidden", !noData);
  bmList.classList.toggle("hidden", noData);
  bmList.innerHTML = "";
  if (noData) return;

  if (items.length === 0) {
    bmList.appendChild(
      el(
        "li",
        "rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600",
        "Tidak ada bookmark yang cocok dengan pencarian.",
      ),
    );
    return;
  }

  items.forEach((b) => {
    const li = el(
      "li",
      "flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-slate-200 px-4 py-3",
    );

    const info = el("div", "flex-1 min-w-0");
    info.appendChild(
      makeLink(
        "font-semibold text-sky-700 hover:underline break-words",
        b.title,
        b.url,
      ),
    );
    info.appendChild(
      makeLink(
        "block text-xs text-slate-500 break-all hover:underline",
        b.url,
        b.url,
      ),
    );
    const meta = el("div", "flex flex-wrap items-center gap-2 mt-1.5");
    meta.appendChild(
      el("span", "badge bg-violet-100 text-violet-800", b.category),
    );
    if (b.note) meta.appendChild(el("span", "text-xs text-slate-600", b.note));
    info.appendChild(meta);

    const actions = el("div", "flex flex-wrap gap-1.5 shrink-0");
    const openBtn = makeLink("btn btn-sm btn-primary", "", b.url);
    openBtn.innerHTML = '<i class="ti ti-external-link"></i> Buka';
    actions.append(
      openBtn,
      actionBtn("ti-pencil", "Ubah", "btn-ghost", () => openEditBookmark(b.id)),
      actionBtn(
        "ti-trash",
        "Hapus",
        "btn-ghost text-rose-700 border-rose-200",
        () => askDelete("bookmark", b.id, b.title),
      ),
    );

    li.append(info, actions);
    bmList.appendChild(li);
  });
}

/** CREATE: tambah bookmark */
bmForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#bm-title").value,
    url: $("#bm-url").value,
    category: $("#bm-category").value,
    note: $("#bm-note").value,
  };
  const err = validateBookmark(data);
  bmError.textContent = err;
  if (err) return;

  bookmarks.push({
    id: makeId(),
    title: data.title.trim(),
    url: data.url.trim(),
    category: data.category.trim(),
    note: data.note.trim(),
    createdAt: Date.now(),
  });
  saveBookmarks();
  bmForm.reset();
  renderBookmarks();
});

/** UPDATE */
function openEditBookmark(id) {
  const b = bookmarks.find((x) => x.id === id);
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

editBmForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#eb-title").value,
    url: $("#eb-url").value,
    category: $("#eb-category").value,
    note: $("#eb-note").value,
  };
  const err = validateBookmark(data);
  $("#eb-error").textContent = err;
  if (err) return;

  const b = bookmarks.find((x) => x.id === editingBookmarkId);
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

bmSearch.addEventListener("input", renderBookmarks);
bmSort.addEventListener("change", renderBookmarks);

/* ========== HAPUS (modal konfirmasi bersama) ========== */

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
      "Event submit dipicu ketika form dikirim; gunakan preventDefault() agar halaman tidak reload.",
  },
];

// State aplikasi kuis
const quiz = { index: 0, score: 0, answered: false, active: false };

const qIntro = $("#quiz-intro");
const qPlay = $("#quiz-play");
const qResult = $("#quiz-result");
const qStart = $("#quiz-start");
const qQuestion = $("#quiz-question");
const qOptions = $("#quiz-options");
const qFeedback = $("#quiz-feedback");
const qNext = $("#quiz-next");
const qBar = $("#quiz-bar");

/** Tampilkan high score dari localStorage */
function showHighScore() {
  const hs = loadJSON(QUIZ_KEY, null);
  $("#quiz-high").textContent = hs ? `${hs.score} / ${hs.total}` : "—";
}

/** Update progres, skor, dan progress bar */
function updateStats() {
  const total = questions.length;
  const shown = quiz.active ? quiz.index + 1 : 0;
  $("#quiz-progress").textContent = `${shown} / ${total}`;
  $("#quiz-score").textContent = String(quiz.score);
  const done = quiz.active ? quiz.index + (quiz.answered ? 1 : 0) : 0;
  qBar.style.width = `${(done / total) * 100}%`;
}

/** Mulai / reset kuis */
function startQuiz() {
  quiz.index = 0;
  quiz.score = 0;
  quiz.answered = false;
  quiz.active = true;
  qIntro.classList.add("hidden");
  qResult.classList.add("hidden");
  qPlay.classList.remove("hidden");
  qStart.innerHTML = '<i class="ti ti-refresh"></i> Reset Quiz';
  renderQuestion();
}

/** Render satu soal + opsi lewat DOM */
function renderQuestion() {
  const q = questions[quiz.index];
  quiz.answered = false;
  qQuestion.textContent = `${quiz.index + 1}. ${q.question}`;
  qFeedback.className = "hidden";
  qNext.classList.add("hidden");

  qOptions.innerHTML = "";
  const buttons = q.options.map((text, i) => {
    const btn = el(
      "button",
      "w-full text-left rounded-xl border border-slate-200 px-4 py-3 min-h-[48px] text-sm transition hover:bg-slate-50",
    );
    btn.type = "button";
    btn.append(
      el("span", "font-semibold mr-2", `${String.fromCharCode(65 + i)}.`),
      document.createTextNode(text),
    );
    btn.addEventListener("click", () => answerQuestion(i));
    return btn;
  });
  qOptions.append(...buttons);
  updateStats();
}

/** Bandingkan jawaban user dengan kunci, hitung skor, beri feedback */
function answerQuestion(chosen) {
  if (quiz.answered) return;
  quiz.answered = true;

  const q = questions[quiz.index];
  const correct = chosen === q.answer;
  if (correct) quiz.score += 1;

  $all("#quiz-options button").forEach((btn, i) => {
    btn.disabled = true;
    btn.classList.remove("hover:bg-slate-50");
    if (i === q.answer)
      btn.classList.add(
        "border-emerald-400",
        "bg-emerald-50",
        "text-emerald-900",
      );
    else if (i === chosen)
      btn.classList.add("border-rose-400", "bg-rose-50", "text-rose-900");
  });

  qFeedback.className = `rounded-xl border px-4 py-3 text-sm ${
    correct
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : "border-rose-200 bg-rose-50 text-rose-900"
  }`;
  qFeedback.textContent = correct
    ? `Benar! ${q.explanation}`
    : `Salah. Jawaban yang benar: ${q.options[q.answer]}. ${q.explanation}`;

  qNext.textContent =
    quiz.index === questions.length - 1 ? "Lihat Hasil" : "Soal Berikutnya";
  qNext.classList.remove("hidden");
  updateStats();
}

/** Selesai: tampilkan skor akhir + update high score jika lebih tinggi */
function finishQuiz() {
  const total = questions.length;
  quiz.active = false;
  qPlay.classList.add("hidden");
  qResult.classList.remove("hidden");

  $("#quiz-final").textContent = `${quiz.score} / ${total}`;
  const percent = Math.round((quiz.score / total) * 100);
  let msg = `Kamu menjawab benar ${percent}% soal.`;

  const hs = loadJSON(QUIZ_KEY, null);
  if (!hs || quiz.score > hs.score) {
    saveJSON(QUIZ_KEY, { score: quiz.score, total });
    msg += " High score baru!";
  }
  $("#quiz-result-msg").textContent = msg;
  qBar.style.width = "100%";
  showHighScore();
  $("#quiz-score").textContent = String(quiz.score);
}

qStart.addEventListener("click", startQuiz);
$("#quiz-again").addEventListener("click", startQuiz);
qNext.addEventListener("click", () => {
  quiz.index += 1;
  if (quiz.index >= questions.length) finishQuiz();
  else renderQuestion();
});

/* ========== INISIALISASI ========== */
renderExpenses();
renderBookmarks();
showHighScore();
updateStats();
