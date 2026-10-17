/*
 * SIGAP (Simulasi dan Indeks Gerak Akurat Peserta) – JadiPrajurit
 * Tampilan dan alur aplikasi. Data disimpan ke Google Sheets lewat Apps Script.
 */
(function () {
  'use strict';
  var VERSI = '2026.10.11-18';
  var BACKEND_DIHARAPKAN = '2026.10.11-10';
  (window.VERSI_FILE = window.VERSI_FILE || {})['app.js'] = VERSI;

  var N = window.Nilai, ITEMS = N.ITEMS;
  var LS_SESI = 'pelatih-garjas-sesi-v1', LS_CONFIG = 'pelatih-garjas-config-v1', LS_REF = 'pelatih-garjas-ref', LS_ANTRE = 'pelatih-garjas-antre-v1';
  var HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

  /* ---------------- Util ---------------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { return dstr(new Date()); }
  function parseDate(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function dayDiff(a, b) { return Math.round((parseDate(b) - parseDate(a)) / 86400000); }
  function fmtDate(s) { try { return parseDate(s).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return s; } }
  function fmtNum(n, d) { if (n == null || !isFinite(n)) return '–'; return Number(n).toLocaleString('id-ID', { maximumFractionDigits: d == null ? 1 : d, minimumFractionDigits: 0 }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); }
  function $(s) { return document.querySelector(s); }
  function num(v) { if (v === '' || v == null) return null; var n = Number(String(v).replace(',', '.')); return isFinite(n) ? n : null; }
  function lsGet(k) { try { var t = localStorage.getItem(k); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }

  /* ---------------- State ---------------- */
  var S = { email: null, profil: null, catatan: [] };
  var CFG = null;
  var tab = 'beranda', authView = 'awal', authMsg = '', busy = false;
  var progressPick = 'garjas', checkin = null;
  var draft = { date: todayStr(), items: {}, sim: false, note: '' };
  var timer = { mode: null, running: false, start: 0, elapsed: 0, done: false, iv: null };
  var audioCtx = null, wakeLock = null;

  function gender() { return S.profil && S.profil.gender === 'Wanita' ? 'Wanita' : 'Pria'; }
  function itemLabel(it) { return N.label(it, gender()); }
  function score(key, raw) { return N.score(key, raw, gender()); }
  function target() { return S.profil && Number(S.profil.target) > 0 ? Number(S.profil.target) : (CFG && CFG.targetDefault) || 100; }
  function simpanSesi() { lsSet(LS_SESI, S.email ? S : null); }

  /* ---------------- API ---------------- */
  function api(action, data, method) {
    var url = window.CONFIG && window.CONFIG.APPS_SCRIPT_URL;
    if (!url) return Promise.reject({ kode: 'belum_diatur' });
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    var req = method === 'GET'
      ? fetch(url + '?action=' + encodeURIComponent(action) + Object.keys(data || {}).map(function (k) { return '&' + k + '=' + encodeURIComponent(data[k]); }).join('') + '&t=' + Date.now(), { signal: ctl && ctl.signal })
      : fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action: action }, data || {})), signal: ctl && ctl.signal });
    return req.then(function (r) { return r.json(); }, function () { throw { kode: 'jaringan' }; })
      .then(function (j) { clearTimeout(t); if (!j || !j.ok) throw j || { kode: 'server' }; return j; },
        function (e) { clearTimeout(t); throw e && e.kode ? e : { kode: 'jaringan' }; });
  }
  function pesanError(e) {
    var k = e && e.kode;
    if (k === 'belum_diatur') return 'Aplikasi belum terhubung ke server. Hubungi admin.';
    if (k === 'jaringan') return 'Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.';
    if (k === 'email_terdaftar') return 'Email ini sudah terdaftar. Silakan masuk dengan email tersebut.';
    if (k === 'tidak_ditemukan') return 'Email belum terdaftar. Periksa penulisannya atau daftar terlebih dahulu.';
    if (k === 'data_tidak_valid') return 'Data belum sesuai' + (e.pesan ? ' (' + e.pesan + ')' : '') + '. Periksa lagi isiannya.';
    if (k === 'sibuk') return 'Server sedang sibuk. Coba lagi beberapa detik lagi.';
    if (k === 'batas_battle') return 'Kamu sudah punya 3 tantangan aktif. Tunggu sampai dijawab atau kedaluwarsa.';
    if (k === 'battle_tutup') return 'Tantangan ini sudah ditutup (' + (e.pesan || 'selesai') + ').';
    if (k === 'bukti_kurang') return 'Syarat pendaftaran baru saja berubah. Muat ulang halaman, lalu unggah bukti untuk setiap syarat.';
    if (k === 'bukti_tidak_valid') return 'Bukti ' + (e.pesan || 'syarat') + ' tidak bisa dibaca. Unggah ulang screenshot-nya.';
    return 'Terjadi gangguan di server. Coba lagi sebentar.';
  }

  function muatConfig() {
    var c = lsGet(LS_CONFIG);
    if (c) { CFG = c; N.setStandar(c.standar, c.standarMatra); }
    return api('config', null, 'GET').then(function (j) {
      CFG = j; N.setStandar(j.standar, j.standarMatra); lsSet(LS_CONFIG, j); return j;
    });
  }

  /* ---------------- Perhitungan ---------------- */
  function sortedLogs() { return S.catatan.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
  function latestUpTo(date) {
    var out = {};
    sortedLogs().forEach(function (l) { if (date && l.date > date) return; ITEMS.forEach(function (it) { var v = l.items[it.key]; if (v != null && isFinite(v)) out[it.key] = { raw: v, date: l.date }; }); });
    return out;
  }
  function currentScores(date) {
    var lat = latestUpTo(date), sc = {};
    ITEMS.forEach(function (it) { sc[it.key] = lat[it.key] ? score(it.key, lat[it.key].raw) : null; });
    return { latest: lat, scores: sc, garjas: N.garjasFrom(sc) };
  }
  function isComplete(items) { return ITEMS.every(function (it) { return items[it.key] != null; }); }
  function itemSeries(key) { return sortedLogs().filter(function (l) { return l.items[key] != null; }).map(function (l) { return { date: l.date, s: score(key, l.items[key]) }; }); }
  function garjasSeries() {
    var dates = []; sortedLogs().forEach(function (l) { if (dates.indexOf(l.date) < 0) dates.push(l.date); });
    return dates.map(function (d) { return { date: d, s: currentScores(d).garjas }; }).filter(function (p) { return p.s != null; });
  }
  function trend(series) {
    var pts = series.filter(function (p) { return dayDiff(p.date, todayStr()) <= 60; });
    if (pts.length < 3) return null;
    var x0 = pts[0].date, n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { var x = dayDiff(x0, p.date); sx += x; sy += p.s; sxx += x * x; sxy += x * p.s; });
    var den = n * sxx - sx * sx; if (!den) return null;
    return (n * sxy - sx * sy) / den * 7;
  }
  function daysToTest() { return S.profil && S.profil.testDate ? dayDiff(todayStr(), S.profil.testDate) : null; }
  function forecastText(series) {
    var tg = target();
    if (!series.length) return 'Belum ada data.';
    var last = series[series.length - 1].s;
    if (last >= tg) return 'Sudah mencapai target. Pertahankan dengan 1–2 sesi per minggu dan alihkan tenaga ke item yang masih kurang.';
    var w = trend(series);
    if (w == null) return 'Catat minimal 3 kali dalam 2 bulan agar aplikasi bisa memperkirakan kapan target tercapai.';
    if (w <= 0.15) return 'Belum terlihat tren naik. Ikuti program di menu Program dan catat hasilnya secara rutin.';
    var weeks = Math.ceil((tg - last) / w);
    var t = 'Dengan laju sekarang (+' + fmtNum(w, 1) + ' poin/minggu), target ' + fmtNum(tg, 0) + ' tercapai sekitar ' + weeks + ' minggu lagi';
    var dl = daysToTest();
    if (dl != null && dl > 0) return t + (weeks * 7 <= dl ? ', sebelum hari tes.' : ', melewati hari tes (' + Math.ceil(dl / 7) + ' minggu lagi). Butuh percepatan.');
    return t + '.';
  }
  function streak() {
    var set = {}; S.catatan.forEach(function (l) { set[l.date] = 1; });
    var d = new Date(), n = 0;
    if (!set[todayStr()]) d.setDate(d.getDate() - 1);
    while (set[dstr(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function ringkasan() {
    var c = currentScores(), logs = sortedLogs();
    return { jumlah: logs.length, garjas: c.garjas, terakhir: logs.length ? logs[logs.length - 1].date : '' };
  }
  function standarNote() {
    if (!CFG) return 'Standar nilai belum termuat dari server.';
    var m = S.profil && S.profil.matra, khusus = m && ITEMS.filter(function (it) { return N.pakaiTabelMatra(it.key, gender(), m); }).length;
    var awal = khusus ? 'Memakai tabel khusus TNI ' + esc(m) + (khusus < ITEMS.length ? ' untuk ' + khusus + ' item, sisanya tabel umum' : '') + '. ' : '';
    return awal + standarNoteDasar();
  }
  function standarNoteDasar() {
    if (CFG.standarResmi) return 'Standar nilai resmi' + (CFG.sumberStandar ? ' (sumber: ' + esc(CFG.sumberStandar) + ')' : '') + '.';
    if (CFG.sumberStandar) return 'Standar nilai: ' + esc(CFG.sumberStandar) + '. Belum ditandai resmi oleh admin.';
    return 'Tabel nilai masih contoh, belum tabel resmi.';
  }

  /* ---------------- Ikon & navigasi ---------------- */
  var IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    plus: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M12 8v8M8 12h8"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5 1 1 1.5 2 1.5 3 0-3 .5-5.5 1.5-7.5z"/>',
    trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
    share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 3v12M7 8l5-5 5 5"/>',
    back: '<path d="m15 18-6-6 6-6"/>'
  };
  function icon(n, size) { return '<svg aria-hidden="true" width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; }
  var TABS = [['beranda', 'Beranda', 'home'], ['catat', 'Catat', 'plus'], ['progres', 'Progres', 'chart'], ['peringkat', 'Peringkat', 'trophy'], ['program', 'Program', 'cal'], ['profil', 'Profil', 'user']];
  function renderNav() {
    $('#nav').innerHTML = TABS.map(function (t) { return '<button type="button" data-tab="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[2]) + '<span>' + t[1] + '</span></button>'; }).join('');
  }
  function go(t) {
    tab = t;
    if (t === 'peringkat') muatLB(false);
    if (t === 'battle') { muatBattle(false); muatLB(false); }
    if (t === 'bagikan') siapkanBagikan();
    render(); window.scrollTo(0, 0);
  }

  /* ---------------- Anti salah (poka-yoke) ---------------- */
  // Batas wajar manusia untuk tes 1 menit / 12 menit. Di luar ini tidak ditolak, tetapi diminta konfirmasi.
  var WAJAR = {
    lari: { Pria: [800, 4500], Wanita: [600, 3800] }, pullup: { Pria: [0, 45], Wanita: [0, 100] },
    situp: { Pria: [0, 80], Wanita: [0, 80] }, pushup: { Pria: [0, 90], Wanita: [0, 80] }, shuttle: { Pria: [12, 35], Wanita: [12, 40] }
  };
  var DOMAIN_UMUM = ['gmail.com', 'yahoo.com', 'yahoo.co.id', 'hotmail.com', 'outlook.com', 'icloud.com', 'ymail.com', 'live.com', 'outlook.co.id'];
  function jarakEdit(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // Menyarankan perbaikan salah ketik domain email yang umum (gmial.com, gmail.con, yaho.com, ...).
  function saranEmail(e) {
    var at = e.lastIndexOf('@'); if (at < 1) return null;
    var dom = e.slice(at + 1); if (DOMAIN_UMUM.indexOf(dom) >= 0) return null;
    var best = null, bd = 9;
    DOMAIN_UMUM.forEach(function (d) { var k = jarakEdit(dom, d); if (k < bd) { bd = k; best = d; } });
    return bd > 0 && bd <= 2 ? e.slice(0, at + 1) + best : null;
  }
  function catatanTerakhir(key) {
    var ser = sortedLogs().filter(function (l) { return l.items[key] != null; });
    return ser.length ? ser[ser.length - 1].items[key] : null;
  }
  // Pemeriksaan sebelum menyimpan catatan: mengoreksi salah satuan, menolak yang mustahil, dan meminta konfirmasi untuk yang janggal.
  function periksaCatatan(items, tanggal) {
    var tolak = [], tanya = [], g = gender();
    if (items.lari != null && items.lari > 0 && items.lari < 100) {
      var m = Math.round(items.lari * 1000);
      if (confirm('Jarak lari tertulis ' + fmtNum(items.lari, 2) + '. Maksudmu ' + fmtNum(m, 0) + ' meter?\n\nTekan OK untuk memakai ' + fmtNum(m, 0) + ' m.')) { items.lari = m; var f = $('#f-lari'); if (f) f.value = m; draft.items.lari = m; }
      else tolak.push('jarak lari harus diisi dalam meter, misalnya 2400');
    }
    ['pullup', 'situp', 'pushup'].forEach(function (k) {
      if (items[k] != null && Math.round(items[k]) !== items[k]) tolak.push(itemLabel(ITEMS.filter(function (i) { return i.key === k; })[0]).toLowerCase() + ' harus bilangan bulat');
    });
    if (tolak.length) return { ok: false, pesan: 'Periksa lagi: ' + tolak.join('; ') + '.' };
    ITEMS.forEach(function (it) {
      var vfa = verifAktif(it.key);
      var v = items[it.key]; if (v == null || (vfa && vfa.terverifikasi !== false)) return;
      var w = WAJAR[it.key][g], lbl = itemLabel(it);
      if (v < w[0] || v > w[1]) tanya.push(lbl + ' ' + fmtNum(v, 1) + ' ' + it.unit + ' di luar kisaran wajar (' + fmtNum(w[0], 0) + '–' + fmtNum(w[1], 0) + ')');
      var prev = catatanTerakhir(it.key);
      if (prev != null && prev > 0) {
        var lonjak = it.key === 'shuttle' ? prev - v >= 3 : it.key === 'lari' ? v - prev >= 600 : (v - prev >= 8 && v >= prev * 1.6);
        if (lonjak) tanya.push(lbl + ' naik jauh dari catatan terakhir (' + fmtNum(prev, 1) + ' → ' + fmtNum(v, 1) + ')');
      }
    });
    if (tanggal < todayStr() && dayDiff(tanggal, todayStr()) > 60) tanya.push('tanggal latihan lebih dari 60 hari yang lalu');
    if (tanya.length && !confirm('Pastikan tidak salah ketik:\n\n• ' + tanya.join('\n• ') + '\n\nTekan OK bila datanya sudah benar.')) return { ok: false, pesan: 'Penyimpanan dibatalkan. Periksa lagi angkanya.' };
    return { ok: true };
  }

  /* ---------- Antrean simpan saat koneksi putus ---------- */
  function antre() { var a = lsGet(LS_ANTRE); return Array.isArray(a) ? a : []; }
  function setAntre(a) { lsSet(LS_ANTRE, a.length ? a : null); }
  var mengirim = false;
  function kirimAntre() {
    if (mengirim || !S.email || !navigator.onLine && navigator.onLine !== undefined) return;
    var a = antre().filter(function (x) { return x.email === S.email; });
    if (!a.length) return;
    mengirim = true;
    var x = a[0];
    api('tambahCatatan', { email: x.email, catatan: x.catatan, ringkasan: ringkasan() }).then(function () {
      setAntre(antre().filter(function (y) { return y.catatan.id !== x.catatan.id; }));
      S.catatan.forEach(function (l) { if (l.id === x.catatan.id) delete l.tertunda; }); simpanSesi(); LB.at = 0;
      mengirim = false;
      if (!antre().some(function (y) { return y.email === S.email; })) { toast('Catatan yang tertunda sudah terkirim.'); softRender(); }
      else kirimAntre();
    }, function (e) {
      mengirim = false;
      if (e && (e.kode === 'data_tidak_valid' || e.kode === 'tidak_ditemukan')) { setAntre(antre().filter(function (y) { return y.catatan.id !== x.catatan.id; })); }
    });
  }
  function gabungAntre(catatanServer) {
    var ids = {}; catatanServer.forEach(function (l) { ids[l.id] = 1; });
    var tertunda = antre().filter(function (x) { return x.email === S.email && !ids[x.catatan.id]; }).map(function (x) {
      var c = x.catatan; return { id: c.id, date: c.date, items: c.items, sim: c.sim, note: c.note, tertunda: true };
    });
    return catatanServer.concat(tertunda);
  }
  window.addEventListener('online', function () { kirimAntre(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) kirimAntre(); });

  /* ---------------- Hasil dari tes kamera / lari GPS ---------------- */
  var LS_KIRIM = 'pelatih-garjas-kirim-v1';
  function terimaHasil() {
    var k = lsGet(LS_KIRIM);
    if (!k || !S.email) return;
    lsSet(LS_KIRIM, null);
    var it = ITEMS.filter(function (i) { return i.key === k.key; })[0];
    if (!it || !isFinite(k.nilai) || Date.now() - (Number(k.waktu) || 0) > 6 * 3600 * 1000) return;
    draft.items[k.key] = k.nilai;
    var SUMBER = {
      gps: { sumber: 'GPS', label: 'Terverifikasi GPS', catatan: 'Terverifikasi GPS', terverifikasi: true, nama: 'lari GPS' },
      kamera: { sumber: 'kamera', label: 'Terverifikasi kamera', catatan: 'Terverifikasi kamera', terverifikasi: true, nama: 'tes kamera' },
      gpx: { sumber: 'GPX', label: 'Dari file GPX', catatan: 'Dari file GPX' + (k.jam ? ' (mulai ' + k.jam + ')' : ''), terverifikasi: false, nama: 'file GPX' },
      putaran: { sumber: 'putaran', label: 'Hitung putaran', catatan: 'Stopwatch + hitung putaran (' + (k.putaran != null ? k.putaran + ' × ' + k.lintasan + ' m' : 'mandiri') + ')', terverifikasi: false, nama: 'stopwatch' }
    };
    var info = SUMBER[k.sumber] || SUMBER.kamera;
    draft.verif = draft.verif || {}; draft.verif[k.key] = Object.assign({ nilai: k.nilai }, info);
    if (k.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(k.tanggal) && k.tanggal <= todayStr()) draft.date = k.tanggal;
    tab = 'catat';
    setTimeout(function () {
      toast('Hasil ' + info.nama + ' sudah diisikan' + (k.tanggal && k.tanggal !== todayStr() ? ' dengan tanggal ' + fmtDate(k.tanggal) : '') + (k.gender && k.gender !== gender() ? ', tetapi jenis kelamin saat tes berbeda dengan profilmu. Periksa lagi' : '') + '. Tekan Simpan catatan.');
    }, 300);
  }
  function verifAktif(key) { var v = draft.verif && draft.verif[key]; return v && draft.items[key] === v.nilai ? v : null; }

  /* ---------------- Syarat pendaftaran (pop-up bukti) ---------------- */
  var bukti = [], modalSyarat = false, syaratDibuka = false, syaratErr = '';
  function daftarSyarat() { return CFG && Array.isArray(CFG.syarat) ? CFG.syarat : null; }
  function buktiLengkap() { var sy = daftarSyarat(); return !sy || sy.every(function (_, i) { return !!bukti[i]; }); }
  function kompres(file) {
    return new Promise(function (res, rej) {
      if (!file || !/^image\//.test(file.type)) { rej(new Error('File harus berupa gambar, misalnya screenshot.')); return; }
      if (file.size > 15 * 1024 * 1024) { rej(new Error('Ukuran gambar maksimal 15 MB.')); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1280, sk = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * sk)); c.height = Math.max(1, Math.round(img.height * sk));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var d = c.toDataURL('image/jpeg', 0.8);
        res({ preview: d, mime: 'image/jpeg', data: d.split(',')[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Gambar tidak bisa dibaca. Coba ambil screenshot lagi.')); };
      img.src = url;
    });
  }
  function syaratListHTML() {
    var sy = daftarSyarat() || [], n = bukti.filter(Boolean).length, lengkap = buktiLengkap();
    var h = '<ol class="syarat-list">';
    sy.forEach(function (x, i) {
      var b = bukti[i];
      h += '<li><div style="font-weight:600">' + esc(x.teks) + '</div>' + (x.link ? '<a class="inline small" href="' + esc(x.link) + '" target="_blank" rel="noopener">Buka tautan</a>' : '');
      h += '<label class="drop' + (b ? ' done' : '') + '"><input type="file" accept="image/*" data-bukti="' + i + '"><span class="thumb">' + (b ? '<img src="' + b.preview + '" alt="Bukti syarat ' + (i + 1) + '">' : '+') + '</span><span>' + (b ? 'Bukti terunggah. Ketuk untuk mengganti.' : 'Unggah screenshot bukti') + '</span></label></li>';
    });
    h += '</ol><div id="syarat-err" class="small warn" role="alert">' + esc(syaratErr) + '</div>';
    h += '<div class="small" style="font-weight:700;color:' + (lengkap ? 'var(--good)' : 'var(--muted)') + '">Bukti terunggah: ' + n + ' dari ' + sy.length + '</div>';
    return h;
  }
  function segarkanSyarat() { if (modalSyarat) renderModal(); else render(); }
  function renderModal() {
    var el = $('#modal'); if (!el) return;
    var sy = daftarSyarat();
    if (!modalSyarat || !sy) { el.innerHTML = ''; document.body.style.overflow = ''; return; }
    var n = bukti.filter(Boolean).length, lengkap = buktiLengkap();
    var h = '<div class="modal-bg"><div class="modal card stack" role="dialog" aria-modal="true" aria-labelledby="syarat-judul">';
    h += '<div class="row" style="align-items:flex-start"><div><h2 id="syarat-judul">Syarat pendaftaran SIGAP</h2><p class="small muted" style="margin:4px 0 0">Penuhi syarat berikut, lalu unggah satu screenshot bukti untuk setiap syarat.</p></div><button type="button" class="btn ghost small" id="syarat-tutup" aria-label="Tutup" style="padding:0 12px">✕</button></div>';
    h += '<ol class="syarat-list">';
    sy.forEach(function (x, i) {
      var b = bukti[i];
      h += '<li><div style="font-weight:600">' + esc(x.teks) + '</div>' + (x.link ? '<a class="inline small" href="' + esc(x.link) + '" target="_blank" rel="noopener">Buka tautan</a>' : '');
      h += '<label class="drop' + (b ? ' done' : '') + '"><input type="file" accept="image/*" data-bukti="' + i + '"><span class="thumb">' + (b ? '<img src="' + b.preview + '" alt="Bukti syarat ' + (i + 1) + '">' : '+') + '</span><span>' + (b ? 'Bukti terunggah. Ketuk untuk mengganti.' : 'Unggah screenshot bukti') + '</span></label></li>';
    });
    h += '</ol><div id="syarat-err" class="small warn" role="alert">' + esc(syaratErr) + '</div>';
    h += '<div class="small" style="font-weight:700;color:' + (lengkap ? 'var(--good)' : 'var(--muted)') + '">Bukti terunggah: ' + n + ' dari ' + sy.length + '</div>';
    h += '<button class="btn" id="syarat-lanjut"' + (lengkap ? '' : ' disabled') + '>' + (lengkap ? 'Lanjut isi data diri' : 'Lengkapi semua bukti dulu') + '</button></div></div>';
    el.innerHTML = h; document.body.style.overflow = 'hidden';
  }
  function bukaSyarat() { modalSyarat = true; syaratDibuka = true; syaratErr = ''; renderModal(); setTimeout(function () { var f = $('#syarat-tutup'); if (f) f.focus(); }, 30); }
  function tutupSyarat() { modalSyarat = false; renderModal(); render(); }
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t || t.dataset == null || t.dataset.bukti == null || !t.files || !t.files[0]) return;
    var i = +t.dataset.bukti; syaratErr = '';
    kompres(t.files[0]).then(function (b) {
      var kembar = bukti.some(function (x, j) { return x && j !== i && x.data === b.data; });
      if (kembar) { syaratErr = 'Screenshot ini sama dengan bukti syarat lain. Unggah bukti yang sesuai untuk setiap syarat.'; segarkanSyarat(); return; }
      bukti[i] = b; segarkanSyarat();
    }, function (err) { syaratErr = err.message; segarkanSyarat(); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && modalSyarat) tutupSyarat(); });
  function statusSyarat() {
    if (!S.email && lsGet(LS_ARENA_LINK) && !buktiLengkap()) return '<div class="note goodbox small">Kamu diajak duel live! Isi data singkat lalu langsung duel. Bukti syarat pendaftaran diminta setelah duel pertama.</div>';
    var sy = daftarSyarat();
    if (!sy) return '<div class="note small">Memuat syarat pendaftaran…</div>';
    if (!sy.length) return '';
    var n = bukti.filter(Boolean).length, lengkap = buktiLengkap();
    return '<div class="note ' + (lengkap ? 'goodbox' : 'warnbox') + ' small" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span>' + (lengkap ? 'Bukti syarat lengkap (' + n + '/' + sy.length + ')' : 'Syarat pendaftaran: ' + n + ' dari ' + sy.length + ' bukti terunggah') + '</span><button type="button" class="btn ghost small" id="syarat-buka">' + (lengkap ? 'Ubah' : 'Unggah bukti') + '</button></div>';
  }

  /* ---------------- Pendaftaran & masuk ---------------- */
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function normEmail(v) { return String(v || '').trim().toLowerCase(); }
  function normWa(v) { var d = String(v || '').replace(/\D/g, ''); if (d.indexOf('0') === 0) d = '62' + d.slice(1); else if (d.indexOf('8') === 0) d = '62' + d; return d; }
  function opt(list, cur) { return list.map(function (m) { return '<option' + (cur === m ? ' selected' : '') + '>' + m + '</option>'; }).join(''); }

  function profileForm(p, isNew) {
    p = p || {};
    var h = '';
    h += '<label class="f">Nama lengkap *<input class="in" id="p-name" maxlength="80" autocomplete="name" value="' + esc(p.name) + '"></label>';
    if (isNew) h += '<label class="f">Email terdaftar di aplikasi JadiPrajurit *<input class="in" type="email" id="p-email" maxlength="120" autocomplete="email" inputmode="email" value="' + esc(p.email) + '" placeholder="nama@email.com"><span class="tiny muted" style="font-weight:500">Pakai email yang sama dengan akun JadiPrajurit-mu. Email ini dipakai untuk masuk.</span></label>';
    else h += '<div class="f">Email<span class="small" style="font-weight:500">' + esc(p.email) + '</span><span class="tiny muted" style="font-weight:500">Untuk mengganti email, hubungi admin.</span></div>';
    h += '<div class="grid2"><label class="f">Jenis kelamin *<select class="in" id="p-gender">' + opt(['Pria', 'Wanita'], p.gender || 'Pria') + '</select></label><label class="f">Usia *<input class="in" type="number" inputmode="numeric" id="p-age" min="15" max="40" value="' + esc(p.age) + '"></label></div>';
    h += '<div class="grid2"><label class="f">Tinggi (cm)<input class="in" type="number" inputmode="numeric" id="p-height" min="120" max="220" value="' + esc(p.height) + '"></label><label class="f">Berat (kg)<input class="in" type="number" inputmode="numeric" id="p-weight" min="30" max="160" value="' + esc(p.weight) + '"></label></div>';
    h += '<label class="f">Domisili (kota/kabupaten)<input class="in" id="p-domisili" maxlength="60" value="' + esc(p.domisili) + '" placeholder="Misal: Kota Bandung"></label>';
    h += '<label class="f">Matra *<select class="in" id="p-matra">' + opt(['AD', 'AL', 'AU'], p.matra || 'AD') + '</select></label>';
    h += '<div class="grid2"><label class="f">Tanggal tes jasmani<input class="in" type="date" id="p-test" value="' + esc(p.testDate) + '"></label><label class="f">Target nilai<input class="in" type="number" inputmode="numeric" id="p-target" min="1" max="100" value="' + esc(p.target || (CFG && CFG.targetDefault) || 100) + '"></label></div>';
    if (!isNew) h += '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;min-height:44px"><input type="checkbox" id="p-lb" style="width:22px;height:22px;flex:0 0 auto;margin-top:1px"' + (p.tampilLeaderboard !== false ? ' checked' : '') + '> <span>Tampilkan nama depan dan nilaiku di Peringkat casis</span></label>';
    if (isNew) h += '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;min-height:44px"><input type="checkbox" id="p-consent" style="width:22px;height:22px;flex:0 0 auto;margin-top:1px"> <span>Saya setuju data diri dan hasil latihan saya disimpan dan dikelola tim JadiPrajurit. Nama depan dan nilai saya dapat tampil di Peringkat casis (bisa dimatikan di Profil).</span></label>';
    return h;
  }
  function readProfileForm(isNew) {
    var o = {
      name: $('#p-name').value.trim().replace(/\s+/g, ' ').slice(0, 80),
      email: isNew ? normEmail($('#p-email').value) : S.email,
      gender: $('#p-gender').value, age: $('#p-age').value, height: $('#p-height').value, weight: $('#p-weight').value,
      domisili: $('#p-domisili').value.trim().slice(0, 60), matra: $('#p-matra').value,
      testDate: $('#p-test').value
    };
    var t = num($('#p-target').value); o.target = t != null && t > 0 && t <= 100 ? t : 100;
    var err = [];
    if (o.name.length < 3) err.push('nama lengkap');
    if (isNew && !EMAIL_RE.test(o.email)) err.push('email yang valid');
    var a = num(o.age); if (a == null || a < 15 || a > 40) err.push('usia (15–40 tahun)');
    var hg = num(o.height); if (o.height !== '' && (hg == null || hg < 120 || hg > 220)) err.push('tinggi badan (120–220 cm)');
    var wg = num(o.weight); if (o.weight !== '' && (wg == null || wg < 30 || wg > 160)) err.push('berat badan (30–160 kg)');
    if (isNew) { o.consent = $('#p-consent').checked; if (!o.consent) err.push('persetujuan penyimpanan data'); }
    else o.tampilLeaderboard = $('#p-lb').checked;
    return { data: o, err: err };
  }
  function brand() { return '<div class="brand"><img class="logo-terang" src="assets/logo-jadiprajurit.png" alt="JadiPrajurit" height="34"><img class="logo-gelap" src="assets/logo-jadiprajurit-terang.png" alt="JadiPrajurit" height="34"><span>SIGAP</span></div>'; }
  function jalurCepat() { return !!lsGet(LS_ARENA_LINK) && !buktiLengkap(); }
  function perluBuktiDaftar() { return !jalurCepat() && !!(daftarSyarat() && daftarSyarat().length); }
  function langkah(n, total, label) { return '<div class="langkah"><span>Langkah ' + n + ' dari ' + total + '</span><b>' + esc(label) + '</b><div class="langkah-bar"><i style="width:' + Math.round(n / total * 100) + '%"></i></div></div>'; }
  function viewAwal() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Selamat datang di SIGAP</h1><div class="sub">Sigap fisik, siap tes. Catat latihan, lihat prediksi nilai jasmanimu, dan duel bareng teman.</div></div></div>';
    if (authMsg) h += '<div class="note goodbox small">' + esc(authMsg) + '</div>';
    h += '<div class="card stack"><button class="btn" id="go-daftar">Buat akun baru</button><button class="btn ghost" id="go-login">Masuk</button>';
    h += '<p class="tiny muted" style="margin:0;text-align:center">Sudah pernah daftar? Pilih Masuk dan cukup isi email.</p></div>';
    return h;
  }
  function viewDaftar() {
    var total = perluBuktiDaftar() ? 2 : 1;
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Buat akun</h1>' + langkah(1, total, 'Isi data diri') + '</div></div>';
    if (jalurCepat()) h += '<div class="note goodbox small">Kamu diajak duel live! Isi data singkat lalu langsung duel. Bukti syarat pendaftaran diminta setelah duel pertama.</div>';
    h += '<div class="card stack"><p class="tiny muted" style="margin:0">Kolom bertanda * wajib diisi.</p>' + profileForm(draftDaftar, true);
    h += '<div id="auth-msg" class="small warn" role="alert">' + esc(authMsg) + '</div>';
    h += '<button class="btn" id="do-register"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Mendaftarkan…' : total === 2 ? 'Lanjut ke bukti syarat' : 'Daftar &amp; mulai') + '</button></div>';
    h += '<p class="small muted" style="text-align:center;margin:0"><button type="button" class="linkbtn" id="go-awal">Kembali</button></p>';
    return h;
  }
  function viewSyaratDaftar() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Buat akun</h1>' + langkah(2, 2, 'Lengkapi bukti syarat') + '</div></div>';
    if (!daftarSyarat()) return h + '<div class="card" style="text-align:center"><span class="spin" aria-hidden="true"></span> Memuat syarat pendaftaran…</div>';
    h += '<div class="card stack"><p class="small muted" style="margin:0">Penuhi syarat berikut, lalu unggah satu screenshot bukti untuk setiap syarat.</p>' + syaratListHTML();
    h += '<div id="auth-msg" class="small warn" role="alert">' + esc(authMsg) + '</div>';
    h += '<button class="btn" id="do-daftar-final"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Mendaftarkan…' : 'Daftar &amp; mulai') + '</button></div>';
    h += '<p class="small muted" style="text-align:center;margin:0"><button type="button" class="linkbtn" id="go-daftar">Kembali ke data diri</button></p>';
    return h;
  }
  var draftDaftar = {};
  function viewLogin() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Masuk</h1><div class="sub">Cukup masukkan email yang kamu daftarkan.</div></div></div>';
    h += '<div class="card stack"><label class="f">Email terdaftar<input class="in" type="email" id="login-email" inputmode="email" autocomplete="email" placeholder="nama@email.com" value="' + esc(draftLogin) + '"></label>';
    h += '<div id="auth-msg" class="small warn" role="alert">' + esc(authMsg) + '</div>';
    h += '<button class="btn" id="do-login"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Memeriksa…' : 'Masuk') + '</button></div>';
    h += '<p class="small muted" style="text-align:center;margin:0">Belum punya akun? <button type="button" class="linkbtn" style="color:var(--good)" id="go-daftar">Buat akun baru</button></p>';
    return h;
  }
  var draftLogin = '';
  function setAuthMsg(t) { authMsg = t; var m = $('#auth-msg'); if (m) m.textContent = t; }
  var dataSiap = null;
  function doRegister() {
    var r = readProfileForm(true);
    draftDaftar = r.data;
    if (r.err.length) { setAuthMsg('Lengkapi: ' + r.err.join(', ') + '.'); return; }
    var cepat = jalurCepat();
    if (!cepat && !daftarSyarat()) { setAuthMsg('Syarat pendaftaran belum termuat. Periksa koneksi internet lalu muat ulang halaman.'); return; }
    var saran = saranEmail(r.data.email);
    if (saran && confirm('Apakah maksudmu ' + saran + '?\n\nTekan OK untuk memakai ' + saran + ', atau Batal untuk tetap memakai ' + r.data.email + '.')) { r.data.email = saran; var pe = $('#p-email'); if (pe) pe.value = saran; draftDaftar.email = saran; }
    if (!confirm('Periksa data utamamu sebelum daftar:\n\nEmail (untuk masuk): ' + r.data.email + '\nJenis kelamin: ' + r.data.gender + '\nUsia: ' + r.data.age + ' tahun\nMatra: TNI ' + r.data.matra + '\n\nJenis kelamin dan usia menentukan tabel nilai. Sudah benar?')) { setAuthMsg('Silakan periksa lagi datamu, lalu tekan Daftar.'); return; }
    if (r.data.testDate && r.data.testDate < todayStr()) { setAuthMsg('Tanggal tes jasmani sudah lewat. Kosongkan atau isi tanggal tes berikutnya.'); return; }
    dataSiap = r;
    if (!cepat && daftarSyarat().length) { authView = 'syarat'; authMsg = ''; render(); window.scrollTo(0, 0); return; }
    kirimDaftar();
  }
  function kirimDaftar() {
    var r = dataSiap; if (!r) { authView = 'daftar'; render(); return; }
    var cepat = jalurCepat();
    if (!cepat && !buktiLengkap()) { setAuthMsg('Unggah dulu bukti untuk setiap syarat pendaftaran.'); return; }
    busy = true; authMsg = ''; render();
    var ref = lsGet(LS_REF);
    if (ref) r.data.ref = ref;
    var kirimBukti = cepat ? [] : (daftarSyarat() || []).map(function (_, i) { return { mime: bukti[i].mime, data: bukti[i].data }; });
    api('daftar', { profil: r.data, bukti: kirimBukti, cepat: cepat }).then(function (j) {
      lsSet(LS_REF, null); bukti = [];
      var al = lsGet(LS_ARENA_LINK);
      if (al) { S = { email: j.profil.email, profil: j.profil, catatan: [] }; simpanSesi(); lsSet(LS_ARENA_LINK, null); location.href = 'kamera.html?arena=' + al; return; }
      busy = false; S = { email: j.profil.email, profil: j.profil, catatan: j.catatan || [] }; simpanSesi();
      draftDaftar = {}; tab = 'beranda'; sambut = true; render(); toast('Pendaftaran berhasil!');
    }, function (e) {
      busy = false; authMsg = pesanError(e);
      if (e && e.kode === 'email_terdaftar') { authView = 'login'; draftLogin = r.data.email; }
      render();
    });
  }
  function doLogin() {
    var e = normEmail($('#login-email').value); draftLogin = e;
    if (!EMAIL_RE.test(e)) { setAuthMsg('Masukkan email yang valid.'); return; }
    busy = true; authMsg = ''; render();
    api('masuk', { email: e }).then(function (j) {
      busy = false; S = { email: j.profil.email, profil: j.profil, catatan: j.catatan || [] }; S.catatan = gabungAntre(S.catatan); simpanSesi(); kirimAntre(); terimaHasil(); var alg = lsGet(LS_ARENA_LINK); if (alg) { lsSet(LS_ARENA_LINK, null); location.href = 'kamera.html?arena=' + alg; return; } if (lsGet(LS_BATTLE)) prosesBattle(); var blk = lsGet(LS_BATTLE_LINK); if (blk) { muatLihatBattle(blk); tab = 'battle'; muatLB(false); } muatBattle(true);
      tab = 'beranda'; render(); toast('Selamat datang kembali, ' + String(j.profil.name).split(' ')[0] + '!');
    }, function (err) {
      busy = false; authMsg = pesanError(err);
      var saran = err && err.kode === 'tidak_ditemukan' ? saranEmail(e) : null;
      if (saran) { authMsg = 'Email ' + e + ' tidak ditemukan. Mungkin maksudmu ' + saran + '? Emailnya sudah kami isikan, tekan Masuk lagi.'; draftLogin = saran; }
      render();
    });
  }
  function logout() { S = { email: null, profil: null, catatan: [] }; simpanSesi(); authView = 'awal'; authMsg = ''; draftLogin = ''; render(); toast('Kamu sudah keluar.'); }

  /* ---------------- Beranda ---------------- */
  function viewBeranda() {
    var p = S.profil, cur = currentScores(), tg = target(), dl = daysToTest(), st = streak();
    var h = brand() + '<div class="top" style="margin-top:-4px"><div><div class="sub">Halo, ' + esc(String(p.name).split(' ')[0]) + '</div><h1>' + (dl != null ? (dl > 0 ? 'Tes jasmani ' + dl + ' hari lagi' : dl === 0 ? 'Hari ini tes jasmani. Semangat!' : 'Tanggal tes sudah lewat') : 'SIGAP') + '</h1><div class="sub">' + esc('TNI ' + p.matra + ', ' + p.gender + (p.age ? ', ' + p.age + ' tahun' : '')) + '</div></div></div>';
    if (!S.catatan.length) {
      h += '<div class="card stack"><h2>Mulai dengan tes awal</h2><p class="small muted" style="margin:0">Lakukan dan catat lari 12 menit, ' + esc(itemLabel(ITEMS[1]).toLowerCase()) + ', sit-up, push-up, dan shuttle run sebagai titik mulai. Gunakan stopwatch di menu Catat supaya waktunya sama seperti tes.</p><button class="btn" data-go="catat">Catat tes awal</button></div>';
      if (!p.testDate) h += '<div class="card stack"><p class="small muted" style="margin:0">Isi tanggal tes jasmani di menu Profil supaya hitung mundur dan program latihan menyesuaikan.</p><button class="btn ghost" data-go="profil">Isi tanggal tes</button></div>';
      return h + kartuBattleBeranda() + adminCard() + grupCard();
    }
    var g = cur.garjas, gap = g != null ? Math.round((tg - g) * 10) / 10 : null;
    var weak = ITEMS.filter(function (it) { return cur.scores[it.key] != null && cur.scores[it.key] < tg; }).sort(function (a, b) { return cur.scores[a.key] - cur.scores[b.key]; });
    h += '<section class="hero" aria-label="Prediksi nilai jasmani"><div class="row" style="align-items:flex-start"><div><div class="soft">Prediksi nilai jasmani</div><div style="display:flex;align-items:baseline;gap:8px"><span class="big">' + fmtNum(g, 1) + '</span><span class="soft">/ target ' + fmtNum(tg, 0) + '</span></div></div>' + (st > 0 ? '<span class="pill">' + icon('flame', 15) + st + ' hari beruntun</span>' : '') + '</div>';
    h += '<div class="hbar" role="img" aria-label="Nilai ' + fmtNum(g, 1) + ' dari target ' + fmtNum(tg, 0) + '"><i style="width:' + Math.max(2, Math.min(100, g || 0)) + '%"></i><b style="left:calc(' + Math.min(100, tg) + '% - 1px)"></b></div>';
    h += '<div class="soft" style="color:var(--hero-ink)">' + (gap > 0 ? 'Kurang ' + fmtNum(gap, 1) + ' poin.' + (weak.length ? ' Fokus utama: ' + weak.slice(0, 2).map(function (it) { return '<b>' + esc(itemLabel(it).toLowerCase()) + '</b>'; }).join(' dan ') + '.' : '') : 'Nilaimu sudah di atas target. Pertahankan konsistensi sampai hari tes.') + '</div>';
    if (Object.keys(cur.latest).length < ITEMS.length) h += '<div class="soft">Sebagian item belum pernah dicatat, jadi prediksi belum lengkap.</div>';
    var sy = LB.data && LB.data.saya;
    h += '<div class="row" style="align-items:center"><span class="soft">' + (sy && sy.rankNilai ? 'Peringkat #' + sy.rankNilai + ' dari ' + LB.data.totalNilai + ' casis' : (sy && !sy.lengkap ? 'Catat kelima item untuk masuk peringkat' : '')) + '</span><button type="button" class="btn small" data-go="bagikan" style="background:var(--hero-ink);color:var(--hero)">' + icon('share', 18) + 'Bagikan</button></div>';
    h += '</section>';
    h += kartuBagikanLatihan();
    h += kartuBattleBeranda();

    var nAntre = S.catatan.filter(function (l) { return l.tertunda; }).length;
    if (nAntre) h += '<div class="note warnbox small">' + nAntre + ' catatan tersimpan di HP dan menunggu dikirim. Pastikan koneksi internet menyala.</div>';
    var plan = programSekarang(), idx = (new Date().getDay() + 6) % 7, today = plan.hari[idx];
    h += '<div class="card stack"><div class="row"><h2>Latihan hari ini</h2>' + (today.durasi ? '<span class="small muted">± ' + today.durasi + ' menit</span>' : '') + '</div>';
    h += '<div class="display" style="font-weight:700;font-size:17px">' + esc(today.sesi) + '</div>';
    h += '<div class="btns"><button class="btn" data-go="catat">Catat hasil latihan</button><button class="btn ghost" data-go="program">Lihat program</button></div></div>';

    h += '<div class="card"><div class="row" style="padding-bottom:4px"><h2>Status per item</h2><span class="tiny muted">garis = target</span></div>';
    ITEMS.forEach(function (it) {
      var l = cur.latest[it.key], s = cur.scores[it.key], ok = s != null && s >= tg;
      h += '<div class="item"><div class="row"><span style="font-weight:600">' + esc(itemLabel(it)) + '</span><span class="small muted">' + (l ? fmtNum(l.raw, 1) + ' ' + it.unit + ' · <b class="' + (ok ? 'good' : 'warn') + '">Nilai ' + fmtNum(s, 0) + '</b>' : 'belum dicatat') + '</span></div>';
      h += '<div class="bar" aria-hidden="true"><i style="width:' + (s || 0) + '%;background:' + (ok ? 'var(--good-bar)' : 'var(--warn-bar)') + '"></i><b style="left:' + Math.min(100, tg) + '%"></b></div></div>';
    });
    h += '<p class="tiny muted" style="margin:8px 0 0">' + standarNote() + '</p></div>';
    return h + grupCard() + adminCard();
  }
  // Langkah sambutan setelah daftar: ajakan gabung grup dan konsultasi dengan admin (tidak wajib).
  var sambut = false;
  function linkChatAdmin() {
    var p = S.profil || {}, g = S.email ? currentScores().garjas : null;
    var teks = 'Halo ' + ((CFG && CFG.namaAdmin) || 'Admin JadiPrajurit') + ', saya ' + (p.name || '') + ' (' + (p.email || '') + '), peserta SIGAP TNI ' + (p.matra || '') + '. Saya ingin konsultasi persiapan tes jasmani.' + (g != null ? ' Prediksi nilai saya saat ini ' + fmtNum(g, 1) + '.' : '');
    return 'https://wa.me/' + CFG.waAdmin + '?text=' + encodeURIComponent(teks);
  }
  function perluLengkapiSyarat() { return !!(S.email && S.profil && S.profil.syaratBelum && daftarSyarat() && daftarSyarat().length); }
  function viewLengkapiSyarat() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Satu langkah lagi</h1><div class="sub">Seru kan duelnya? Untuk memakai semua fitur SIGAP, lengkapi dulu syarat pendaftaran berikut.</div></div></div>';
    h += '<div class="card stack">' + syaratListHTML() + '<div id="auth-msg" class="small warn" role="alert">' + esc(authMsg) + '</div><button class="btn" id="kirim-syarat"' + (busy ? ' disabled' : '') + '>' + (busy ? 'Mengirim…' : 'Kirim bukti syarat') + '</button></div>';
    return h;
  }
  function kirimSyarat() {
    if (!buktiLengkap()) { authMsg = 'Unggah dulu bukti untuk setiap syarat.'; render(); return; }
    busy = true; authMsg = ''; render();
    var kb = (daftarSyarat() || []).map(function (_, i) { return { mime: bukti[i].mime, data: bukti[i].data }; });
    api('lengkapiSyarat', { email: S.email, bukti: kb }).then(function (j) { busy = false; bukti = []; S.profil = j.profil; simpanSesi(); sambut = true; render(); toast('Terima kasih! Semua fitur SIGAP sudah terbuka.'); },
      function (e) { busy = false; authMsg = pesanError(e); render(); });
  }
  function perluSimpanAdmin() { return !!(sambut && S.email && CFG && (CFG.linkGrup || CFG.waAdmin)); }
  function viewSimpanAdmin() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Selamat datang di SIGAP, ' + esc(String(S.profil.name || '').split(' ')[0]) + '!</h1><div class="sub">Biar persiapanmu makin terarah, gabung bersama casis lain dan konsultasikan rencana latihanmu dengan admin.</div></div></div>';
    if (CFG.linkGrup) h += '<div class="card stack"><h2>Grup WhatsApp casis</h2><p class="small muted" style="margin:0">Info seleksi terbaru, jadwal, dan latihan bareng casis lain.</p><a class="btn" href="' + esc(CFG.linkGrup) + '" target="_blank" rel="noopener">Gabung grup WhatsApp</a></div>';
    if (CFG.waAdmin) h += '<div class="card stack"><h2>Konsultasi dengan admin</h2><p class="small muted" style="margin:0">Tanyakan program latihan, target nilai, atau persiapan seleksi. Pesannya sudah disiapkan, tinggal kirim.</p><a class="btn" href="' + esc(linkChatAdmin()) + '" target="_blank" rel="noopener">Chat admin untuk konsultasi</a></div>';
    h += '<button class="btn ghost" id="confirm-admin">Mulai pakai SIGAP</button>';
    return h;
  }
  function konfirmasiAdmin() { sambut = false; tab = 'beranda'; var blk = lsGet(LS_BATTLE_LINK); if (blk) { muatLihatBattle(blk); bukaBattle(); return; } muatBattle(true); render(); }
  function adminCard(judul) {
    if (!CFG || !CFG.waAdmin) return '';
    return '<div class="card stack"><h2>' + esc(judul || 'Konsultasi dengan admin') + '</h2><p class="small muted" style="margin:0">Bingung menyusun latihan atau ingin tahu peluangmu? Chat admin JadiPrajurit untuk konsultasi.</p><a class="btn ghost" href="' + esc(linkChatAdmin()) + '" target="_blank" rel="noopener">Chat admin untuk konsultasi</a></div>';
  }
  function grupCard() {
    if (!CFG || !CFG.linkGrup) return '';
    return '<div class="card stack"><h2>Grup casis</h2><p class="small muted" style="margin:0">Gabung grup WhatsApp untuk info seleksi dan latihan bareng casis lain.</p><a class="btn ghost" href="' + esc(CFG.linkGrup) + '" target="_blank" rel="noopener">Gabung grup WhatsApp</a></div>';
  }


  /* ---------------- Catat ---------------- */
  function viewCatat() {
    var h = '<div class="top"><div><h1>Catat latihan</h1><div class="sub">Isi hasil yang kamu lakukan hari ini. Item yang tidak dilatih boleh dikosongkan.</div></div></div>';
    h += viewTimer();
    h += '<div class="card stack"><div class="row"><h2>Catat lari 12 menit</h2><span class="tag good">Baru</span></div><p class="small muted" style="margin:0">Pilih caranya: stopwatch + hitung putaran (layar boleh mati), unggah file GPX dari Strava, atau GPS langsung di SIGAP.</p><div class="btns"><a class="btn ghost small" href="lari.html?metode=putaran">Stopwatch</a><a class="btn ghost small" href="lari.html?metode=gpx">File GPX</a><a class="btn ghost small" href="lari.html?metode=gps">GPS</a></div></div>';
    h += '<div class="card stack"><div class="row"><h2>Tes kamera</h2><span class="tag good">Terverifikasi</span></div><p class="small muted" style="margin:0">Taruh HP sesuai panduan. Kamera menghitung gerakan yang sah selama 1 menit, lalu hasilnya bisa langsung disimpan ke catatan.</p><div class="btns"><a class="btn ghost small" href="kamera.html?item=pushup">Push-up</a><a class="btn ghost small" href="kamera.html?item=situp">Sit-up</a><a class="btn ghost small" href="kamera.html?item=pullup">' + (gender() === 'Wanita' ? 'Chinning' : 'Pull-up') + '</a></div></div>';
    h += '<div class="card stack"><label class="f">Tanggal<input class="in" type="date" id="f-date" value="' + esc(draft.date) + '" max="' + todayStr() + '"></label>';
    ITEMS.forEach(function (it) {
      var v = draft.items[it.key], s = v != null ? score(it.key, v) : null;
      var vf = verifAktif(it.key);
      h += '<div class="logrow"><label class="f" for="f-' + it.key + '">' + esc(itemLabel(it)) + ' (' + it.unit + ')' + (vf ? ' <span class="tag' + (vf.terverifikasi === false ? '' : ' good') + '" id="vf-' + it.key + '">' + esc(vf.label || 'Terverifikasi ' + vf.sumber) + '</span>' : '') + '</label><span></span><input class="in" type="number" inputmode="decimal" id="f-' + it.key + '" data-item="' + it.key + '" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '" placeholder="' + it.ph + '" value="' + (v != null ? esc(v) : '') + '"><span class="hint" id="h-' + it.key + '">' + (s != null ? 'Nilai ' + fmtNum(s, 0) : '') + '</span></div>';
    });
    h += '<label class="f">Catatan (opsional)<input class="in" type="text" id="f-note" maxlength="200" value="' + esc(draft.note) + '" placeholder="Misal: cuaca panas, kaki agak pegal"></label>';
    h += '<label style="display:flex;gap:10px;align-items:center;min-height:44px;font-size:14px;font-weight:600"><input type="checkbox" id="f-sim" style="width:22px;height:22px"' + (draft.sim ? ' checked' : '') + '> Ini simulasi tes lengkap (urutan seperti tes asli)</label>';
    h += '<div class="btns"><button class="btn" id="save-log"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Menyimpan…' : 'Simpan catatan') + '</button><button class="btn ghost" id="clear-log">Kosongkan</button></div>';
    h += '<p class="tiny muted" style="margin:0">' + standarNote() + '</p></div>';
    return h;
  }
  function readDraftFromForm() {
    var d = $('#f-date'); if (!d) return;
    draft.date = d.value || todayStr();
    ITEMS.forEach(function (it) { var el = $('#f-' + it.key); if (el) draft.items[it.key] = num(el.value); });
    draft.note = $('#f-note').value; draft.sim = $('#f-sim').checked;
  }
  function saveLog() {
    readDraftFromForm();
    var items = {}, count = 0, bad = [];
    ITEMS.forEach(function (it) { var v = draft.items[it.key]; if (v != null) { if (v < it.min || v > it.max) bad.push(itemLabel(it)); else { items[it.key] = v; count++; } } else items[it.key] = null; });
    if (bad.length) { toast('Angka ' + bad.join(', ') + ' di luar batas wajar. Periksa lagi.'); return; }
    if (!count) { toast('Isi minimal satu hasil latihan.'); return; }
    if (draft.date > todayStr()) { toast('Tanggal tidak boleh di masa depan.'); return; }
    var cek = periksaCatatan(items, draft.date);
    if (!cek.ok) { toast(cek.pesan); return; }
    var before = currentScores();
    var bests = {}; ITEMS.forEach(function (it) { var ser = itemSeries(it.key); if (ser.length) bests[it.key] = Math.max.apply(null, ser.map(function (p) { return p.s; })); });
    var sim = draft.sim && isComplete(items);
    var catVerif = ITEMS.filter(function (it) { return verifAktif(it.key); }).map(function (it) { var v = draft.verif[it.key]; return (v.catatan || 'Terverifikasi ' + v.sumber) + ': ' + itemLabel(it).toLowerCase() + ' ' + fmtNum(items[it.key], 0); });
    var noteAkhir = [(draft.note || '').trim()].concat(catVerif).filter(Boolean).join(' · ');
    var log = { id: uid(), date: draft.date, items: items, sim: sim, note: noteAkhir.slice(0, 200) };
    S.catatan.push(log);
    var rk = ringkasan();
    S.catatan.pop();
    busy = true; render();
    api('tambahCatatan', { email: S.email, catatan: Object.assign({ garjas: N.garjasItems(items, gender()) }, log), ringkasan: rk }).then(function () {
      busy = false; S.catatan.push(log); simpanSesi(); LB.at = 0; terakhirDisimpan = log.id;
      var after = currentScores(), msgs = [];
      ITEMS.forEach(function (it) { if (items[it.key] == null) return; var s = score(it.key, items[it.key]); if (bests[it.key] != null && s > bests[it.key]) msgs.push('rekor baru ' + itemLabel(it).toLowerCase()); });
      var dg = after.garjas != null && before.garjas != null ? Math.round((after.garjas - before.garjas) * 10) / 10 : null;
      var t = 'Tersimpan.';
      if (msgs.length) t += ' ' + msgs.slice(0, 2).join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) + '!';
      if (dg) t += ' Prediksi nilai jasmani ' + (dg > 0 ? 'naik ' : 'turun ') + fmtNum(Math.abs(dg), 1) + ' poin.';
      if (draft.sim && !sim) t += ' (Tidak ditandai simulasi karena item belum lengkap.)';
      draft = { date: todayStr(), items: {}, sim: false, note: '' };
      toast(t); go('beranda');
    }, function (e) {
      busy = false;
      if (e && (e.kode === 'jaringan' || e.kode === 'sibuk' || e.kode === 'server')) {
        // Jangan sampai catatan hilang: simpan di HP dan kirim otomatis nanti.
        var a = antre(); a.push({ email: S.email, catatan: Object.assign({ garjas: N.garjasItems(items, gender()) }, log) }); setAntre(a);
        S.catatan.push(Object.assign({ tertunda: true }, log)); simpanSesi();
        draft = { date: todayStr(), items: {}, sim: false, note: '' };
        toast('Koneksi bermasalah. Catatan disimpan di HP dan akan dikirim otomatis saat koneksi kembali.'); go('beranda');
        setTimeout(kirimAntre, 15000);
      } else { render(); toast(pesanError(e)); }
    });
  }

  /* ---------------- Alat bantu tes ---------------- */
  var TIMER_MODES = {
    lari: { label: 'Lari 12 menit', dur: 720, field: 'lari', after: 'Waktu habis. Masukkan jarak yang kamu tempuh.' },
    menit: { label: 'Timer 1 menit', dur: 60, field: null, after: 'Satu menit selesai. Masukkan jumlah repetisimu.' },
    shuttle: { label: 'Stopwatch shuttle run', dur: 0, field: 'shuttle', after: '' }
  };
  function timerElapsed() { return timer.elapsed + (timer.running ? (Date.now() - timer.start) : 0); }
  function fmtClock(ms, tenth) { ms = Math.max(0, ms); var t = Math.floor(ms / 100), m = Math.floor(t / 600), s = Math.floor(t / 10) % 60, d = t % 10; return pad(m) + ':' + pad(s) + (tenth ? ',' + d : ''); }
  function timerText() { var m = TIMER_MODES[timer.mode]; if (!m) return ''; return m.dur ? fmtClock(m.dur * 1000 - timerElapsed() + 99, false) : fmtClock(timerElapsed(), true); }
  function viewTimer() {
    var h = '<div class="card stack"><h2>Alat bantu tes</h2>';
    h += '<div class="chips" role="group" aria-label="Pilih alat">' + Object.keys(TIMER_MODES).map(function (k) { return '<button type="button" class="chip" data-timer="' + k + '" aria-pressed="' + (timer.mode === k) + '">' + esc(TIMER_MODES[k].label) + '</button>'; }).join('') + '</div>';
    if (timer.mode) {
      var m = TIMER_MODES[timer.mode];
      h += '<div style="text-align:center;padding:6px 0"><div id="timer-display" class="display" style="font-weight:800;font-size:64px;line-height:1;font-variant-numeric:tabular-nums">' + timerText() + '</div>';
      h += '<div class="small ' + (timer.done ? 'warn' : 'muted') + '" style="margin-top:8px;font-weight:' + (timer.done ? 700 : 500) + '">' + (timer.done ? esc(m.after) : (m.dur ? 'Hitung mundur ' + (m.dur / 60) + ' menit. Ponsel berbunyi dan bergetar saat selesai.' : 'Tekan Selesai begitu kamu melewati garis akhir.')) + '</div></div><div class="btns">';
      if (!timer.done) {
        h += timer.running ? '<button class="btn" data-tctl="pause">Jeda</button>' : '<button class="btn" data-tctl="start">' + (timer.elapsed ? 'Lanjutkan' : 'Mulai') + '</button>';
        if (timer.mode === 'shuttle' && (timer.running || timer.elapsed)) h += '<button class="btn" data-tctl="finish">Selesai &amp; isi waktu</button>';
      }
      h += '<button class="btn ghost" data-tctl="reset">Ulangi</button><button class="btn ghost" data-tctl="close">Tutup</button></div>';
    } else h += '<p class="small muted" style="margin:0">Pakai saat latihan supaya waktunya sama seperti tes. Hasilnya bisa langsung diisi ke kolom di bawah.</p>';
    return h + '</div>';
  }
  function beep(times) {
    try { if (!audioCtx) return; for (var i = 0; i < times; i++) { var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime + i * 0.35; o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25); o.start(t0); o.stop(t0 + 0.27); } } catch (e) { }
  }
  function lockScreen(on) { try { if (on && navigator.wakeLock && !wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }, function () { }); if (!on && wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) { } }
  function stopTick() { if (timer.iv) { clearInterval(timer.iv); timer.iv = null; } }
  function tick() {
    var m = TIMER_MODES[timer.mode];
    if (m && m.dur && timer.running && timerElapsed() >= m.dur * 1000) {
      timer.elapsed = m.dur * 1000; timer.running = false; timer.done = true; stopTick();
      beep(3); try { navigator.vibrate && navigator.vibrate([400, 150, 400, 150, 600]); } catch (e) { }
      lockScreen(false); render();
      if (m.field) { var f = $('#f-' + m.field); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }); } }
      return;
    }
    var el = $('#timer-display'); if (el) el.textContent = timerText();
  }
  function timerCtl(cmd) {
    if (cmd === 'start') {
      try { if (!audioCtx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) audioCtx = new AC(); } if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { }
      if (!timer.elapsed) beep(1);
      timer.start = Date.now(); timer.running = true; stopTick(); timer.iv = setInterval(tick, 100); lockScreen(true);
    } else if (cmd === 'pause') { timer.elapsed = timerElapsed(); timer.running = false; stopTick(); lockScreen(false); }
    else if (cmd === 'finish') {
      timer.elapsed = timerElapsed(); timer.running = false; stopTick(); lockScreen(false); readDraftFromForm();
      var sec = Math.round(timer.elapsed / 100) / 10; draft.items.shuttle = sec;
      var fs = $('#f-shuttle'); if (fs) fs.value = sec;
      timer = { mode: null, running: false, start: 0, elapsed: 0, done: false, iv: null };
      render(); toast('Waktu shuttle run ' + fmtNum(sec, 1) + ' detik diisi. Periksa lalu simpan.'); return;
    } else if (cmd === 'reset') { stopTick(); lockScreen(false); timer.running = false; timer.elapsed = 0; timer.done = false; }
    else if (cmd === 'close') { stopTick(); lockScreen(false); timer = { mode: null, running: false, start: 0, elapsed: 0, done: false, iv: null }; }
    render();
  }

  /* ---------------- Progres ---------------- */
  function weekSummary() {
    var tg = target(), now = new Date();
    var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    var sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6), pe = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() - 1);
    var a = dstr(mon), b = dstr(sun);
    var week = S.catatan.filter(function (l) { return l.date >= a && l.date <= b; });
    var days = {}; week.forEach(function (l) { days[l.date] = 1; });
    var nowS = currentScores(), before = currentScores(dstr(pe)), lines = [];
    lines.push('Hari latihan tercatat: ' + Object.keys(days).length + ' dari 7');
    if (nowS.garjas != null) {
      var t = 'Prediksi nilai jasmani: ' + fmtNum(nowS.garjas, 1) + ' (target ' + fmtNum(tg, 0) + ')';
      if (before.garjas != null && week.length) { var dg = Math.round((nowS.garjas - before.garjas) * 10) / 10; t += dg ? ', ' + (dg > 0 ? 'naik ' : 'turun ') + fmtNum(Math.abs(dg), 1) + ' dari minggu lalu' : ', sama dengan minggu lalu'; }
      lines.push(t);
    }
    var up = [];
    ITEMS.forEach(function (it) {
      var best = null; week.forEach(function (l) { if (l.items[it.key] != null) { var s = score(it.key, l.items[it.key]); if (best == null || s > best) best = s; } });
      var prev = before.scores[it.key]; if (best != null && prev != null && best > prev) up.push(itemLabel(it).toLowerCase() + ' (+' + fmtNum(best - prev, 0) + ')');
    });
    if (up.length) lines.push('Naik: ' + up.join(', '));
    var weak = ITEMS.filter(function (it) { return nowS.scores[it.key] != null && nowS.scores[it.key] < tg; }).map(function (it) { return itemLabel(it).toLowerCase(); });
    lines.push(weak.length ? 'Masih di bawah target: ' + weak.join(', ') : 'Semua item yang dicatat sudah mencapai target');
    var st = streak(); if (st > 1) lines.push('Latihan beruntun: ' + st + ' hari');
    var dl = daysToTest(); if (dl != null && dl > 0) lines.push('Tes jasmani: ' + dl + ' hari lagi');
    var range = fmtDate(a) + ' – ' + fmtDate(b), body = lines.join('\n');
    return { range: range, body: body, full: 'Ringkasan latihan jasmani ' + String(S.profil.name).split(' ')[0] + ', ' + range + '\n' + body + '\n\nDicatat dengan SIGAP, aplikasi JadiPrajurit' };
  }
  function salinTeks(t, pesan) {
    var cad = function () { prompt('Salin teks ini:', t); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast(pesan || 'Disalin.'); }, cad); else cad();
  }
  function copyText(t) {
    function fallback() {
      try { var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); toast(ok ? 'Ringkasan disalin.' : 'Tidak bisa menyalin otomatis. Tahan teks ringkasan lalu salin manual.'); }
      catch (e) { toast('Tidak bisa menyalin otomatis. Tahan teks ringkasan lalu salin manual.'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Ringkasan disalin.'); }, fallback); else fallback();
  }
  function chartSVG(series) {
    var tg = target();
    if (series.length < 2) return '<p class="small muted" style="margin:0">Grafik muncul setelah ada minimal 2 catatan untuk item ini.</p>';
    var W = 320, H = 170, x0 = series[0].date, span = Math.max(1, dayDiff(x0, series[series.length - 1].date));
    var vals = series.map(function (p) { return p.s; });
    var lo = Math.max(0, Math.min(tg, Math.min.apply(null, vals)) - 10), hi = Math.min(100, Math.max(tg, Math.max.apply(null, vals)) + 8);
    if (hi - lo < 20) hi = Math.min(100, lo + 20);
    function X(d) { return 8 + (W - 16) * dayDiff(x0, d) / span; }
    function Y(v) { return 14 + (H - 38) * (1 - (v - lo) / (hi - lo)); }
    var last = series[series.length - 1];
    var s = '<svg role="img" aria-label="Grafik nilai dari ' + fmtNum(series[0].s, 0) + ' ke ' + fmtNum(last.s, 0) + ', target ' + fmtNum(tg, 0) + '" viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;max-width:100%">';
    s += '<line x1="0" x2="' + W + '" y1="' + Y(tg).toFixed(1) + '" y2="' + Y(tg).toFixed(1) + '" stroke="currentColor" stroke-width="1.4" stroke-dasharray="5 4" opacity=".75"/>';
    s += '<text x="' + (W - 4) + '" y="' + (Y(tg) - 6).toFixed(1) + '" text-anchor="end" font-size="11" fill="currentColor">Target ' + fmtNum(tg, 0) + '</text>';
    s += '<polyline points="' + series.map(function (p) { return X(p.date).toFixed(1) + ',' + Y(p.s).toFixed(1); }).join(' ') + '" fill="none" stroke="var(--good-bar)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
    series.forEach(function (p) { s += '<circle cx="' + X(p.date).toFixed(1) + '" cy="' + Y(p.s).toFixed(1) + '" r="3.5" fill="var(--good-bar)"/>'; });
    s += '<circle cx="' + X(last.date).toFixed(1) + '" cy="' + Y(last.s).toFixed(1) + '" r="6" fill="var(--good-bar)" stroke="var(--card)" stroke-width="2"/>';
    s += '<text x="4" y="' + (H - 4) + '" font-size="11" fill="currentColor" opacity=".8">' + esc(fmtDate(series[0].date)) + '</text><text x="' + (W - 4) + '" y="' + (H - 4) + '" text-anchor="end" font-size="11" fill="currentColor" opacity=".8">' + esc(fmtDate(last.date)) + '</text></svg>';
    return s;
  }
  function viewProgres() {
    var tg = target();
    var h = '<div class="top"><div><h1>Progres latihan</h1><div class="sub">' + S.catatan.length + ' catatan tersimpan</div></div></div>';
    if (!S.catatan.length) return h + '<div class="card stack"><p class="small muted" style="margin:0">Belum ada data. Catat latihan pertamamu untuk melihat grafik.</p><button class="btn" data-go="catat">Catat latihan</button></div>';
    var ws = weekSummary();
    h += '<div class="card stack"><div class="row"><h2>Ringkasan minggu ini</h2><span class="tiny muted">' + esc(ws.range) + '</span></div><div class="small" style="white-space:pre-line">' + esc(ws.body) + '</div>';
    h += '<div class="btns"><button class="btn small" id="copy-week">Salin ringkasan</button><a class="btn ghost small" href="https://wa.me/?text=' + encodeURIComponent(ws.full) + '" target="_blank" rel="noopener">Kirim ke WhatsApp</a><button class="btn ghost small" data-go="bagikan">' + icon('share', 18) + 'Bagikan gambar</button></div></div>';
    var opts = [['garjas', 'Nilai jasmani']].concat(ITEMS.map(function (it) { return [it.key, itemLabel(it)]; }));
    h += '<div class="chips" role="group" aria-label="Pilih item">' + opts.map(function (o) { return '<button type="button" class="chip" data-pick="' + o[0] + '" aria-pressed="' + (progressPick === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
    var series = progressPick === 'garjas' ? garjasSeries() : itemSeries(progressPick);
    var last = series.length ? series[series.length - 1].s : null, first = series.length ? series[0].s : null;
    h += '<div class="card stack"><div class="row" style="align-items:flex-end"><div><div class="small muted">Nilai terbaru</div><div class="big" style="font-size:36px">' + fmtNum(last, 1) + '</div></div>' + (series.length > 1 ? '<div style="text-align:right"><div class="small muted">Sejak catatan pertama</div><div class="display ' + (last - first >= 0 ? 'good' : 'warn') + '" style="font-weight:700;font-size:18px">' + (last - first >= 0 ? '+' : '') + fmtNum(last - first, 1) + ' poin</div></div>' : '') + '</div>';
    h += '<div class="chartbox">' + chartSVG(series) + '</div><div class="note plain">' + esc(forecastText(series)) + '</div></div>';

    var sims = sortedLogs().filter(function (l) { return l.sim; }).reverse();
    if (sims.length) {
      h += '<div class="card"><h2 style="padding-bottom:6px">Rapor simulasi</h2>';
      sims.slice(0, 5).forEach(function (l, i) {
        var g = N.garjasItems(l.items, gender()), prev = sims[i + 1], pg = prev ? N.garjasItems(prev.items, gender()) : null;
        h += '<div class="hist"><div class="row"><span style="font-weight:700">' + esc(fmtDate(l.date)) + '</span><span class="display ' + (g >= tg ? 'good' : 'warn') + '" style="font-weight:800;font-size:20px">' + fmtNum(g, 1) + (pg != null ? ' <span class="small muted" style="font-weight:600">(' + (g - pg >= 0 ? '+' : '') + fmtNum(g - pg, 1) + ')</span>' : '') + '</span></div>';
        h += '<div class="small muted">' + ITEMS.map(function (it) { var s = score(it.key, l.items[it.key]); return esc(itemLabel(it)) + ' <b class="' + (s >= tg ? 'good' : 'warn') + '">' + fmtNum(s, 0) + '</b>'; }).join(' · ') + '</div></div>';
      });
      h += '</div>';
    }
    h += '<div class="card"><h2 style="padding-bottom:6px">Riwayat</h2>';
    sortedLogs().reverse().slice(0, 40).forEach(function (l) {
      h += '<div class="hist"><div class="row"><span style="font-weight:700">' + esc(fmtDate(l.date)) + ' ' + (l.sim ? '<span class="tag sim">Simulasi</span>' : '') + (l.tertunda ? ' <span class="tag">Menunggu dikirim</span>' : '') + '</span><span style="display:flex;gap:14px"><button type="button" class="linkbtn" data-bagikan="' + esc(l.id) + '|">Bagikan</button><button type="button" class="linkbtn" data-del="' + esc(l.id) + '">Hapus</button></span></div>';
      h += '<div class="small">' + ITEMS.filter(function (it) { return l.items[it.key] != null; }).map(function (it) { return esc(itemLabel(it)) + ': ' + fmtNum(l.items[it.key], 1) + ' ' + it.unit + ' <span class="muted">(nilai ' + fmtNum(score(it.key, l.items[it.key]), 0) + ')</span>'; }).join('<br>') + '</div>';
      if (l.note) h += '<div class="tiny muted">' + esc(l.note) + '</div>';
      h += '</div>';
    });
    return h + '</div>';
  }
  function hapusLog(id) {
    if (busy || !confirm('Hapus catatan ini?')) return;
    if (terakhirDisimpan === id) terakhirDisimpan = null;
    var lokal = S.catatan.filter(function (l) { return l.id === id && l.tertunda; })[0];
    if (lokal) { setAntre(antre().filter(function (x) { return x.catatan.id !== id; })); S.catatan = S.catatan.filter(function (l) { return l.id !== id; }); simpanSesi(); render(); toast('Catatan dihapus.'); return; }
    var sisa = S.catatan.filter(function (l) { return l.id !== id; }), simpan = S.catatan;
    S.catatan = sisa; var rk = ringkasan(); S.catatan = simpan;
    busy = true;
    api('hapusCatatan', { email: S.email, id: id, ringkasan: rk }).then(function () {
      busy = false; S.catatan = sisa; simpanSesi(); render(); toast('Catatan dihapus.');
    }, function (e) { busy = false; toast(pesanError(e)); });
  }

  /* ---------------- Program ---------------- */
  function programSekarang() {
    var cur = currentScores(), latest = {};
    Object.keys(cur.latest).forEach(function (k) { latest[k] = cur.latest[k].raw; });
    var sims = sortedLogs().filter(function (l) { return l.sim; });
    return N.programMingguan({
      latest: latest, scores: cur.scores, target: target(), gender: gender(), hariMenujuTes: daysToTest(),
      hariSejakSimulasi: sims.length ? dayDiff(sims[sims.length - 1].date, todayStr()) : null
    });
  }
  function viewProgram() {
    var h = '<div class="top"><div><h1>Program minggu ini</h1><div class="sub">Disusun otomatis dari nilai terbaru dan sisa waktu menuju tes</div></div></div>';
    h += '<div class="card stack"><h2>Cek kondisi sebelum latihan</h2>';
    if (checkin === null) h += '<p class="small muted" style="margin:0">Ada nyeri, cedera, atau badan sedang tidak fit?</p><div class="btns"><button class="btn ghost" data-check="ok">Aman, siap latihan</button><button class="btn ghost" data-check="hurt">Ada keluhan</button></div>';
    else if (checkin === 'ok') h += '<div class="note goodbox">Siap. Mulai dengan pemanasan 10 menit dan tutup dengan pendinginan serta peregangan.</div><button class="linkbtn" style="color:var(--muted)" data-check="reset">Ubah jawaban</button>';
    else h += '<div class="note warnbox">Ganti sesi hari ini dengan istirahat atau peregangan ringan. Jika nyeri tidak membaik dalam 2 hari, terasa tajam, atau ada bengkak, periksakan ke dokter atau fisioterapis sebelum latihan berat lagi.</div><button class="linkbtn" style="color:var(--muted)" data-check="reset">Ubah jawaban</button>';
    h += '</div>';
    if (!S.catatan.length) return h + '<div class="card stack"><p class="small muted" style="margin:0">Catat tes awal dulu supaya program bisa disesuaikan dengan kemampuanmu.</p><button class="btn" data-go="catat">Catat tes awal</button></div>';
    var p = programSekarang(), idx = (new Date().getDay() + 6) % 7;
    h += '<div class="card stack"><div class="note plain">' + esc(p.fokus) + '</div><div>';
    p.hari.forEach(function (d, i) {
      h += '<div class="day' + (i === idx ? ' today' : '') + '"><span style="font-weight:800;font-size:13px">' + HARI[i].slice(0, 3) + '</span><div><div style="font-weight:' + (i === idx ? 700 : 500) + '">' + esc(d.sesi) + '</div><div class="tiny muted">' + esc([d.intensitas, d.durasi ? '± ' + d.durasi + ' menit' : ''].filter(Boolean).join(', ')) + (i === idx ? ' · hari ini' : '') + '</div></div></div>';
    });
    h += '</div><p class="small muted" style="margin:0">' + esc(p.catatan) + '</p></div>';
    return h + '<p class="tiny muted" style="margin:0">Program ini panduan latihan umum, bukan pengganti arahan pelatih atau tenaga medis.</p>';
  }

  /* ---------------- Peringkat ---------------- */
  var LB = { data: null, at: 0, loading: false, err: '' }, lbMode = 'nilai', lbMatra = 'Semua';
  function muatLB(force) {
    if (!S.email) return Promise.resolve(null);
    if (LB.loading) return LB.janji;
    if (!force && LB.data && Date.now() - LB.at < 120000) return Promise.resolve(LB.data);
    LB.loading = true; LB.err = '';
    LB.janji = api('leaderboard', { email: S.email }).then(function (j) {
      LB.data = j; LB.at = Date.now(); LB.loading = false;
      if (tab === 'peringkat' || tab === 'beranda') softRender();
      return j;
    }, function (e) {
      LB.loading = false; LB.err = pesanError(e);
      if (tab === 'peringkat') softRender();
      throw e;
    });
    return LB.janji;
  }
  function softRender() { var a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; if (!busy) render(); }
  function viewPeringkat() {
    var h = '<div class="top"><div><h1>Peringkat casis</h1><div class="sub">Dari catatan mandiri casis SIGAP' + (LB.data ? ', diperbarui ' + esc(String(LB.data.waktu).slice(11)) : '') + '</div></div></div>';
    if (!LB.data) {
      h += '<div class="card" style="text-align:center">' + (LB.err ? '<p class="small warn" style="margin:0 0 10px">' + esc(LB.err) + '</p><button class="btn ghost small" id="lb-refresh">Coba lagi</button>' : '<span class="spin" aria-hidden="true"></span> Memuat peringkat…') + '</div>';
      return h;
    }
    var d = LB.data, sy = d.saya || {};
    h += '<div class="hero"><div class="soft">Posisimu</div>';
    if (sy.tampil === false) h += '<div class="display" style="font-weight:700;font-size:20px">Kamu sedang disembunyikan dari peringkat.</div><button class="btn small" data-go="profil" style="background:var(--hero-ink);color:var(--hero);align-self:flex-start">Tampilkan di Profil</button>';
    else {
      h += '<div class="grid2"><div><div class="big" style="font-size:44px">' + (sy.rankNilai ? '#' + sy.rankNilai : '–') + '</div><div class="soft">nilai jasmani, dari ' + d.totalNilai + ' casis</div></div><div><div class="big" style="font-size:44px">' + (sy.rankRajin ? '#' + sy.rankRajin : '–') + '</div><div class="soft">paling rajin minggu ini</div></div></div>';
      if (!sy.lengkap) h += '<div class="soft" style="color:var(--hero-ink)">Catat kelima item tes (lari, ' + esc(itemLabel(ITEMS[1]).toLowerCase()) + ', sit-up, push-up, shuttle run) untuk masuk peringkat nilai.</div>';
      if (S.catatan.length) h += '<button type="button" class="btn small" data-go="bagikan" style="background:var(--hero-ink);color:var(--hero);align-self:flex-start">' + icon('share', 18) + 'Bagikan posisiku</button>';
    }
    h += '</div>';
    h += '<button type="button" class="btn ghost" data-go-battle="1">Battle: tantang casis lain</button>';
    h += '<div class="chips" role="group" aria-label="Jenis peringkat">' + [['nilai', 'Nilai jasmani'], ['rajin', 'Paling rajin minggu ini']].map(function (o) { return '<button type="button" class="chip" data-lbmode="' + o[0] + '" aria-pressed="' + (lbMode === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="chips" role="group" aria-label="Filter matra">' + ['Semua', 'AD', 'AL', 'AU'].map(function (m) { return '<button type="button" class="chip" data-lbmatra="' + m + '" aria-pressed="' + (lbMatra === m) + '">' + (m === 'Semua' ? 'Semua matra' : 'TNI ' + m) + '</button>'; }).join('') + '</div>';
    var list = (lbMode === 'nilai' ? d.nilai : d.rajin).filter(function (x) { return lbMatra === 'Semua' || x.matra === lbMatra; }).slice(0, 50);
    h += '<div class="card" style="padding:8px">';
    if (!list.length) h += '<p class="small muted" style="margin:8px">Belum ada casis di peringkat ini. Jadilah yang pertama!</p>';
    list.forEach(function (x, i) {
      var val = lbMode === 'nilai' ? fmtNum(x.nilai, 1) : x.hari + ' hari';
      h += '<div class="lb-row' + (x.saya ? ' saya' : '') + '"><span class="lb-rank">' + (i + 1) + '</span><div><div style="font-weight:700">' + esc(x.nama) + (x.saya ? ' <span class="tag">Kamu</span>' : '') + '</div><div class="tiny muted">' + esc('TNI ' + x.matra + ', ' + x.gender) + '</div></div><span class="lb-val">' + esc(val) + '</span>' + (x.token ? '<button type="button" class="linkbtn" data-btantang="' + esc(x.token) + '" aria-label="Tantang ' + esc(x.nama) + ' battle">Tantang</button>' : '') + '</div>';
    });
    h += '</div><div class="btns"><button class="btn ghost small" id="lb-refresh"' + (LB.loading ? ' disabled' : '') + '>' + (LB.loading ? 'Memuat…' : 'Perbarui') + '</button></div>';
    h += '<p class="tiny muted" style="margin:0">Peringkat nilai hanya menghitung casis yang sudah mencatat kelima item. Yang tampil hanya nama depan, inisial, dan matra.</p>';
    return h;
  }

  /* ---------------- Bagikan hasil ---------------- */
  var share = { url: null, blob: null, loading: false, err: '', mode: 'ringkasan', logId: null, key: null };
  function namaPendek(n) { var b = String(n || '').trim().split(/\s+/); return (b[0] || 'Casis').slice(0, 15) + (b[1] ? ' ' + b[1].charAt(0).toUpperCase() + '.' : ''); }
  function linkBagikan() { var base = location.origin + location.pathname.replace(/index\.html$/, ''); return S.profil && S.profil.kodeBagikan ? base + '?h=' + S.profil.kodeBagikan : base; }
  function teksBagikan() {
    var g = currentScores().garjas, sy = LB.data && LB.data.saya;
    return 'Prediksi nilai jasmani saya ' + fmtNum(g, 1) + ' dari 100' + (sy && sy.rankNilai ? ', peringkat #' + sy.rankNilai + ' dari ' + LB.data.totalNilai + ' casis' : '') + '. Ukur kesiapan fisikmu sekarang juga di SIGAP, aplikasi JadiPrajurit, tersedia di Play Store dan App Store. Lihat hasilku:';
  }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  var logoStiker = null;
  function muatLogo() {
    if (logoStiker) return Promise.resolve(logoStiker);
    return new Promise(function (res) { var im = new Image(); im.onload = function () { logoStiker = im; res(im); }; im.onerror = function () { res(null); }; im.src = 'assets/logo-jadiprajurit-stiker.png'; });
  }
  function gambarHasil() {
    var W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), p = S.profil, cur = currentScores(), tg = target(), g = cur.garjas || 0, sy = LB.data && LB.data.saya;
    var MS = "'Montserrat', 'Public Sans', Arial, sans-serif", ST = "'Saira Stencil One', 'Archivo', Arial, sans-serif";
    var INK = '#F3F2EC', SOFT = '#C3D2BD', HIJAU = '#8CCB86', ORANYE = '#F29A38';
    x.fillStyle = '#121810'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(140,203,134,0.08)'; x.lineWidth = 2;
    for (var i = 0; i < W; i += 60) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
    for (var j = 0; j < H; j += 60) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
    x.strokeStyle = 'rgba(140,203,134,0.18)'; x.lineWidth = 3;
    [300, 480, 660].forEach(function (r) { x.beginPath(); x.arc(820, 880, r / 2, 0, Math.PI * 2); x.stroke(); });
    x.strokeStyle = ORANYE; x.lineWidth = 8; x.lineCap = 'butt';
    [[80, 220, 1, 1], [1000, 220, -1, 1], [80, 1720, 1, -1], [1000, 1720, -1, -1]].forEach(function (b) { x.beginPath(); x.moveTo(b[0], b[1] + b[3] * 60); x.lineTo(b[0], b[1]); x.lineTo(b[0] + b[2] * 60, b[1]); x.stroke(); });
    if (logoStiker) { var lw = 720; x.drawImage(logoStiker, 118, 252, lw, lw * logoStiker.height / logoStiker.width); }
    else { x.fillStyle = INK; x.font = '800 64px ' + MS; x.fillText('JADIPRAJURIT', 130, 340); }
    x.fillStyle = HIJAU; x.font = '34px ' + ST; x.fillText('// LAPORAN SIGAP · TNI ' + String(p.matra).toUpperCase(), 130, 500);
    x.fillStyle = INK; x.font = '800 84px ' + MS; x.fillText(namaPendek(p.name), 130, 610);
    x.fillStyle = SOFT; x.font = '600 36px ' + MS; x.fillText('Prediksi nilai jasmani', 130, 705);
    x.fillStyle = INK; x.font = '290px ' + ST; x.fillText(fmtNum(g, 1), 110, 985);
    var info = 'TARGET ' + fmtNum(tg, 0) + (sy && sy.rankNilai ? '   #' + sy.rankNilai + ' DARI ' + LB.data.totalNilai : '');
    var st = streak(); if (st > 1) info += '   ' + st + ' HARI BERUNTUN';
    x.fillStyle = ORANYE; x.font = '40px ' + ST; x.fillText(info, 130, 1085);
    var y = 1165;
    ITEMS.forEach(function (it) {
      var l = cur.latest[it.key], sc = cur.scores[it.key];
      x.fillStyle = SOFT; x.font = '600 32px ' + MS; x.fillText(itemLabel(it), 130, y);
      x.textAlign = 'right'; x.fillStyle = l ? INK : SOFT; x.font = '36px ' + ST;
      x.fillText(l ? fmtNum(l.raw, 1) + ' ' + it.unit + '  ' + fmtNum(sc, 0) : 'BELUM DICATAT', 950, y); x.textAlign = 'left';
      var isi = sc != null ? Math.round(sc / 5) : 0;
      for (var k = 0; k < 20; k++) { x.fillStyle = k < isi ? (sc >= tg ? HIJAU : ORANYE) : 'rgba(243,242,236,0.12)'; x.fillRect(130 + k * 41, y + 18, 33, 12); }
      y += 80;
    });
    x.strokeStyle = 'rgba(140,203,134,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(130, 1532); x.lineTo(950, 1532); x.stroke();
    x.fillStyle = INK; x.font = '800 34px ' + MS; x.fillText('Ukur kesiapan fisikmu sekarang juga', 130, 1590); x.fillText('di aplikasi JadiPrajurit.', 130, 1634);
    x.font = '30px ' + ST; x.fillStyle = ORANYE; x.fillText('TERSEDIA DI', 130, 1686);
    var px = 330;
    ['PLAY STORE', 'APP STORE'].forEach(function (t) { var tw = x.measureText(t).width + 40; x.strokeStyle = INK; x.lineWidth = 3; rr(x, px, 1652, tw, 50, 10); x.stroke(); x.fillStyle = INK; x.fillText(t, px + 20, 1688); px += tw + 16; });
    return c;
  }
  function siapkanBagikan() {
    if (!S.catatan.length && !(share.mode === 'battle' && share.battle) && !(share.mode === 'arena' && share.arena)) return;
    share.loading = true; share.err = '';
    var fonts = document.fonts && document.fonts.load ? Promise.all(['800 84px Montserrat', '600 36px Montserrat', '40px "Saira Stencil One"'].map(function (f) { return document.fonts.load(f); })) : Promise.resolve();
    var batas = new Promise(function (r) { setTimeout(r, 2500); });
    Promise.race([Promise.all([fonts, muatLogo(), muatLB(false).catch(function () { })]), batas]).then(function () {
      var D = share.mode === 'latihan' ? dataLatihan(share.logId, share.key) : null;
      if (share.mode === 'latihan' && !D) share.mode = 'ringkasan';
      var c = share.mode === 'arena' && share.arena ? gambarArena(share.arena) : share.mode === 'battle' && share.battle ? gambarBattle(share.battle) : D ? gambarLatihan(D) : gambarHasil();
      return new Promise(function (res, rej) { if (c.toBlob) c.toBlob(function (b) { b ? res(b) : rej(); }, 'image/png'); else rej(); });
    }).then(function (blob) {
      if (share.url) URL.revokeObjectURL(share.url);
      share.blob = blob; share.url = URL.createObjectURL(blob); share.loading = false;
      if (tab === 'bagikan') render();
    }, function () { share.loading = false; share.err = 'Gambar belum bisa dibuat di browser ini. Kamu tetap bisa membagikan link.'; if (tab === 'bagikan') render(); });
  }
  function viewBagikan() {
    var h = '<div class="top"><div style="display:flex;gap:8px;align-items:center"><button type="button" class="btn ghost small" data-go="beranda" aria-label="Kembali" style="padding:0 10px">' + icon('back', 20) + '</button><div><h1>Bagikan ' + (share.mode === 'arena' ? 'duel live' : share.mode === 'battle' ? 'battle' : share.mode === 'latihan' ? 'latihan' : 'hasil') + '</h1><div class="sub">Ajak teman casis ukur kesiapan fisiknya</div></div></div></div>';
    if (!S.catatan.length && !(share.mode === 'battle' && share.battle) && !(share.mode === 'arena' && share.arena)) return h + '<div class="card stack"><p class="small muted" style="margin:0">Catat latihan dulu supaya ada hasil yang bisa dibagikan.</p><button class="btn" data-go="catat">Catat latihan</button></div>';
    var lg = share.mode === 'latihan' && S.catatan.filter(function (x) { return x.id === share.logId; })[0];
    var modeBattle = (share.mode === 'battle' && share.battle) || (share.mode === 'arena' && share.arena);
    if (!modeBattle) {
    h += '<div class="chips" role="group" aria-label="Pilih isi story">';
    h += '<button type="button" class="chip" data-share-mode="ringkasan" aria-pressed="' + (!lg) + '">Semua latihan</button>';
    var lgUntuk = lg || sortedLogs()[sortedLogs().length - 1];
    ITEMS.forEach(function (it) { if (lgUntuk.items[it.key] != null) h += '<button type="button" class="chip" data-bagikan="' + esc(lgUntuk.id) + '|' + it.key + '" aria-pressed="' + (!!lg && share.key === it.key) + '">' + esc(itemLabel(it)) + '</button>'; });
    h += '</div>';
    if (lgUntuk) h += '<p class="tiny muted" style="margin:-6px 0 0">Latihan per item diambil dari catatan ' + esc(fmtDate(lgUntuk.date)) + '. Untuk tanggal lain, buka Riwayat di menu Progres.</p>';
    }
    h += '<div class="card stack" style="align-items:center">';
    if (share.loading || (!share.url && !share.err)) h += '<div class="share-prev" style="display:flex;align-items:center;justify-content:center"><span class="spin" aria-hidden="true"></span></div>';
    else if (share.url) h += '<img class="share-prev" src="' + share.url + '" alt="Gambar hasil latihan JadiPrajurit: prediksi nilai jasmani ' + fmtNum(currentScores().garjas, 1) + '">';
    if (share.err) h += '<p class="small warn" style="margin:0">' + esc(share.err) + '</p>';
    h += '<div class="btns" style="width:100%">';
    if (navigator.share) h += '<button class="btn" id="share-native"' + (share.loading ? ' disabled' : '') + '>' + icon('share', 18) + 'Bagikan</button>';
    if (share.url) h += '<a class="btn ghost" href="' + share.url + '" download="' + (modeBattle ? 'battle-sigap.png' : lg ? 'latihan-' + share.key + '-sigap.png' : 'hasil-sigap-jadiprajurit.png') + '">Unduh gambar</a>';
    h += '</div><p class="tiny muted" style="margin:0;text-align:center">Ukuran pas untuk Instagram Story dan Status WhatsApp.</p></div>';
    var link = linkBagikan();
    h += '<div class="card stack"><h2>Link hasilmu</h2><div class="small" style="word-break:break-all;background:var(--line2);border-radius:10px;padding:10px 12px">' + esc(link) + '</div>';
    var teksNow = share.mode === 'arena' && share.arena ? teksArena(share.arena) : modeBattle ? teksBattle(share.battle) : lg ? teksLatihan(dataLatihan(share.logId, share.key)) : teksBagikan();
    h += '<div class="btns"><button class="btn ghost small" id="share-copy">Salin link</button><a class="btn ghost small" href="https://wa.me/?text=' + encodeURIComponent(teksNow + ' ' + link) + '" target="_blank" rel="noopener">Kirim ke WhatsApp</a></div>';
    h += '<p class="tiny muted" style="margin:0">Yang terlihat orang lain hanya nama depan, inisial, matra, dan nilaimu. Email tidak pernah ditampilkan.</p></div>';
    return h;
  }
  function bagikanNative() {
    var Dn = share.mode === 'latihan' ? dataLatihan(share.logId, share.key) : null;
    var teksN = share.mode === 'arena' && share.arena ? teksArena(share.arena) : share.mode === 'battle' && share.battle ? teksBattle(share.battle) : Dn ? teksLatihan(Dn) : teksBagikan();
    var link = linkBagikan(), data = { title: 'Hasil latihan SIGAP', text: teksN, url: link };
    try {
      if (share.blob && window.File) {
        var f = new File([share.blob], 'hasil-sigap-jadiprajurit.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [f] })) { data.files = [f]; data.text = teksN + ' ' + link; delete data.url; }
      }
    } catch (e) { }
    navigator.share(data).catch(function () { });
  }

  /* ---------------- Story per latihan ---------------- */
  var terakhirDisimpan = null; // id catatan yang baru disimpan, untuk ajakan bagikan di Beranda
  function labelLatihan(it) { return itemLabel(it) + (it.key === 'lari' || it.key === 'shuttle' ? '' : ' · 1 menit'); }
  function verifLatihan(l, it) {
    var n = String(l.note || ''), lbl = itemLabel(it).toLowerCase();
    if (n.indexOf('Terverifikasi kamera: ' + lbl) >= 0) return 'KAMERA';
    if (n.indexOf('Terverifikasi GPS: ' + lbl) >= 0) return 'GPS';
    return '';
  }
  // Data satu latihan: hasil, nilai, perbandingan dengan sebelumnya, rekor, dan 5 riwayat terakhir.
  function dataLatihan(logId, key) {
    var urut = sortedLogs(), idx = -1;
    urut.forEach(function (l, i) { if (l.id === logId) idx = i; });
    if (idx < 0) return null;
    var l = urut[idx], it = ITEMS.filter(function (i) { return i.key === key; })[0];
    if (!it || l.items[key] == null) return null;
    var lebihKecil = key === 'shuttle', v = l.items[key];
    var sebelum = urut.slice(0, idx).filter(function (x) { return x.items[key] != null; });
    var prev = sebelum.length ? sebelum[sebelum.length - 1].items[key] : null;
    var terbaikLama = sebelum.length ? sebelum.reduce(function (b, x) { var y = x.items[key]; return lebihKecil ? Math.min(b, y) : Math.max(b, y); }, lebihKecil ? Infinity : -Infinity) : null;
    var rekor = terbaikLama != null && (lebihKecil ? v < terbaikLama : v > terbaikLama);
    var riwayat = sebelum.slice(-4).map(function (x) { return { v: x.items[key], d: x.date }; }).concat([{ v: v, d: l.date }]);
    var desimal = key === 'shuttle' ? 1 : 0, sel = '', baik = true;
    if (prev != null) {
      var d = Math.round((v - prev) * 10) / 10;
      if (d === 0) sel = 'SAMA DENGAN SEBELUMNYA';
      else if (lebihKecil) { baik = d < 0; sel = fmtNum(Math.abs(d), 1) + ' DETIK LEBIH ' + (d < 0 ? 'CEPAT' : 'LAMBAT'); }
      else { baik = d > 0; sel = (d > 0 ? '+' : '−') + fmtNum(Math.abs(d), desimal) + (key === 'lari' ? ' M' : '') + ' DARI SEBELUMNYA'; }
    }
    return { log: l, it: it, v: v, nilai: score(key, v), rekor: rekor, verif: verifLatihan(l, it), selisih: sel, baik: baik, riwayat: riwayat, lebihKecil: lebihKecil, desimal: desimal };
  }
  function gambarLatihan(D) {
    var W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d'), p = S.profil, tg = target();
    var MS = "'Montserrat', 'Public Sans', Arial, sans-serif", ST = "'Saira Stencil One', 'Archivo', Arial, sans-serif";
    var INK = '#F3F2EC', SOFT = '#C3D2BD', HIJAU = '#8CCB86', ORANYE = '#F29A38', LATAR = '#121810';
    x.fillStyle = LATAR; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(140,203,134,0.08)'; x.lineWidth = 2;
    for (var i = 0; i < W; i += 60) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
    for (var j = 0; j < H; j += 60) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
    x.strokeStyle = 'rgba(140,203,134,0.18)'; x.lineWidth = 3;
    [300, 480, 660].forEach(function (r) { x.beginPath(); x.arc(820, 820, r / 2, 0, Math.PI * 2); x.stroke(); });
    x.strokeStyle = ORANYE; x.lineWidth = 8;
    [[80, 220, 1, 1], [1000, 220, -1, 1], [80, 1720, 1, -1], [1000, 1720, -1, -1]].forEach(function (b) { x.beginPath(); x.moveTo(b[0], b[1] + b[3] * 60); x.lineTo(b[0], b[1]); x.lineTo(b[0] + b[2] * 60, b[1]); x.stroke(); });
    if (logoStiker) x.drawImage(logoStiker, 118, 252, 720, 720 * logoStiker.height / logoStiker.width);
    else { x.fillStyle = INK; x.font = '800 64px ' + MS; x.fillText('JADIPRAJURIT', 130, 340); }
    x.fillStyle = HIJAU; x.font = '34px ' + ST; x.fillText('// LATIHAN ' + (D.log.date === todayStr() ? 'HARI INI' : 'SIGAP') + ' · TNI ' + String(p.matra).toUpperCase(), 130, 500);
    x.fillStyle = INK; x.font = '800 84px ' + MS; x.fillText(namaPendek(p.name), 130, 610);
    var tglPanjang; try { tglPanjang = parseDate(D.log.date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { tglPanjang = D.log.date; }
    x.fillStyle = SOFT; x.font = '600 36px ' + MS; x.fillText(tglPanjang, 130, 668);
    var bx = 130; x.font = '30px ' + ST;
    [[D.verif ? 'TERVERIFIKASI ' + D.verif : '', HIJAU], [D.rekor ? 'REKOR BARU' : '', ORANYE]].forEach(function (b) {
      if (!b[0]) return; var tw = x.measureText(b[0]).width + 44;
      x.fillStyle = b[1]; rr(x, bx, 720, tw, 56, 12); x.fill(); x.fillStyle = LATAR; x.fillText(b[0], bx + 22, 760); bx += tw + 16;
    });
    x.fillStyle = ORANYE; x.font = '60px ' + ST; x.fillText(labelLatihan(D.it).toUpperCase(), 130, 860);
    var hasil = fmtNum(D.v, D.desimal), sat = D.it.unit.toUpperCase();
    x.font = '64px ' + ST; var sw = x.measureText(sat).width, fz = 300;
    x.font = fz + 'px ' + ST; while (x.measureText(hasil).width + 24 + sw > 840 && fz > 160) { fz -= 10; x.font = fz + 'px ' + ST; }
    x.fillStyle = INK; x.fillText(hasil, 110, 1140); var hw = x.measureText(hasil).width;
    x.font = '64px ' + ST; x.fillStyle = SOFT; x.fillText(sat, 110 + hw + 24, 1140);
    x.fillStyle = INK; x.font = '40px ' + ST; x.fillText('NILAI ' + fmtNum(D.nilai, 0), 130, 1210);
    x.textAlign = 'right'; x.fillStyle = SOFT; x.font = '600 34px ' + MS; x.fillText('target ' + fmtNum(tg, 0), 950, 1210); x.textAlign = 'left';
    var isi = Math.round((D.nilai || 0) / 5);
    for (var k = 0; k < 20; k++) { x.fillStyle = k < isi ? (D.nilai >= tg ? HIJAU : ORANYE) : 'rgba(243,242,236,0.12)'; x.fillRect(130 + k * 41, 1232, 33, 14); }
    if (D.selisih) { x.fillStyle = D.baik ? HIJAU : ORANYE; x.font = '38px ' + ST; x.fillText(D.selisih, 130, 1306); }
    if (D.riwayat.length > 1) {
      x.fillStyle = SOFT; x.font = '600 32px ' + MS; x.fillText('Perkembangan ' + D.riwayat.length + ' latihan terakhir', 130, 1366);
      var vs = D.riwayat.map(function (r) { return r.v; }), mx = Math.max.apply(null, vs), mn = Math.min.apply(null, vs), bw = 110, gap = 34, base = 1538;
      D.riwayat.forEach(function (r, i) {
        var t = D.lebihKecil ? (mx - r.v) / ((mx - mn) || 1) : (r.v - mn) / ((mx - mn) || 1), h = 30 + t * 92, X = 130 + i * (bw + gap), akhir = i === D.riwayat.length - 1;
        x.fillStyle = akhir ? ORANYE : 'rgba(140,203,134,0.55)'; x.fillRect(X, base - h, bw, h);
        x.textAlign = 'center'; x.fillStyle = akhir ? INK : SOFT; x.font = (akhir ? '36px ' : '30px ') + ST; x.fillText(fmtNum(r.v, D.desimal), X + bw / 2, base - h - 14);
        var dt = parseDate(r.d); x.font = '600 24px ' + MS; x.fillStyle = SOFT; x.fillText(dt.getDate() + '/' + (dt.getMonth() + 1), X + bw / 2, base + 34); x.textAlign = 'left';
      });
    } else {
      x.fillStyle = HIJAU; x.font = '40px ' + ST; x.fillText('LATIHAN PERTAMA,', 130, 1400); x.fillText('AYO PANTAU PERKEMBANGANNYA!', 130, 1452);
    }
    x.strokeStyle = 'rgba(140,203,134,0.35)'; x.lineWidth = 2; x.beginPath(); x.moveTo(130, 1588); x.lineTo(950, 1588); x.stroke();
    x.fillStyle = INK; x.font = '800 32px ' + MS; x.fillText('Ukur kesiapan fisikmu sekarang juga', 130, 1630); x.fillText('di aplikasi JadiPrajurit.', 130, 1668);
    x.font = '28px ' + ST; x.fillStyle = ORANYE; x.fillText('TERSEDIA DI', 130, 1712);
    var px = 318;
    ['PLAY STORE', 'APP STORE'].forEach(function (t) { var tw = x.measureText(t).width + 36; x.strokeStyle = INK; x.lineWidth = 3; rr(x, px, 1680, tw, 46, 10); x.stroke(); x.fillStyle = INK; x.fillText(t, px + 18, 1712); px += tw + 14; });
    return c;
  }
  function teksLatihan(D) {
    var t = 'Latihan ' + labelLatihan(D.it).toLowerCase() + ' saya: ' + fmtNum(D.v, D.desimal) + ' ' + D.it.unit + ' (nilai ' + fmtNum(D.nilai, 0) + ')' + (D.rekor ? ', rekor baru!' : '.') + (D.verif ? ' Terverifikasi ' + (D.verif === 'GPS' ? 'GPS' : 'kamera') + '.' : '');
    return t + ' Ukur kesiapan fisikmu sekarang juga di SIGAP, aplikasi JadiPrajurit, tersedia di Play Store dan App Store. Lihat hasilku:';
  }
  function bagikanLatihan(logId, key) {
    var l = S.catatan.filter(function (x) { return x.id === logId; })[0]; if (!l) return;
    share.mode = 'latihan'; share.logId = logId;
    share.key = key && l.items[key] != null ? key : ITEMS.filter(function (it) { return l.items[it.key] != null; })[0].key;
    go('bagikan');
  }
  function kartuBagikanLatihan() {
    var l = terakhirDisimpan && S.catatan.filter(function (x) { return x.id === terakhirDisimpan; })[0];
    if (!l) return '';
    var it = ITEMS.filter(function (i) { return l.items[i.key] != null; });
    var h = '<div class="card stack goodcard"><div class="row"><h2>Latihan tersimpan</h2><button type="button" class="linkbtn" id="tutup-bagikan-latihan">Tutup</button></div><p class="small muted" style="margin:0">Bagikan hasil latihanmu ke Instagram Story atau Status WhatsApp.</p><div class="btns">';
    it.forEach(function (i) { h += '<button type="button" class="btn ghost small" data-bagikan="' + esc(l.id) + '|' + i.key + '">' + esc(itemLabel(i)) + '</button>'; });
    return h + '</div></div>';
  }

  /* ---------------- Battle ---------------- */
  var LS_BATTLE = 'pelatih-garjas-battle-v1', LS_BATTLE_LINK = 'pelatih-garjas-battle-link', LS_ARENA_LINK = 'pelatih-garjas-arena-link';
  var ITEM_BATTLE = ['pushup', 'situp', 'pullup'];
  var BT = { data: null, loading: false, err: '', at: 0, lihat: null, buat: { item: 'pushup', lawan: '' } };
  function namaItem(k) { var it = ITEMS.filter(function (i) { return i.key === k; })[0]; return it ? itemLabel(it) : k; }
  function muatBattle(paksa) {
    if (!S.email || BT.loading) return;
    if (!paksa && BT.data && Date.now() - BT.at < 60000) return;
    BT.loading = true;
    api('battleDaftar', { email: S.email }).then(function (j) {
      BT.data = j; BT.at = Date.now(); BT.loading = false; BT.err = '';
      if (tab === 'battle' || tab === 'beranda') softRender();
    }, function (e) { BT.loading = false; BT.err = pesanError(e); if (tab === 'battle') render(); });
  }
  function muatLihatBattle(id) {
    BT.lihat = { id: id, data: null, err: '' };
    api('battle', { id: id }, 'GET').then(function (j) { if (BT.lihat && BT.lihat.id === id) { BT.lihat.data = j.battle; if (tab === 'battle') render(); } },
      function (e) { if (BT.lihat && BT.lihat.id === id) { BT.lihat.err = e && e.kode === 'tidak_ditemukan' ? 'Tantangan ini tidak ditemukan.' : pesanError(e); if (tab === 'battle') render(); } });
  }
  function bukaBattle() { muatBattle(true); muatLB(false); go('battle'); }
  function mulaiBattle(o) {
    lsSet(LS_BATTLE, Object.assign({ waktu: Date.now() }, o));
    location.href = 'kamera.html?item=' + encodeURIComponent(o.item) + '&battle=1';
  }
  // Skor dari halaman Tes Kamera dikirim ke server setelah kembali ke aplikasi.
  function prosesBattle() {
    var b = lsGet(LS_BATTLE);
    if (!b || !S.email || !b.selesai) return;
    lsSet(LS_BATTLE, null);
    if (Date.now() - (Number(b.waktu) || 0) > 3 * 3600 * 1000) { toast('Skor battle sudah kedaluwarsa. Ulangi tes kameranya.'); return; }
    tab = 'battle';
    var p = b.aksi === 'jawab' ? api('battleJawab', { email: S.email, id: b.id, skor: b.skor }) : api('battleBuat', { email: S.email, lawan: b.lawan || '', item: b.item, skor: b.skor });
    p.then(function (j) {
      var x = j.battle; BT.baru = x; lsSet(LS_BATTLE_LINK, null);
      toast(b.aksi === 'jawab' ? (x.hasil === 'menang' ? 'Kamu menang battle!' : x.hasil === 'seri' ? 'Battle berakhir seri.' : 'Kamu kalah kali ini. Ayo latihan lagi!') : 'Tantangan terkirim! Kirim link-nya ke lawanmu.');
      muatBattle(true); render();
    }, function (e) { toast(pesanError(e)); muatBattle(true); render(); });
  }
  function teksUndangBattle(x) {
    return 'Aku menantangmu battle ' + namaItem(x.item).toLowerCase() + ' 1 menit di SIGAP JadiPrajurit! Skorku ' + x.skorP + ' kali. Berani? Jawab sebelum ' + x.batas + ': ' + location.origin + location.pathname + '?b=' + x.id;
  }
  function kartuBattle(x) {
    var saya = x.peran === 'penantang', lawan = saya ? (x.ditantang || 'Siapa saja lewat link') : x.penantang;
    var skorSaya = saya ? x.skorP : x.skorD, nilaiSaya = saya ? x.nilaiP : x.nilaiD, skorLawan = saya ? x.skorD : x.skorP, nilaiLawan = saya ? x.nilaiD : x.nilaiP;
    var label = { menang: '<span class="tag good">Menang</span>', kalah: '<span class="tag">Kalah</span>', seri: '<span class="tag">Seri</span>' }[x.hasil] || { menunggu: '<span class="tag">Menunggu</span>', ditolak: '<span class="tag">Ditolak</span>', kedaluwarsa: '<span class="tag">Kedaluwarsa</span>' }[x.status] || '';
    var h = '<div class="hist"><div class="row"><span style="font-weight:700">' + esc(namaItem(x.item)) + ' · vs ' + esc(lawan) + '</span>' + label + '</div>';
    h += '<div class="small muted">Kamu ' + (skorSaya != null ? skorSaya + ' kali (nilai ' + fmtNum(nilaiSaya, 0) + ')' : 'belum tes') + ' · lawan ' + (skorLawan != null ? skorLawan + ' kali (nilai ' + fmtNum(nilaiLawan, 0) + ')' : 'belum tes') + '</div>';
    if (x.status === 'menunggu' && saya) h += '<div class="btns"><a class="btn ghost small" href="https://wa.me/?text=' + encodeURIComponent(teksUndangBattle(x)) + '" target="_blank" rel="noopener">Kirim link ke lawan</a><button type="button" class="btn ghost small" data-bsalin="' + esc(x.id) + '">Salin link</button></div><div class="tiny muted">Berlaku sampai ' + esc(x.batas) + '</div>';
    if (x.status === 'menunggu' && !saya) h += '<div class="btns"><button type="button" class="btn small" data-bjawab="' + esc(x.id) + '|' + esc(x.item) + '|' + esc(x.penantang) + '">Terima & mulai tes kamera</button><button type="button" class="btn ghost small" data-btolak="' + esc(x.id) + '">Tolak</button></div><div class="tiny muted">Jawab sebelum ' + esc(x.batas) + '</div>';
    if (x.status === 'selesai') h += '<div class="btns"><button type="button" class="btn ghost small" data-bshare="' + esc(x.id) + '">Bagikan hasil battle</button></div>';
    return h + '</div>';
  }
  function viewBattle() {
    var h = '<div class="top"><div><h1>Battle</h1><div class="sub">Tantang casis lain lewat tes kamera 1 menit. Nilai yang lebih tinggi menang.</div></div></div>';
    if (BT.data) {
      var r = BT.data.rekor;
      h += '<div class="hero"><div class="soft">Rekor battle-mu</div><div class="grid2" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div><div class="big" style="font-size:40px">' + r.menang + '</div><div class="soft">menang</div></div><div><div class="big" style="font-size:40px">' + r.kalah + '</div><div class="soft">kalah</div></div><div><div class="big" style="font-size:40px">' + r.seri + '</div><div class="soft">seri</div></div></div></div>';
    }
    // Tantangan dari link
    if (BT.lihat) {
      var L = BT.lihat.data;
      h += '<div class="card stack goodcard"><h2>Tantangan untukmu</h2>';
      if (BT.lihat.err) h += '<p class="small warn" style="margin:0">' + esc(BT.lihat.err) + '</p>';
      else if (!L) h += '<p class="small muted" style="margin:0">Memuat tantangan…</p>';
      else {
        h += '<p class="small" style="margin:0"><b>' + esc(L.penantang) + '</b> menantang battle <b>' + esc(namaItem(L.item).toLowerCase()) + '</b> 1 menit dengan skor <b>' + L.skorP + ' kali</b> (nilai ' + fmtNum(L.nilaiP, 0) + ').</p>';
        var milikSendiri = BT.data && BT.data.battle.some(function (x) { return x.id === L.id && x.peran === 'penantang'; });
        if (L.status !== 'menunggu') h += '<p class="small muted" style="margin:0">Tantangan ini sudah ' + esc(L.status) + '.</p>';
        else if (milikSendiri) h += '<p class="small muted" style="margin:0">Ini tantanganmu sendiri. Kirim link-nya ke teman.</p>';
        else if (!L.terbuka && !(BT.data && BT.data.battle.some(function (x) { return x.id === L.id; }))) h += '<p class="small muted" style="margin:0">Tantangan ini ditujukan untuk casis lain.</p>';
        else h += '<button type="button" class="btn" data-bjawab="' + esc(L.id) + '|' + esc(L.item) + '|' + esc(L.penantang) + '">Terima & mulai tes kamera</button><div class="tiny muted">Berlaku sampai ' + esc(L.batas) + '</div>';
      }
      h += '<button type="button" class="linkbtn" id="b-tutup-link">Tutup</button></div>';
    }
    var rl = BT.data && BT.data.rekorLive;
    h += '<div class="card stack goodcard"><div class="row"><h2>Duel live</h2><span class="tag good">Baru</span></div><p class="small muted" style="margin:0">Bertanding bersamaan dengan teman lewat tes kamera, lengkap dengan bar nyawa dan skor langsung. Teman cukup membuka link undangan.' + (rl ? ' Rekor duel live: ' + rl.menang + ' menang, ' + rl.kalah + ' kalah, ' + rl.seri + ' seri.' : '') + '</p>';
    h += '<div class="f">Gerakan<div class="chips">' + ITEM_BATTLE.map(function (k) { return '<button type="button" class="chip" data-bitem="' + k + '" aria-pressed="' + (BT.buat.item === k) + '">' + esc(namaItem(k)) + '</button>'; }).join('') + '</div></div>';
    h += '<button class="btn" id="a-buat">Buat ruang duel</button>';
    h += '<div style="display:flex;gap:8px"><input class="in" id="a-kode" maxlength="5" placeholder="Kode ruang, misal K7Q2M" style="text-transform:uppercase" aria-label="Kode ruang duel"><button type="button" class="btn ghost" id="a-masuk">Masuk</button></div></div>';
    if (BT.err) h += '<div class="note warnbox small">' + esc(BT.err) + '</div>';
    if (!BT.data) return h + '<div class="card" style="text-align:center"><span class="spin" aria-hidden="true"></span> Memuat battle…</div>';
    var list = BT.data.battle, masuk = list.filter(function (x) { return x.status === 'menunggu' && x.peran === 'ditantang'; });
    if (masuk.length) { h += '<div class="card stack"><h2>Tantangan masuk</h2>'; masuk.forEach(function (x) { h += kartuBattle(x); }); h += '</div>'; }
    // Buat tantangan
    var lawanList = [], ada = {};
    if (LB.data) (LB.data.nilai || []).concat(LB.data.rajin || []).forEach(function (x) { if (x.token && !ada[x.token]) { ada[x.token] = 1; lawanList.push(x); } });
    h += '<div class="card stack"><h2>Battle santai (48 jam)</h2><div class="f">Gerakan<div class="chips" role="group" aria-label="Gerakan battle">';
    ITEM_BATTLE.forEach(function (k) { h += '<button type="button" class="chip" data-bitem="' + k + '" aria-pressed="' + (BT.buat.item === k) + '">' + esc(namaItem(k)) + '</button>'; });
    h += '</div></div><label class="f">Lawan<select class="in" id="b-lawan"><option value="">Teman lewat link (siapa saja yang membuka link)</option>';
    lawanList.forEach(function (x) { h += '<option value="' + esc(x.token) + '"' + (BT.buat.lawan === x.token ? ' selected' : '') + '>' + esc(x.nama + ' · TNI ' + x.matra) + '</option>'; });
    h += '</select></label>';
    if (!LB.data) h += '<p class="tiny muted" style="margin:0">Daftar casis sedang dimuat dari Peringkat…</p>';
    h += '<button class="btn" id="b-mulai">Mulai tes kamera</button>';
    h += '<p class="tiny muted" style="margin:0">Skormu dikunci setelah tes kamera 1 menit selesai, lalu lawan punya waktu 48 jam untuk menjawab. Yang dibandingkan nilai sesuai tabel jenis kelamin dan matra masing-masing, jadi adil untuk semua. Maksimal 3 tantangan aktif.</p></div>';
    var keluar = list.filter(function (x) { return x.status === 'menunggu' && x.peran === 'penantang'; });
    if (keluar.length) { h += '<div class="card stack"><h2>Menunggu lawan</h2>'; keluar.forEach(function (x) { h += kartuBattle(x); }); h += '</div>'; }
    var riwayat = list.filter(function (x) { return x.status !== 'menunggu'; });
    if (riwayat.length) { h += '<div class="card stack"><h2>Riwayat battle</h2>'; riwayat.slice(0, 15).forEach(function (x) { h += kartuBattle(x); }); h += '</div>'; }
    return h;
  }
  function kartuBattleBeranda() {
    if (!BT.data) return '';
    var n = BT.data.battle.filter(function (x) { return x.status === 'menunggu' && x.peran === 'ditantang'; }).length;
    if (n) return '<div class="card stack goodcard"><h2>Ada ' + n + ' tantangan battle untukmu</h2><p class="small muted" style="margin:0">Jawab sebelum waktunya habis supaya tidak kedaluwarsa.</p><button class="btn" data-go-battle="1">Lihat tantangan</button></div>';
    return '<div class="card stack"><div class="row"><h2>Battle</h2><span class="tag">Baru</span></div><p class="small muted" style="margin:0">Tantang casis lain battle push-up, sit-up, atau ' + esc(namaItem('pullup').toLowerCase()) + ' lewat tes kamera.</p><button class="btn ghost" data-go-battle="1">Buka Battle</button></div>';
  }
  function gambarBattle(x) {
    var W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var MS = "'Montserrat', 'Public Sans', Arial, sans-serif", ST = "'Saira Stencil One', 'Archivo', Arial, sans-serif";
    var INK = '#F3F2EC', SOFT = '#C3D2BD', HIJAU = '#8CCB86', ORANYE = '#F29A38', LATAR = '#121810';
    g.fillStyle = LATAR; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(140,203,134,0.08)'; g.lineWidth = 2;
    for (var i = 0; i < W; i += 60) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
    for (var j = 0; j < H; j += 60) { g.beginPath(); g.moveTo(0, j); g.lineTo(W, j); g.stroke(); }
    g.strokeStyle = ORANYE; g.lineWidth = 8;
    [[80, 220, 1, 1], [1000, 220, -1, 1], [80, 1720, 1, -1], [1000, 1720, -1, -1]].forEach(function (b) { g.beginPath(); g.moveTo(b[0], b[1] + b[3] * 60); g.lineTo(b[0], b[1]); g.lineTo(b[0] + b[2] * 60, b[1]); g.stroke(); });
    if (logoStiker) g.drawImage(logoStiker, 118, 252, 720, 720 * logoStiker.height / logoStiker.width);
    g.fillStyle = HIJAU; g.font = '34px ' + ST; g.fillText('// BATTLE SIGAP · ' + namaItem(x.item).toUpperCase() + ' 1 MENIT', 130, 500);
    var menangP = x.hasil ? (x.peran === 'penantang' ? x.hasil === 'menang' : x.hasil === 'kalah') : false, seri = x.hasil === 'seri';
    var menangD = !seri && x.hasil && !menangP;
    function panel(y, nama, skor, nilai, menang) {
      g.fillStyle = menang ? 'rgba(242,154,56,0.14)' : 'rgba(243,242,236,0.05)'; rr(g, 130, y, 820, 300, 24); g.fill();
      if (menang) { g.strokeStyle = ORANYE; g.lineWidth = 5; rr(g, 130, y, 820, 300, 24); g.stroke(); }
      g.fillStyle = INK; g.font = '800 58px ' + MS; g.fillText(nama, 170, y + 84);
      if (menang) { g.font = '30px ' + ST; var t = 'MENANG', tw = g.measureText(t).width + 40; g.fillStyle = ORANYE; rr(g, 910 - tw, y + 36, tw, 54, 12); g.fill(); g.fillStyle = LATAR; g.fillText(t, 930 - tw, y + 74); }
      g.fillStyle = menang ? ORANYE : INK; g.font = '170px ' + ST; g.fillText(String(skor), 166, y + 262); var sw = g.measureText(String(skor)).width;
      g.fillStyle = SOFT; g.font = '52px ' + ST; g.fillText('KALI', 166 + sw + 20, y + 262);
      g.textAlign = 'right'; g.fillStyle = SOFT; g.font = '600 34px ' + MS; g.fillText('nilai', 910, y + 200); g.fillStyle = INK; g.font = '64px ' + ST; g.fillText(fmtNum(nilai, 0), 910, y + 262); g.textAlign = 'left';
    }
    panel(560, x.penantang, x.skorP, x.nilaiP, menangP);
    g.fillStyle = ORANYE; g.font = '96px ' + ST; g.textAlign = 'center'; g.fillText('VS', 540, 966); g.textAlign = 'left';
    panel(1010, x.ditantang || '?', x.skorD, x.nilaiD, menangD);
    g.fillStyle = seri ? HIJAU : INK; g.font = '800 40px ' + MS;
    g.fillText(seri ? 'Hasil seri! Sama kuatnya.' : (menangP ? x.penantang : x.ditantang) + ' memenangkan battle!', 130, 1400);
    g.fillStyle = SOFT; g.font = '600 30px ' + MS; g.fillText('Dihitung kamera · nilai sesuai jenis kelamin & matra', 130, 1452);
    g.strokeStyle = 'rgba(140,203,134,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(130, 1588); g.lineTo(950, 1588); g.stroke();
    g.fillStyle = INK; g.font = '800 32px ' + MS; g.fillText('Berani tantang aku? Ukur kesiapan fisikmu', 130, 1630); g.fillText('di aplikasi JadiPrajurit.', 130, 1668);
    g.font = '28px ' + ST; g.fillStyle = ORANYE; g.fillText('TERSEDIA DI', 130, 1712);
    var px = 318;
    ['PLAY STORE', 'APP STORE'].forEach(function (t) { var tw = g.measureText(t).width + 36; g.strokeStyle = INK; g.lineWidth = 3; rr(g, px, 1680, tw, 46, 10); g.stroke(); g.fillStyle = INK; g.fillText(t, px + 18, 1712); px += tw + 14; });
    return c;
  }
  function gambarArena(a) {
    var W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    var g = c.getContext('2d');
    var MS = "'Montserrat', 'Public Sans', Arial, sans-serif", ST = "'Saira Stencil One', 'Archivo', Arial, sans-serif";
    var INK = '#F3F2EC', SOFT = '#C3D2BD', HIJAU = '#8CCB86', ORANYE = '#F29A38', LATAR = '#121810';
    g.fillStyle = LATAR; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(140,203,134,0.08)'; g.lineWidth = 2;
    for (var i = 0; i < W; i += 60) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
    for (var j = 0; j < H; j += 60) { g.beginPath(); g.moveTo(0, j); g.lineTo(W, j); g.stroke(); }
    g.strokeStyle = ORANYE; g.lineWidth = 8;
    [[80, 220, 1, 1], [1000, 220, -1, 1], [80, 1720, 1, -1], [1000, 1720, -1, -1]].forEach(function (b) { g.beginPath(); g.moveTo(b[0], b[1] + b[3] * 60); g.lineTo(b[0], b[1]); g.lineTo(b[0] + b[2] * 60, b[1]); g.stroke(); });
    if (logoStiker) g.drawImage(logoStiker, 118, 252, 720, 720 * logoStiker.height / logoStiker.width);
    g.fillStyle = HIJAU; g.font = '34px ' + ST; g.fillText('// DUEL LIVE SIGAP · ' + namaItem(a.item).toUpperCase() + ' 1 MENIT', 130, 500);
    var hs = a.hasil.slice(0, 6), juara = hs.filter(function (x) { return x.rank === 1; }).length;
    var tinggi = hs.length <= 2 ? 300 : hs.length <= 4 ? 190 : 140, gap = hs.length <= 2 ? 120 : 24, y = 560;
    hs.forEach(function (x, idx) {
      var top = x.rank === 1;
      g.fillStyle = top ? 'rgba(242,154,56,0.14)' : 'rgba(243,242,236,0.05)'; rr(g, 130, y, 820, tinggi, 24); g.fill();
      if (top) { g.strokeStyle = ORANYE; g.lineWidth = 5; rr(g, 130, y, 820, tinggi, 24); g.stroke(); }
      var fs = tinggi >= 300 ? 170 : tinggi >= 190 ? 110 : 80;
      g.fillStyle = INK; g.font = '800 ' + (tinggi >= 190 ? 52 : 42) + 'px ' + MS; g.fillText(x.rank + '. ' + x.nama + (x.token === a.token ? ' (aku)' : ''), 170, y + (tinggi >= 190 ? 74 : 60));
      if (top) { g.font = '28px ' + ST; var t = juara > 1 ? 'SERI' : 'MENANG', tw = g.measureText(t).width + 36; g.fillStyle = ORANYE; rr(g, 910 - tw, y + 28, tw, 50, 12); g.fill(); g.fillStyle = LATAR; g.fillText(t, 928 - tw, y + 63); }
      g.fillStyle = top ? ORANYE : INK; g.font = fs + 'px ' + ST; g.fillText(String(x.skor), 166, y + tinggi - 28); var sw = g.measureText(String(x.skor)).width;
      g.fillStyle = SOFT; g.font = Math.round(fs * 0.3) + 'px ' + ST; g.fillText('KALI', 166 + sw + 16, y + tinggi - 28);
      g.textAlign = 'right'; g.fillStyle = SOFT; g.font = '600 30px ' + MS; g.fillText('nilai', 910, y + tinggi - 82); g.fillStyle = INK; g.font = '56px ' + ST; g.fillText(fmtNum(x.nilai, 0), 910, y + tinggi - 28); g.textAlign = 'left';
      y += tinggi + gap;
      if (idx === 0 && hs.length === 2) { g.fillStyle = ORANYE; g.font = '80px ' + ST; g.textAlign = 'center'; g.fillText('VS', 540, y - gap / 2 + 28); g.textAlign = 'left'; }
    });
    g.fillStyle = SOFT; g.font = '600 30px ' + MS; g.fillText('Dihitung kamera · nilai sesuai jenis kelamin & matra', 130, 1540);
    g.strokeStyle = 'rgba(140,203,134,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(130, 1588); g.lineTo(950, 1588); g.stroke();
    g.fillStyle = INK; g.font = '800 32px ' + MS; g.fillText('Berani duel live? Ukur kesiapan fisikmu', 130, 1630); g.fillText('di aplikasi JadiPrajurit.', 130, 1668);
    g.font = '28px ' + ST; g.fillStyle = ORANYE; g.fillText('TERSEDIA DI', 130, 1712);
    var px = 318;
    ['PLAY STORE', 'APP STORE'].forEach(function (t) { var tw = g.measureText(t).width + 36; g.strokeStyle = INK; g.lineWidth = 3; rr(g, px, 1680, tw, 46, 10); g.stroke(); g.fillStyle = INK; g.fillText(t, px + 18, 1712); px += tw + 14; });
    return c;
  }
  function teksArena(a) {
    var saya = a.hasil.filter(function (x) { return x.token === a.token; })[0], juara = a.hasil.filter(function (x) { return x.rank === 1; });
    var hasilTxt = saya && saya.rank === 1 ? (juara.length > 1 ? 'Hasilnya seri!' : 'Aku menang!') : juara[0].nama + ' menang!';
    return 'Duel live ' + namaItem(a.item).toLowerCase() + ' SIGAP: ' + a.hasil.map(function (x) { return x.nama + ' ' + x.skor + ' kali'; }).join(' vs ') + '. ' + hasilTxt + ' Berani duel live? Ukur kesiapan fisikmu di SIGAP, aplikasi JadiPrajurit, tersedia di Play Store dan App Store:';
  }
  function teksBattle(x) {
    var seri = x.hasil === 'seri', pemenang = x.hasil === 'menang' ? 'Aku menang' : x.hasil === 'kalah' ? (x.peran === 'penantang' ? x.ditantang : x.penantang) + ' menang' : 'Hasilnya seri';
    return 'Battle ' + namaItem(x.item).toLowerCase() + ' SIGAP: ' + x.penantang + ' ' + x.skorP + ' kali vs ' + x.ditantang + ' ' + x.skorD + ' kali. ' + pemenang + (seri ? '!' : '!') + ' Berani tantang aku? Ukur kesiapan fisikmu di SIGAP, aplikasi JadiPrajurit, tersedia di Play Store dan App Store:';
  }

  /* ---------------- Halaman hasil publik (?h=KODE) ---------------- */
  var landing = { kode: null, data: null, err: '', aktif: false };
  function viewLanding() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '</div></div>';
    if (!landing.data) return h + '<div class="card" style="text-align:center">' + (landing.err ? '<p class="small muted" style="margin:0 0 10px">' + esc(landing.err) + '</p>' : '<span class="spin" aria-hidden="true"></span> Memuat hasil…') + '</div>' + ctaLanding();
    var d = landing.data, tg = d.target || 100;
    h += '<div><h1 style="margin:0;font-family:Archivo,sans-serif;font-weight:800;font-size:26px;line-height:1.2">' + esc(d.nama) + ' sedang bersiap untuk tes jasmani TNI</h1><div class="sub">' + esc('TNI ' + d.matra) + '</div></div>';
    h += '<section class="hero"><div class="soft">Prediksi nilai jasmani</div><div style="display:flex;align-items:baseline;gap:8px"><span class="big">' + fmtNum(d.nilai, 1) + '</span><span class="soft">/ 100</span></div>';
    h += '<div class="hbar" aria-hidden="true"><i style="width:' + Math.max(2, Math.min(100, d.nilai || 0)) + '%"></i><b style="left:calc(' + Math.min(100, tg) + '% - 1px)"></b></div>';
    if (d.rankNilai) h += '<div class="soft" style="color:var(--hero-ink)">Peringkat <b>#' + d.rankNilai + '</b> dari ' + d.totalNilai + ' casis SIGAP</div>';
    h += '</section><div class="card">';
    d.items.forEach(function (x) {
      var it = ITEMS.filter(function (i) { return i.key === x.key; })[0], ok = x.nilai != null && x.nilai >= tg;
      h += '<div class="item"><div class="row"><span style="font-weight:600">' + esc(N.label(it, d.gender)) + '</span><span class="small muted">' + (x.raw != null ? fmtNum(x.raw, 1) + ' ' + it.unit + ' · <b class="' + (ok ? 'good' : 'warn') + '">Nilai ' + fmtNum(x.nilai, 0) + '</b>' : 'belum dicatat') + '</span></div><div class="bar" aria-hidden="true"><i style="width:' + (x.nilai || 0) + '%;background:' + (ok ? 'var(--good-bar)' : 'var(--warn-bar)') + '"></i><b style="left:' + Math.min(100, tg) + '%"></b></div></div>';
    });
    h += '</div>';
    return h + ctaLanding();
  }
  function ctaLanding() {
    var h = '<div class="card stack"><h2>Seberapa siap fisikmu?</h2><p class="small muted" style="margin:0">Catat latihanmu, lihat prediksi nilai jasmani, dapatkan program latihan mingguan, dan bersaing di peringkat casis. Gratis.</p>';
    if (S.email) h += '<button class="btn" id="landing-app">Buka aplikasiku</button>';
    else h += '<button class="btn" id="landing-daftar">Ukur nilaimu sekarang</button><p class="small muted" style="text-align:center;margin:0">Sudah punya akun? <button type="button" class="linkbtn" style="color:var(--good)" id="landing-masuk">Masuk</button></p>';
    return h + '</div>';
  }
  function tutupLanding(view) {
    landing.aktif = false;
    try { history.replaceState(null, '', location.pathname); } catch (e) { }
    if (view) authView = view;
    tab = 'beranda'; render(); window.scrollTo(0, 0);
  }

  /* ---------------- Profil ---------------- */
  function viewProfil() {
    var p = S.profil;
    var h = '<div class="top"><div><h1>Profil &amp; data diri</h1><div class="sub">Terdaftar sejak ' + esc(p.regAt ? fmtDate(p.regAt) : '-') + '</div></div></div>';
    h += '<div class="card stack"><h2>Data diri</h2>' + profileForm(p, false);
    h += '<div id="auth-msg" class="small warn" role="alert"></div>';
    h += '<button class="btn" id="save-profile"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Menyimpan…' : 'Simpan data diri') + '</button></div>';
    h += '<div class="card stack"><details><summary>Standar nilai (' + gender() + ')</summary><div class="stack" style="margin-top:10px"><div class="note ' + (CFG && CFG.standarResmi ? 'plain' : 'warnbox') + '">' + standarNote() + '</div>';
    ITEMS.forEach(function (it) {
      var lbl = itemLabel(it), t = [];
      for (var v = 0; v <= 100; v += 10) { var r = N.hasilUntukNilai(it.key, v, gender()); if (r != null) t.push(fmtNum(r, it.key === 'shuttle' ? 1 : 0) + ' → ' + v); }
      h += '<div class="small"><b>' + esc(lbl) + '</b> <span class="muted">(' + it.unit + ', hasil → nilai)</span><br>' + esc(t.join(', ')) + '</div>';
    });
    h += '</div></details></div>';
    h += grupCard();
    h += adminCard();
    h += '<div class="card stack"><h2>Akun</h2><p class="small muted" style="margin:0">Masuk sebagai ' + esc(p.email) + '.</p><button class="btn ghost" id="logout">Keluar</button></div>';
    return h;
  }
  function saveProfile() {
    var r = readProfileForm(false);
    if (r.err.length) { setAuthMsg('Lengkapi: ' + r.err.join(', ') + '.'); return; }
    busy = true; render();
    api('simpanProfil', { email: S.email, profil: r.data }).then(function (j) {
      busy = false; S.profil = j.profil; simpanSesi(); LB.at = 0; render(); toast('Data diri tersimpan.');
    }, function (e) { busy = false; render(); setAuthMsg(pesanError(e)); });
  }

  /* ---------------- Halaman cek (?cek=1) ---------------- */
  function renderCek() {
    document.querySelector('nav.tabs').style.display = 'none';
    var rows = [];
    function baris(ok, judul, ket) { rows.push('<div class="baris"><span class="ikon" aria-hidden="true">' + (ok === true ? '✅' : ok === false ? '❌' : ok === 'warn' ? '⚠️' : '⏳') + '</span><div><div style="font-weight:700">' + esc(judul) + '</div>' + (ket ? '<div class="small muted">' + ket + '</div>' : '') + '</div></div>'); }
    function tampil() { $('#app').innerHTML = '<div class="stack"><div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Cek sistem</h1><div class="sub">Versi web ' + VERSI + '</div></div></div><div class="card cek">' + rows.join('') + '</div><a class="btn ghost" href="./">Buka aplikasi</a></div>'; }
    var vf = window.VERSI_FILE || {}, meta = (document.querySelector('meta[name="tmb-versi"]') || {}).content;
    var cssV = getComputedStyle(document.documentElement).getPropertyValue('--versi').replace(/["'\s]/g, '');
    var semua = { 'index.html': meta, 'css/style.css': cssV, 'js/nilai.js': vf['nilai.js'], 'js/app.js': vf['app.js'] };
    var beda = Object.keys(semua).filter(function (k) { return semua[k] !== VERSI; });
    baris(!beda.length, 'Semua file versi ' + VERSI, beda.length ? 'Belum terbaru: ' + esc(beda.map(function (k) { return k + ' (' + (semua[k] || 'tidak terbaca') + ')'; }).join(', ')) + '. Upload ulang file tersebut ke folder yang benar.' : 'index.html, css/style.css, js/nilai.js, js/app.js');
    var url = window.CONFIG && window.CONFIG.APPS_SCRIPT_URL;
    var urlOk = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url || '');
    baris(urlOk, 'URL Apps Script di js/config.js', urlOk ? 'Terisi dan formatnya benar.' : (url ? 'Format URL tidak dikenali. Pastikan diakhiri /exec.' : 'Masih kosong. Tempel URL Web app dari Apps Script.'));
    baris(lsSet('pelatih-garjas-cek', 1) ? true : 'warn', 'Penyimpanan di perangkat', 'Dipakai untuk mengingat login. Bila ⚠️, pengguna harus masuk ulang setiap membuka aplikasi.');
    lsSet('pelatih-garjas-cek', null);
    var idx = rows.length; baris(null, 'Backend Google terhubung', 'Memeriksa…'); tampil();
    if (!urlOk) { rows[idx] = ''; baris(false, 'Backend Google terhubung', 'Dilewati karena URL belum benar.'); tampil(); return; }
    api('ping', null, 'GET').then(function (j) {
      rows[idx] = ''; baris(true, 'Backend Google terhubung', 'Versi backend ' + esc(j.versi) + '.');
      baris(j.versi === BACKEND_DIHARAPKAN ? true : 'warn', 'Versi backend ' + BACKEND_DIHARAPKAN, j.versi === BACKEND_DIHARAPKAN ? 'Sesuai dengan versi web.' : 'Backend masih versi ' + esc(j.versi) + '. Tempel Code.gs terbaru, jalankan setup, lalu Deploy → Manage deployments → pensil → New version.');
      return api('config', null, 'GET');
    }).then(function (c) {
      var KC = window.CONFIG || {};
      baris(KC.SUPABASE_URL && KC.SUPABASE_KEY ? true : false, 'Duel live (Supabase)', KC.SUPABASE_URL && KC.SUPABASE_KEY ? 'Alamat dan kunci Supabase terpasang. Status koneksi terlihat di lobi duel (harus "Terhubung").' : 'SUPABASE_URL atau SUPABASE_KEY di js/config.js masih kosong.');
      var urut = [];
      ['Pria', 'Wanita'].forEach(function (g) {
        ITEMS.forEach(function (it) {
          var t = (c.standar && c.standar[g] && c.standar[g][it.key]) || [];
          for (var i = 1; i < t.length; i++) {
            var naikNilai = t[i][1] - t[i - 1][1];
            if ((it.key === 'shuttle' && naikNilai > 0) || (it.key !== 'shuttle' && naikNilai < 0)) { urut.push(g + ' ' + it.label); break; }
            if (t[i][0] === t[i - 1][0]) { urut.push(g + ' ' + it.label + ' (hasil ganda)'); break; }
          }
        });
      });
      baris(urut.length ? false : true, 'Urutan tabel nilai', urut.length ? 'Tidak berurutan, periksa baris: ' + esc(urut.join(', ')) + '. Hasil lebih baik harus bernilai lebih tinggi (shuttle run: waktu lebih cepat bernilai lebih tinggi).' : 'Semua tabel berurutan dengan benar.');
      baris(Array.isArray(c.syarat) ? (c.syarat.length ? true : 'warn') : false, 'Syarat pendaftaran (tab Syarat)', Array.isArray(c.syarat) ? (c.syarat.length ? c.syarat.length + ' syarat aktif, wajib diunggah buktinya saat daftar.' : 'Tidak ada syarat aktif, pendaftaran tanpa bukti.') : 'Backend belum mengirim data syarat. Deploy versi backend terbaru.');
      var sm = c.standarMatra || {}, daftarM = ['AD', 'AL', 'AU'].filter(function (m) { return sm[m]; }).map(function (m) { var n = 0; ['Pria', 'Wanita'].forEach(function (g) { n += Object.keys((sm[m] || {})[g] || {}).length; }); return 'TNI ' + m + ' (' + n + ' tabel)'; });
      baris(true, 'Tabel khusus matra', daftarM.length ? 'Terpasang: ' + esc(daftarM.join(', ')) + '. Item yang belum diisi memakai tabel Semua.' : 'Belum ada. Semua matra memakai tabel Semua.');
      baris(c.standarLengkap ? true : 'warn', 'Tab Standar Nilai', c.standarLengkap ? 'Semua item untuk Pria dan Wanita terbaca.' : 'Ada item yang kurang dari 2 baris, sementara memakai tabel contoh untuk item itu.');
      baris(c.standarResmi ? true : 'warn', 'Standar nilai resmi', c.standarResmi ? 'Sumber: ' + esc(c.sumberStandar || '(belum diisi)') : (c.sumberStandar ? 'Sumber: ' + esc(c.sumberStandar) + '. Ubah standar_resmi menjadi YA di tab Pengaturan setelah dicocokkan dengan juknis.' : 'Masih tabel contoh. Isi tabel resmi lalu ubah standar_resmi menjadi YA di tab Pengaturan.'));
      baris(c.linkGrup ? true : 'warn', 'Link grup WhatsApp', c.linkGrup ? 'Terisi.' : 'Kosong (opsional). Isi link_grup_wa di tab Pengaturan.');
      baris(c.waAdmin ? true : 'warn', 'Nomor WA admin', c.waAdmin ? 'Terisi.' : 'Kosong (opsional). Isi wa_admin di tab Pengaturan.');
      tampil();
    }).catch(function (e) {
      rows[idx] = ''; baris(false, 'Backend Google terhubung', esc(pesanError(e)) + ' Pastikan deployment Web app diatur "Anyone" dan fungsi setup sudah dijalankan.'); tampil();
    });
  }

  /* ---------------- Render & event ---------------- */
  var toastTimer = null;
  function toast(t) { var el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.classList.remove('show'); }, 4200); }
  function render() {
    N.setMatra(S.profil && S.profil.matra);
    if (tab === 'catat') readDraftFromForm();
    var nav = document.querySelector('nav.tabs'), v, gate = !S.email;
    if (landing.aktif) { gate = true; v = viewLanding(); }
    else if (gate) v = authView === 'login' ? viewLogin() : authView === 'daftar' ? viewDaftar() : authView === 'syarat' ? viewSyaratDaftar() : viewAwal();
    else if (perluLengkapiSyarat()) { gate = true; v = viewLengkapiSyarat(); }
    else if (perluSimpanAdmin()) { gate = true; v = viewSimpanAdmin(); }
    else v = tab === 'catat' ? viewCatat() : tab === 'progres' ? viewProgres() : tab === 'peringkat' ? viewPeringkat() : tab === 'battle' ? viewBattle() : tab === 'bagikan' ? viewBagikan() : tab === 'program' ? viewProgram() : tab === 'profil' ? viewProfil() : viewBeranda();
    $('#app').innerHTML = '<div class="stack">' + v + '</div>';
    nav.style.display = gate ? 'none' : '';
    if (!gate) renderNav();
    if (!gate && tab === 'beranda' && S.catatan.length && !LB.data && !LB.loading && !LB.err) muatLB(false).catch(function () { });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button,a'); if (!b) return;
    if (b.dataset.tab) { go(b.dataset.tab); return; }
    if (b.dataset.go) { if (b.dataset.go === 'bagikan') share.mode = 'ringkasan'; go(b.dataset.go); return; }
    if (b.dataset.bagikan) { var pb = b.dataset.bagikan.split('|'); bagikanLatihan(pb[0], pb[1]); return; }
    if (b.dataset.shareMode) { share.mode = 'ringkasan'; go('bagikan'); return; }
    if (b.id === 'tutup-bagikan-latihan') { terakhirDisimpan = null; render(); return; }
    if (b.id === 'kirim-syarat') { if (!busy) kirimSyarat(); return; }
    if (b.dataset.goBattle) { bukaBattle(); return; }
    if (b.id === 'a-buat') { location.href = 'kamera.html?arena=baru&item=' + encodeURIComponent(BT.buat.item); return; }
    if (b.id === 'a-masuk') { var kd = String(($('#a-kode') || {}).value || '').trim().toUpperCase(); if (!/^[A-Z0-9]{5}$/.test(kd)) { toast('Kode ruang terdiri dari 5 huruf atau angka.'); return; } location.href = 'kamera.html?arena=' + kd; return; }
    if (b.dataset.btantang) { BT.buat.lawan = b.dataset.btantang; bukaBattle(); return; }
    if (b.dataset.bitem) { BT.buat.item = b.dataset.bitem; var sl = $('#b-lawan'); if (sl) BT.buat.lawan = sl.value; render(); return; }
    if (b.id === 'b-mulai') { var sl2 = $('#b-lawan'); BT.buat.lawan = sl2 ? sl2.value : ''; var opt2 = sl2 && sl2.options[sl2.selectedIndex]; mulaiBattle({ aksi: 'buat', item: BT.buat.item, lawan: BT.buat.lawan, lawanNama: BT.buat.lawan && opt2 ? opt2.textContent : '' }); return; }
    if (b.dataset.bjawab) { var pj = b.dataset.bjawab.split('|'); mulaiBattle({ aksi: 'jawab', id: pj[0], item: pj[1], lawanNama: pj[2] }); return; }
    if (b.dataset.btolak) { if (!confirm('Tolak tantangan ini?')) return; api('battleTolak', { email: S.email, id: b.dataset.btolak }).then(function () { toast('Tantangan ditolak.'); muatBattle(true); }, function (e) { toast(pesanError(e)); }); return; }
    if (b.dataset.bsalin) { var xb = BT.data && BT.data.battle.filter(function (y) { return y.id === b.dataset.bsalin; })[0]; if (xb) salinTeks(teksUndangBattle(xb), 'Link tantangan disalin.'); return; }
    if (b.dataset.bshare) { var xs = BT.data && BT.data.battle.filter(function (y) { return y.id === b.dataset.bshare; })[0]; if (xs) { share.mode = 'battle'; share.battle = xs; go('bagikan', true); } return; }
    if (b.id === 'b-tutup-link') { BT.lihat = null; lsSet(LS_BATTLE_LINK, null); render(); return; }
    if (b.dataset.pick) { progressPick = b.dataset.pick; render(); return; }
    if (b.dataset.lbmode) { lbMode = b.dataset.lbmode; render(); return; }
    if (b.dataset.lbmatra) { lbMatra = b.dataset.lbmatra; render(); return; }
    if (b.dataset.check) { checkin = b.dataset.check === 'reset' ? null : b.dataset.check; render(); return; }
    if (b.dataset.del) { hapusLog(b.dataset.del); return; }
    if (b.dataset.timer) { if (timer.mode !== b.dataset.timer) { stopTick(); lockScreen(false); timer = { mode: b.dataset.timer, running: false, start: 0, elapsed: 0, done: false, iv: null }; } render(); return; }
    if (b.dataset.tctl) { timerCtl(b.dataset.tctl); return; }
    switch (b.id) {
      case 'do-register': if (!busy) doRegister(); break;
      case 'do-login': if (!busy) doLogin(); break;
      case 'go-login': authView = 'login'; authMsg = ''; render(); break;
      case 'go-daftar': authView = 'daftar'; authMsg = ''; render(); break;
      case 'go-awal': authView = 'awal'; authMsg = ''; render(); break;
      case 'do-daftar-final': if (!busy) kirimDaftar(); break;
      case 'save-log': if (!busy) saveLog(); break;
      case 'clear-log': draft = { date: todayStr(), items: {}, sim: false, note: '' }; tab = 'catat'; var d = $('#f-date'); if (d) d.value = ''; ITEMS.forEach(function (it) { var el = $('#f-' + it.key); if (el) el.value = ''; }); render(); break;
      case 'save-profile': if (!busy) saveProfile(); break;
      case 'logout': logout(); break;
      case 'confirm-admin': if (!busy) konfirmasiAdmin(); break;
      case 'syarat-buka': bukaSyarat(); break;
      case 'syarat-tutup': tutupSyarat(); break;
      case 'syarat-lanjut': if (buktiLengkap()) { tutupSyarat(); var pn = $('#p-name'); if (pn) pn.focus(); } break;
      case 'lb-refresh': muatLB(true).catch(function () { }); render(); break;
      case 'share-native': bagikanNative(); break;
      case 'share-copy':
        (function (t) { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast('Link disalin.'); }, function () { toast('Salin manual link di atas.'); }); else toast('Salin manual link di atas.'); })(linkBagikan());
        break;
      case 'landing-daftar': if (landing.kode) lsSet(LS_REF, landing.kode); tutupLanding('daftar'); break;
      case 'landing-masuk': tutupLanding('login'); break;
      case 'landing-app': tutupLanding(null); break;
      case 'copy-week': copyText(weekSummary().full); break;
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'login-email') { e.preventDefault(); if (!busy) doLogin(); } });
  document.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.item;
    if (k) {
      var v = num(e.target.value), s = v != null ? score(k, v) : null, h = $('#h-' + k); if (h) h.textContent = s != null ? 'Nilai ' + fmtNum(s, 0) : '';
      if (draft.verif && draft.verif[k] && v !== draft.verif[k].nilai) { delete draft.verif[k]; var t = $('#vf-' + k); if (t) t.remove(); }
    }
  });

  /* ---------------- Mulai ---------------- */
  if (/[?&]cek=1/.test(location.search)) { renderCek(); return; }
  (function () {
    var vf = window.VERSI_FILE || {}, cssV = getComputedStyle(document.documentElement).getPropertyValue('--versi').replace(/["'\s]/g, '');
    if (vf['nilai.js'] !== VERSI || (cssV && cssV !== VERSI)) {
      var b = document.createElement('div');
      b.setAttribute('role', 'alert');
      b.style.cssText = 'position:sticky;top:0;z-index:9;background:#9A4207;color:#fff;padding:10px 14px;font-weight:700;font-size:14px;display:flex;gap:10px;align-items:center;justify-content:space-between';
      b.innerHTML = '<span>Aplikasi baru saja diperbarui. Muat ulang supaya semua fitur berjalan benar.</span>';
      var btn = document.createElement('button'); btn.textContent = 'Muat ulang'; btn.style.cssText = 'min-height:40px;border:0;border-radius:10px;padding:0 12px;font-weight:700;cursor:pointer';
      btn.onclick = function () { location.reload(); }; b.appendChild(btn); document.body.insertBefore(b, document.body.firstChild);
    }
  })();
  var mh = location.search.match(/[?&]h=([A-Za-z0-9]{6,12})/);
  if (mh) {
    landing.kode = mh[1].toUpperCase(); landing.aktif = true;
    api('hasil', { k: landing.kode }, 'GET').then(function (j) { landing.data = j; if (landing.aktif) render(); },
      function (e) { landing.err = e && e.kode === 'tidak_ditemukan' ? 'Hasil ini tidak ditemukan.' : 'Hasil belum bisa dimuat.'; if (landing.aktif) render(); });
  }
  var ma = location.search.match(/[?&]arena=([A-Za-z0-9]{5})/);
  if (ma) { lsSet(LS_ARENA_LINK, ma[1].toUpperCase()); try { history.replaceState(null, '', location.pathname); } catch (e) { } }
  var mb = location.search.match(/[?&]b=(B[A-Z0-9]{9})/);
  if (mb) { lsSet(LS_BATTLE_LINK, mb[1]); try { history.replaceState(null, '', location.pathname); } catch (e) { } }
  var sesi = lsGet(LS_SESI);
  if (sesi && sesi.email && sesi.profil) {
    S = { email: sesi.email, profil: sesi.profil, catatan: Array.isArray(sesi.catatan) ? sesi.catatan : [] }; terimaHasil();
    var al0 = lsGet(LS_ARENA_LINK);
    if (al0) { lsSet(LS_ARENA_LINK, null); location.replace('kamera.html?arena=' + al0); return; }
    if (/[?&]bagikan=arena/.test(location.search)) { var sa = lsGet('pelatih-garjas-arena-share'); try { history.replaceState(null, '', location.pathname); } catch (e) { } if (sa && Date.now() - sa.waktu < 6 * 3600 * 1000) { share.mode = 'arena'; share.arena = sa; tab = 'bagikan'; setTimeout(siapkanBagikan, 0); } }
    if (lsGet(LS_BATTLE)) prosesBattle();
    var bl = lsGet(LS_BATTLE_LINK); if (bl) { muatLihatBattle(bl); tab = 'battle'; muatLB(false); }
    muatBattle(true);
  } else if (lsGet(LS_ARENA_LINK)) { authView = 'awal'; authMsg = 'Kamu diajak duel live! Sudah punya akun? Pilih Masuk. Belum? Buat akun singkat, bukti syarat menyusul setelah duel.'; }
  else if (lsGet(LS_BATTLE_LINK)) { authMsg = 'Kamu ditantang battle! Daftar atau masuk dulu untuk menjawab tantangannya.'; }
  else { authView = lsGet(LS_KIRIM) ? 'login' : 'awal'; if (lsGet(LS_KIRIM)) authMsg = 'Masuk dulu untuk menyimpan hasil tesmu.'; }
  muatConfig().then(function () { if (!busy) render(); }, function () { });
  render();
  if (S.email) {
    api('masuk', { email: S.email }).then(function (j) {
      S = { email: j.profil.email, profil: j.profil, catatan: j.catatan || [] }; S.catatan = gabungAntre(S.catatan); simpanSesi(); kirimAntre();
      var a = document.activeElement;
      if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !busy) render();
    }, function (e) {
      if (e && e.kode === 'tidak_ditemukan') { S = { email: null, profil: null, catatan: [] }; simpanSesi(); authView = 'login'; authMsg = 'Data akunmu tidak ditemukan di server. Masuk ulang atau daftar.'; render(); }
    });
  }
})();
