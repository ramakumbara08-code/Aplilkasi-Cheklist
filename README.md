# Aplikasi Checklist

Struktur proyek sekarang dipisah menjadi dua bagian:

```text
Cheklist/
  gas/   -> backend Google Apps Script + database Google Sheets
  web/   -> frontend GitHub/Vercel + proxy API ke GAS
```

## 1. Folder `gas/`

File di folder ini yang disalin ke Google Apps Script:

- `Code.gs`
- `Database.gs`
- `Auth.gs`
- `Admin.gs`
- `Checklist.gs`
- `Api.gs`
- `Storage.gs`
- `appsscript.json`

Frontend HTML lama sudah tidak dipakai karena tampilan aplikasi sekarang ada di folder `web/`.

Setelah file GAS disalin:

1. Jalankan `setupApp()` sekali.
   Jalankan kembali setelah pembaruan ini agar kolom jabatan dan bukti upload ditambahkan tanpa menghapus data lama.
2. Deploy sebagai Web App.
3. Gunakan pengaturan:
   - Execute as: `Me`
   - Who has access: `Anyone`
4. Salin URL Web App yang berakhiran `/exec`.

## 2. Folder `web/`

Upload folder `web`, folder `api`, serta `index.html` dan `vercel.json` di root ke GitHub.

Upload logo, kop surat, dan bukti ACC disimpan dalam satu folder `Aplikasi Checklist - Uploads` di Google Drive akun yang mendeploy GAS. Kapasitas total mengikuti kuota akun Google/Workspace tersebut.

Untuk upload saat memakai VS Code Live Server, jalankan dari root proyek:

```powershell
node local-proxy.js
```

Biarkan terminal proxy tetap terbuka, lalu gunakan Live Server seperti biasa di port `5500`.

Jika Vercel tidak menampilkan pilihan `Root Directory`, biarkan saja. File `index.html` di root proyek akan otomatis membuka aplikasi di `web/index.html`.

URL GAS tidak ditempel di kode `index.html` atau `src/app.js`.

Untuk deploy Vercel, paste URL GAS di:

```text
Vercel Dashboard -> Project -> Settings -> Environment Variables
Name  : GAS_WEB_APP_URL
Value : https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

Saat import ke Vercel, set `Root Directory` ke:

```text
web
```

Untuk tes lokal, buat file:

```text
web/.env
```

Isi:

```env
GAS_WEB_APP_URL=https://script.google.com/macros/s/DEPLOYMENT_ID/exec
```

File `.env` sengaja tidak ikut GitHub karena sudah masuk `.gitignore`.

## Login Awal

Jika database baru:

- Username: `admin`
- Password: `admin123`

Jika login bermasalah setelah migrasi, jalankan fungsi `resetAdminLogin()` di Apps Script lalu login kembali dengan `admin / admin123`.
