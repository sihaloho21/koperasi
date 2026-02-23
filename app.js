(function () {
  "use strict";

  const STORAGE_KEY = "koperasi_db_v1";
  const THEME_KEY = "koperasi_theme_v1";
  const TOKEN_KEY = "koperasi_admin_token";
  const DEFAULT_ADMIN = { username: "admin", password: "admin123" };
  const MAX_PROFILE_PHOTO_SIZE = 5 * 1024 * 1024;
  const MAX_PROFILE_PHOTO_CELL_CHARS = 45000;
  const PROFILE_PHOTO_MAX_SIDE = 360;
  const CLOUD_SYNC_DEBOUNCE_MS = 500;
  const CLOUD_FETCH_TIMEOUT_MS = 20000;
  // Isi URL Web App GAS hasil deploy (akhiran /exec) agar aplikasi sync ke Google Sheets.
  const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbytAEkT-cJF1QGmUZEe6ZJgD5RIjH7RRKWE8lsNuCSXqSv4k_DMmKZsbRBSplgFDaTi/exec";

  const fmtCurrency = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  });

  const refs = {};
  let db = emptyDb();
  let activeView = "dashboard";
  let editNasabahId = "";
  let pendingNasabahFoto = "";
  let chart = null;
  let cloudSyncTimer = null;
  let cloudSyncChain = Promise.resolve();
  let cloudReady = false;

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => {
      console.error("Init gagal:", err);
      alert("Aplikasi gagal dimuat. Cek console untuk detail.");
    });
  });

  async function init() {
    cacheRefs();
    bindEvents();
    applyTheme(localStorage.getItem(THEME_KEY) || "light");
    refs.todayLabel.textContent = new Date().toLocaleDateString("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric"
    });

    db = loadDb();
    await initCloudDb();
    migrateNasabahData();
    seedAdmin();
    syncPinjamanStatus();
    saveDb();

    const today = isoDate(new Date());
    [refs.simpananTanggal, refs.pinjamanTanggal, refs.angsuranTanggal].forEach((el) => {
      if (!el.value) el.value = today;
    });
    if (!refs.simpananFilterMonth.value) refs.simpananFilterMonth.value = today.slice(0, 7);
    if (!refs.reportMonth.value) refs.reportMonth.value = today.slice(0, 7);

    if (sessionStorage.getItem(TOKEN_KEY)) showApp();
    else showLogin();

    refreshAll();
  }

  function cacheRefs() {
    const ids = [
      "loginScreen", "appShell", "loginForm", "loginUsername", "loginPassword", "loginError", "logoutBtn",
      "themeToggle", "themeToggleMobile", "todayLabel", "pageTitle", "metricNasabah", "metricSimpanan",
      "metricPinjamanAktif", "metricAngsuran", "monthlyChart", "nasabahForm", "nasabahNama", "nasabahHp",
      "nasabahPekerjaan", "nasabahAlamat", "nasabahJaminan", "nasabahFoto", "nasabahFotoPreview",
      "nasabahFotoResetBtn", "nasabahFormHint", "nasabahSearch", "nasabahStatusFilter", "nasabahResetBtn",
      "nasabahTableBody", "simpananForm", "simpananNasabah", "simpananJenis", "simpananJumlah",
      "simpananTanggal", "simpananKeterangan", "simpananFilterNasabah", "simpananFilterJenis",
      "simpananFilterMonth", "exportSimpananExcel", "exportSimpananPdf", "simpananTableBody", "pinjamanForm",
      "pinjamanNasabah", "pinjamanNasabahTrigger", "pinjamanNasabahMenu", "pinjamanJumlah", "pinjamanTenor",
      "pinjamanBunga", "pinjamanTanggal", "angsuranForm", "angsuranPinjaman", "angsuranJumlah", "angsuranTanggal",
      "pinjamanTableBody", "angsuranTableBody",
      "reportType", "reportMonth", "reportRef", "exportReportExcel", "exportReportPdf", "exportAllSheetsBtn",
      "logTableBody"
    ];
    ids.forEach((id) => {
      refs[id] = document.getElementById(id);
    });
    refs.navButtons = Array.from(document.querySelectorAll("[data-view-btn]"));
    refs.viewPanels = Array.from(document.querySelectorAll(".view-panel"));
  }

  function bindEvents() {
    refs.loginForm.addEventListener("submit", onLogin);
    refs.logoutBtn.addEventListener("click", onLogout);
    refs.themeToggle.addEventListener("click", toggleTheme);
    refs.themeToggleMobile.addEventListener("click", toggleTheme);

    refs.navButtons.forEach((btn) => {
      btn.addEventListener("click", () => showView(btn.dataset.viewBtn));
    });

    refs.nasabahForm.addEventListener("submit", onSaveNasabah);
    refs.nasabahResetBtn.addEventListener("click", resetNasabahForm);
    refs.nasabahSearch.addEventListener("input", renderNasabahTable);
    refs.nasabahStatusFilter.addEventListener("change", renderNasabahTable);
    refs.nasabahTableBody.addEventListener("click", onNasabahAction);
    refs.nasabahFoto.addEventListener("change", onNasabahFotoChange);
    refs.nasabahFotoResetBtn.addEventListener("click", clearNasabahFotoSelection);

    refs.simpananForm.addEventListener("submit", onSaveSimpanan);
    refs.simpananFilterNasabah.addEventListener("change", renderSimpananTable);
    refs.simpananFilterJenis.addEventListener("change", renderSimpananTable);
    refs.simpananFilterMonth.addEventListener("change", renderSimpananTable);
    refs.exportSimpananExcel.addEventListener("click", () => exportRowsToExcel(filteredSimpananForExport(), "simpanan_riwayat"));
    refs.exportSimpananPdf.addEventListener("click", () => exportRowsToPdf(filteredSimpananForPdf(), "Riwayat Simpanan", "simpanan_riwayat"));

    refs.pinjamanForm.addEventListener("submit", onSavePinjaman);
    refs.pinjamanNasabahTrigger.addEventListener("click", onTogglePinjamanNasabahMenu);
    refs.pinjamanNasabahMenu.addEventListener("click", onPickPinjamanNasabah);
    refs.angsuranForm.addEventListener("submit", onSaveAngsuran);
    document.addEventListener("click", onGlobalClick);
    document.addEventListener("keydown", onGlobalKeydown);

    refs.reportType.addEventListener("change", updateReportRefOptions);
    refs.exportReportExcel.addEventListener("click", onExportReportExcel);
    refs.exportReportPdf.addEventListener("click", onExportReportPdf);
    refs.exportAllSheetsBtn.addEventListener("click", exportAllSheets);
  }

  function emptyDb() {
    return { nasabah: [], simpanan: [], pinjaman: [], angsuran: [], admin: [], log: [] };
  }

  function loadDb() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyDb();
      return normalizeDb(JSON.parse(raw));
    } catch {
      return emptyDb();
    }
  }

  function normalizeDb(obj) {
    const base = emptyDb();
    Object.keys(base).forEach((k) => {
      base[k] = Array.isArray(obj && obj[k]) ? obj[k] : [];
    });
    return base;
  }

  function migrateNasabahData() {
    db.nasabah = db.nasabah.map((n) => {
      const created = text(n.created_at);
      return {
        ...n,
        nama: text(n.nama),
        no_hp: text(n.no_hp),
        pekerjaan: text(n.pekerjaan),
        alamat_rumah: text(n.alamat_rumah || n.alamat),
        jaminan: text(n.jaminan),
        foto_profil: safePhotoUrl(n.foto_profil),
        status: n.status === "nonaktif" ? "nonaktif" : "aktif",
        created_at: /^\d{4}-\d{2}-\d{2}$/.test(created) ? created : isoDate(new Date())
      };
    });
  }

  function saveDb() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    scheduleCloudSync();
  }

  function hasCloudSync() {
    return /^https:\/\/script\.google\.com\/macros\/s\//.test(text(GAS_WEBAPP_URL));
  }

  async function initCloudDb() {
    if (!hasCloudSync()) return;
    try {
      await gasGet("bootstrap");
      const res = await gasGet("getDb");
      if (res && res.db) {
        db = normalizeDb(res.db);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      }
      cloudReady = true;
    } catch (err) {
      console.warn("Sync Google Sheets belum aktif:", err);
      cloudReady = false;
    }
  }

  function scheduleCloudSync() {
    if (!hasCloudSync() || !cloudReady) return;
    if (cloudSyncTimer) clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => {
      cloudSyncChain = cloudSyncChain.then(pushDbToCloud).catch((err) => {
        console.warn("Sinkronisasi Google Sheets gagal:", err);
      });
    }, CLOUD_SYNC_DEBOUNCE_MS);
  }

  async function pushDbToCloud() {
    await gasPost("setDb", { db: sanitizeDbForCloud(db) });
  }

  function sanitizeDbForCloud(input) {
    const clean = normalizeDb(input);
    clean.nasabah = clean.nasabah.map((n) => ({
      ...n,
      foto_profil: sanitizePhotoForCloud(n.foto_profil)
    }));
    return clean;
  }

  function sanitizePhotoForCloud(value) {
    const photo = safePhotoUrl(value);
    if (!photo) return "";
    if (photo.length > MAX_PROFILE_PHOTO_CELL_CHARS) return "";
    return photo;
  }

  async function gasGet(action) {
    return gasRequest("GET", action, null);
  }

  async function gasPost(action, payload) {
    return gasRequest("POST", action, payload || {});
  }

  async function gasRequest(method, action, payload) {
    const url = text(GAS_WEBAPP_URL);
    if (!url) throw new Error("URL GAS kosong.");

    if (method === "GET") {
      const reqUrl = new URL(url);
      reqUrl.searchParams.set("action", action || "");
      const res = await withTimeout(fetch(reqUrl.toString(), { method: "GET", cache: "no-store" }), CLOUD_FETCH_TIMEOUT_MS);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
      return data;
    }

    const body = JSON.stringify({ action, ...(payload || {}) });
    const res = await withTimeout(fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body
    }), CLOUD_FETCH_TIMEOUT_MS);
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  }

  async function withTimeout(promise, ms) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Request timeout")), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  function seedAdmin() {
    if (db.admin.length) return;
    db.admin.push({
      username: DEFAULT_ADMIN.username,
      password_hash: hashPassword(DEFAULT_ADMIN.password),
      last_login: ""
    });
    addLog("tambah", "admin", DEFAULT_ADMIN.username);
  }

  function hashPassword(password) {
    const bcrypt = window.dcodeIO && window.dcodeIO.bcrypt;
    if (bcrypt) return bcrypt.hashSync(password, 10);
    return "plain::" + btoa(password);
  }

  function verifyPassword(password, hash) {
    const bcrypt = window.dcodeIO && window.dcodeIO.bcrypt;
    if (bcrypt && hash && hash.startsWith("$2")) return bcrypt.compareSync(password, hash);
    return hash === "plain::" + btoa(password);
  }

  function onLogin(e) {
    e.preventDefault();
    const u = refs.loginUsername.value.trim();
    const p = refs.loginPassword.value;
    const admin = db.admin.find((x) => x.username === u);
    if (!admin || !verifyPassword(p, admin.password_hash)) {
      refs.loginError.classList.remove("hidden");
      refs.loginError.textContent = "Username atau password salah.";
      return;
    }
    refs.loginError.classList.add("hidden");
    admin.last_login = new Date().toISOString();
    addLog("login", "admin", admin.username);
    saveDb();
    sessionStorage.setItem(TOKEN_KEY, token());
    refs.loginForm.reset();
    showApp();
    refreshAll();
  }

  function onLogout() {
    sessionStorage.removeItem(TOKEN_KEY);
    showLogin();
  }

  function showApp() {
    refs.loginScreen.classList.add("hidden");
    refs.appShell.classList.remove("hidden");
    showView(activeView);
  }

  function showLogin() {
    refs.appShell.classList.add("hidden");
    refs.loginScreen.classList.remove("hidden");
  }

  function showView(view) {
    activeView = view || "dashboard";
    refs.viewPanels.forEach((p) => p.classList.toggle("hidden", p.dataset.view !== activeView));
    refs.navButtons.forEach((b) => b.classList.toggle("nav-btn-active", b.dataset.viewBtn === activeView));
    refs.pageTitle.textContent = {
      dashboard: "Dashboard",
      nasabah: "Kelola Nasabah",
      simpanan: "Simpanan",
      pinjaman: "Pinjaman",
      export: "Export Laporan",
      log: "Aktivitas"
    }[activeView] || "Dashboard";
  }

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    localStorage.setItem(THEME_KEY, isDark ? "dark" : "light");
    renderChart();
  }

  function applyTheme(mode) {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }

  function refreshAll() {
    syncPinjamanStatus();
    saveDb();
    fillNasabahSelects();
    fillPinjamanSelect();
    updateReportRefOptions();
    renderMetrics();
    renderChart();
    renderNasabahTable();
    renderSimpananTable();
    renderPinjamanTable();
    renderAngsuranTable();
    renderLogTable();
  }

  function fillNasabahSelects() {
    const aktif = db.nasabah.filter((x) => x.status === "aktif").sort((a, b) => a.nama.localeCompare(b.nama));
    const semua = db.nasabah.slice().sort((a, b) => a.nama.localeCompare(b.nama));
    const currentPinjamanNasabah = refs.pinjamanNasabah.value;
    refs.simpananNasabah.innerHTML = '<option value="">Pilih nasabah aktif</option>' + aktif.map(optNasabah).join("");
    refs.pinjamanNasabah.innerHTML = '<option value="">Pilih nasabah aktif</option>' + aktif.map(optNasabah).join("");
    refs.simpananFilterNasabah.innerHTML = '<option value="all">Semua Nasabah</option>' + semua.map(optNasabah).join("");
    if (aktif.some((x) => x.id_nasabah === currentPinjamanNasabah)) {
      refs.pinjamanNasabah.value = currentPinjamanNasabah;
    }
    renderPinjamanNasabahPicker(aktif);
  }

  function fillPinjamanSelect() {
    const list = db.pinjaman.filter((x) => x.status === "berjalan").sort((a, b) => b.tanggal.localeCompare(a.tanggal));
    refs.angsuranPinjaman.innerHTML = '<option value="">Pilih pinjaman berjalan</option>' + list.map((x) => {
      const n = findNasabah(x.id_nasabah);
      return `<option value="${x.id_pinjaman}">${esc(x.id_pinjaman)} - ${esc(n ? n.nama : "Nasabah")}</option>`;
    }).join("");
  }

  function optNasabah(n) {
    return `<option value="${n.id_nasabah}">${esc(n.nama)} (${esc(n.no_hp || "-")})</option>`;
  }

  function renderPinjamanNasabahPicker(list) {
    const items = list || [];
    refs.pinjamanNasabahMenu.innerHTML = items.length
      ? items.map((n) => `<button type="button" class="nasabah-picker-option" data-id="${n.id_nasabah}">
          ${renderPinjamanPickerAvatar(n)}
          <span class="nasabah-picker-meta">
            <span class="nasabah-picker-name">${esc(n.nama)}</span>
            <span class="nasabah-picker-sub">${esc(n.no_hp || "-")}</span>
          </span>
        </button>`).join("")
      : '<p class="nasabah-picker-empty">Belum ada nasabah aktif.</p>';
    refs.pinjamanNasabahTrigger.disabled = !items.length;
    refs.pinjamanNasabahTrigger.classList.toggle("nasabah-picker-trigger-disabled", !items.length);
    if (!items.length) refs.pinjamanNasabah.value = "";
    updatePinjamanNasabahTrigger();
    syncPinjamanNasabahOptionState();
  }

  function updatePinjamanNasabahTrigger() {
    const id = refs.pinjamanNasabah.value;
    const n = findNasabah(id);
    if (!n) {
      refs.pinjamanNasabahTrigger.innerHTML = '<span class="nasabah-picker-placeholder">Pilih nasabah aktif</span><span class="nasabah-picker-chevron" aria-hidden="true">&#9662;</span>';
      return;
    }
    refs.pinjamanNasabahTrigger.innerHTML = `<span class="nasabah-picker-selected">
      ${renderPinjamanPickerAvatar(n)}
      <span class="nasabah-picker-meta">
        <span class="nasabah-picker-name">${esc(n.nama)}</span>
        <span class="nasabah-picker-sub">${esc(n.no_hp || "-")}</span>
      </span>
    </span><span class="nasabah-picker-chevron" aria-hidden="true">&#9662;</span>`;
  }

  function renderPinjamanPickerAvatar(n) {
    const photo = safePhotoUrl(n.foto_profil);
    if (photo) {
      return `<img src="${esc(photo)}" alt="Foto ${esc(n.nama)}" class="nasabah-picker-avatar" />`;
    }
    return `<div class="nasabah-picker-avatar-fallback">${esc(initials(n.nama))}</div>`;
  }

  function syncPinjamanNasabahOptionState() {
    const picked = refs.pinjamanNasabah.value;
    Array.from(refs.pinjamanNasabahMenu.querySelectorAll("button[data-id]")).forEach((btn) => {
      btn.classList.toggle("nasabah-picker-option-active", btn.dataset.id === picked);
    });
  }

  function onTogglePinjamanNasabahMenu(e) {
    e.stopPropagation();
    if (refs.pinjamanNasabahTrigger.disabled) return;
    const willOpen = refs.pinjamanNasabahMenu.classList.contains("hidden");
    refs.pinjamanNasabahMenu.classList.toggle("hidden", !willOpen);
    refs.pinjamanNasabahTrigger.classList.toggle("nasabah-picker-open", willOpen);
  }

  function closePinjamanNasabahMenu() {
    refs.pinjamanNasabahMenu.classList.add("hidden");
    refs.pinjamanNasabahTrigger.classList.remove("nasabah-picker-open");
  }

  function onPickPinjamanNasabah(e) {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    refs.pinjamanNasabah.value = btn.dataset.id;
    updatePinjamanNasabahTrigger();
    syncPinjamanNasabahOptionState();
    closePinjamanNasabahMenu();
  }

  function onGlobalClick(e) {
    if (!e.target.closest(".nasabah-picker")) closePinjamanNasabahMenu();
  }

  function onGlobalKeydown(e) {
    if (e.key === "Escape") closePinjamanNasabahMenu();
  }

  async function onSaveNasabah(e) {
    e.preventDefault();
    const nama = refs.nasabahNama.value.trim();
    const pekerjaan = refs.nasabahPekerjaan.value.trim();
    const no_hp = refs.nasabahHp.value.trim();
    const alamat_rumah = refs.nasabahAlamat.value.trim();
    const jaminan = refs.nasabahJaminan.value.trim();
    const fotoFile = refs.nasabahFoto.files && refs.nasabahFoto.files[0];
    if (!nama || !pekerjaan || !no_hp || !alamat_rumah) {
      alert("Nama, pekerjaan, alamat rumah, dan Telp/HP wajib diisi.");
      return;
    }

    if (fotoFile) {
      const uploadedPhoto = await readProfilePhoto(fotoFile);
      if (!uploadedPhoto) return;
      pendingNasabahFoto = uploadedPhoto;
    }

    if (editNasabahId) {
      const n = db.nasabah.find((x) => x.id_nasabah === editNasabahId);
      if (!n) return;
      n.nama = nama;
      n.pekerjaan = pekerjaan;
      n.no_hp = no_hp;
      n.alamat_rumah = alamat_rumah;
      n.jaminan = jaminan;
      n.foto_profil = pendingNasabahFoto;
      addLog("edit", "nasabah", n.id_nasabah);
    } else {
      const n = {
        id_nasabah: genId("NSB"),
        nama,
        pekerjaan,
        no_hp,
        alamat_rumah,
        jaminan,
        foto_profil: pendingNasabahFoto,
        status: "aktif",
        created_at: isoDate(new Date())
      };
      db.nasabah.push(n);
      addLog("tambah", "nasabah", n.id_nasabah);
    }

    saveDb();
    resetNasabahForm();
    refreshAll();
  }

  async function onNasabahFotoChange(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const photo = await readProfilePhoto(file);
    if (!photo) {
      refs.nasabahFoto.value = "";
      return;
    }
    pendingNasabahFoto = photo;
    renderNasabahFotoPreview();
  }

  function onNasabahAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    const n = db.nasabah.find((x) => x.id_nasabah === id);
    if (!n) return;

    if (action === "edit") {
      editNasabahId = id;
      refs.nasabahNama.value = n.nama;
      refs.nasabahPekerjaan.value = n.pekerjaan || "";
      refs.nasabahHp.value = n.no_hp;
      refs.nasabahAlamat.value = n.alamat_rumah || "";
      refs.nasabahJaminan.value = n.jaminan || "";
      refs.nasabahFoto.value = "";
      pendingNasabahFoto = n.foto_profil || "";
      renderNasabahFotoPreview();
      refs.nasabahFormHint.textContent = `Mode edit aktif untuk ${id}`;
      refs.nasabahNama.focus();
      return;
    }

    if (action === "toggle") {
      n.status = n.status === "aktif" ? "nonaktif" : "aktif";
      addLog("edit", "nasabah", n.id_nasabah);
      saveDb();
      refreshAll();
    }
  }

  function clearNasabahFotoSelection() {
    refs.nasabahFoto.value = "";
    pendingNasabahFoto = "";
    renderNasabahFotoPreview();
  }

  function renderNasabahFotoPreview() {
    if (!refs.nasabahFotoPreview || !refs.nasabahFotoResetBtn) return;
    const photo = safePhotoUrl(pendingNasabahFoto);
    if (!photo) {
      refs.nasabahFotoPreview.classList.add("hidden");
      refs.nasabahFotoResetBtn.classList.add("hidden");
      refs.nasabahFotoPreview.removeAttribute("src");
      return;
    }
    refs.nasabahFotoPreview.src = photo;
    refs.nasabahFotoPreview.classList.remove("hidden");
    refs.nasabahFotoResetBtn.classList.remove("hidden");
  }

  function resetNasabahForm() {
    editNasabahId = "";
    refs.nasabahForm.reset();
    pendingNasabahFoto = "";
    renderNasabahFotoPreview();
    refs.nasabahFormHint.textContent = "";
  }

  function renderNasabahTable() {
    const q = refs.nasabahSearch.value.trim().toLowerCase();
    const s = refs.nasabahStatusFilter.value;
    const rows = db.nasabah
      .filter((n) => {
        const hit = [
          n.nama,
          n.pekerjaan,
          n.no_hp,
          n.alamat_rumah,
          n.jaminan,
          n.id_nasabah
        ].some((v) => String(v || "").toLowerCase().includes(q));
        const st = s === "all" || n.status === s;
        return hit && st;
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((n) => {
        const badge = n.status === "aktif" ? "badge-aktif" : "badge-nonaktif";
        const toggleLabel = n.status === "aktif" ? "Nonaktifkan" : "Aktifkan";
        return `<tr>
          <td>${esc(n.id_nasabah)}</td>
          <td>${renderNasabahAvatar(n)}</td>
          <td>${esc(n.nama)}</td>
          <td>${esc(n.pekerjaan || "-")}</td>
          <td class="text-wrap-cell">${esc(n.alamat_rumah || "-")}</td>
          <td>${esc(n.no_hp || "-")}</td>
          <td class="text-wrap-cell">${esc(n.jaminan || "-")}</td>
          <td><span class="badge ${badge}">${esc(n.status)}</span></td>
          <td>${fmtDate(n.created_at)}</td>
          <td>
            <button class="btn-secondary" data-action="edit" data-id="${n.id_nasabah}">Edit</button>
            <button class="btn-secondary" data-action="toggle" data-id="${n.id_nasabah}">${toggleLabel}</button>
          </td>
        </tr>`;
      });

    refs.nasabahTableBody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="10">Belum ada data nasabah.</td></tr>';
  }

  function renderNasabahAvatar(n) {
    const photo = safePhotoUrl(n.foto_profil);
    if (photo) {
      return `<img src="${esc(photo)}" alt="Foto ${esc(n.nama)}" class="nasabah-avatar" />`;
    }
    return `<div class="nasabah-avatar-fallback">${esc(initials(n.nama))}</div>`;
  }

  function onSaveSimpanan(e) {
    e.preventDefault();
    const id_nasabah = refs.simpananNasabah.value;
    const jenis = refs.simpananJenis.value;
    const jumlah = Number(refs.simpananJumlah.value);
    const tanggal = refs.simpananTanggal.value;
    const keterangan = refs.simpananKeterangan.value.trim();

    if (!id_nasabah || !jenis || !tanggal || !Number.isFinite(jumlah) || jumlah <= 0) {
      alert("Lengkapi data simpanan dengan benar.");
      return;
    }

    const trx = { id_transaksi: genId("SMP"), id_nasabah, jenis, jumlah, tanggal, keterangan };
    db.simpanan.push(trx);
    addLog("tambah", "simpanan", trx.id_transaksi);
    saveDb();
    refs.simpananJumlah.value = "";
    refs.simpananKeterangan.value = "";
    refreshAll();
  }

  function filteredSimpanan() {
    const id_nasabah = refs.simpananFilterNasabah.value;
    const jenis = refs.simpananFilterJenis.value;
    const month = refs.simpananFilterMonth.value;
    return db.simpanan
      .filter((x) => {
        const f1 = id_nasabah === "all" || x.id_nasabah === id_nasabah;
        const f2 = jenis === "all" || x.jenis === jenis;
        const f3 = !month || x.tanggal.startsWith(month);
        return f1 && f2 && f3;
      })
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  }

  function renderSimpananTable() {
    const rows = filteredSimpanan().map((x) => {
      const n = findNasabah(x.id_nasabah);
      return `<tr>
        <td>${esc(x.id_transaksi)}</td>
        <td>${esc(n ? n.nama : "Nasabah tidak ditemukan")}</td>
        <td>${esc(x.jenis)}</td>
        <td>${money(x.jumlah)}</td>
        <td>${fmtDate(x.tanggal)}</td>
        <td>${esc(x.keterangan || "-")}</td>
      </tr>`;
    });
    refs.simpananTableBody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="6">Belum ada transaksi simpanan.</td></tr>';
  }

  function filteredSimpananForExport() {
    return filteredSimpanan().map((x) => ({
      id_transaksi: x.id_transaksi,
      id_nasabah: x.id_nasabah,
      nama_nasabah: (findNasabah(x.id_nasabah) || {}).nama || "",
      jenis: x.jenis,
      jumlah: x.jumlah,
      tanggal: x.tanggal,
      keterangan: x.keterangan || ""
    }));
  }

  function filteredSimpananForPdf() {
    return filteredSimpanan().map((x) => ({
      ID: x.id_transaksi,
      NASABAH: (findNasabah(x.id_nasabah) || {}).nama || "-",
      JENIS: x.jenis,
      JUMLAH: money(x.jumlah),
      TANGGAL: x.tanggal,
      KETERANGAN: x.keterangan || "-"
    }));
  }

  function onSavePinjaman(e) {
    e.preventDefault();
    const id_nasabah = refs.pinjamanNasabah.value;
    const jumlah = Number(refs.pinjamanJumlah.value);
    const tenor = Number(refs.pinjamanTenor.value);
    const bunga = Number(refs.pinjamanBunga.value) || 0;
    const tanggal = refs.pinjamanTanggal.value;

    if (!id_nasabah || !tanggal || !Number.isFinite(jumlah) || jumlah <= 0 || !Number.isFinite(tenor) || tenor <= 0) {
      alert("Data pinjaman belum valid.");
      return;
    }

    const p = { id_pinjaman: genId("PJM"), id_nasabah, jumlah, tenor, bunga, status: "berjalan", tanggal };
    db.pinjaman.push(p);
    addLog("tambah", "pinjaman", p.id_pinjaman);
    saveDb();
    refs.pinjamanForm.reset();
    refs.pinjamanTanggal.value = isoDate(new Date());
    refreshAll();
  }

  function onSaveAngsuran(e) {
    e.preventDefault();
    const id_pinjaman = refs.angsuranPinjaman.value;
    const jumlah = Number(refs.angsuranJumlah.value);
    const tanggal = refs.angsuranTanggal.value;

    if (!id_pinjaman || !tanggal || !Number.isFinite(jumlah) || jumlah <= 0) {
      alert("Data angsuran belum valid.");
      return;
    }

    const cicilan_ke = db.angsuran.filter((x) => x.id_pinjaman === id_pinjaman).length + 1;
    const ang = { id_angsuran: genId("ANG"), id_pinjaman, cicilan_ke, jumlah, tanggal };
    db.angsuran.push(ang);
    addLog("tambah", "angsuran", ang.id_angsuran);
    syncPinjamanStatus();
    saveDb();
    refs.angsuranJumlah.value = "";
    refreshAll();
  }

  function syncPinjamanStatus() {
    db.pinjaman.forEach((p) => {
      p.status = paidLoan(p.id_pinjaman) >= loanTarget(p) ? "lunas" : "berjalan";
    });
  }

  function renderPinjamanTable() {
    const rows = db.pinjaman
      .slice()
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
      .map((p) => {
        const n = findNasabah(p.id_nasabah);
        const target = loanTarget(p);
        const paid = paidLoan(p.id_pinjaman);
        const badge = p.status === "lunas" ? "badge-lunas" : "badge-berjalan";
        return `<tr>
          <td>${esc(p.id_pinjaman)}</td>
          <td>${esc(n ? n.nama : "Nasabah tidak ditemukan")}</td>
          <td>${money(p.jumlah)}</td>
          <td>${p.bunga}%</td>
          <td>${money(target)}</td>
          <td>${money(paid)}</td>
          <td><span class="badge ${badge}">${esc(p.status)}</span></td>
          <td>${fmtDate(p.tanggal)}</td>
        </tr>`;
      });
    refs.pinjamanTableBody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="8">Belum ada data pinjaman.</td></tr>';
  }

  function renderAngsuranTable() {
    const rows = db.angsuran
      .slice()
      .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
      .map((a) => {
        const p = db.pinjaman.find((x) => x.id_pinjaman === a.id_pinjaman);
        const n = p ? findNasabah(p.id_nasabah) : null;
        return `<tr>
          <td>${esc(a.id_angsuran)}</td>
          <td>${esc(a.id_pinjaman)}</td>
          <td>${renderAngsuranPeminjam(n)}</td>
          <td>${a.cicilan_ke}</td>
          <td>${money(a.jumlah)}</td>
          <td>${fmtDate(a.tanggal)}</td>
        </tr>`;
      });
    refs.angsuranTableBody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="6">Belum ada riwayat angsuran.</td></tr>';
  }

  function renderAngsuranPeminjam(n) {
    if (!n) {
      return '<span class="angsuran-peminjam-unknown">Nasabah tidak ditemukan</span>';
    }
    const photo = safePhotoUrl(n.foto_profil);
    const avatar = photo
      ? `<img src="${esc(photo)}" alt="Foto ${esc(n.nama)}" class="angsuran-peminjam-avatar" />`
      : `<div class="angsuran-peminjam-avatar-fallback">${esc(initials(n.nama))}</div>`;
    return `<div class="angsuran-peminjam-cell">${avatar}<span class="angsuran-peminjam-name">${esc(n.nama)}</span></div>`;
  }

  function renderMetrics() {
    refs.metricNasabah.textContent = String(db.nasabah.length);
    refs.metricSimpanan.textContent = money(sumBy(db.simpanan, "jumlah"));
    refs.metricPinjamanAktif.textContent = money(db.pinjaman.filter((x) => x.status === "berjalan").reduce((n, x) => n + x.jumlah, 0));
    refs.metricAngsuran.textContent = money(sumBy(db.angsuran, "jumlah"));
  }

  function renderChart() {
    if (!window.Chart || !refs.monthlyChart) return;
    const months = last12Months();
    const sData = months.map((m) => db.simpanan.filter((x) => x.tanggal.startsWith(m)).reduce((n, x) => n + x.jumlah, 0));
    const pData = months.map((m) => db.pinjaman.filter((x) => x.tanggal.startsWith(m)).reduce((n, x) => n + x.jumlah, 0));
    const aData = months.map((m) => db.angsuran.filter((x) => x.tanggal.startsWith(m)).reduce((n, x) => n + x.jumlah, 0));
    const dark = document.documentElement.classList.contains("dark");

    if (chart) chart.destroy();
    chart = new Chart(refs.monthlyChart, {
      type: "bar",
      data: {
        labels: months.map((m) => new Date(m + "-01").toLocaleDateString("id-ID", { month: "short", year: "2-digit" })),
        datasets: [
          { type: "bar", label: "Simpanan", data: sData, backgroundColor: "rgba(47,111,237,0.72)", borderRadius: 6 },
          { type: "bar", label: "Pinjaman", data: pData, backgroundColor: "rgba(232,100,36,0.66)", borderRadius: 6 },
          { type: "line", label: "Angsuran", data: aData, borderColor: "rgba(15,167,130,0.95)", backgroundColor: "rgba(15,167,130,0.25)", tension: 0.3 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { labels: { color: dark ? "#cbd5e1" : "#334155" } } },
        scales: {
          x: { ticks: { color: dark ? "#94a3b8" : "#64748b" }, grid: { color: dark ? "rgba(51,65,85,0.4)" : "rgba(203,213,225,0.5)" } },
          y: { ticks: { color: dark ? "#94a3b8" : "#64748b" }, grid: { color: dark ? "rgba(51,65,85,0.4)" : "rgba(203,213,225,0.5)" } }
        }
      }
    });
  }

  function renderLogTable() {
    const rows = db.log
      .slice()
      .sort((a, b) => b.waktu.localeCompare(a.waktu))
      .slice(0, 300)
      .map((l) => `<tr><td>${fmtDateTime(l.waktu)}</td><td>${esc(l.aktivitas)}</td><td>${esc(l.entitas)}</td><td>${esc(l.id_ref)}</td></tr>`);
    refs.logTableBody.innerHTML = rows.length ? rows.join("") : '<tr><td colspan="4">Belum ada aktivitas.</td></tr>';
  }

  function updateReportRefOptions() {
    const type = refs.reportType.value;
    if (type === "bulanan") {
      refs.reportRef.disabled = true;
      refs.reportRef.innerHTML = '<option value="">Tidak diperlukan</option>';
      return;
    }

    refs.reportRef.disabled = false;
    if (type === "nasabah") {
      refs.reportRef.innerHTML = '<option value="">Pilih nasabah</option>' + db.nasabah
        .slice()
        .sort((a, b) => a.nama.localeCompare(b.nama))
        .map((n) => `<option value="${n.id_nasabah}">${esc(n.nama)}</option>`)
        .join("");
      return;
    }

    refs.reportRef.innerHTML = '<option value="">Pilih jenis</option><option value="pokok">Pokok</option><option value="wajib">Wajib</option><option value="sukarela">Sukarela</option>';
  }

  function buildReport() {
    const type = refs.reportType.value;
    const month = refs.reportMonth.value;
    const ref = refs.reportRef.value;

    if (type === "bulanan") {
      if (!month) return { title: "Laporan Bulanan", rows: [] };
      const rows = [];
      db.simpanan.filter((x) => x.tanggal.startsWith(month)).forEach((x) => {
        const n = findNasabah(x.id_nasabah);
        rows.push({ tanggal: x.tanggal, kategori: "simpanan", id_ref: x.id_transaksi, nama: n ? n.nama : "-", detail: x.jenis, jumlah: x.jumlah, keterangan: x.keterangan || "" });
      });
      db.pinjaman.filter((x) => x.tanggal.startsWith(month)).forEach((x) => {
        const n = findNasabah(x.id_nasabah);
        rows.push({ tanggal: x.tanggal, kategori: "pinjaman", id_ref: x.id_pinjaman, nama: n ? n.nama : "-", detail: `${x.tenor} bulan, bunga ${x.bunga}%`, jumlah: x.jumlah, keterangan: x.status });
      });
      db.angsuran.filter((x) => x.tanggal.startsWith(month)).forEach((x) => {
        const p = db.pinjaman.find((z) => z.id_pinjaman === x.id_pinjaman);
        const n = p ? findNasabah(p.id_nasabah) : null;
        rows.push({ tanggal: x.tanggal, kategori: "angsuran", id_ref: x.id_angsuran, nama: n ? n.nama : "-", detail: `Cicilan ke-${x.cicilan_ke}`, jumlah: x.jumlah, keterangan: x.id_pinjaman });
      });
      return { title: `Laporan Bulanan ${month}`, rows: rows.sort((a, b) => b.tanggal.localeCompare(a.tanggal)) };
    }

    if (type === "nasabah") {
      if (!ref) return { title: "Laporan per Nasabah", rows: [] };
      const n = findNasabah(ref);
      const rows = [];
      db.simpanan.filter((x) => x.id_nasabah === ref).forEach((x) => rows.push({ tanggal: x.tanggal, kategori: "simpanan", id_ref: x.id_transaksi, detail: x.jenis, jumlah: x.jumlah }));
      db.pinjaman.filter((x) => x.id_nasabah === ref).forEach((x) => {
        rows.push({ tanggal: x.tanggal, kategori: "pinjaman", id_ref: x.id_pinjaman, detail: `${x.tenor} bln, bunga ${x.bunga}%`, jumlah: x.jumlah });
        db.angsuran.filter((a) => a.id_pinjaman === x.id_pinjaman).forEach((a) => {
          rows.push({ tanggal: a.tanggal, kategori: "angsuran", id_ref: a.id_angsuran, detail: `untuk ${x.id_pinjaman} cicilan ke-${a.cicilan_ke}`, jumlah: a.jumlah });
        });
      });
      return { title: `Laporan Nasabah - ${n ? n.nama : ref}`, rows: rows.sort((a, b) => b.tanggal.localeCompare(a.tanggal)) };
    }

    if (!ref) return { title: "Laporan Jenis Simpanan", rows: [] };
    return {
      title: `Laporan Simpanan Jenis ${ref}`,
      rows: db.simpanan
        .filter((x) => x.jenis === ref)
        .sort((a, b) => b.tanggal.localeCompare(a.tanggal))
        .map((x) => {
          const n = findNasabah(x.id_nasabah);
          return { tanggal: x.tanggal, id_transaksi: x.id_transaksi, nama_nasabah: n ? n.nama : "-", jenis: x.jenis, jumlah: x.jumlah, keterangan: x.keterangan || "" };
        })
    };
  }

  function onExportReportExcel() {
    const rep = buildReport();
    exportRowsToExcel(rep.rows, slug(rep.title));
  }

  function onExportReportPdf() {
    const rep = buildReport();
    const rows = rep.rows.map((r) => {
      const o = {};
      Object.keys(r).forEach((k) => {
        o[k.toUpperCase()] = k === "jumlah" ? money(r[k]) : r[k];
      });
      return o;
    });
    exportRowsToPdf(rows, rep.title, slug(rep.title));
  }

  function exportAllSheets() {
    if (!window.XLSX) {
      alert("Library XLSX belum tersedia.");
      return;
    }

    const wb = XLSX.utils.book_new();
    const sheets = [
      ["nasabah", db.nasabah.map((x) => ({
        id_nasabah: x.id_nasabah,
        nama: x.nama,
        pekerjaan: x.pekerjaan || "",
        alamat_rumah: x.alamat_rumah || "",
        no_hp: x.no_hp,
        jaminan: x.jaminan || "",
        foto_profil_tersedia: x.foto_profil ? "ya" : "tidak",
        status: x.status,
        created_at: x.created_at
      }))],
      ["simpanan", db.simpanan.map((x) => ({ id_transaksi: x.id_transaksi, id_nasabah: x.id_nasabah, jenis: x.jenis, jumlah: x.jumlah, tanggal: x.tanggal, keterangan: x.keterangan || "" }))],
      ["pinjaman", db.pinjaman.map((x) => ({ id_pinjaman: x.id_pinjaman, id_nasabah: x.id_nasabah, jumlah: x.jumlah, tenor: x.tenor, bunga: x.bunga, status: x.status, tanggal: x.tanggal }))],
      ["angsuran", db.angsuran.map((x) => ({ id_angsuran: x.id_angsuran, id_pinjaman: x.id_pinjaman, cicilan_ke: x.cicilan_ke, jumlah: x.jumlah, tanggal: x.tanggal }))],
      ["admin", db.admin.map((x) => ({ username: x.username, password_hash: x.password_hash, last_login: x.last_login || "" }))],
      ["log", db.log.map((x) => ({ waktu: x.waktu, aktivitas: x.aktivitas, entitas: x.entitas, id_ref: x.id_ref }))]
    ];

    sheets.forEach(([name, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name));
    XLSX.writeFile(wb, `koperasi_semua_sheet_${compactDate(new Date())}.xlsx`);
  }

  function exportRowsToExcel(rows, fileBase) {
    if (!rows || !rows.length) {
      alert("Tidak ada data untuk diexport.");
      return;
    }
    if (!window.XLSX) {
      alert("Library XLSX belum tersedia.");
      return;
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "laporan");
    XLSX.writeFile(wb, `${fileBase || "laporan"}.xlsx`);
  }

  function exportRowsToPdf(rows, title, fileBase) {
    if (!rows || !rows.length) {
      alert("Tidak ada data untuk diexport.");
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("Library jsPDF belum tersedia.");
      return;
    }
    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
    const head = [Object.keys(rows[0])];
    const body = rows.map((r) => head[0].map((k) => String(r[k] ?? "")));
    doc.setFontSize(12);
    doc.text(title || "Laporan", 40, 34);
    doc.autoTable({ head, body, startY: 48, styles: { fontSize: 8, cellPadding: 4 }, theme: "grid" });
    doc.save(`${fileBase || "laporan"}.pdf`);
  }

  function addLog(aktivitas, entitas, id_ref) {
    db.log.push({ waktu: new Date().toISOString(), aktivitas, entitas, id_ref });
  }

  function findNasabah(id) {
    return db.nasabah.find((x) => x.id_nasabah === id) || null;
  }

  function loanTarget(p) {
    const pokok = Number(p.jumlah) || 0;
    const bunga = Number(p.bunga) || 0;
    return pokok + pokok * (bunga / 100);
  }

  function paidLoan(id_pinjaman) {
    return db.angsuran.filter((x) => x.id_pinjaman === id_pinjaman).reduce((n, x) => n + (Number(x.jumlah) || 0), 0);
  }

  async function readProfilePhoto(file) {
    if (!file.type || !file.type.startsWith("image/")) {
      alert("File foto harus berupa gambar.");
      return null;
    }
    if (file.size > MAX_PROFILE_PHOTO_SIZE) {
      alert(`Ukuran foto maksimal ${Math.round(MAX_PROFILE_PHOTO_SIZE / (1024 * 1024))} MB.`);
      return null;
    }
    try {
      const data = await compressProfilePhoto(file);
      const safe = safePhotoUrl(data);
      if (!safe) {
        alert("Format foto tidak valid.");
        return null;
      }
      return safe;
    } catch {
      alert("Foto profil gagal diproses.");
      return null;
    }
  }

  async function compressProfilePhoto(file) {
    const image = await loadImageFromFile(file);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");

    let width = image.width;
    let height = image.height;
    const maxSide = Math.max(width, height);
    if (maxSide > PROFILE_PHOTO_MAX_SIDE) {
      const ratio = PROFILE_PHOTO_MAX_SIDE / maxSide;
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(image, 0, 0, width, height);

    let quality = 0.86;
    let out = canvas.toDataURL("image/jpeg", quality);
    while (out.length > MAX_PROFILE_PHOTO_CELL_CHARS && quality >= 0.46) {
      quality -= 0.08;
      out = canvas.toDataURL("image/jpeg", quality);
    }

    if (out.length > MAX_PROFILE_PHOTO_CELL_CHARS) {
      for (let i = 0; i < 4; i += 1) {
        width = Math.max(1, Math.floor(width * 0.85));
        height = Math.max(1, Math.floor(height * 0.85));
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(image, 0, 0, width, height);
        out = canvas.toDataURL("image/jpeg", Math.max(quality, 0.45));
        if (out.length <= MAX_PROFILE_PHOTO_CELL_CHARS) break;
      }
    }

    if (out.length > MAX_PROFILE_PHOTO_CELL_CHARS) {
      throw new Error("photo_too_large_for_storage");
    }
    return out;
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("image_decode_failed"));
      };
      img.src = objectUrl;
    });
  }

  function sumBy(list, key) {
    return list.reduce((n, x) => n + (Number(x[key]) || 0), 0);
  }

  function last12Months() {
    const out = [];
    const c = new Date();
    c.setDate(1);
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(c.getFullYear(), c.getMonth() - i, 1);
      out.push(isoDate(d).slice(0, 7));
    }
    return out;
  }

  function money(v) {
    return fmtCurrency.format(Number(v) || 0);
  }

  function fmtDate(v) {
    if (!v) return "-";
    return new Date(v + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  }

  function fmtDateTime(v) {
    if (!v) return "-";
    return new Date(v).toLocaleString("id-ID");
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function compactDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }

  function genId(prefix) {
    return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  }

  function token() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `tok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function slug(v) {
    return (v || "laporan").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  function text(v) {
    if (v === null || v === undefined) return "";
    return String(v).trim();
  }

  function safePhotoUrl(v) {
    const value = text(v);
    if (!value) return "";
    if (/^data:image\//i.test(value)) return value;
    if (/^https?:\/\//i.test(value)) return value;
    return "";
  }

  function initials(v) {
    const words = text(v).split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return "NA";
    return words.map((w) => w[0].toUpperCase()).join("");
  }

  function esc(v) {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
})();
