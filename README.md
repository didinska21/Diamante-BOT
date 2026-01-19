# 💎 Diamante-BOT - Complete Automation Suite

Bot otomasi untuk testnet Diamante Network dengan fitur lengkap dan modular.

---

## 📁 Struktur Project

```
Diamante-BOT/
├── auto-cycle.js          # ✨ NEW: Auto cycle 24/7 (claim → send → repeat)
├── wallet-swap.js         # ✨ NEW: Ping-pong transfer 2 wallets
├── sender.js              # (ex: main3.js) Auto sender dengan token refresh
├── register-claim.js      # (ex: test3.js) Register & claim faucet
├── faucet.js              # Auto claim faucet only (24/7)
├── package.json           # Dependencies
├── account_data.json      # Device ID storage (auto-generated)
├── wallet_data.json       # Created wallets data (auto-generated)
│
├── users.txt              # Daftar wallet addresses (sender wallets)
├── targets.txt            # ✨ NEW: Target addresses untuk auto-cycle
├── wallet_swap.txt        # ✨ NEW: 2 wallets untuk swap (line1=W1, line2=W2)
├── wallet.txt             # Recipient addresses (untuk sender.js)
├── x_accounts.txt         # X/Twitter handles untuk register
├── main_wallet.txt        # Main wallet untuk collect all
└── proxy.txt              # Proxies (optional)
```

---

## 🚀 Fitur Utama

### 1. **auto-cycle.js** - Auto Claim & Send 24/7 ✨ NEW
**Fitur:**
- ✅ Login otomatis semua wallet di `users.txt`
- ✅ Claim faucet dengan retry logic (3x attempts)
- ✅ Kirim DIAM ke random address dari `targets.txt` sampai balance habis
- ✅ Loop otomatis setiap 24 jam

**Cara Pakai:**
```bash
# 1. Isi file-file ini:
echo "0xYourWallet1" > users.txt
echo "0xYourWallet2" >> users.txt
echo "0xTargetAddress1" > targets.txt
echo "0xTargetAddress2" >> targets.txt

# 2. Jalankan
node auto-cycle.js
```

**Alur:**
```
Login → Claim Faucet → Send to Random Target (loop sampai habis) 
→ Wait 24 hours → Repeat
```

---

### 2. **wallet-swap.js** - Wallet Ping-Pong Transfer ✨ NEW
**Fitur:**
- ✅ Transfer Wallet 1 → Wallet 2 (random amount, sampai habis)
- ✅ Otomatis return ALL dari Wallet 2 → Wallet 1 (sisakan fee saja)
- ✅ Safety limit 100 transfers per phase

**Cara Pakai:**
```bash
# 1. Buat wallet_swap.txt dengan 2 address:
echo "0xWallet1Address" > wallet_swap.txt
echo "0xWallet2Address" >> wallet_swap.txt

# 2. Jalankan
node wallet-swap.js
```

**Alur:**
```
PHASE 1: Wallet 1 → Wallet 2 (kirim sampai habis, random amount)
PHASE 2: Wallet 2 → Wallet 1 (return ALL balance - fee)
```

---

### 3. **sender.js** - Auto Transfer dengan Token Refresh
**Fitur:**
- ✅ Auto token refresh setiap 150 DIAM terkirim
- ✅ Multiple retry jika refresh gagal
- ✅ Kirim ke random address / dari file / manual

**Cara Pakai:**
```bash
node sender.js
# Ikuti interactive setup
```

---

### 4. **register-claim.js** - Register & Claim
**Fitur:**
- ✅ Create account baru (random wallet)
- ✅ Register dengan X account
- ✅ Claim faucet
- ✅ Send all to main wallet
- ✅ Full auto mode (all-in-one)

**Cara Pakai:**
```bash
# Setup
echo "@your_twitter" > x_accounts.txt
echo "0xMainWallet" > main_wallet.txt

# Jalankan
node register-claim.js
# Pilih mode 1-5
```

---

### 5. **faucet.js** - Claim Only 24/7
**Fitur:**
- ✅ Claim faucet only
- ✅ Loop 24 jam otomatis
- ✅ Retry logic jika gagal

**Cara Pakai:**
```bash
node faucet.js
```

---

## 📝 File Configuration

### **users.txt** - Wallet Addresses
Format: 1 address per line
```
0x1234567890abcdef1234567890abcdef12345678
0xabcdef1234567890abcdef1234567890abcdef12
```

### **targets.txt** - Target Addresses untuk Auto-Cycle
Format: 1 address per line
```
0x1111111111111111111111111111111111111111
0x2222222222222222222222222222222222222222
```

### **wallet_swap.txt** - 2 Wallets untuk Swap
Format: 2 lines only
```
0xWallet1AddressHere
0xWallet2AddressHere
```

### **proxy.txt** - Proxy List (Optional)
Format: `protocol://user:pass@host:port` or `protocol://host:port`
```
http://user:pass@proxy1.com:8080
socks5://proxy2.com:1080
```

### **x_accounts.txt** - X/Twitter Handles
Format: 1 handle per line (with or without @)
```
@cooluser123
twitterhandle456
```

---

## ⚙️ Configuration

Edit konstanta `CONFIG` di setiap file:

### **auto-cycle.js**
```javascript
const CONFIG = {
  sendAmountMin: 0.001,        // Min DIAM per transfer
  sendAmountMax: 0.01,         // Max DIAM per transfer
  minBalanceToKeep: 0.1,       // Min balance yang disimpan
  claimRetryMax: 3,            // Max retry claim faucet
  delayBetweenSends: 90,       // Delay antar transfer (detik)
  delayBetweenAccounts: 60,    // Delay antar account (detik)
  delay24Hours: 24 * 60 * 60   // 24 jam
};
```

### **wallet-swap.js**
```javascript
const CONFIG = {
  sendAmountMin: 0.001,          // Min per transfer
  sendAmountMax: 0.01,           // Max per transfer
  feeReserve: 0.05,              // Reserve untuk fee
  delayBetweenSends: 90,         // Delay (detik)
  maxSendsBeforeReturn: 100      // Safety limit
};
```

---

## 🔧 Installation

```bash
# 1. Clone/download project
git clone <repo-url>
cd Diamante-BOT

# 2. Install dependencies
npm install

# 3. Setup files
echo "0xYourAddress" > users.txt
echo "0xTargetAddress" > targets.txt
# ... setup file lainnya

# 4. Run
node auto-cycle.js
# atau
node wallet-swap.js
```

---

## 📊 Monitoring

Semua script menampilkan:
- ✅ Live countdown timer
- ✅ Balance tracker real-time
- ✅ Success/fail statistics
- ✅ Detailed transaction logs
- ✅ Error handling dengan retry

**Output Example:**
```
[14:30:15] ✅ Login success: 0x1234...5678
[14:30:20] 💰 Current balance: 10.5000 DIAM
[14:30:25] ✅ Sent 0.0050 DIAM to 0xabcd...ef12
[14:30:30] ⏳ Next send in 90s...

╔══════════════════════════════════════╗
║        CYCLE SUMMARY                  ║
╠══════════════════════════════════════╣
║  📊 Total Accounts: 5                ║
║  ✅ Success: 5                       ║
║  ❌ Failed: 0                        ║
║  💰 Total DIAM Sent: 125.4500        ║
╚══════════════════════════════════════╝
```

---

## ⚠️ Important Notes

1. **Rate Limits**: Delay minimal 60 detik untuk menghindari rate limit
2. **Token Refresh**: Auto refresh setiap 150 DIAM (sender.js)
3. **Safety**: Semua script punya safety limit dan error handling
4. **Headless**: Browser berjalan headless (background)
5. **Proxy**: Optional, support HTTP/HTTPS/SOCKS4/SOCKS5

---

## 🐛 Troubleshooting

**Login Failed:**
- Cek wallet sudah register
- Cek proxy (jika pakai)
- Cek internet connection

**Claim Failed:**
- Sudah claim hari ini (cooldown 24 jam)
- Balance tidak cukup untuk gas
- Rate limit (tunggu beberapa menit)

**Send Failed:**
- Balance tidak cukup
- Target address invalid
- Token expired (auto refresh di sender.js)

---

## 📜 Scripts Summary

| Script | Function | Mode |
|--------|----------|------|
| `auto-cycle.js` | Claim → Send loop 24/7 | Fully automated |
| `wallet-swap.js` | 2-wallet ping-pong | Semi-automated |
| `sender.js` | Mass transfer | Interactive |
| `register-claim.js` | Register + claim | Interactive |
| `faucet.js` | Claim only 24/7 | Fully automated |

---

## 💡 Tips

1. **Multiple Accounts**: Tambahkan lebih banyak address di `users.txt`
2. **Diversify Targets**: Gunakan banyak target di `targets.txt`
3. **Proxy Rotation**: 1 proxy per account untuk best results
4. **Monitor Logs**: Semua script print detailed logs
5. **Safety First**: Jangan set amount terlalu tinggi di awal

---

## 📞 Support

Untuk bug report atau feature request, silakan buka issue di GitHub repository.

---

## ⚖️ License

MIT License - Use at your own risk. Ini untuk testnet only.

---

**🌟 Star jika bermanfaat! 🌟**
