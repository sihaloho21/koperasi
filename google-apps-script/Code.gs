const SPREADSHEET_ID = "15rFEqZoJjjNGwcDnXhZTvDcgPApaJYV5hNZUPDbe84s";

const TABLES = {
  nasabah: [
    "id_nasabah",
    "nama",
    "pekerjaan",
    "alamat_rumah",
    "no_hp",
    "jaminan",
    "foto_profil",
    "status",
    "created_at"
  ],
  simpanan: [
    "id_transaksi",
    "id_nasabah",
    "jenis",
    "jumlah",
    "tanggal",
    "keterangan"
  ],
  pinjaman: [
    "id_pinjaman",
    "id_nasabah",
    "jumlah",
    "tenor",
    "bunga",
    "status",
    "tanggal"
  ],
  angsuran: [
    "id_angsuran",
    "id_pinjaman",
    "cicilan_ke",
    "jumlah",
    "tanggal"
  ],
  admin: [
    "username",
    "password_hash",
    "last_login"
  ],
  log: [
    "waktu",
    "aktivitas",
    "entitas",
    "id_ref"
  ]
};

function doGet(e) {
  return handleRequest_(e, "GET");
}

function doPost(e) {
  return handleRequest_(e, "POST");
}

function handleRequest_(e, method) {
  try {
    const req = parseRequest_(e, method);
    const action = String(req.action || "getDb");

    if (action === "bootstrap") {
      const result = bootstrapSheets_();
      return json_({ ok: true, action: action, result: result });
    }

    if (action === "getDb") {
      bootstrapSheets_();
      return json_({ ok: true, action: action, db: readDb_() });
    }

    if (action === "setDb") {
      bootstrapSheets_();
      writeDb_(req.db || {});
      return json_({ ok: true, action: action, message: "Data berhasil disimpan." });
    }

    return json_({ ok: false, error: "Action tidak dikenal: " + action });
  } catch (err) {
    return json_({ ok: false, error: errorMessage_(err) });
  }
}

function setupKoperasiSheets() {
  return bootstrapSheets_();
}

function parseRequest_(e, method) {
  if (method === "GET") return (e && e.parameter) ? e.parameter : {};

  if (!e || !e.postData || !e.postData.contents) return {};
  const raw = String(e.postData.contents || "").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error("Body JSON tidak valid.");
  }
}

function bootstrapSheets_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const created = [];
  const ensured = [];

  Object.keys(TABLES).forEach(function (name) {
    const headers = TABLES[name];
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    }

    ensureHeader_(sheet, headers);
    ensured.push(name);
  });

  return {
    spreadsheet_id: SPREADSHEET_ID,
    created: created,
    ensured: ensured
  };
}

function ensureHeader_(sheet, headers) {
  const neededCols = headers.length;
  if (sheet.getMaxColumns() < neededCols) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), neededCols - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, neededCols).setValues([headers]);
  if (sheet.getFrozenRows() !== 1) sheet.setFrozenRows(1);
}

function readDb_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const out = {};

  Object.keys(TABLES).forEach(function (name) {
    const headers = TABLES[name];
    const sheet = ss.getSheetByName(name);
    out[name] = readRows_(sheet, headers);
  });

  return out;
}

function readRows_(sheet, headers) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values
    .filter(function (row) {
      return row.some(function (cell) {
        return String(cell || "").trim() !== "";
      });
    })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (header, idx) {
        obj[header] = normalizeFromSheet_(row[idx]);
      });
      return obj;
    });
}

function writeDb_(incoming) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const db = normalizeDb_(incoming);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    Object.keys(TABLES).forEach(function (name) {
      const headers = TABLES[name];
      let sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      ensureHeader_(sheet, headers);
      writeRows_(sheet, headers, db[name]);
    });
  } finally {
    lock.releaseLock();
  }
}

function normalizeDb_(obj) {
  const base = {};
  Object.keys(TABLES).forEach(function (name) {
    base[name] = Array.isArray(obj && obj[name]) ? obj[name] : [];
  });
  return base;
}

function writeRows_(sheet, headers, list) {
  const rows = Array.isArray(list) ? list : [];
  const width = headers.length;
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, width).clearContent();
  }

  if (!rows.length) return;

  const values = rows.map(function (item) {
    return headers.map(function (header) {
      return normalizeForSheet_(item[header]);
    });
  });

  sheet.getRange(2, 1, values.length, width).setValues(values);
}

function normalizeForSheet_(value) {
  if (value === null || value === undefined) return "";

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
  }

  if (typeof value === "object") {
    value = JSON.stringify(value);
  }

  if (typeof value === "string" && value.length > 49000) {
    return "";
  }

  return value;
}

function normalizeFromSheet_(value) {
  if (value === null || value === undefined) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return value;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorMessage_(err) {
  if (!err) return "Unknown error";
  if (err && err.message) return String(err.message);
  return String(err);
}
