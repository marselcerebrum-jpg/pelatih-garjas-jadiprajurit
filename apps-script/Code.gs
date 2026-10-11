/**
 * Backend Pelatih Garjas – JadiPrajurit
 * Google Apps Script yang terpasang di spreadsheet data casis.
 *
 * Cara pasang:
 * 1. Buka spreadsheet → Extensions → Apps Script. Tempel seluruh isi file ini, lalu simpan.
 * 2. Pilih fungsi setup → Run (pertama kali akan diminta izin akses spreadsheet).
 * 3. Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone.
 * 4. Salin URL Web app (diakhiri /exec) ke js/config.js di repo.
 *
 * Saat memperbarui file ini: Deploy → Manage deployments → ikon pensil →
 * Version: New version → Deploy. JANGAN pilih "New deployment", karena URL-nya berubah.
 */

var VERSI_BACKEND = '2026.10.11';
var TZ = 'Asia/Jakarta';

var TAB = {
  PESERTA: 'Peserta',
  CATATAN: 'Catatan Latihan',
  STANDAR: 'Standar Nilai',
  PENGATURAN: 'Pengaturan'
};

var KOLOM_PESERTA = ['ID Peserta', 'Tanggal Daftar', 'Nama Lengkap', 'Email JadiPrajurit', 'No. WhatsApp',
  'Jenis Kelamin', 'Usia', 'Tinggi (cm)', 'Berat (kg)', 'Domisili', 'Matra', 'Jalur', 'Tanggal Tes',
  'Target Nilai', 'Persetujuan Data', 'Terakhir Diperbarui', 'Jumlah Catatan', 'Nilai Garjas Terbaru',
  'Terakhir Latihan'];
var KOLOM_CATATAN = ['ID Catatan', 'Waktu Input', 'Email JadiPrajurit', 'Nama Lengkap', 'Tanggal',
  'Lari 12 Menit (m)', 'Pull-up/Chinning (kali)', 'Sit-up (kali)', 'Push-up (kali)', 'Shuttle Run (detik)',
  'Simulasi', 'Nilai Garjas', 'Catatan'];
var KOLOM_STANDAR = ['Jenis Kelamin', 'Item', 'Hasil', 'Nilai'];
var KOLOM_PENGATURAN = ['Kunci', 'Nilai', 'Keterangan'];

var ITEM_KEYS = ['lari', 'pullup', 'situp', 'pushup', 'shuttle'];
var ITEM_LABEL = {
  lari: 'Lari 12 menit',
  pullup: 'Pull-up / Chinning',
  situp: 'Sit-up',
  pushup: 'Push-up',
  shuttle: 'Shuttle run'
};
var BATAS = { lari: [0, 6000], pullup: [0, 150], situp: [0, 150], pushup: [0, 150], shuttle: [8, 60] };
var MATRA = ['AD', 'AL', 'AU'];
var JALUR = ['Tamtama', 'Bintara', 'Akmil', 'PA PK'];
var GENDER = ['Pria', 'Wanita'];

/* Tabel CONTOH (hasil : nilai). Ganti di tab Standar Nilai dengan tabel resmi. */
var STANDAR_CONTOH = {
  Pria: {
    lari: [[1000, 0], [1600, 30], [2000, 45], [2400, 62], [2800, 78], [3200, 92], [3500, 100]],
    pullup: [[0, 0], [5, 35], [10, 60], [14, 76], [17, 90], [20, 100]],
    situp: [[0, 0], [10, 20], [25, 50], [35, 68], [42, 82], [50, 100]],
    pushup: [[0, 0], [10, 20], [25, 50], [35, 68], [43, 85], [50, 100]],
    shuttle: [[15, 100], [16, 86], [17, 75], [18, 66], [20, 50], [22, 30], [26, 0]]
  },
  Wanita: {
    lari: [[800, 0], [1200, 20], [1700, 45], [2100, 62], [2500, 80], [2900, 100]],
    pullup: [[0, 0], [20, 40], [40, 65], [60, 85], [72, 100]],
    situp: [[0, 0], [10, 20], [20, 45], [30, 65], [38, 82], [45, 100]],
    pushup: [[0, 0], [8, 20], [18, 45], [28, 65], [36, 82], [44, 100]],
    shuttle: [[17, 100], [18.5, 78], [20, 65], [22, 50], [24, 30], [28, 0]]
  }
};

var PENGATURAN_AWAL = [
  ['standar_resmi', 'TIDAK', 'Ubah menjadi YA setelah tab Standar Nilai diisi tabel resmi. Selama TIDAK, aplikasi menampilkan peringatan bahwa tabel masih contoh.'],
  ['sumber_standar', '', 'Sumber tabel nilai, misalnya nama juknis dan tahunnya. Tampil di aplikasi.'],
  ['target_default', '70', 'Target nilai awal untuk casis yang baru mendaftar.'],
  ['link_grup_wa', '', 'Link grup WhatsApp casis. Kosongkan bila tidak ada.'],
  ['wa_admin', '', 'Nomor WhatsApp admin untuk bantuan, format 628xxxxxxxxxx. Kosongkan bila tidak ada.']
];

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);

  var peserta = siapkanTab_(ss, TAB.PESERTA, KOLOM_PESERTA, 0);
  peserta.getRange('A:A').setNumberFormat('@');
  peserta.getRange('C:F').setNumberFormat('@');
  peserta.getRange('J:L').setNumberFormat('@');
  peserta.getRange('O:O').setNumberFormat('@');

  var catatan = siapkanTab_(ss, TAB.CATATAN, KOLOM_CATATAN, 1);
  catatan.getRange('A:A').setNumberFormat('@');
  catatan.getRange('C:D').setNumberFormat('@');
  catatan.getRange('M:M').setNumberFormat('@');

  var standar = siapkanTab_(ss, TAB.STANDAR, KOLOM_STANDAR, 2);
  if (standar.getLastRow() < 2) {
    var rows = [];
    GENDER.forEach(function (g) {
      ITEM_KEYS.forEach(function (k) {
        STANDAR_CONTOH[g][k].forEach(function (r) { rows.push([g, ITEM_LABEL[k], r[0], r[1]]); });
      });
    });
    standar.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  standar.getRange('A2:A').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(GENDER, true).setAllowInvalid(false).build());
  standar.getRange('B2:B').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(ITEM_KEYS.map(function (k) { return ITEM_LABEL[k]; }), true).setAllowInvalid(false).build());
  standar.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireNumberBetween(0, 100).setAllowInvalid(false).build());

  var pengaturan = siapkanTab_(ss, TAB.PENGATURAN, KOLOM_PENGATURAN, 3);
  pengaturan.getRange('A:B').setNumberFormat('@');
  var ada = {};
  if (pengaturan.getLastRow() >= 2) {
    pengaturan.getRange(2, 1, pengaturan.getLastRow() - 1, 1).getValues().forEach(function (r) { ada[String(r[0]).trim()] = true; });
  }
  PENGATURAN_AWAL.forEach(function (r) { if (!ada[r[0]]) pengaturan.appendRow(r); });
  pengaturan.setColumnWidth(1, 160);
  pengaturan.setColumnWidth(2, 320);
  pengaturan.setColumnWidth(3, 520);
  pengaturan.getRange('C:C').setWrap(true);

  // Hapus Sheet1 bawaan bila masih kosong
  var s1 = ss.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);

  Logger.log('Setup selesai. Versi backend ' + VERSI_BACKEND);
}

function siapkanTab_(ss, nama, kolom, posisi) {
  var sh = ss.getSheetByName(nama);
  if (!sh) sh = ss.insertSheet(nama, posisi);
  sh.getRange(1, 1, 1, kolom.length).setValues([kolom])
    .setFontWeight('bold').setBackground('#D9E3D4').setWrap(true).setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setColumnWidths(1, kolom.length, 140);
  sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(function (pr) {
    if (pr.getDescription().indexOf('Baris judul dipakai aplikasi') === 0) pr.remove();
  });
  var lindung = sh.getRange(1, 1, 1, kolom.length).protect();
  lindung.setDescription('Baris judul dipakai aplikasi. Jangan ubah urutan atau nama kolom.');
  lindung.setWarningOnly(true);
  return sh;
}

/* ------------------------------------------------------------------ */
/* Web app                                                             */
/* ------------------------------------------------------------------ */

function doGet(e) {
  var aksi = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (aksi === 'ping') return json_({ ok: true, versi: VERSI_BACKEND, waktu: sekarang_() });
    if (aksi === 'config') return json_(ambilConfig_());
    return json_({ ok: false, kode: 'aksi_tidak_dikenal' });
  } catch (err) {
    return json_({ ok: false, kode: 'server', pesan: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, kode: 'data_tidak_valid' }); }
  try {
    switch (body.action) {
      case 'daftar': return json_(daftar_(body.profil || {}));
      case 'masuk': return json_(masuk_(body.email));
      case 'simpanProfil': return json_(simpanProfil_(body.email, body.profil || {}));
      case 'tambahCatatan': return json_(tambahCatatan_(body.email, body.catatan || {}, body.ringkasan || {}));
      case 'hapusCatatan': return json_(hapusCatatan_(body.email, body.id, body.ringkasan || {}));
    }
    return json_({ ok: false, kode: 'aksi_tidak_dikenal' });
  } catch (err) {
    if (err && err.kode) return json_({ ok: false, kode: err.kode, pesan: err.pesan || '' });
    return json_({ ok: false, kode: 'server', pesan: String(err && err.message || err) });
  }
}

/* ------------------------------------------------------------------ */
/* Aksi                                                                */
/* ------------------------------------------------------------------ */

function ambilConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var set = bacaPengaturan_(ss);
  var standar = { Pria: {}, Wanita: {} };
  var labelKeKey = {};
  ITEM_KEYS.forEach(function (k) { labelKeKey[ITEM_LABEL[k].toLowerCase()] = k; });
  var sh = ss.getSheetByName(TAB.STANDAR);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().forEach(function (r) {
      var g = String(r[0]).trim(), k = labelKeKey[String(r[1]).trim().toLowerCase()];
      var hasil = Number(r[2]), nilai = Number(r[3]);
      if (!standar[g] || !k || r[2] === '' || r[3] === '' || !isFinite(hasil) || !isFinite(nilai) || nilai < 0 || nilai > 100) return;
      (standar[g][k] = standar[g][k] || []).push([hasil, nilai]);
    });
  }
  var lengkap = true;
  GENDER.forEach(function (g) {
    ITEM_KEYS.forEach(function (k) {
      if (!standar[g][k] || standar[g][k].length < 2) { standar[g][k] = STANDAR_CONTOH[g][k]; lengkap = false; }
      standar[g][k].sort(function (a, b) { return a[0] - b[0]; });
    });
  });
  return {
    ok: true,
    versi: VERSI_BACKEND,
    standar: standar,
    standarResmi: String(set.standar_resmi || '').trim().toUpperCase() === 'YA' && lengkap,
    standarLengkap: lengkap,
    sumberStandar: set.sumber_standar || '',
    targetDefault: Number(set.target_default) > 0 ? Number(set.target_default) : 70,
    linkGrup: /^https:\/\//.test(set.link_grup_wa || '') ? set.link_grup_wa : '',
    waAdmin: /^62\d{8,13}$/.test(String(set.wa_admin || '').replace(/\D/g, '')) ? String(set.wa_admin).replace(/\D/g, '') : ''
  };
}

function daftar_(p) {
  var v = validasiProfil_(p, true);
  return denganKunci_(function () {
    var sh = tab_(TAB.PESERTA);
    if (cariBaris_(sh, 4, v.email) > 0) throw { kode: 'email_terdaftar' };
    var id = 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
    var waktu = sekarang_();
    sh.appendRow([id, waktu.slice(0, 10), teks_(v.name, 80), v.email, '+' + v.wa, v.gender, v.age, v.height, v.weight,
      teks_(v.domisili, 60), v.matra, v.jalur, v.testDate, v.target, 'Ya (' + waktu.slice(0, 10) + ')', waktu, 0, '', '']);
    return { ok: true, profil: profilPublik_(sh, sh.getLastRow()), catatan: [] };
  });
}

function masuk_(email) {
  email = normEmail_(email);
  if (!emailValid_(email)) throw { kode: 'data_tidak_valid', pesan: 'email' };
  var sh = tab_(TAB.PESERTA);
  var baris = cariBaris_(sh, 4, email);
  if (baris < 0) throw { kode: 'tidak_ditemukan' };
  return { ok: true, profil: profilPublik_(sh, baris), catatan: catatanMilik_(email) };
}

function simpanProfil_(email, p) {
  email = normEmail_(email);
  var sh = tab_(TAB.PESERTA);
  return denganKunci_(function () {
    var baris = cariBaris_(sh, 4, email);
    if (baris < 0) throw { kode: 'tidak_ditemukan' };
    p.email = email;
    var adaWa = String(p.wa || '').replace(/\D/g, '') !== '';
    if (!adaWa) p.wa = String(sh.getRange(baris, 5).getValue()).replace(/\D/g, '');
    var v = validasiProfil_(p, false);
    sh.getRange(baris, 3).setValue(teks_(v.name, 80));
    sh.getRange(baris, 5, 1, 10).setValues([['+' + v.wa, v.gender, v.age, v.height, v.weight, teks_(v.domisili, 60), v.matra, v.jalur, v.testDate, v.target]]);
    sh.getRange(baris, 16).setValue(sekarang_());
    return { ok: true, profil: profilPublik_(sh, baris) };
  });
}

function tambahCatatan_(email, c, ringkasan) {
  email = normEmail_(email);
  var v = validasiCatatan_(c);
  return denganKunci_(function () {
    var ps = tab_(TAB.PESERTA);
    var baris = cariBaris_(ps, 4, email);
    if (baris < 0) throw { kode: 'tidak_ditemukan' };
    var sh = tab_(TAB.CATATAN);
    if (cariBaris_(sh, 1, v.id) > 0) return { ok: true, duplikat: true };
    var nama = ps.getRange(baris, 3).getValue();
    sh.appendRow([v.id, sekarang_(), email, String(nama), v.tanggal, v.items.lari, v.items.pullup, v.items.situp,
      v.items.pushup, v.items.shuttle, v.sim ? 'Ya' : 'Tidak', v.garjas, teks_(v.note, 200)]);
    tulisRingkasan_(ps, baris, ringkasan);
    return { ok: true };
  });
}

function hapusCatatan_(email, id, ringkasan) {
  email = normEmail_(email);
  id = String(id || '').slice(0, 40);
  return denganKunci_(function () {
    var ps = tab_(TAB.PESERTA);
    var baris = cariBaris_(ps, 4, email);
    if (baris < 0) throw { kode: 'tidak_ditemukan' };
    var sh = tab_(TAB.CATATAN);
    var b = cariBaris_(sh, 1, id);
    if (b > 0) {
      if (normEmail_(sh.getRange(b, 3).getValue()) !== email) throw { kode: 'tidak_ditemukan' };
      sh.deleteRow(b);
    }
    tulisRingkasan_(ps, baris, ringkasan);
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Bantuan                                                             */
/* ------------------------------------------------------------------ */

function profilPublik_(sh, baris) {
  var r = sh.getRange(baris, 1, 1, KOLOM_PESERTA.length).getValues()[0];
  // Nomor WhatsApp sengaja tidak dikirim balik ke aplikasi.
  return {
    id: String(r[0]), regAt: tgl_(r[1]), name: String(r[2]).replace(/^'/, ''), email: String(r[3]),
    gender: String(r[5]), age: r[6] === '' ? '' : Number(r[6]), height: r[7] === '' ? '' : Number(r[7]),
    weight: r[8] === '' ? '' : Number(r[8]), domisili: String(r[9]).replace(/^'/, ''), matra: String(r[10]),
    jalur: String(r[11]), testDate: tgl_(r[12]), target: Number(r[13]) || 70, waTerisi: String(r[4]).replace(/\D/g, '').length > 8
  };
}

function catatanMilik_(email) {
  var sh = tab_(TAB.CATATAN);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var angka = function (x) { return x === '' || x === null ? null : Number(x); };
  return sh.getRange(2, 1, n, KOLOM_CATATAN.length).getValues()
    .filter(function (r) { return normEmail_(r[2]) === email; })
    .map(function (r) {
      return {
        id: String(r[0]), date: tgl_(r[4]),
        items: { lari: angka(r[5]), pullup: angka(r[6]), situp: angka(r[7]), pushup: angka(r[8]), shuttle: angka(r[9]) },
        sim: String(r[10]) === 'Ya', note: String(r[12] || '').replace(/^'/, '')
      };
    });
}

function tulisRingkasan_(sh, baris, r) {
  var jumlah = Math.max(0, Math.round(Number(r.jumlah) || 0));
  var garjas = Number(r.garjas);
  var terakhir = /^\d{4}-\d{2}-\d{2}$/.test(String(r.terakhir || '')) ? r.terakhir : '';
  sh.getRange(baris, 16, 1, 4).setValues([[sekarang_(), jumlah, isFinite(garjas) && garjas >= 0 && garjas <= 100 && r.garjas !== null && r.garjas !== '' ? garjas : '', terakhir]]);
}

function validasiProfil_(p, baru) {
  var v = {
    name: String(p.name || '').trim().replace(/\s+/g, ' '),
    email: normEmail_(p.email),
    wa: normWa_(p.wa),
    gender: String(p.gender || ''),
    age: Number(p.age),
    height: p.height === '' || p.height == null ? '' : Number(p.height),
    weight: p.weight === '' || p.weight == null ? '' : Number(p.weight),
    domisili: String(p.domisili || '').trim(),
    matra: String(p.matra || ''),
    jalur: String(p.jalur || ''),
    testDate: /^\d{4}-\d{2}-\d{2}$/.test(String(p.testDate || '')) ? String(p.testDate) : '',
    target: Number(p.target) > 0 && Number(p.target) <= 100 ? Number(p.target) : 70
  };
  var salah = [];
  if (v.name.length < 3 || v.name.length > 80) salah.push('nama');
  if (!emailValid_(v.email)) salah.push('email');
  if (!/^628\d{7,12}$/.test(v.wa)) salah.push('whatsapp');
  if (GENDER.indexOf(v.gender) < 0) salah.push('jenis kelamin');
  if (!(v.age >= 15 && v.age <= 40)) salah.push('usia');
  if (v.height !== '' && !(v.height >= 120 && v.height <= 220)) salah.push('tinggi');
  if (v.weight !== '' && !(v.weight >= 30 && v.weight <= 160)) salah.push('berat');
  if (MATRA.indexOf(v.matra) < 0) salah.push('matra');
  if (JALUR.indexOf(v.jalur) < 0) salah.push('jalur');
  if (baru && p.consent !== true) salah.push('persetujuan');
  if (salah.length) throw { kode: 'data_tidak_valid', pesan: salah.join(', ') };
  return v;
}

function validasiCatatan_(c) {
  var id = String(c.id || '');
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) throw { kode: 'data_tidak_valid', pesan: 'id' };
  var tanggal = String(c.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || tanggal > Utilities.formatDate(new Date(Date.now() + 86400000), TZ, 'yyyy-MM-dd')) {
    throw { kode: 'data_tidak_valid', pesan: 'tanggal' };
  }
  var items = {}, ada = 0;
  ITEM_KEYS.forEach(function (k) {
    var x = c.items ? c.items[k] : null;
    if (x === null || x === undefined || x === '') { items[k] = ''; return; }
    x = Number(x);
    if (!isFinite(x) || x < BATAS[k][0] || x > BATAS[k][1]) throw { kode: 'data_tidak_valid', pesan: ITEM_LABEL[k] };
    items[k] = x; ada++;
  });
  if (!ada) throw { kode: 'data_tidak_valid', pesan: 'kosong' };
  var g = Number(c.garjas);
  return {
    id: id, tanggal: tanggal, items: items, sim: c.sim === true,
    garjas: c.garjas !== null && c.garjas !== '' && isFinite(g) && g >= 0 && g <= 100 ? g : '',
    note: String(c.note || '').trim()
  };
}

function bacaPengaturan_(ss) {
  var out = {};
  var sh = ss.getSheetByName(TAB.PENGATURAN);
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(function (r) {
    var k = String(r[0]).trim();
    if (k) out[k] = String(r[1]).trim();
  });
  return out;
}

function cariBaris_(sh, kolom, nilai) {
  var last = sh.getLastRow();
  if (last < 2 || !nilai) return -1;
  var hasil = sh.getRange(2, kolom, last - 1, 1).createTextFinder(String(nilai))
    .matchEntireCell(true).matchCase(false).findNext();
  return hasil ? hasil.getRow() : -1;
}

function denganKunci_(fn) {
  var kunci = LockService.getScriptLock();
  if (!kunci.tryLock(20000)) throw { kode: 'sibuk' };
  try { return fn(); } finally { kunci.releaseLock(); }
}

function tab_(nama) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nama);
  if (!sh) throw { kode: 'server', pesan: 'Tab "' + nama + '" tidak ditemukan. Jalankan fungsi setup.' };
  return sh;
}

function teks_(s, max) {
  s = String(s == null ? '' : s).trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function normEmail_(e) { return String(e || '').trim().toLowerCase(); }
function emailValid_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120; }
function normWa_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.charAt(0) === '0') d = '62' + d.slice(1);
  else if (d.charAt(0) === '8') d = '62' + d;
  return d;
}
function tgl_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v || '').slice(0, 10);
}
function sekarang_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
