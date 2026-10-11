/*
 * Pelatih Garjas – JadiPrajurit
 * Tampilan dan alur aplikasi. Data disimpan ke Google Sheets lewat Apps Script.
 */
(function () {
  'use strict';
  var VERSI = '2026.10.11';
  (window.VERSI_FILE = window.VERSI_FILE || {})['app.js'] = VERSI;

  var N = window.Nilai, ITEMS = N.ITEMS;
  var LS_SESI = 'pelatih-garjas-sesi-v1', LS_CONFIG = 'pelatih-garjas-config-v1';
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
  var tab = 'beranda', authView = 'daftar', authMsg = '', busy = false;
  var progressPick = 'garjas', checkin = null;
  var draft = { date: todayStr(), items: {}, sim: false, note: '' };
  var timer = { mode: null, running: false, start: 0, elapsed: 0, done: false, iv: null };
  var audioCtx = null, wakeLock = null;

  function gender() { return S.profil && S.profil.gender === 'Wanita' ? 'Wanita' : 'Pria'; }
  function itemLabel(it) { return N.label(it, gender()); }
  function score(key, raw) { return N.score(key, raw, gender()); }
  function target() { return S.profil && Number(S.profil.target) > 0 ? Number(S.profil.target) : (CFG && CFG.targetDefault) || 70; }
  function simpanSesi() { lsSet(LS_SESI, S.email ? S : null); }

  /* ---------------- API ---------------- */
  function api(action, data, method) {
    var url = window.CONFIG && window.CONFIG.APPS_SCRIPT_URL;
    if (!url) return Promise.reject({ kode: 'belum_diatur' });
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    var req = method === 'GET'
      ? fetch(url + '?action=' + encodeURIComponent(action) + '&t=' + Date.now(), { signal: ctl && ctl.signal })
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
    return 'Terjadi gangguan di server. Coba lagi sebentar.';
  }

  function muatConfig() {
    var c = lsGet(LS_CONFIG);
    if (c) { CFG = c; N.setStandar(c.standar); }
    return api('config', null, 'GET').then(function (j) {
      CFG = j; N.setStandar(j.standar); lsSet(LS_CONFIG, j); return j;
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
    if (CFG.standarResmi) return 'Standar nilai resmi' + (CFG.sumberStandar ? ' (sumber: ' + esc(CFG.sumberStandar) + ')' : '') + '.';
    return 'Tabel nilai masih contoh, belum tabel resmi.';
  }

  /* ---------------- Ikon & navigasi ---------------- */
  var IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    plus: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M12 8v8M8 12h8"/>',
    chart: '<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.5 2-5.5 1 1 1.5 2 1.5 3 0-3 .5-5.5 1.5-7.5z"/>'
  };
  function icon(n, size) { return '<svg aria-hidden="true" width="' + (size || 22) + '" height="' + (size || 22) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + IC[n] + '</svg>'; }
  var TABS = [['beranda', 'Beranda', 'home'], ['catat', 'Catat', 'plus'], ['progres', 'Progres', 'chart'], ['program', 'Program', 'cal'], ['profil', 'Profil', 'user']];
  function renderNav() {
    $('#nav').innerHTML = TABS.map(function (t) { return '<button type="button" data-tab="' + t[0] + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '>' + icon(t[2]) + '<span>' + t[1] + '</span></button>'; }).join('');
  }
  function go(t) { tab = t; render(); window.scrollTo(0, 0); }

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
    h += '<label class="f">Nomor WhatsApp' + (isNew ? ' *' : '') + '<input class="in" type="tel" id="p-wa" maxlength="20" autocomplete="tel" inputmode="tel" placeholder="081234567890">' + (isNew ? '' : '<span class="tiny muted" style="font-weight:500">Kosongkan bila tidak ingin mengganti nomor yang sudah tersimpan.</span>') + '</label>';
    h += '<div class="grid2"><label class="f">Jenis kelamin *<select class="in" id="p-gender">' + opt(['Pria', 'Wanita'], p.gender || 'Pria') + '</select></label><label class="f">Usia *<input class="in" type="number" inputmode="numeric" id="p-age" min="15" max="40" value="' + esc(p.age) + '"></label></div>';
    h += '<div class="grid2"><label class="f">Tinggi (cm)<input class="in" type="number" inputmode="numeric" id="p-height" min="120" max="220" value="' + esc(p.height) + '"></label><label class="f">Berat (kg)<input class="in" type="number" inputmode="numeric" id="p-weight" min="30" max="160" value="' + esc(p.weight) + '"></label></div>';
    h += '<label class="f">Domisili (kota/kabupaten)<input class="in" id="p-domisili" maxlength="60" value="' + esc(p.domisili) + '" placeholder="Misal: Kota Bandung"></label>';
    h += '<div class="grid2"><label class="f">Matra *<select class="in" id="p-matra">' + opt(['AD', 'AL', 'AU'], p.matra || 'AD') + '</select></label><label class="f">Jalur *<select class="in" id="p-jalur">' + opt(['Tamtama', 'Bintara', 'Akmil', 'PA PK'], p.jalur || 'Bintara') + '</select></label></div>';
    h += '<div class="grid2"><label class="f">Tanggal tes jasmani<input class="in" type="date" id="p-test" value="' + esc(p.testDate) + '"></label><label class="f">Target nilai<input class="in" type="number" inputmode="numeric" id="p-target" min="1" max="100" value="' + esc(p.target || (CFG && CFG.targetDefault) || 70) + '"></label></div>';
    if (isNew) h += '<label style="display:flex;gap:10px;align-items:flex-start;font-size:14px;line-height:1.45;min-height:44px"><input type="checkbox" id="p-consent" style="width:22px;height:22px;flex:0 0 auto;margin-top:1px"> <span>Saya setuju data diri dan hasil latihan saya disimpan dan dikelola tim JadiPrajurit untuk keperluan pendampingan latihan.</span></label>';
    return h;
  }
  function readProfileForm(isNew) {
    var o = {
      name: $('#p-name').value.trim().replace(/\s+/g, ' ').slice(0, 80),
      email: isNew ? normEmail($('#p-email').value) : S.email,
      wa: normWa($('#p-wa').value),
      gender: $('#p-gender').value, age: $('#p-age').value, height: $('#p-height').value, weight: $('#p-weight').value,
      domisili: $('#p-domisili').value.trim().slice(0, 60), matra: $('#p-matra').value, jalur: $('#p-jalur').value,
      testDate: $('#p-test').value
    };
    var t = num($('#p-target').value); o.target = t != null && t > 0 && t <= 100 ? t : 70;
    var err = [];
    if (o.name.length < 3) err.push('nama lengkap');
    if (isNew && !EMAIL_RE.test(o.email)) err.push('email yang valid');
    if ((isNew || o.wa) && !/^628\d{7,12}$/.test(o.wa)) err.push('nomor WhatsApp yang valid (contoh 081234567890)');
    var a = num(o.age); if (a == null || a < 15 || a > 40) err.push('usia (15–40 tahun)');
    var hg = num(o.height); if (o.height !== '' && (hg == null || hg < 120 || hg > 220)) err.push('tinggi badan (120–220 cm)');
    var wg = num(o.weight); if (o.weight !== '' && (wg == null || wg < 30 || wg > 160)) err.push('berat badan (30–160 kg)');
    if (isNew) { o.consent = $('#p-consent').checked; if (!o.consent) err.push('persetujuan penyimpanan data'); }
    return { data: o, err: err };
  }
  function brand() { return '<div class="brand"><img src="assets/favicon.svg" alt="" width="28" height="28">Pelatih Garjas · JadiPrajurit</div>'; }
  function viewDaftar() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Daftar untuk mulai</h1><div class="sub">Isi data diri sekali saja. Kolom bertanda * wajib diisi.</div></div></div>';
    h += '<div class="card stack">' + profileForm(draftDaftar, true);
    h += '<div id="auth-msg" class="small warn" role="alert">' + esc(authMsg) + '</div>';
    h += '<button class="btn" id="do-register"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Mendaftarkan…' : 'Daftar &amp; mulai') + '</button></div>';
    h += '<p class="small muted" style="text-align:center;margin:0">Sudah pernah daftar? <button type="button" class="linkbtn" style="color:var(--good)" id="go-login">Masuk dengan email</button></p>';
    return h;
  }
  var draftDaftar = {};
  function viewLogin() {
    var h = '<div class="top"><div class="stack" style="gap:6px">' + brand() + '<h1>Masuk</h1><div class="sub">Cukup masukkan email yang kamu daftarkan.</div></div></div>';
    h += '<div class="card stack"><label class="f">Email terdaftar<input class="in" type="email" id="login-email" inputmode="email" autocomplete="email" placeholder="nama@email.com" value="' + esc(draftLogin) + '"></label>';
    h += '<div id="auth-msg" class="small warn" role="alert">' + esc(authMsg) + '</div>';
    h += '<button class="btn" id="do-login"' + (busy ? ' disabled' : '') + '>' + (busy ? '<span class="spin" aria-hidden="true"></span> Memeriksa…' : 'Masuk') + '</button></div>';
    h += '<p class="small muted" style="text-align:center;margin:0">Belum punya akun? <button type="button" class="linkbtn" style="color:var(--good)" id="go-daftar">Daftar sekarang</button></p>';
    return h;
  }
  var draftLogin = '';
  function setAuthMsg(t) { authMsg = t; var m = $('#auth-msg'); if (m) m.textContent = t; }
  function doRegister() {
    var r = readProfileForm(true);
    draftDaftar = r.data;
    if (r.err.length) { setAuthMsg('Lengkapi: ' + r.err.join(', ') + '.'); return; }
    busy = true; authMsg = ''; render();
    api('daftar', { profil: r.data }).then(function (j) {
      busy = false; S = { email: j.profil.email, profil: j.profil, catatan: j.catatan || [] }; simpanSesi();
      draftDaftar = {}; tab = 'beranda'; render(); toast('Pendaftaran berhasil. Selamat berlatih!');
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
      busy = false; S = { email: j.profil.email, profil: j.profil, catatan: j.catatan || [] }; simpanSesi();
      tab = 'beranda'; render(); toast('Selamat datang kembali, ' + String(j.profil.name).split(' ')[0] + '!');
    }, function (err) { busy = false; authMsg = pesanError(err); render(); });
  }
  function logout() { S = { email: null, profil: null, catatan: [] }; simpanSesi(); authView = 'login'; authMsg = ''; draftLogin = ''; render(); toast('Kamu sudah keluar.'); }

  /* ---------------- Beranda ---------------- */
  function viewBeranda() {
    var p = S.profil, cur = currentScores(), tg = target(), dl = daysToTest(), st = streak();
    var h = '<div class="top"><div><div class="sub">Halo, ' + esc(String(p.name).split(' ')[0]) + '</div><h1>' + (dl != null ? (dl > 0 ? 'Tes jasmani ' + dl + ' hari lagi' : dl === 0 ? 'Hari ini tes jasmani. Semangat!' : 'Tanggal tes sudah lewat') : 'Pelatih Garjas') + '</h1><div class="sub">' + esc(p.jalur + ' TNI ' + p.matra + ', ' + p.gender + (p.age ? ', ' + p.age + ' tahun' : '')) + '</div></div></div>';
    if (!S.catatan.length) {
      h += '<div class="card stack"><h2>Mulai dengan tes awal</h2><p class="small muted" style="margin:0">Lakukan dan catat lari 12 menit, ' + esc(itemLabel(ITEMS[1]).toLowerCase()) + ', sit-up, push-up, dan shuttle run sebagai titik mulai. Gunakan stopwatch di menu Catat supaya waktunya sama seperti tes.</p><button class="btn" data-go="catat">Catat tes awal</button></div>';
      if (!p.testDate) h += '<div class="card stack"><p class="small muted" style="margin:0">Isi tanggal tes jasmani di menu Profil supaya hitung mundur dan program latihan menyesuaikan.</p><button class="btn ghost" data-go="profil">Isi tanggal tes</button></div>';
      return h + grupCard();
    }
    var g = cur.garjas, gap = g != null ? Math.round((tg - g) * 10) / 10 : null;
    var weak = ITEMS.filter(function (it) { return cur.scores[it.key] != null && cur.scores[it.key] < tg; }).sort(function (a, b) { return cur.scores[a.key] - cur.scores[b.key]; });
    h += '<section class="hero" aria-label="Prediksi nilai garjas"><div class="row" style="align-items:flex-start"><div><div class="soft">Prediksi nilai garjas</div><div style="display:flex;align-items:baseline;gap:8px"><span class="big">' + fmtNum(g, 1) + '</span><span class="soft">/ target ' + fmtNum(tg, 0) + '</span></div></div>' + (st > 0 ? '<span class="pill">' + icon('flame', 15) + st + ' hari beruntun</span>' : '') + '</div>';
    h += '<div class="hbar" role="img" aria-label="Nilai ' + fmtNum(g, 1) + ' dari target ' + fmtNum(tg, 0) + '"><i style="width:' + Math.max(2, Math.min(100, g || 0)) + '%"></i><b style="left:calc(' + Math.min(100, tg) + '% - 1px)"></b></div>';
    h += '<div class="soft" style="color:var(--hero-ink)">' + (gap > 0 ? 'Kurang ' + fmtNum(gap, 1) + ' poin.' + (weak.length ? ' Fokus utama: ' + weak.slice(0, 2).map(function (it) { return '<b>' + esc(itemLabel(it).toLowerCase()) + '</b>'; }).join(' dan ') + '.' : '') : 'Nilaimu sudah di atas target. Pertahankan konsistensi sampai hari tes.') + '</div>';
    if (Object.keys(cur.latest).length < ITEMS.length) h += '<div class="soft">Sebagian item belum pernah dicatat, jadi prediksi belum lengkap.</div>';
    h += '</section>';

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
    return h + grupCard();
  }
  function grupCard() {
    if (!CFG || !CFG.linkGrup) return '';
    return '<div class="card stack"><h2>Grup casis</h2><p class="small muted" style="margin:0">Gabung grup WhatsApp untuk info seleksi dan latihan bareng casis lain.</p><a class="btn ghost" href="' + esc(CFG.linkGrup) + '" target="_blank" rel="noopener">Gabung grup WhatsApp</a></div>';
  }

  /* ---------------- Catat ---------------- */
  function viewCatat() {
    var h = '<div class="top"><div><h1>Catat latihan</h1><div class="sub">Isi hasil yang kamu lakukan hari ini. Item yang tidak dilatih boleh dikosongkan.</div></div></div>';
    h += viewTimer();
    h += '<div class="card stack"><label class="f">Tanggal<input class="in" type="date" id="f-date" value="' + esc(draft.date) + '" max="' + todayStr() + '"></label>';
    ITEMS.forEach(function (it) {
      var v = draft.items[it.key], s = v != null ? score(it.key, v) : null;
      h += '<div class="logrow"><label class="f" for="f-' + it.key + '">' + esc(itemLabel(it)) + ' (' + it.unit + ')</label><span></span><input class="in" type="number" inputmode="decimal" id="f-' + it.key + '" data-item="' + it.key + '" min="' + it.min + '" max="' + it.max + '" step="' + it.step + '" placeholder="' + it.ph + '" value="' + (v != null ? esc(v) : '') + '"><span class="hint" id="h-' + it.key + '">' + (s != null ? 'Nilai ' + fmtNum(s, 0) : '') + '</span></div>';
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
    var before = currentScores();
    var bests = {}; ITEMS.forEach(function (it) { var ser = itemSeries(it.key); if (ser.length) bests[it.key] = Math.max.apply(null, ser.map(function (p) { return p.s; })); });
    var sim = draft.sim && isComplete(items);
    var log = { id: uid(), date: draft.date, items: items, sim: sim, note: (draft.note || '').trim().slice(0, 200) };
    S.catatan.push(log);
    var rk = ringkasan();
    S.catatan.pop();
    busy = true; render();
    api('tambahCatatan', { email: S.email, catatan: Object.assign({ garjas: N.garjasItems(items, gender()) }, log), ringkasan: rk }).then(function () {
      busy = false; S.catatan.push(log); simpanSesi();
      var after = currentScores(), msgs = [];
      ITEMS.forEach(function (it) { if (items[it.key] == null) return; var s = score(it.key, items[it.key]); if (bests[it.key] != null && s > bests[it.key]) msgs.push('rekor baru ' + itemLabel(it).toLowerCase()); });
      var dg = after.garjas != null && before.garjas != null ? Math.round((after.garjas - before.garjas) * 10) / 10 : null;
      var t = 'Tersimpan.';
      if (msgs.length) t += ' ' + msgs.slice(0, 2).join(', ').replace(/^./, function (c) { return c.toUpperCase(); }) + '!';
      if (dg) t += ' Prediksi garjas ' + (dg > 0 ? 'naik ' : 'turun ') + fmtNum(Math.abs(dg), 1) + ' poin.';
      if (draft.sim && !sim) t += ' (Tidak ditandai simulasi karena item belum lengkap.)';
      draft = { date: todayStr(), items: {}, sim: false, note: '' };
      toast(t); go('beranda');
    }, function (e) { busy = false; render(); toast(pesanError(e)); });
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
      var t = 'Prediksi nilai garjas: ' + fmtNum(nowS.garjas, 1) + ' (target ' + fmtNum(tg, 0) + ')';
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
    return { range: range, body: body, full: 'Ringkasan latihan jasmani ' + String(S.profil.name).split(' ')[0] + ', ' + range + '\n' + body + '\n\nDicatat dengan Pelatih Garjas, JadiPrajurit' };
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
    h += '<div class="btns"><button class="btn small" id="copy-week">Salin ringkasan</button><a class="btn ghost small" href="https://wa.me/?text=' + encodeURIComponent(ws.full) + '" target="_blank" rel="noopener">Kirim ke WhatsApp</a></div></div>';
    var opts = [['garjas', 'Nilai garjas']].concat(ITEMS.map(function (it) { return [it.key, itemLabel(it)]; }));
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
      h += '<div class="hist"><div class="row"><span style="font-weight:700">' + esc(fmtDate(l.date)) + ' ' + (l.sim ? '<span class="tag sim">Simulasi</span>' : '') + '</span><button type="button" class="linkbtn" data-del="' + esc(l.id) + '">Hapus</button></div>';
      h += '<div class="small">' + ITEMS.filter(function (it) { return l.items[it.key] != null; }).map(function (it) { return esc(itemLabel(it)) + ': ' + fmtNum(l.items[it.key], 1) + ' ' + it.unit + ' <span class="muted">(nilai ' + fmtNum(score(it.key, l.items[it.key]), 0) + ')</span>'; }).join('<br>') + '</div>';
      if (l.note) h += '<div class="tiny muted">' + esc(l.note) + '</div>';
      h += '</div>';
    });
    return h + '</div>';
  }
  function hapusLog(id) {
    if (busy || !confirm('Hapus catatan ini?')) return;
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
    if (CFG && CFG.waAdmin) h += '<div class="card stack"><h2>Butuh bantuan?</h2><a class="btn ghost" href="https://wa.me/' + esc(CFG.waAdmin) + '?text=' + encodeURIComponent('Halo admin JadiPrajurit, saya ' + p.name + ' (' + p.email + ') butuh bantuan soal Pelatih Garjas.') + '" target="_blank" rel="noopener">Hubungi admin lewat WhatsApp</a></div>';
    h += '<div class="card stack"><h2>Akun</h2><p class="small muted" style="margin:0">Masuk sebagai ' + esc(p.email) + '.</p><button class="btn ghost" id="logout">Keluar</button></div>';
    return h;
  }
  function saveProfile() {
    var r = readProfileForm(false);
    if (r.err.length) { setAuthMsg('Lengkapi: ' + r.err.join(', ') + '.'); return; }
    busy = true; render();
    api('simpanProfil', { email: S.email, profil: r.data }).then(function (j) {
      busy = false; S.profil = j.profil; simpanSesi(); render(); toast('Data diri tersimpan.');
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
      return api('config', null, 'GET');
    }).then(function (c) {
      baris(c.standarLengkap ? true : 'warn', 'Tab Standar Nilai', c.standarLengkap ? 'Semua item untuk Pria dan Wanita terbaca.' : 'Ada item yang kurang dari 2 baris, sementara memakai tabel contoh untuk item itu.');
      baris(c.standarResmi ? true : 'warn', 'Standar nilai resmi', c.standarResmi ? 'Sumber: ' + esc(c.sumberStandar || '(belum diisi)') : 'Masih ditandai contoh. Setelah tabel resmi diisi, ubah standar_resmi menjadi YA di tab Pengaturan.');
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
    if (tab === 'catat') readDraftFromForm();
    var nav = document.querySelector('nav.tabs'), v, gate = !S.email;
    if (gate) v = authView === 'login' ? viewLogin() : viewDaftar();
    else v = tab === 'catat' ? viewCatat() : tab === 'progres' ? viewProgres() : tab === 'program' ? viewProgram() : tab === 'profil' ? viewProfil() : viewBeranda();
    $('#app').innerHTML = '<div class="stack">' + v + '</div>';
    nav.style.display = gate ? 'none' : '';
    if (!gate) renderNav();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button,a'); if (!b) return;
    if (b.dataset.tab) { go(b.dataset.tab); return; }
    if (b.dataset.go) { go(b.dataset.go); return; }
    if (b.dataset.pick) { progressPick = b.dataset.pick; render(); return; }
    if (b.dataset.check) { checkin = b.dataset.check === 'reset' ? null : b.dataset.check; render(); return; }
    if (b.dataset.del) { hapusLog(b.dataset.del); return; }
    if (b.dataset.timer) { if (timer.mode !== b.dataset.timer) { stopTick(); lockScreen(false); timer = { mode: b.dataset.timer, running: false, start: 0, elapsed: 0, done: false, iv: null }; } render(); return; }
    if (b.dataset.tctl) { timerCtl(b.dataset.tctl); return; }
    switch (b.id) {
      case 'do-register': if (!busy) doRegister(); break;
      case 'do-login': if (!busy) doLogin(); break;
      case 'go-login': authView = 'login'; authMsg = ''; render(); break;
      case 'go-daftar': authView = 'daftar'; authMsg = ''; render(); break;
      case 'save-log': if (!busy) saveLog(); break;
      case 'clear-log': draft = { date: todayStr(), items: {}, sim: false, note: '' }; tab = 'catat'; var d = $('#f-date'); if (d) d.value = ''; ITEMS.forEach(function (it) { var el = $('#f-' + it.key); if (el) el.value = ''; }); render(); break;
      case 'save-profile': if (!busy) saveProfile(); break;
      case 'logout': logout(); break;
      case 'copy-week': copyText(weekSummary().full); break;
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter' && e.target && e.target.id === 'login-email') { e.preventDefault(); if (!busy) doLogin(); } });
  document.addEventListener('input', function (e) {
    var k = e.target.dataset && e.target.dataset.item;
    if (k) { var v = num(e.target.value), s = v != null ? score(k, v) : null, h = $('#h-' + k); if (h) h.textContent = s != null ? 'Nilai ' + fmtNum(s, 0) : ''; }
  });

  /* ---------------- Mulai ---------------- */
  if (/[?&]cek=1/.test(location.search)) { renderCek(); return; }
  var sesi = lsGet(LS_SESI);
  if (sesi && sesi.email && sesi.profil) { S = { email: sesi.email, profil: sesi.profil, catatan: Array.isArray(sesi.catatan) ? sesi.catatan : [] }; }
  else authView = 'daftar';
  muatConfig().then(function () { if (!busy) render(); }, function () { });
  render();
  if (S.email) {
    api('masuk', { email: S.email }).then(function (j) {
      S = { email: j.profil.email, profil: j.profil, catatan: j.catatan || [] }; simpanSesi();
      var a = document.activeElement;
      if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !busy) render();
    }, function (e) {
      if (e && e.kode === 'tidak_ditemukan') { S = { email: null, profil: null, catatan: [] }; simpanSesi(); authView = 'login'; authMsg = 'Data akunmu tidak ditemukan di server. Masuk ulang atau daftar.'; render(); }
    });
  }
})();
