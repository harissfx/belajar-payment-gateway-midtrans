require('dotenv').config();

const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const midtransClient = require('midtrans-client');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// 1. konfigurasi key diambil dari .env
const SERVER_KEY = process.env.MIDTRANS_SERVER_KEY;
const CLIENT_KEY = process.env.MIDTRANS_CLIENT_KEY;

if (!SERVER_KEY || !CLIENT_KEY) {
  console.error('❌ MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY belum diisi di file .env');
  console.error('   Salin .env.example menjadi .env lalu isi key sandbox kamu.');
  process.exit(1);
}

const snap = new midtransClient.Snap({
  isProduction: false,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY,
});

const coreApi = new midtransClient.CoreApi({
  isProduction: false,
  serverKey: SERVER_KEY,
  clientKey: CLIENT_KEY,
});

// 2. "DATABASE" produk — harga ditentukan di SERVER, bukan dari input frontend. Ini mencegah user memanipulasi nominal bayar
const PRODUCTS = {
  'buku-belajar-node': { name: 'Buku Belajar Node.js', price: 50000 },
  'kaos-polos': { name: 'Kaos Polos', price: 75000 },
  'sticker-pack': { name: 'Sticker Pack', price: 15000 },
};

// 3. penyimpanan order sederhana di real project ini diganti database (Postgres/MySQL/dll)
const DB_PATH = path.join(__dirname, '..', 'data', 'orders.json');

function readOrders() {
  if (!fs.existsSync(DB_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function saveOrder(orderId, orderData) {
  const orders = readOrders();
  orders[orderId] = { ...orders[orderId], ...orderData };
  fs.writeFileSync(DB_PATH, JSON.stringify(orders, null, 2));
}

/* 4. endpoint buat transaksi frontend cuma kirim productId + data customer,
    harga & order_id dihitung/dibuat di server
*/
app.post('/create-transaction', async (req, res) => {
  const { productId, customer } = req.body;

  const product = PRODUCTS[productId];
  if (!product) {
    return res.status(400).json({ error: 'Produk tidak ditemukan' });
  }

  const orderId = 'ORDER-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: product.price,
    },
    item_details: [
      {
        id: productId,
        price: product.price,
        quantity: 1,
        name: product.name,
      },
    ],
    customer_details: {
      first_name: customer?.name || 'Guest',
      email: customer?.email || 'guest@example.com',
      phone: customer?.phone || '',
    },
  };

  try {
    const transaction = await snap.createTransaction(parameter);

    saveOrder(orderId, {
      orderId,
      productId,
      productName: product.name,
      amount: product.price,
      customer: parameter.customer_details,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    res.json({ token: transaction.token, orderId, redirect_url: transaction.redirect_url });
  } catch (error) {
    console.error('Gagal membuat transaksi:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/* 5. endpoint webhook — dipanggil server midtrans (bukan browser)
    Ini sumber kebenaran status pembayaran yang sesungguhnya, karena diverifikasi pakai signature, tidak bisa dipalsukan dari sisi frontend
*/
app.post('/notification', async (req, res) => {
  try {
    const notificationJson = req.body;
    const { order_id, status_code, gross_amount, signature_key } = notificationJson;
    const expectedSignature = crypto
      .createHash('sha512')
      .update(order_id + status_code + gross_amount + SERVER_KEY)
      .digest('hex');

    if (expectedSignature !== signature_key) {
      console.warn('⚠️  Signature tidak valid untuk order:', order_id);
      return res.status(403).json({ error: 'Invalid signature' });
    }

    const statusResponse = await coreApi.transaction.notification(notificationJson);
    const orderId = statusResponse.order_id;
    const transactionStatus = statusResponse.transaction_status;
    const fraudStatus = statusResponse.fraud_status;

    let finalStatus = 'pending';

    if (transactionStatus === 'capture') {
      finalStatus = fraudStatus === 'accept' ? 'success' : 'challenge';
    } else if (transactionStatus === 'settlement') {
      finalStatus = 'success';
    } else if (
      transactionStatus === 'cancel' ||
      transactionStatus === 'deny' ||
      transactionStatus === 'expire'
    ) {
      finalStatus = 'failed';
    } else if (transactionStatus === 'pending') {
      finalStatus = 'pending';
    }

    saveOrder(orderId, {
      status: finalStatus,
      transactionStatus,
      fraudStatus,
      updatedAt: new Date().toISOString(),
    });

    console.log(`✅ Notifikasi diterima untuk ${orderId}: ${finalStatus}`);
    res.status(200).json({ message: 'OK' });
  } catch (error) {
    console.error('Gagal memproses notifikasi:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 6. endpointcek status order (dipanggil frontend untuk polling, atau untuk verifikasi manual)
app.get('/order-status/:orderId', (req, res) => {
  const orders = readOrders();
  const order = orders[req.params.orderId];

  if (!order) {
    return res.status(404).json({ error: 'Order tidak ditemukan' });
  }

  res.json(order);
});

app.get('/products', (req, res) => {
  res.json(PRODUCTS);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
