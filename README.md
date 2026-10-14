# SIGAP – JadiPrajurit

**SIGAP: Simulasi dan Indeks Gerak Akurat Peserta.** *Sigap fisik, siap tes.*

Web untuk casis TNI mencatat latihan jasmani, melihat prediksi nilai jasmani, dan mendapat program latihan mingguan. Semua data pendaftaran dan catatan latihan langsung tersimpan di Google Sheets.

Versi web: **2026.10.11-15** · Versi backend: **2026.10.11-5**

## Fitur

- **Daftar dan masuk.** Daftar sekali dengan nama lengkap, email terdaftar di aplikasi JadiPrajurit, nomor WhatsApp, dan data fisik. Setelah itu cukup masuk dengan email.
- **Catat latihan** lewat form, dengan nilai yang langsung terlihat saat mengetik.
- **Alat bantu tes:** hitung mundur lari 12 menit (bunyi dan getar saat selesai), timer 1 menit, dan stopwatch shuttle run yang mengisi kolom otomatis.
- **Beranda:** hitung mundur ke hari tes, prediksi nilai jasmani, streak, latihan hari ini, dan status per item.
- **Progres:** grafik per item, perkiraan kapan target tercapai, rapor simulasi, riwayat, dan ringkasan mingguan yang bisa disalin atau dikirim ke WhatsApp.
- **Program mingguan** disusun otomatis dari nilai terbaru: fokus ke item terlemah, ada hari istirahat, tidak ada dua hari berat berturut-turut, dan volume dikurangi 7 hari sebelum tes.
- **Peringkat casis:** peringkat nilai jasmani (khusus yang sudah mencatat kelima item) dan peringkat paling rajin minggu ini, bisa difilter per matra. Yang tampil hanya nama depan dan inisial; casis bisa menyembunyikan diri di Profil.
- **Bagikan hasil:** gambar ukuran Instagram Story/Status WhatsApp bergaya papan taktis dengan logo JadiPrajurit, berisi nilai, rincian item, peringkat, dan ajakan mengunduh aplikasi JadiPrajurit, plus link hasil publik `?h=KODE`. Orang yang membuka link melihat hasil temannya dan tombol daftar; pendaftar lewat link tercatat di kolom **Diajak Oleh**.
- **Tes kamera (prototipe, `kamera.html`):** push-up, sit-up, dan pull-up/chinning dihitung kamera dengan pengenalan pose di HP (MediaPipe). Hanya gerakan sah yang dihitung; gerakan salah ditolak dengan alasannya. Pull-up/chinning berlabel uji coba. Video tidak direkam atau dikirim. Hasil belum tersimpan ke catatan. `pushup.html` lama otomatis dialihkan ke sini.
- **Lari 12 menit dengan GPS (prototipe, `lari.html`):** jarak dari GPS, diperiksa sensor langkah dan batas kecepatan manusia. Layar wajib menyala; bila layar mati atau aplikasi ditinggalkan, tes dinyatakan tidak sah. Mulai manual lewat tombol "Mulai sekarang" setelah GPS siap, tombol Putaran untuk mencatat waktu per putaran (dan membandingkan jarak lintasan dengan GPS), serta Jeda khusus mode Lari bebas. Lokasi tidak disimpan atau dikirim. Hasil belum tersimpan ke catatan.
- **Halaman `?cek=1`** untuk memeriksa versi file dan koneksi ke Google Sheets.

Aplikasi ini tidak memakai AI. Semua nilai dihitung dari tab **Standar Nilai** di spreadsheet.

## Struktur

```
index.html
kamera.html         ← tes kamera (push-up, sit-up, pull-up/chinning)
vendor/mediapipe/   ← mesin dan model pengenal pose untuk tes kamera
pushup.html         ← pengalih ke kamera.html?item=pushup
lari.html           ← lari 12 menit dengan GPS
css/style.css
js/config.js        ← URL Apps Script (diisi sekali, tidak ikut paket update)
js/nilai.js         ← rumus nilai dan penyusun program latihan
js/app.js           ← tampilan dan alur aplikasi
assets/favicon.svg
assets/og.png       ← gambar pratinjau saat link dibagikan
assets/logo-*.png   ← logo JadiPrajurit (warna asli, versi latar gelap, versi stiker, ikon)
assets/icon-*.png   ← ikon situs
apps-script/Code.gs ← backend, ditempel di Apps Script spreadsheet
```

## Isi spreadsheet

| Tab | Isi |
|---|---|
| Peserta | Satu baris per casis: data diri, nomor WA, persetujuan data, jumlah catatan, nilai jasmani terbaru, tanggal latihan terakhir |
| Catatan Latihan | Satu baris per sesi latihan |
| Standar Nilai | Tabel konversi hasil ke nilai, per jenis kelamin dan item. Berisi tabel nilai jasmani TNI golongan umur 18–25 tahun; cocokkan dengan juknis seleksi terbaru. |
| Pengaturan | `standar_resmi`, `sumber_standar`, `target_default`, `link_grup_wa`, `wa_admin`, `nama_admin`, `label_kontak` |
| Simpan Kontak | Daftar nomor casis untuk disimpan admin secara bulk lewat Markaz, beserta statusnya |

Nilai jasmani dihitung sebagai (nilai lari 12 menit + rata-rata nilai pull-up/chinning, sit-up, push-up, shuttle run) ÷ 2. Di antara dua baris tabel, nilai dihitung proporsional.

## Cara pasang (pertama kali)

### 1. Apps Script
1. Buka spreadsheet **SIGAP – Data Peserta JadiPrajurit** → **Extensions → Apps Script**.
2. Hapus kode bawaan, tempel seluruh isi `apps-script/Code.gs`, lalu simpan.
3. Pilih fungsi **setup** → **Run**. Izinkan akses saat diminta. Langkah ini membuat dan merapikan tab Peserta, Catatan Latihan, Standar Nilai (berisi tabel contoh), dan Pengaturan.
4. **Deploy → New deployment** → ikon gerigi → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Klik **Deploy**, lalu salin **URL Web app** yang diakhiri `/exec`.

### 2. config.js
Buka `js/config.js`, tempel URL tadi di `APPS_SCRIPT_URL`, simpan.

### 3. GitHub
Buat repo baru, misalnya `sigap-jadiprajurit`, lalu upload **isi** folder ini (bukan foldernya) sehingga `index.html` berada langsung di halaman utama repo.

### 4. Vercel
**Add New → Project** → pilih repo → Framework Preset **Other** → Root Directory `./` → **Deploy**.

### 5. Cek
Buka `https://<nama-project>.vercel.app/?cek=1`. Semua baris harus ✅. Tanda ⚠️ pada "Standar nilai resmi", "Link grup WhatsApp", dan "Nomor WA admin" berarti isiannya belum dilengkapi di tab Pengaturan.

### 6. Lengkapi spreadsheet
1. Tab **Standar Nilai**: ganti tabel contoh dengan tabel resmi. Satu baris = satu titik (Jenis Kelamin, Item, Hasil, Nilai). Minimal 2 baris per item per jenis kelamin; makin banyak titik, makin akurat.
2. Tab **Pengaturan**: ubah `standar_resmi` menjadi `YA`, isi `sumber_standar`, dan bila ada, `link_grup_wa` serta `wa_admin` (format `628xxxxxxxxxx`).

Perubahan di tab Standar Nilai dan Pengaturan langsung berlaku tanpa deploy ulang.

## Kontak WhatsApp

**Nomor casis disimpan admin.** Persetujuan ini sudah menjadi bagian dari centang wajib saat daftar. Setiap pendaftar otomatis masuk tab **Simpan Kontak** dengan nama seperti `Rizky Aditya Casis JadiPrajurit` dan status `Belum disimpan admin`. Admin menyimpannya secara bulk lewat Markaz, lalu memilih menu **SIGAP → Tandai semua sudah disimpan**. Menu **Ekspor kontak belum disimpan ke vCard** tersedia sebagai cadangan.

**Casis wajib menyimpan nomor admin.** Setelah daftar, kartu kontak admin langsung terbuka otomatis di HP casis. Casis tidak bisa masuk ke aplikasi sebelum mencentang "Saya sudah menyimpan nomor admin". Konfirmasinya tercatat di kolom **Simpan Nomor Admin** pada tab Peserta. Casis yang mendaftar sebelum fitur ini juga akan diminta langkah yang sama saat membuka aplikasi.

Langkah wajib ini hanya aktif bila `wa_admin` di tab Pengaturan sudah diisi. Nama kontaknya diambil dari `nama_admin`.

## Data pendaftaran

Wajib: bukti syarat, nama lengkap, email akun JadiPrajurit, jenis kelamin, usia, matra, dan persetujuan data. Opsional: tinggi, berat, domisili, tanggal tes, dan target nilai (bawaan 100). Nomor WhatsApp dan jalur **tidak lagi diminta**; data lama peserta yang sudah terisi tetap tersimpan.

Setelah daftar, peserta melihat halaman sambutan dengan dua ajakan: **Gabung grup WhatsApp** (link dari `link_grup_wa`) dan **Chat admin untuk konsultasi** (nomor dari `wa_admin`, pesan sudah terisi nama, email, matra, dan prediksi nilai). Kedua ajakan juga tampil di Beranda dan Profil. Karena nomor peserta tidak lagi diminta, tab **Simpan Kontak** hanya terisi dari peserta lama; nomor peserta baru didapat admin saat mereka mengirim chat konsultasi.

## Story per latihan

Selain story ringkasan semua latihan, peserta bisa membagikan **satu latihan saja**, misalnya push-up hari ini. Isinya: hasil dalam angka besar, nilai dibanding target, selisih dari latihan sebelumnya, grafik 5 latihan terakhir untuk item itu, serta label otomatis **Terverifikasi kamera/GPS** dan **Rekor baru**. Latihan pertama untuk sebuah item menampilkan ajakan memantau perkembangan.

Tombol bagikan latihan tersedia di tiga tempat: kartu **Latihan tersimpan** di Beranda setelah menyimpan catatan, tombol **Bagikan** di setiap catatan pada Riwayat (menu Progres), dan pilihan latihan di halaman Bagikan.

## Tabel nilai per matra

Tab **Standar Nilai** punya kolom **Matra** berisi `Semua`, `AD`, `AL`, atau `AU`.

- Baris `Semua` adalah tabel umum yang dipakai semua matra.
- Untuk membuat tabel khusus, tambahkan baris dengan matra tertentu, misalnya `Pria | Push-up | 10 | 0 | AL` dan `Pria | Push-up | 30 | 100 | AL`. Setiap tabel khusus minimal 2 baris per item.
- Item yang belum punya tabel khusus otomatis memakai tabel `Semua`. Peserta memakai tabel sesuai matra di profilnya, dan halaman Catat menuliskan tabel mana yang sedang dipakai.
- Target nilai bawaan adalah **100** (kunci `target_default` di tab Pengaturan).

## Tes kamera dan lari GPS

Kedua fitur sudah bisa dipakai dan hasilnya bisa disimpan ke catatan:
- **Tes kamera (`kamera.html`):** push-up, sit-up, dan pull-up/chinning dihitung kamera. Hasil mode *Tes 1 menit* yang selesai penuh bisa disimpan; isian di Catat diberi tanda **Terverifikasi kamera** dan keterangannya ikut tersimpan.
- **Lari GPS (`lari.html`):** hasil Tes 12 menit yang sah bisa disimpan dengan tanda **Terverifikasi GPS**.
- Bila angka yang terisi diubah manual, tanda terverifikasi otomatis hilang.
- Mesin pengenal pose (MediaPipe) dan modelnya disimpan di folder `vendor/mediapipe/` sehingga tidak bergantung pada server luar. Lisensi Apache 2.0 dari Google ada di `vendor/mediapipe/LISENSI.txt`.

## Syarat pendaftaran

Saat calon peserta membuka halaman Daftar, pop-up **Syarat pendaftaran SIGAP** muncul otomatis. Peserta wajib mengunggah satu screenshot bukti untuk setiap syarat; tombol Daftar tidak bisa dipakai sebelum semua bukti lengkap, dan server juga menolak pendaftaran tanpa bukti.

- **Mengubah syarat:** edit tab **Syarat** di spreadsheet. Kolom "Syarat" berisi teks yang tampil, "Link" opsional (misalnya link profil atau postingan), dan "Aktif" diisi `Tidak` untuk menyembunyikan syarat. Perubahan berlaku dalam 5 menit tanpa deploy ulang.
- **Melihat bukti:** kolom **Bukti Syarat** di tab Peserta berisi link file di Google Drive (folder *Bukti Syarat - SIGAP JadiPrajurit*), satu link per syarat. File hanya bisa dibuka akun pemilik dan yang diberi akses.
- Gambar dikompres di HP sebelum diunggah (maksimal sisi 1280 px). Hanya gambar yang diterima; screenshot yang sama untuk dua syarat ditolak.

## Pengaman anti salah (poka-yoke)

| Risiko | Pengaman |
|---|---|
| Salah ketik email saat daftar atau masuk (gmial.com, gmail.con) | Saran perbaikan otomatis; email yang disarankan langsung diisikan |
| Data utama salah (email, WA, jenis kelamin, usia) | Ringkasan wajib dikonfirmasi sebelum daftar, karena jenis kelamin dan usia menentukan tabel nilai |
| Jarak lari ditulis "2.400" atau "2,4" | Terbaca sebagai 2,4 lalu ditawarkan diubah menjadi 2.400 meter |
| Repetisi berkoma (10.5) | Ditolak, harus bilangan bulat |
| Angka di luar kemampuan manusia atau melonjak jauh dari catatan sebelumnya | Diminta konfirmasi sebelum disimpan |
| Tanggal di masa depan / lebih dari 60 hari lalu | Ditolak / diminta konfirmasi |
| Tombol simpan ditekan dua kali, atau koneksi putus lalu dikirim ulang | Tombol terkunci saat menyimpan; setiap catatan punya ID unik sehingga server tidak mencatat ganda |
| Koneksi putus saat menyimpan | Catatan disimpan di HP dan dikirim otomatis saat koneksi kembali |
| HP masih memakai file lama setelah update | Muncul banner "Muat ulang" |
| Pendaftaran tanpa bukti syarat, bukti bukan gambar, atau screenshot yang sama dipakai untuk dua syarat | Ditolak di HP dan di server |
| Paket salah diupload, `config.js` kosong, backend belum di-deploy | Terdeteksi di halaman `?cek=1` |
| Admin salah mengisi tab Standar Nilai (tidak berurutan, nilai di luar 0–100) | Ditolak server atau ditandai ❌ di `?cek=1`; item yang rusak memakai tabel cadangan |
| Admin mengubah baris judul spreadsheet | Baris judul dilindungi dengan peringatan |
| Isian berisi rumus (=, +, @) | Disimpan sebagai teks, bukan dijalankan sebagai rumus |
| Dua orang menyimpan bersamaan | Penulisan ke spreadsheet dikunci bergantian |
| Tes kamera dan lari GPS dicurangi | Gerakan tidak sah ditolak; layar mati, kecepatan tidak wajar, atau tanpa irama langkah membuat hasil tidak sah |

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
