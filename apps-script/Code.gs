/**
 * Backend SIGAP (Simulasi dan Indeks Gerak Akurat Peserta) – JadiPrajurit
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

var VERSI_BACKEND = '2026.10.11-6';
var TZ = 'Asia/Jakarta';

var TAB = {
  PESERTA: 'Peserta',
  CATATAN: 'Catatan Latihan',
  STANDAR: 'Standar Nilai',
  PENGATURAN: 'Pengaturan',
  KONTAK: 'Simpan Kontak',
  SYARAT: 'Syarat'
};
var NAMA_FOLDER_BUKTI = 'Bukti Syarat - SIGAP JadiPrajurit';
var MAX_BUKTI_BYTES = 5 * 1024 * 1024;
var MIME_BUKTI = ['image/jpeg', 'image/png', 'image/webp'];

var KOLOM_PESERTA = ['ID Peserta', 'Tanggal Daftar', 'Nama Lengkap', 'Email JadiPrajurit', 'No. WhatsApp',
  'Jenis Kelamin', 'Usia', 'Tinggi (cm)', 'Berat (kg)', 'Domisili', 'Matra', 'Jalur', 'Tanggal Tes',
  'Target Nilai', 'Persetujuan Data', 'Terakhir Diperbarui', 'Jumlah Catatan', 'Nilai Jasmani Terbaru',
  'Terakhir Latihan', 'Disimpan Admin', 'Simpan Nomor Admin', 'Tampil di Peringkat', 'Kode Bagikan', 'Diajak Oleh', 'Bukti Syarat'];
var KOLOM_CATATAN = ['ID Catatan', 'Waktu Input', 'Email JadiPrajurit', 'Nama Lengkap', 'Tanggal',
  'Lari 12 Menit (m)', 'Pull-up/Chinning (kali)', 'Sit-up (kali)', 'Push-up (kali)', 'Shuttle Run (detik)',
  'Simulasi', 'Nilai Jasmani', 'Catatan'];
var KOLOM_STANDAR = ['Jenis Kelamin', 'Item', 'Hasil', 'Nilai'];
var KOLOM_PENGATURAN = ['Kunci', 'Nilai', 'Keterangan'];
var KOLOM_SYARAT = ['No', 'Syarat', 'Link (opsional)', 'Aktif (Ya/Tidak)'];
var KOLOM_KONTAK = ['Waktu', 'ID Peserta', 'Nama Kontak', 'No. WhatsApp', 'Email JadiPrajurit', 'Status'];

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

/* Isi awal tab Standar Nilai: tabel nilai jasmani TNI golongan umur 18–25 tahun (hasil : nilai).
   Nilai 100 mengikuti naskah Pusdikjas TNI AD. Cocokkan dengan juknis seleksi terbaru. */
var STANDAR_CONTOH = {
  Pria: {
    lari: [[1607, 0], [3507, 100]],
    pullup: [[0, 0], [1, 15], [18, 100]],
    situp: [[13, 0], [14, 1], [32, 55], [41, 100]],
    pushup: [[15, 0], [16, 1], [34, 55], [43, 100]],
    shuttle: [[15.9, 100], [25.9, 0]]
  },
  Wanita: {
    lari: [[1530, 0], [2630, 100]],
    pullup: [[11, 0], [12, 2], [13, 4], [14, 6], [15, 8], [16, 10], [17, 12], [18, 14], [19, 16], [20, 18], [21, 20], [22, 22], [23, 24], [24, 26], [25, 29], [26, 31], [27, 33], [28, 35], [29, 37], [30, 39], [31, 43], [32, 46], [33, 49], [34, 51], [35, 53], [36, 55], [37, 57], [38, 58], [39, 60], [40, 62], [41, 63], [42, 65], [43, 67], [44, 68], [45, 70], [46, 72], [47, 73], [48, 75], [49, 77], [50, 78], [51, 80], [52, 82], [53, 83], [54, 85], [55, 87], [56, 88], [57, 90], [58, 92], [59, 93], [60, 95], [61, 97], [62, 98], [63, 100]],
    situp: [[13, 0], [14, 3], [27, 55], [36, 100]],
    pushup: [[5, 0], [6, 3], [19, 55], [28, 100]],
    shuttle: [[17.2, 100], [27.2, 0]]
  }
};

var PENGATURAN_AWAL = [
  ['standar_resmi', 'TIDAK', 'Ubah menjadi YA setelah tabel di tab Standar Nilai dicocokkan dengan juknis seleksi resmi. Selama TIDAK, aplikasi menampilkan keterangan bahwa tabel belum ditandai resmi.'],
  ['sumber_standar', 'Tabel nilai jasmani TNI golongan umur 18–25 tahun (nilai 100 sesuai naskah Pusdikjas TNI AD); perlu dicocokkan dengan juknis seleksi terbaru', 'Sumber tabel nilai, misalnya nama juknis dan tahunnya. Tampil di aplikasi.'],
  ['target_default', '70', 'Target nilai awal untuk casis yang baru mendaftar.'],
  ['link_grup_wa', '', 'Link grup WhatsApp casis. Kosongkan bila tidak ada.'],
  ['wa_admin', '', 'Nomor WhatsApp admin untuk bantuan, format 628xxxxxxxxxx. Kosongkan bila tidak ada.'],
  ['nama_admin', 'Admin JadiPrajurit', 'Nama kontak admin yang tersimpan di HP casis saat mereka menekan "Simpan nomor admin".'],
  ['label_kontak', 'Casis JadiPrajurit', 'Akhiran nama kontak di tab Simpan Kontak (untuk impor bulk lewat Markaz). Contoh hasil: "Rizky Aditya Casis JadiPrajurit".']
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
  var syarat = siapkanTab_(ss, TAB.SYARAT, KOLOM_SYARAT, 4);
  if (syarat.getLastRow() < 2) {
    syarat.getRange(2, 1, 2, 4).setValues([
      [1, 'Follow Instagram @jadiprajurit.id', 'https://www.instagram.com/jadiprajurit.id/', 'Ya'],
      [2, 'Like, save, repost, dan tag 3 teman kamu di kolom komentar postingan JadiPrajurit', '', 'Ya']
    ]);
  }
  syarat.setColumnWidth(2, 460); syarat.setColumnWidth(3, 300);
  syarat.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Ya', 'Tidak'], true).setAllowInvalid(false).build());
  folderBukti_();

  var kontak = siapkanTab_(ss, TAB.KONTAK, KOLOM_KONTAK, 5);
  kontak.getRange('B:F').setNumberFormat('@');
  kontak.setColumnWidth(6, 320);

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
    if (aksi === 'hasil') return json_(hasilPublik_(e.parameter.k));
    return json_({ ok: false, kode: 'aksi_tidak_dikenal' });
  } catch (err) {
    if (err && err.kode) return json_({ ok: false, kode: err.kode, pesan: err.pesan || '' });
    return json_({ ok: false, kode: 'server', pesan: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, kode: 'data_tidak_valid' }); }
  try {
    switch (body.action) {
      case 'daftar': return json_(daftar_(body.profil || {}, body.bukti));
      case 'masuk': return json_(masuk_(body.email));
      case 'simpanProfil': return json_(simpanProfil_(body.email, body.profil || {}));
      case 'tambahCatatan': return json_(tambahCatatan_(body.email, body.catatan || {}, body.ringkasan || {}));
      case 'konfirmasiKontak': return json_(konfirmasiKontak_(body.email));
      case 'leaderboard': return json_(leaderboard_(body.email));
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
    waAdmin: /^62\d{8,13}$/.test(String(set.wa_admin || '').replace(/\D/g, '')) ? String(set.wa_admin).replace(/\D/g, '') : '',
    namaAdmin: String(set.nama_admin || 'Admin JadiPrajurit').slice(0, 60),
    syarat: bacaSyarat_(ss)
  };
}

function daftar_(p, bukti) {
  var v = validasiProfil_(p, true);
  var syarat = bacaSyarat_(SpreadsheetApp.getActiveSpreadsheet());
  var blob = validasiBukti_(bukti, syarat.length);
  var sh0 = tab_(TAB.PESERTA);
  if (cariBaris_(sh0, 4, v.email) > 0) throw { kode: 'email_terdaftar' };
  var id = 'P' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  var linkBukti = simpanBukti_(id, v.name, blob);
  return denganKunci_(function () {
    var sh = tab_(TAB.PESERTA);
    if (cariBaris_(sh, 4, v.email) > 0) throw { kode: 'email_terdaftar' };
    var waktu = sekarang_();
    var diajak = '';
    var ref = String(p.ref || '').toUpperCase();
    if (/^[A-Z0-9]{6,12}$/.test(ref)) { var rb = cariBaris_(sh, 23, ref); if (rb > 0) diajak = String(sh.getRange(rb, 1).getValue()); }
    sh.appendRow([id, waktu.slice(0, 10), teks_(v.name, 80), v.email, '+' + v.wa, v.gender, v.age, v.height, v.weight,
      teks_(v.domisili, 60), v.matra, v.jalur, v.testDate, v.target, 'Ya (' + waktu.slice(0, 10) + ')', waktu, 0, '', '',
      'Ya', '', 'Ya', kodeBaru_(sh), diajak, linkBukti]);
    antreKontak_(id, v.name, v.wa, v.email);
    hapusCache_();
    return { ok: true, profil: profilPublik_(sh, sh.getLastRow()), catatan: [] };
  });
}

function masuk_(email) {
  email = normEmail_(email);
  if (!emailValid_(email)) throw { kode: 'data_tidak_valid', pesan: 'email' };
  var sh = tab_(TAB.PESERTA);
  var baris = cariBaris_(sh, 4, email);
  if (baris < 0) throw { kode: 'tidak_ditemukan' };
  if (!String(sh.getRange(baris, 23).getValue())) denganKunci_(function () { pastikanKode_(sh, baris); });
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
    sh.getRange(baris, 22).setValue(p.tampilLeaderboard === false ? 'Tidak' : 'Ya');
    pastikanKode_(sh, baris);
    hapusCache_();
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
    hapusCache_();
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
    hapusCache_();
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Syarat pendaftaran dan bukti                                        */
/* ------------------------------------------------------------------ */

function bacaSyarat_(ss) {
  var sh = ss.getSheetByName(TAB.SYARAT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues()
    .filter(function (r) { return String(r[1]).trim() && String(r[3]).trim().toLowerCase() !== 'tidak'; })
    .map(function (r) { var link = String(r[2]).trim(); return { teks: String(r[1]).trim().slice(0, 300), link: /^https?:\/\//.test(link) ? link : '' }; });
}

function validasiBukti_(bukti, perlu) {
  if (!perlu) return [];
  if (!Array.isArray(bukti) || bukti.length !== perlu) throw { kode: 'bukti_kurang', pesan: String(perlu) };
  return bukti.map(function (b, i) {
    if (!b || MIME_BUKTI.indexOf(String(b.mime)) < 0 || typeof b.data !== 'string' || !b.data) throw { kode: 'bukti_tidak_valid', pesan: 'syarat ' + (i + 1) };
    var bytes;
    try { bytes = Utilities.base64Decode(b.data); } catch (e) { throw { kode: 'bukti_tidak_valid', pesan: 'syarat ' + (i + 1) }; }
    if (bytes.length > MAX_BUKTI_BYTES) throw { kode: 'bukti_tidak_valid', pesan: 'syarat ' + (i + 1) + ' terlalu besar' };
    return { bytes: bytes, mime: String(b.mime) };
  });
}

function simpanBukti_(id, nama, blobs) {
  if (!blobs.length) return '';
  var folder = folderBukti_(), ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  return blobs.map(function (b, i) {
    var f = folder.createFile(Utilities.newBlob(b.bytes, b.mime, id + ' - ' + String(nama).slice(0, 40) + ' - syarat ' + (i + 1) + '.' + ext[b.mime]));
    return f.getUrl();
  }).join('\n');
}

function folderBukti_() {
  var props = PropertiesService.getScriptProperties();
  var fid = props.getProperty('FOLDER_BUKTI');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) { } }
  var f = DriveApp.createFolder(NAMA_FOLDER_BUKTI);
  props.setProperty('FOLDER_BUKTI', f.getId());
  return f;
}

/* ------------------------------------------------------------------ */
/* Peringkat dan hasil yang bisa dibagikan                             */
/* ------------------------------------------------------------------ */

var KUNCI_CACHE = 'rekap_v1';

function hapusCache_() { try { CacheService.getScriptCache().remove(KUNCI_CACHE); } catch (e) { } }

function kodeBaru_(sh) {
  var huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var n = 0; n < 20; n++) {
    var k = '';
    for (var i = 0; i < 8; i++) k += huruf.charAt(Math.floor(Math.random() * huruf.length));
    if (cariBaris_(sh, 23, k) < 0) return k;
  }
  return 'K' + Date.now().toString(36).toUpperCase();
}

function pastikanKode_(sh, baris) {
  if (!String(sh.getRange(baris, 23).getValue())) sh.getRange(baris, 23).setValue(kodeBaru_(sh));
  if (!String(sh.getRange(baris, 22).getValue())) sh.getRange(baris, 22).setValue('Ya');
}

/* Nama yang tampil ke publik: nama depan + inisial nama kedua, misal "Faisal D." */
function namaTampil_(nama) {
  var bagian = String(nama || '').replace(/^'/, '').trim().split(/\s+/);
  var depan = (bagian[0] || 'Casis').slice(0, 15);
  return bagian.length > 1 && bagian[1] ? depan + ' ' + bagian[1].charAt(0).toUpperCase() + '.' : depan;
}

function skor_(tabel, raw) {
  if (raw === '' || raw === null || raw === undefined || !isFinite(raw)) return null;
  var t = tabel;
  if (raw <= t[0][0]) return t[0][1];
  if (raw >= t[t.length - 1][0]) return t[t.length - 1][1];
  for (var i = 1; i < t.length; i++) {
    if (raw <= t[i][0]) {
      var a = t[i - 1], b = t[i];
      var v = a[1] + (b[1] - a[1]) * (raw - a[0]) / (b[0] - a[0]);
      return Math.max(0, Math.min(100, Math.round(v * 10) / 10));
    }
  }
  return null;
}

function garjas_(sc) {
  var a = sc.lari;
  var bs = ['pullup', 'situp', 'pushup', 'shuttle'].map(function (k) { return sc[k]; }).filter(function (v) { return v != null; });
  if (a == null && !bs.length) return null;
  var b = bs.length ? bs.reduce(function (x, y) { return x + y; }, 0) / bs.length : null;
  if (a != null && b != null) return Math.round((a + b) / 2 * 10) / 10;
  return Math.round((a != null ? a : b) * 10) / 10;
}

/* Rekap semua casis (disimpan di cache 5 menit, dihapus setiap ada data baru). */
function rekapSemua_() {
  var cache = CacheService.getScriptCache();
  var c = cache.get(KUNCI_CACHE);
  if (c) return JSON.parse(c);
  var cfg = ambilConfig_();
  var ps = tab_(TAB.PESERTA), ct = tab_(TAB.CATATAN);
  var np = ps.getLastRow() - 1, nc = ct.getLastRow() - 1;
  var peserta = np > 0 ? ps.getRange(2, 1, np, KOLOM_PESERTA.length).getValues() : [];
  var catatan = nc > 0 ? ct.getRange(2, 1, nc, KOLOM_CATATAN.length).getValues() : [];
  var perEmail = {};
  catatan.forEach(function (r) {
    var em = normEmail_(r[2]);
    (perEmail[em] = perEmail[em] || []).push({ d: tgl_(r[4]), it: [r[5], r[6], r[7], r[8], r[9]] });
  });
  var hariIni = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var batas = Utilities.formatDate(new Date(Date.now() - 6 * 86400000), TZ, 'yyyy-MM-dd');
  var list = peserta.map(function (r) {
    var em = normEmail_(r[3]);
    var logs = (perEmail[em] || []).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var g = String(r[5]) === 'Wanita' ? 'Wanita' : 'Pria';
    var latest = {}, sc = {}, lengkap = true, hari = {};
    logs.forEach(function (l) {
      ITEM_KEYS.forEach(function (k, i) { var v = l.it[i]; if (v !== '' && v !== null && isFinite(Number(v))) latest[k] = Number(v); });
      if (l.d >= batas && l.d <= hariIni) hari[l.d] = 1;
    });
    ITEM_KEYS.forEach(function (k) {
      sc[k] = latest[k] != null ? skor_(cfg.standar[g][k], latest[k]) : null;
      if (sc[k] == null) lengkap = false;
    });
    return {
      em: em, nama: namaTampil_(r[2]), matra: String(r[10]), jalur: String(r[11]), gender: g,
      tampil: String(r[21]) !== 'Tidak', kode: String(r[22] || ''), target: Number(r[13]) || 70,
      nilai: garjas_(sc), lengkap: lengkap, hari: Object.keys(hari).length, total: logs.length, latest: latest, sc: sc
    };
  });
  var data = { waktu: sekarang_(), list: list };
  try { cache.put(KUNCI_CACHE, JSON.stringify(data), 300); } catch (e) { }
  return data;
}

function urutanPeringkat_(list) {
  var nilai = list.filter(function (x) { return x.tampil && x.lengkap && x.nilai != null; })
    .sort(function (a, b) { return b.nilai - a.nilai || b.total - a.total; });
  var rajin = list.filter(function (x) { return x.tampil && x.hari > 0; })
    .sort(function (a, b) { return b.hari - a.hari || b.total - a.total; });
  return { nilai: nilai, rajin: rajin };
}

function leaderboard_(email) {
  var me = normEmail_(email);
  var data = rekapSemua_();
  var u = urutanPeringkat_(data.list);
  var pub = function (x, i) {
    return { rank: i + 1, nama: x.nama, matra: x.matra, jalur: x.jalur, gender: x.gender, nilai: x.nilai, hari: x.hari, saya: x.em === me };
  };
  var self = data.list.filter(function (x) { return x.em === me; })[0];
  var posisi = function (arr) { for (var i = 0; i < arr.length; i++) if (arr[i].em === me) return i + 1; return null; };
  return {
    ok: true, waktu: data.waktu,
    nilai: u.nilai.slice(0, 100).map(pub), rajin: u.rajin.slice(0, 100).map(pub),
    totalNilai: u.nilai.length, totalRajin: u.rajin.length,
    saya: self ? { rankNilai: posisi(u.nilai), rankRajin: posisi(u.rajin), lengkap: self.lengkap, tampil: self.tampil, nilai: self.nilai, hari: self.hari } : null
  };
}

function hasilPublik_(kode) {
  kode = String(kode || '').toUpperCase();
  if (!/^[A-Z0-9]{6,12}$/.test(kode)) throw { kode: 'tidak_ditemukan' };
  var data = rekapSemua_();
  var x = data.list.filter(function (y) { return y.kode === kode; })[0];
  if (!x) throw { kode: 'tidak_ditemukan' };
  var u = urutanPeringkat_(data.list), rank = null;
  for (var i = 0; i < u.nilai.length; i++) if (u.nilai[i].kode === kode) { rank = i + 1; break; }
  return {
    ok: true, nama: x.nama, matra: x.matra, jalur: x.jalur, gender: x.gender, nilai: x.nilai, lengkap: x.lengkap,
    target: x.target, total: x.total, rankNilai: rank, totalNilai: u.nilai.length,
    items: ITEM_KEYS.map(function (k) { return { key: k, raw: x.latest[k] != null ? x.latest[k] : null, nilai: x.sc[k] }; })
  };
}

/* ------------------------------------------------------------------ */
/* Kontak WhatsApp                                                     */
/* ------------------------------------------------------------------ */

/*
 * Setiap casis yang mendaftar otomatis masuk tab "Simpan Kontak" berstatus
 * "Belum disimpan admin". Admin menyimpannya secara bulk lewat Markaz, lalu
 * menandainya lewat menu SIGAP → Tandai semua sudah disimpan.
 * Casis wajib menyimpan nomor admin sebelum masuk aplikasi; konfirmasinya
 * tercatat di kolom "Simpan Nomor Admin" pada tab Peserta.
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('SIGAP')
    .addItem('Tandai semua sudah disimpan', 'tandaiKontakTersimpan')
    .addItem('Ekspor kontak belum disimpan ke vCard', 'eksporKontakVcf')
    .addToUi();
}

function konfirmasiKontak_(email) {
  email = normEmail_(email);
  return denganKunci_(function () {
    var sh = tab_(TAB.PESERTA);
    var baris = cariBaris_(sh, 4, email);
    if (baris < 0) throw { kode: 'tidak_ditemukan' };
    if (!/^Ya/.test(String(sh.getRange(baris, 21).getValue()))) sh.getRange(baris, 21).setValue('Ya (' + sekarang_() + ')');
    if (String(sh.getRange(baris, 20).getValue()) !== 'Ya') {
      // Casis lama yang mendaftar sebelum fitur ini: masukkan ke antrean simpan kontak.
      sh.getRange(baris, 20).setValue('Ya');
      antreKontak_(String(sh.getRange(baris, 1).getValue()), String(sh.getRange(baris, 3).getValue()).replace(/^'/, ''),
        String(sh.getRange(baris, 5).getValue()).replace(/\D/g, ''), email);
    }
    return { ok: true, profil: profilPublik_(sh, baris) };
  });
}

function antreKontak_(id, nama, wa, email) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TAB.KONTAK);
    if (!sh || !wa) return;
    var noWa = '+' + wa;
    if (cariBaris_(sh, 4, noWa) > 0) return;
    var label = String(bacaPengaturan_(ss).label_kontak || 'Casis JadiPrajurit').trim();
    var namaKontak = (String(nama).trim() + (label ? ' ' + label : '')).slice(0, 120);
    sh.appendRow([sekarang_(), id, teks_(namaKontak, 120), noWa, email, 'Belum disimpan admin']);
  } catch (e) {
    Logger.log('antreKontak_: ' + e);
  }
}

/** Menu: tandai semua kontak "Belum disimpan admin" sebagai sudah disimpan (setelah impor lewat Markaz). */
function tandaiKontakTersimpan() {
  var sh = tab_(TAB.KONTAK), n = sh.getLastRow() - 1, jumlah = 0;
  if (n > 0) {
    var st = sh.getRange(2, 6, n, 1).getValues();
    st.forEach(function (r, i) { if (/^Belum/.test(String(r[0]))) { st[i][0] = 'Sudah disimpan (' + sekarang_() + ')'; jumlah++; } });
    sh.getRange(2, 6, n, 1).setValues(st);
  }
  SpreadsheetApp.getUi().alert(jumlah + ' kontak ditandai sudah disimpan.');
}

/** Menu: buat file .vcf di Google Drive berisi kontak yang belum disimpan admin. */
function eksporKontakVcf() {
  var sh = tab_(TAB.KONTAK), n = sh.getLastRow() - 1, isi = [];
  if (n > 0) {
    sh.getRange(2, 1, n, KOLOM_KONTAK.length).getValues().forEach(function (r) {
      if (!/^Belum/.test(String(r[5]))) return;
      var nama = String(r[2]).replace(/^'/, '').replace(/[\r\n;,]/g, ' ');
      isi.push('BEGIN:VCARD\r\nVERSION:3.0\r\nFN:' + nama + '\r\nN:' + nama + ';;;;\r\nTEL;TYPE=CELL:' + String(r[3]) + '\r\nEND:VCARD');
    });
  }
  if (!isi.length) { SpreadsheetApp.getUi().alert('Tidak ada kontak yang belum disimpan.'); return; }
  var file = DriveApp.createFile('Kontak Casis JadiPrajurit ' + sekarang_().replace(/[: ]/g, '-') + '.vcf', isi.join('\r\n') + '\r\n', 'text/vcard');
  SpreadsheetApp.getUi().alert(isi.length + ' kontak diekspor ke Google Drive:\n' + file.getUrl());
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
    jalur: String(r[11]), testDate: tgl_(r[12]), target: Number(r[13]) || 70, waTerisi: String(r[4]).replace(/\D/g, '').length > 8,
    disimpanAdmin: String(r[19]) === 'Ya',
    kontakAdmin: /^Ya/.test(String(r[20])),
    tampilLeaderboard: String(r[21]) !== 'Tidak',
    kodeBagikan: String(r[22] || '')
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
