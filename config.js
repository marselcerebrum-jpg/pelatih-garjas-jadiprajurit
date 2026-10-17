/*
 * Pengaturan koneksi. Isi APPS_SCRIPT_URL dengan URL Web app dari Apps Script
 * (Deploy → Manage deployments → salin URL yang diakhiri /exec).
 * File ini TIDAK disertakan di paket update berikutnya supaya URL-nya tidak tertimpa.
 */
window.CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxk0vnElewXG6HhwuViAmiLFFOdM0eBS6NYXGpOo5rTGbDrM8e75Cxkc2a3eqQfOyO3fg/exec',
  // Duel live (Arena) memakai Supabase Realtime. Publishable key memang kunci publik untuk aplikasi web.
  SUPABASE_URL: 'https://pqxuedrzplbblmjavztm.supabase.co',
  SUPABASE_KEY: 'sb_publishable_G9RvQKICfd0xd5pK7eGr6A_Cn8o7X46'
};
