// Data simulasi pembayaran untuk demo checkout.
//
// PENTING: semua nomor, nama rekening, dan kode QR di berkas ini adalah data
// karangan. Tidak ada permintaan jaringan dan tidak ada transaksi sungguhan
// yang terjadi. Untuk produksi, ganti isi file ini dengan panggilan ke
// backend yang mengembalikan instruksi pembayaran dari penyedia resmi.
window.BUNNIE_PAYMENT_CONFIG = Object.freeze({
  // Biaya antar dalam rupiah. Gratis mulai subtotalThreshold.
  deliveryFee: 10000,
  freeDeliveryThreshold: 150000,
  storeName: 'Bunnie Bloom',
  storeAddress: 'Jl. Rasa Manis No. 12, Jakarta Pusat',
  storeHours: 'Setiap hari 08.00-20.00',
  bankHolder: 'PT Bunnie Bloom Bakery'
});

// Satu titik integrasi untuk gateway asli. Fungsi ini sengaja dibuat async
// supaya mengganti demo dengan Midtrans/Xendit cukup pada satu tempat.
window.BUNNIE_PAYMENT_SUBMIT = (payload) => new Promise((resolve) => {
  const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 500 : 1400;
  window.setTimeout(() => {
    resolve({
      ok: !payload.simulateFailure,
      orderId: payload.orderId,
      code: payload.simulateFailure ? 'PAYMENT_REJECTED' : 'PAID',
      message: payload.simulateFailure
        ? 'Bank menolak transaksi ini. Coba lagi atau pilih metode pembayaran lain.'
        : 'Pembayaran berhasil dikonfirmasi.'
    });
  }, delay);
});

window.BUNNIE_PAYMENT_METHODS = Object.freeze([
  {
    id: 'qris',
    label: 'QRIS',
    icon: 'qr',
    hint: 'Bisa dari GoPay, OVO, DANA, ShopeePay, atau m-banking apa pun.',
    kind: 'qr',
    instructions: [
      'Buka aplikasi e-wallet atau m-banking kamu.',
      'Pilih menu Scan QR lalu arahkan ke kode di layar ini.',
      'Pastikan jumlah yang muncul sudah cocok dengan total pesanan.',
      'Simpan screenshot sebagai bukti pembayaran.'
    ]
  },
  {
    id: 'va',
    label: 'Virtual Account',
    icon: 'bank',
    hint: 'Otomatis terverifikasi dari mutasi rekening bank.',
    kind: 'account',
    accounts: [
      { bank: 'Bank Central Asia', number: '8808 1234 5678' },
      { bank: 'Bank Mandiri', number: '8808 2345 6789' },
      { bank: 'Bank Negara Indonesia', number: '8808 3456 7890' }
    ],
    instructions: [
      'Pilih bank tujuan di aplikasi mobile atau m-banking kamu.',
      'Masukkan nomor virtual account di atas tanpa tanda hubung.',
      'Transfer tepat sampai digit terakhir agar pesanan terverifikasi otomatis.',
      'Simpan struk transfer sampai pesanan dikonfirmasi.'
    ]
  },
  {
    id: 'ewallet',
    label: 'E-Wallet',
    icon: 'wallet',
    hint: 'GoPay, OVO, DANA, ShopeePay, atau LinkAja.',
    kind: 'wallet',
    options: ['GoPay', 'OVO', 'DANA', 'ShopeePay', 'LinkAja'],
    instructions: [
      'Buka aplikasi dompet digital yang kamu pilih.',
      'Cari menu Scan QRIS lalu pindai kode di layar ini.',
      'Periksa nama merchants dan jumlah tagihan sebelum membayar.',
      'Simpan screenshot jika butuh bukti konfirmasi.'
    ]
  },
  {
    id: 'transfer',
    label: 'Transfer Bank',
    icon: 'bank',
    hint: 'Transfer manual, dikonfirmasi kami dalam 15 menit.',
    kind: 'account',
    accounts: [
      { bank: 'Bank Central Asia', number: '1122 3344 5566' },
      { bank: 'Bank Rakyat Indonesia', number: '2233 4455 6677' }
    ],
    instructions: [
      'Transfer ke salah satu rekening di atas sesuai nama pemilik rekening.',
      'Tuliskan nomor pesanan pada berita transfer agar mudah kami cocokkan.',
      'Kirim bukti transfer lewat WhatsApp ke nomor kami.',
      'Pesanan kami proses setelah dana terlihat, maksimal 15 menit.'
    ]
  },
  {
    id: 'cod',
    label: 'Bayar di Kedai',
    icon: 'store',
    hint: 'Ambil sendiri di toko dan bayar saat mengambil pesanan.',
    kind: 'cod',
    instructions: [
      'Ambil pesanan di toko sesuai estimasi waktu yang tertera.',
      'Tunjukkan nomor pesanan kepada kasir.',
      'Bayar di kasir dengan tunai, QRIS, atau kartu.',
      'Kue dipanggang ulang setelah pesanan masuk.'
    ]
  }
]);
