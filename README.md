# Pelatih Garjas – JadiPrajurit

Web untuk casis TNI mencatat latihan jasmani, melihat prediksi nilai garjas, dan mendapat program latihan mingguan. Semua data pendaftaran dan catatan latihan langsung tersimpan di Google Sheets.

Versi web: **2026.10.11-7** · Versi backend: **2026.10.11-5**

## Fitur

- **Daftar dan masuk.** Daftar sekali dengan nama lengkap, email terdaftar di aplikasi JadiPrajurit, nomor WhatsApp, dan data fisik. Setelah itu cukup masuk dengan email.
- **Catat latihan** lewat form, dengan nilai yang langsung terlihat saat mengetik.
- **Alat bantu tes:** hitung mundur lari 12 menit (bunyi dan getar saat selesai), timer 1 menit, dan stopwatch shuttle run yang mengisi kolom otomatis.
- **Beranda:** hitung mundur ke hari tes, prediksi nilai garjas, streak, latihan hari ini, dan status per item.
- **Progres:** grafik per item, perkiraan kapan target tercapai, rapor simulasi, riwayat, dan ringkasan mingguan yang bisa disalin atau dikirim ke WhatsApp.
- **Program mingguan** disusun otomatis dari nilai terbaru: fokus ke item terlemah, ada hari istirahat, tidak ada dua hari berat berturut-turut, dan volume dikurangi 7 hari sebelum tes.
- **Peringkat casis:** peringkat nilai garjas (khusus yang sudah mencatat kelima item) dan peringkat paling rajin minggu ini, bisa difilter per matra. Yang tampil hanya nama depan dan inisial; casis bisa menyembunyikan diri di Profil.
- **Bagikan hasil:** gambar ukuran Instagram Story/Status WhatsApp berisi nilai, rincian item, dan peringkat, plus link hasil publik `?h=KODE`. Orang yang membuka link melihat hasil temannya dan tombol daftar; pendaftar lewat link tercatat di kolom **Diajak Oleh**.
- **Tes kamera (prototipe, `kamera.html`):** push-up, sit-up, dan pull-up/chinning dihitung kamera dengan pengenalan pose di HP (MediaPipe). Hanya gerakan sah yang dihitung; gerakan salah ditolak dengan alasannya. Pull-up/chinning berlabel uji coba. Video tidak direkam atau dikirim. Hasil belum tersimpan ke catatan. `pushup.html` lama otomatis dialihkan ke sini.
- **Lari 12 menit dengan GPS (prototipe, `lari.html`):** jarak dari GPS, diperiksa sensor langkah dan batas kecepatan manusia. Layar wajib menyala; bila layar mati atau aplikasi ditinggalkan, tes dinyatakan tidak sah. Lokasi tidak disimpan atau dikirim. Hasil belum tersimpan ke catatan.
- **Halaman `?cek=1`** untuk memeriksa versi file dan koneksi ke Google Sheets.

Aplikasi ini tidak memakai AI. Semua nilai dihitung dari tab **Standar Nilai** di spreadsheet.

## Struktur

```
index.html
kamera.html         ← prototipe tes kamera (push-up, sit-up, pull-up/chinning)
pushup.html         ← pengalih ke kamera.html?item=pushup
lari.html           ← prototipe lari 12 menit dengan GPS
css/style.css
js/config.js        ← URL Apps Script (diisi sekali, tidak ikut paket update)
js/nilai.js         ← rumus nilai dan penyusun program latihan
js/app.js           ← tampilan dan alur aplikasi
assets/favicon.svg
assets/og.png       ← gambar pratinjau saat link dibagikan
apps-script/Code.gs ← backend, ditempel di Apps Script spreadsheet
```

## Isi spreadsheet

| Tab | Isi |
|---|---|
| Peserta | Satu baris per casis: data diri, nomor WA, persetujuan data, jumlah catatan, nilai garjas terbaru, tanggal latihan terakhir |
| Catatan Latihan | Satu baris per sesi latihan |
| Standar Nilai | Tabel konversi hasil ke nilai, per jenis kelamin dan item. Berisi tabel Garjas TNI golongan umur 18–25 tahun; cocokkan dengan juknis seleksi terbaru. |
| Pengaturan | `standar_resmi`, `sumber_standar`, `target_default`, `link_grup_wa`, `wa_admin`, `nama_admin`, `label_kontak` |
| Simpan Kontak | Daftar nomor casis untuk disimpan admin secara bulk lewat Markaz, beserta statusnya |

Nilai garjas dihitung sebagai (nilai lari 12 menit + rata-rata nilai pull-up/chinning, sit-up, push-up, shuttle run) ÷ 2. Di antara dua baris tabel, nilai dihitung proporsional.

## Cara pasang (pertama kali)

### 1. Apps Script
1. Buka spreadsheet **Pelatih Garjas AI – Data Casis JadiPrajurit** → **Extensions → Apps Script**.
2. Hapus kode bawaan, tempel seluruh isi `apps-script/Code.gs`, lalu simpan.
3. Pilih fungsi **setup** → **Run**. Izinkan akses saat diminta. Langkah ini membuat dan merapikan tab Peserta, Catatan Latihan, Standar Nilai (berisi tabel contoh), dan Pengaturan.
4. **Deploy → New deployment** → ikon gerigi → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Klik **Deploy**, lalu salin **URL Web app** yang diakhiri `/exec`.

### 2. config.js
Buka `js/config.js`, tempel URL tadi di `APPS_SCRIPT_URL`, simpan.

### 3. GitHub
Buat repo baru, misalnya `pelatih-garjas-jadiprajurit`, lalu upload **isi** folder ini (bukan foldernya) sehingga `index.html` berada langsung di halaman utama repo.

### 4. Vercel
**Add New → Project** → pilih repo → Framework Preset **Other** → Root Directory `./` → **Deploy**.

### 5. Cek
Buka `https://<nama-project>.vercel.app/?cek=1`. Semua baris harus ✅. Tanda ⚠️ pada "Standar nilai resmi", "Link grup WhatsApp", dan "Nomor WA admin" berarti isiannya belum dilengkapi di tab Pengaturan.

### 6. Lengkapi spreadsheet
1. Tab **Standar Nilai**: ganti tabel contoh dengan tabel resmi. Satu baris = satu titik (Jenis Kelamin, Item, Hasil, Nilai). Minimal 2 baris per item per jenis kelamin; makin banyak titik, makin akurat.
2. Tab **Pengaturan**: ubah `standar_resmi` menjadi `YA`, isi `sumber_standar`, dan bila ada, `link_grup_wa` serta `wa_admin` (format `628xxxxxxxxxx`).

Perubahan di tab Standar Nilai dan Pengaturan langsung berlaku tanpa deploy ulang.

## Kontak WhatsApp

**Nomor casis disimpan admin.** Persetujuan ini sudah menjadi bagian dari centang wajib saat daftar. Setiap pendaftar otomatis masuk tab **Simpan Kontak** dengan nama seperti `Rizky Aditya Casis JadiPrajurit` dan status `Belum disimpan admin`. Admin menyimpannya secara bulk lewat Markaz, lalu memilih menu **Pelatih Garjas → Tandai semua sudah disimpan**. Menu **Ekspor kontak belum disimpan ke vCard** tersedia sebagai cadangan.

**Casis wajib menyimpan nomor admin.** Setelah daftar, kartu kontak admin langsung terbuka otomatis di HP casis. Casis tidak bisa masuk ke aplikasi sebelum mencentang "Saya sudah menyimpan nomor admin". Konfirmasinya tercatat di kolom **Simpan Nomor Admin** pada tab Peserta. Casis yang mendaftar sebelum fitur ini juga akan diminta langkah yang sama saat membuka aplikasi.

Langkah wajib ini hanya aktif bila `wa_admin` di tab Pengaturan sudah diisi. Nama kontaknya diambil dari `nama_admin`.

## Cara update

1. Di GitHub, masuk ke folder tempat `index.html` berada, lalu **Add file → Upload files** dan drag **isi** folder update.
2. **Jangan upload `config.js`** kecuali memang ingin mengganti URL backend.
3. Bila `Code.gs` ikut berubah: di Apps Script buka **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**. **Jangan pilih "New deployment"**, karena URL-nya berubah dan web terputus dari spreadsheet.
4. Buka `?cek=1` dan pastikan "Semua file versi …" sudah ✅.

## Data dan keamanan

- Nomor WhatsApp hanya tersimpan di spreadsheet dan tidak pernah dikirim balik ke browser.
- Masuk hanya memakai email tanpa kata sandi, sesuai kebutuhan. Artinya, orang yang mengetahui email seorang casis bisa melihat catatan latihannya. Bila nanti dibutuhkan, verifikasi tambahan (misalnya 4 digit terakhir nomor WA) bisa ditambahkan di `Code.gs` tanpa mengubah struktur data.
- Email belum dicocokkan otomatis dengan database akun JadiPrajurit; yang dicek baru formatnya.
- Jangan mengubah urutan atau nama kolom di baris judul tab Peserta, Catatan Latihan, dan Standar Nilai. Baris judul sudah diberi peringatan bila diedit.
- Kuota Apps Script akun Google gratis cukup untuk ribuan pencatatan per hari. Bila pengguna sangat banyak, pertimbangkan akun Google Workspace.
