/*
 * Penilaian nilai jasmani dan penyusun program latihan berbasis aturan.
 * Tidak memakai AI: semua angka dihitung dari tabel standar di tab "Standar Nilai".
 */
(function () {
  'use strict';
  (window.VERSI_FILE = window.VERSI_FILE || {})['nilai.js'] = '2026.10.11-18';

  var ITEMS = [
    { key: 'lari', label: 'Lari 12 menit', unit: 'm', min: 0, max: 6000, step: '10', ph: '2400' },
    { key: 'pullup', label: 'Pull-up', labelW: 'Chinning', unit: 'kali', min: 0, max: 150, step: '1', ph: '10' },
    { key: 'situp', label: 'Sit-up', unit: 'kali', min: 0, max: 150, step: '1', ph: '38' },
    { key: 'pushup', label: 'Push-up', unit: 'kali', min: 0, max: 150, step: '1', ph: '36' },
    { key: 'shuttle', label: 'Shuttle run', unit: 'detik', min: 8, max: 60, step: '0.1', ph: '17.6' }
  ];

  /* Cadangan bila backend belum bisa dihubungi: tabel nilai jasmani TNI golongan umur 18–25 tahun,
     sama dengan isi awal tab "Standar Nilai" (lihat README). */
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

  var standar = STANDAR_CONTOH, standarMatra = {}, matraAktif = '';

  // s: tabel umum (berlaku semua matra). sm: tabel khusus per matra, boleh sebagian item saja.
  function setStandar(s, sm) {
    if (s && s.Pria && s.Wanita) {
      var ok = ['Pria', 'Wanita'].every(function (g) {
        return ITEMS.every(function (it) { var t = s[g][it.key]; return Array.isArray(t) && t.length >= 2; });
      });
      if (ok) standar = s;
    }
    standarMatra = sm && typeof sm === 'object' ? sm : {};
  }
  function setMatra(m) { matraAktif = String(m || '').toUpperCase(); }
  function gKey(g) { return g === 'Wanita' ? 'Wanita' : 'Pria'; }
  function tabelKhusus(key, gender, matra) {
    var m = standarMatra[String(matra || matraAktif).toUpperCase()];
    var t = m && m[gKey(gender)] && m[gKey(gender)][key];
    return Array.isArray(t) && t.length >= 2 ? t : null;
  }
  function tabel(key, gender, matra) {
    return (tabelKhusus(key, gender, matra) || standar[gKey(gender)][key]).slice().sort(function (a, b) { return a[0] - b[0]; });
  }
  function label(it, gender) { return gender === 'Wanita' && it.labelW ? it.labelW : it.label; }

  function score(key, raw, gender) {
    if (raw == null || raw === '' || !isFinite(raw)) return null;
    var t = tabel(key, gender);
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

  /* Hasil mentah yang dibutuhkan untuk mencapai nilai tertentu (kebalikan tabel). */
  function hasilUntukNilai(key, nilai, gender) {
    var t = tabel(key, gender);
    for (var i = 1; i < t.length; i++) {
      var a = t[i - 1], b = t[i];
      if ((a[1] - nilai) * (b[1] - nilai) <= 0 && a[1] !== b[1]) {
        return a[0] + (b[0] - a[0]) * (nilai - a[1]) / (b[1] - a[1]);
      }
    }
    return null;
  }

  /* Nilai jasmani = (nilai lari + rata-rata item B) / 2 */
  function garjasFrom(scores) {
    var a = scores.lari;
    var bs = ['pullup', 'situp', 'pushup', 'shuttle'].map(function (k) { return scores[k]; })
      .filter(function (v) { return v != null; });
    if (a == null && !bs.length) return null;
    var b = bs.length ? bs.reduce(function (x, y) { return x + y; }, 0) / bs.length : null;
    if (a != null && b != null) return Math.round((a + b) / 2 * 10) / 10;
    return Math.round((a != null ? a : b) * 10) / 10;
  }
  function garjasItems(items, gender) {
    var sc = {};
    ITEMS.forEach(function (it) { sc[it.key] = items[it.key] != null ? score(it.key, items[it.key], gender) : null; });
    return garjasFrom(sc);
  }

  /* ---------------- Program mingguan berbasis aturan ---------------- */

  function pace400(meter12) {
    if (!meter12 || meter12 <= 0) return null;
    var s = Math.round(400 / (meter12 / 720));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function rep(max, pct, minimal) { return Math.max(minimal || 2, Math.round((max || 0) * pct)); }

  /*
   * input: { latest:{key:raw}, scores:{key:nilai}, target, gender, hariMenujuTes (null|angka), hariSejakSimulasi (null|angka) }
   * output: { fokus, hari:[7 x {sesi, durasi, intensitas}], catatan }
   */
  function programMingguan(inp) {
    var g = inp.gender, target = inp.target || 70, L = inp.latest || {}, S = inp.scores || {};
    var W = g === 'Wanita';
    var pullLabel = W ? 'Chinning' : 'Pull-up';
    var dl = inp.hariMenujuTes;

    var gaps = ITEMS.map(function (it) {
      var s = S[it.key];
      return { it: it, gap: s == null ? null : target - s };
    });
    var belum = gaps.filter(function (x) { return x.gap == null; }).map(function (x) { return label(x.it, g).toLowerCase(); });
    var fokusList = gaps.filter(function (x) { return x.gap != null && x.gap > 0; })
      .sort(function (a, b) { return b.gap - a.gap; }).slice(0, 2);
    var fokus = {};
    fokusList.forEach(function (x) { fokus[x.it.key] = true; });

    var fokusTeks;
    if (fokusList.length) {
      fokusTeks = 'Fokus minggu ini: ' + fokusList.map(function (x) {
        return label(x.it, g).toLowerCase() + ' (kurang ' + Math.round(x.gap) + ' poin)';
      }).join(' dan ') + '. Item lain cukup dipertahankan.';
    } else if (!belum.length) {
      fokusTeks = 'Semua item sudah mencapai target. Minggu ini fokus mempertahankan performa dan menjaga kondisi tetap prima.';
    } else {
      fokusTeks = 'Item yang sudah dicatat sudah mencapai target.';
    }
    if (belum.length) fokusTeks += ' Belum ada data untuk ' + belum.join(', ') + ', jadi uji item itu minggu ini.';

    var hari;
    if (dl != null && dl >= 0 && dl <= 7) {
      hari = [
        { sesi: 'Lari ringan 20 menit + 3 × 200 m agak cepat', durasi: 30, intensitas: 'ringan' },
        { sesi: pullLabel + ', push-up, dan sit-up masing-masing 2 set ringan (setengah kemampuan maksimal)', durasi: 25, intensitas: 'ringan' },
        { sesi: 'Pemulihan aktif: jalan santai 20 menit + peregangan', durasi: 25, intensitas: 'ringan' },
        { sesi: 'Shuttle run 3 × santai untuk menjaga teknik + peregangan', durasi: 20, intensitas: 'ringan' },
        { sesi: 'Istirahat. Tidur cukup dan minum air yang cukup', durasi: 0, intensitas: 'istirahat' },
        { sesi: 'Istirahat. Siapkan perlengkapan tes', durasi: 0, intensitas: 'istirahat' },
        { sesi: 'Istirahat total', durasi: 0, intensitas: 'istirahat' }
      ];
      return {
        fokus: 'Tes tinggal ' + dl + ' hari lagi. Volume latihan dikurangi supaya tubuh segar di hari tes. Jangan mencoba latihan atau menu makan baru.',
        hari: hari,
        catatan: 'Dua hari terakhir sebelum tes sebaiknya dipakai untuk istirahat penuh.'
      };
    }

    var lariTarget = hasilUntukNilai('lari', target, g);
    if (L.lari && (!lariTarget || lariTarget < L.lari)) lariTarget = L.lari + 100;
    var shuttleTarget = hasilUntukNilai('shuttle', target, g);
    var pace = pace400(lariTarget);

    var maxPull = L.pullup, maxSit = L.situp, maxPush = L.pushup;
    var setPull = fokus.pullup ? 5 : 3, setPush = fokus.pushup ? 5 : 3, setSit = fokus.situp ? 5 : 3;

    function sesiPull() {
      if (maxPull == null) return pullLabel + ' tes maksimal 1 kali, lalu 3 set dengan setengah hasilnya';
      if (!W && maxPull < 3) return 'Pull-up negatif 4 × 3 (turun pelan 5 detik) + menggantung 3 × 20 detik';
      return pullLabel + ' ' + setPull + ' × ' + rep(maxPull, fokus.pullup ? 0.65 : 0.6);
    }
    function sesiPush() {
      return maxPush == null ? 'push-up tes maksimal 1 menit' : 'push-up ' + setPush + ' × ' + rep(maxPush, fokus.pushup ? 0.65 : 0.6);
    }
    function sesiSit() {
      return maxSit == null ? 'sit-up tes maksimal 1 menit' : 'sit-up ' + setSit + ' × ' + rep(maxSit, fokus.situp ? 0.65 : 0.6);
    }

    var sen = fokus.lari
      ? { sesi: 'Interval lari 6 × 400 m' + (pace ? ', target ' + pace + ' per 400 m' : '') + ', istirahat jalan 2 menit', durasi: 45, intensitas: 'berat' }
      : { sesi: L.lari == null ? 'Tes lari 12 menit, catat jaraknya' : 'Lari tempo 25 menit dengan napas teratur', durasi: 40, intensitas: L.lari == null ? 'berat' : 'sedang' };
    if (fokus.situp) sen.sesi += ' + ' + sesiSit();

    var selBerat = (fokus.pullup || fokus.pushup) && sen.intensitas !== 'berat';
    if (sen.intensitas === 'berat') { setPull = Math.max(3, setPull - 1); setPush = Math.max(3, setPush - 1); }
    var sel = { sesi: sesiPull() + ', ' + sesiPush(), durasi: 40, intensitas: selBerat ? 'berat' : 'sedang' };
    setPull = fokus.pullup ? 5 : 3; setPush = fokus.pushup ? 5 : 3;

    var rab = { sesi: 'Pemulihan aktif: jogging ringan atau jalan cepat 20 menit + peregangan', durasi: 30, intensitas: 'ringan' };

    var kam;
    if (fokus.shuttle) kam = { sesi: 'Shuttle run 8 ×' + (shuttleTarget ? ', target ' + String(Math.round(shuttleTarget * 10) / 10).replace('.', ',') + ' detik' : '') + ', istirahat 90 detik + lari ringan 15 menit', durasi: 45, intensitas: 'berat' };
    else if (fokus.lari) kam = { sesi: 'Lari tempo 20 menit + shuttle run 4 ×', durasi: 40, intensitas: 'sedang' };
    else kam = { sesi: (L.shuttle == null ? 'Tes shuttle run, catat waktunya' : 'Shuttle run 6 ×') + ' + lari ringan 20 menit', durasi: 40, intensitas: 'sedang' };

    var jum = { sesi: sesiSit() + ', ' + sesiPush() + (fokus.pullup ? ', ' + sesiPull() : '') + ', plank 3 × 40 detik', durasi: 40, intensitas: 'sedang' };

    var perluSim = inp.hariSejakSimulasi == null || inp.hariSejakSimulasi >= 21;
    var sab = perluSim
      ? { sesi: 'Simulasi tes lengkap sesuai urutan tes. Catat hasilnya dan centang "simulasi"', durasi: 60, intensitas: 'berat' }
      : { sesi: 'Uji ' + (fokusList.length ? fokusList.map(function (x) { return label(x.it, g).toLowerCase(); }).join(' dan ') : 'satu item pilihan') + ', lalu lari ringan 15 menit', durasi: 40, intensitas: 'sedang' };

    var min = { sesi: 'Istirahat total', durasi: 0, intensitas: 'istirahat' };

    var hariAkhir = [sen, sel, rab, kam, jum, sab, min].map(function (d) {
      d.sesi = d.sesi.charAt(0).toUpperCase() + d.sesi.slice(1);
      return d;
    });
    return {
      fokus: fokusTeks,
      hari: hariAkhir,
      catatan: 'Selalu pemanasan 10 menit dan pendinginan. Angka repetisi dihitung dari hasil terbaru, jadi program ikut naik saat kamu makin kuat.'
    };
  }

  window.Nilai = {
    ITEMS: ITEMS,
    setStandar: setStandar,
    setMatra: setMatra,
    pakaiTabelMatra: function (key, gender, matra) { return !!tabelKhusus(key, gender, matra); },
    score: score,
    label: label,
    garjasFrom: garjasFrom,
    garjasItems: garjasItems,
    hasilUntukNilai: hasilUntukNilai,
    programMingguan: programMingguan
  };
})();
