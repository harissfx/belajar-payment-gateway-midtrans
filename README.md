# Belajar Payment Gateway dengan Midtrans (Snap)

Project ini adalah versi pengembangan dari demo dasar Midtrans Snap, dengan tambahan
konsep-konsep yang dipakai di project payment gateway sungguhan.

## Cara menjalankan

```bash
npm install
cp .env.example .env
# lalu isi .env dengan Server Key & Client Key SANDBOX dari dashboard Midtrans kamu
npm start
```

Buka `http://localhost:3000`.

## PENTING: supaya webhook bisa dites

Server Midtrans (di internet) tidak bisa memanggil `http://localhost:3000/notification`
karena itu alamat lokal di komputer kamu. Untuk belajar & testing, kamu perlu expose
localhost ke internet, misalnya pakai [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

Ngrok akan kasih URL publik seperti `https://abcd1234.ngrok-free.app`. Lalu:

1. Login ke Dashboard Midtrans → **Settings → Configuration**.
2. Isi **Payment Notification URL** dengan `https://abcd1234.ngrok-free.app/notification`.
3. Simpan, lalu coba lakukan pembayaran sandbox lagi.
4. Perhatikan log di terminal `npm start` — kamu akan lihat notifikasi masuk dan status
   order berubah dari `pending` menjadi `success`/`failed`.

## Membaca log di terminal

Saat kamu jalankan `npm start` lalu buka aplikasi dan bayar, log di terminal akan urut kira-kira begini:

```
[SERVER]    Server berjalan di http://localhost:3000
[HTTP]      GET /products
[HTTP]      POST /create-transaction
[CREATE-TX] Permintaan transaksi masuk untuk productId="buku-belajar-node"
[CREATE-TX] Order ID dibuat: ORDER-171... | produk: Buku Belajar Node.js | harga: Rp50000
[CREATE-TX] Mengirim permintaan token ke Midtrans untuk ORDER-171...
[CREATE-TX] ✅ Token diterima dari Midtrans untuk ORDER-171...
[CREATE-TX] Order ORDER-171... disimpan dengan status "pending"

... (setelah kamu bayar di popup Snap, Midtrans memanggil webhook) ...

[HTTP]      POST /notification
[WEBHOOK]   📩 Notifikasi masuk dari Midtrans untuk order_id="ORDER-171..." (status: settlement)
[WEBHOOK]   ✔️  Signature valid untuk ORDER-171...
[WEBHOOK]   Mengonfirmasi ulang status ORDER-171... langsung ke Midtrans API...
[WEBHOOK]   ✅ Order ORDER-171... diupdate → status akhir: "success"

[HTTP]      GET /order-status/ORDER-171...
[STATUS]    Cek status ORDER-171... → "success"
```

Kalau webhook belum kamu setting (belum pakai ngrok), kamu hanya akan lihat sampai baris
`[CREATE-TX] disimpan dengan status "pending"` — bagian `[WEBHOOK]` tidak akan pernah muncul,
karena Midtrans tidak tahu ke mana harus mengirim notifikasi.

## Konsep penting yang perlu dipahami

- **Jangan pernah percaya status pembayaran dari frontend (`onSuccess` di JS).**
  Itu bisa dimanipulasi user (misalnya lewat DevTools). Status yang valid adalah yang
  datang lewat webhook `/notification` dan sudah lolos verifikasi signature.
- **Jangan pernah terima nominal harga dari frontend.** Selalu hitung/ambil harga dari
  data di server (database/produk), supaya user tidak bisa mengubah jumlah bayar dari
  browser.
- **`order_id` harus unik** setiap transaksi — di sini digabung timestamp + random number.
- File `data/orders.json` di project ini hanya untuk belajar. Di project produksi,
  gantilah dengan database sungguhan (PostgreSQL, MySQL, MongoDB, dll) karena file JSON
  tidak aman untuk akses bersamaan (concurrent write).

## Struktur folder

```
project_pay_gateway/
├── backend/
│   └── server.js        # semua logic backend
├── public/
│   └── index.html        # UI sederhana
├── data/
│   └── orders.json       # "database" order (untuk belajar)
├── .env.example           # template environment variable
├── .gitignore
└── package.json
```

## Langkah lanjut kalau mau eksplorasi lebih jauh

- Ganti `data/orders.json` dengan SQLite (pakai `better-sqlite3`) supaya lebih terbiasa
  dengan query database.
- Tambahkan halaman riwayat transaksi (list semua order & statusnya).
- Tambahkan autentikasi user sederhana supaya tiap order terhubung ke akun tertentu.
- Coba metode pembayaran lain di Midtrans (GoPay, QRIS, Virtual Account) — logikanya sama,
  cuma `payment_type` di parameter transaksi yang beda.