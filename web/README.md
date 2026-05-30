# Aplikasi Checklist Frontend Vercel

Frontend ini berjalan di GitHub/Vercel, sedangkan backend dan database tetap memakai Google Apps Script + Google Sheets.

## Alur Deploy

1. Upload file GAS utama ke Apps Script, termasuk file baru `Api.gs`.
2. Jalankan `setupApp()` sekali jika spreadsheet belum disiapkan.
3. Deploy Apps Script sebagai Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
4. Salin URL Web App GAS yang berakhiran `/exec`.
5. Push folder `web` ke GitHub.
6. Import repository ke Vercel.
   - Jika repository berisi folder `gas` dan `web`, set `Root Directory` ke `web`.
7. Tambahkan Environment Variable di Vercel:
   - Name: `GAS_WEB_APP_URL`
   - Value: URL Web App GAS `/exec`
8. Deploy ulang Vercel.

## Struktur

- `index.html` adalah tampilan aplikasi.
- `src/app.js` memanggil API frontend.
- `api/gas.js` adalah proxy tipis Vercel ke GAS.
- Semua logic login, role, checklist, approve, print, dan data Sheets tetap berada di GAS.

## Tempat Paste URL GAS

Untuk percobaan dengan Live Server, paste URL GAS di:

```text
web/src/config.js
```

Formatnya:

```js
window.GAS_WEB_APP_URL = 'https://script.google.com/macros/s/DEPLOYMENT_ID/exec';
```

Jika memakai Live Server, backend GAS harus sudah memakai file `gas/Code.gs` terbaru karena Live Server memakai jalur JSONP dari `doGet()`.

Untuk deploy produksi di Vercel, URL GAS sebaiknya tetap dimasukkan lewat Environment Variable agar tidak hardcode di frontend.

Masukkan di Vercel:

```text
Settings -> Environment Variables
Name  : GAS_WEB_APP_URL
Value : https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Untuk tes lokal, buat file `.env.local` di folder `web`:

```env
GAS_WEB_APP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Contohnya sudah ada di `.env.example`. File `.env.local` tidak ikut GitHub karena masuk `.gitignore`.

## Catatan Penting

Setiap kali kode GAS berubah, buat deployment versi baru di Apps Script lalu pastikan URL `/exec` yang dipakai Vercel masih deployment terbaru. Jika memakai URL deployment yang sama dengan opsi redeploy, environment Vercel tidak perlu diganti.
