# 🚀 TAOSCRIPTIONS AUTO MINTER

CLI Node.js untuk auto mint TAO-20 di Taoscriptions lewat chain Bittensor Finney.

## ✨ Features

- 🎯 Input ticker manual saat runtime
- 💎 Support `TAO_SECRET` maupun `SEED_PHRASE`
- ⚡ Fast mode dan finalized mode
- 💰 Auto hitung estimasi mint fee
- 👛 Balance check sebelum mint
- 🔁 Loop mint dengan delay yang bisa diatur
- 📊 Ringkasan hasil mint di akhir
- 🎨 Output terminal yang lebih rapi dan enak dilihat

## 📋 Prerequisites

- 🟢 Node.js 20+
- 👛 Wallet Bittensor/Substrate dengan saldo TAO
- 🔐 Recovery phrase Talisman atau secret Substrate lain yang valid

## 📦 Installation

```bash
npm install
```

## ⚙️ Configuration

1. Copy file [.env.example](/Users/ekydiza/codevibe/mint-taos/.env.example) menjadi `.env`

```bash
cp .env.example .env
```

2. Isi `.env`

```env
TAO_SECRET=your recovery phrase here
SEED_PHRASE=
TAO_RPC_URL=wss://entrypoint-finney.opentensor.ai:443
TAO_TREASURY=5Fh7dSmMKVXT5YC7hsfCcHDg171xtQWBhppu66pxCqbvnnJC
TAO_MINT_FEE=0.001
TAO_DEFAULT_DELAY_MS=1200
TAO_SEND_MODE=fast
```

### 📝 Notes for Env

- Isi salah satu: `TAO_SECRET` atau `SEED_PHRASE`
- Untuk wallet Talisman TAO, biasanya yang dipakai adalah recovery phrase
- Jangan commit file `.env`

## 🖥️ Usage

Jalankan:

```bash
npm start
```

Atau:

```bash
npx mint-taos
```

Saat runtime CLI akan menanyakan:

1. 🎯 ticker yang mau di-mint
2. 💎 amount per mint
3. 🔁 jumlah iterasi
4. ⏱ delay antar transaksi
5. ⚡ mode kirim: `fast` atau `finalized`

Setelah input selesai, proses mint langsung jalan tanpa prompt konfirmasi tambahan.

## ⚡ Send Modes

- ⚡ `fast`: lanjut ke iterasi berikutnya setelah transaksi masuk block
- 🛡️ `finalized`: tunggu finalization sebelum lanjut ke transaksi berikutnya

Kalau targetmu speed, gunakan `fast`.

## 🔗 Mint Flow

Tool ini membangun transaksi:

```text
utility.batchAll([
  balances.transferKeepAlive(treasury, 0.001 TAO),
  system.remark(payload)
])
```

Payload mint:

```json
{"p":"tao-20","op":"mint","tick":"BYTE","amt":"420"}
```

`BYTE` di atas hanya contoh. Saat jalan, ticker tetap kamu input manual.

## 🧾 Example Output

```text
════════════════════════════════════════════════════════════════════════════════════════════════
TAOSCRIPTIONS AUTO MINTER
created by Prune
════════════════════════════════════════════════════════════════════════════════════════════════

> 🔧 Session
wallet     5F...
rpc        wss://entrypoint-finney.opentensor.ai:443
treasury   5Fh7dSmMKVXT5YC7hsfCcHDg171xtQWBhppu66pxCqbvnnJC
fee/tx     0.001 TAO

🎯 Ticker yang mau di-mint BYTE
💎 Amount per mint 420
🔁 Berapa kali iterasi mint 3
⏱ Delay antar transaksi dalam ms 3000
⚡ Mode kirim (fast/finalized) fast

> 📝 Mint Plan
ticker     BYTE
amount     420
tx count   3
delay      3000 ms
mode       fast
balance    0.1554 TAO
mint fee   0.0030 TAO total

[1/3] • minting BYTE x420 (nonce 12)
✓ 0x1234abcd...89ef in block 0xabcd1234...5678
• wait 3000 ms

> 📊 Summary
success    ✓ 3
failed     ✗ 0
mode       fast
```

## 💡 Tips

- 🎯 Pastikan `amount` tidak melebihi `lim` ticker yang ingin kamu mint
- ⏱ Kalau sering gagal, naikkan delay
- ⚡ Kalau mau ngebut, pakai `fast`
- 🧪 Tes dulu pakai iterasi kecil sebelum gas penuh

## 🛠️ Troubleshooting

### ❌ Missing TAO_SECRET in .env

Pastikan file `.env` benar-benar ada, bukan cuma `.env.example`.

### 🌐 RPC connection timed out

- Cek internet
- Coba ulang beberapa saat lagi
- Pastikan endpoint `wss://entrypoint-finney.opentensor.ai:443` masih aktif

### 🔁 Mint gagal terus

- Cek saldo TAO cukup
- Pastikan ticker valid dan amount tidak melewati limit
- Coba mode `finalized`
- Tambahkan delay lebih besar

### ⚠️ Warning API/INIT atau signed extensions

Warning umum yang tidak penting sudah difilter di CLI. Kalau masih muncul, biasanya itu noise dari compatibility metadata chain.

## 🔒 Security

- 🔐 Jangan bagikan recovery phrase
- 🚫 Jangan commit `.env`
- 👛 Sebaiknya pakai wallet khusus minting
- 🧪 Mulai dari nominal kecil dulu

## 📌 Notes

- 🏦 Default treasury Taoscriptions: `5Fh7dSmMKVXT5YC7hsfCcHDg171xtQWBhppu66pxCqbvnnJC`
- 🌐 Default RPC: `wss://entrypoint-finney.opentensor.ai:443`
- 💸 Mint fee default: `0.001 TAO` per tx, gas belum termasuk
