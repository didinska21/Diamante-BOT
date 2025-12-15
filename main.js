// ============================================================
// SIMPLE DIAM BOT - Login & Send (ENHANCED VERSION)
// ============================================================

import fs from 'fs';
import axios from 'axios';
import { getAddress, Wallet } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import readline from 'readline';

// ============================================================
// CONFIGURATION
// ============================================================

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CONFIG_DEFAULT_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Cache-Control": "no-cache",
  "Origin": "https://campaign.diamante.io",
  "Pragma": "no-cache",
  "Referer": "https://campaign.diamante.io/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
};

const CONFIG = {
  sendAmountMin: 0.001,
  sendAmountMax: 0.001,
  sendCount: 1,
  sendMode: 'random-generated',
  targetAddress: null,
  delayBetweenSends: 60000,      // Default 60 detik
  delayBetweenAccounts: 60000    // Default 60 detik
};

// ============================================================
// GLOBAL STATE
// ============================================================

let accountTokens = {};
let accountData = {};

// ============================================================
// READLINE INTERFACE
// ============================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// ============================================================
// HELPER FUNCTIONS - ENHANCED
// ============================================================

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('id-ID');
  const colors = {
    info: '\x1b[36m',
    success: '\x1b[32m',
    error: '\x1b[31m',
    warn: '\x1b[33m',
    highlight: '\x1b[35m',
    reset: '\x1b[0m'
  };
  
  const icons = {
    info: 'ℹ',
    success: '✓',
    error: '✗',
    warn: '⚠',
    highlight: '★'
  };
  
  const color = colors[type] || colors.info;
  const icon = icons[type] || 'ℹ';
  console.log(`${color}[${timestamp}] ${icon} ${message}${colors.reset}`);
}

function printBanner() {
  console.clear();
  const banner = `
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     ██████╗ ██╗ █████╗ ███╗   ███╗                       ║
║     ██╔══██╗██║██╔══██╗████╗ ████║                       ║
║     ██║  ██║██║███████║██╔████╔██║                       ║
║     ██║  ██║██║██╔══██║██║╚██╔╝██║                       ║
║     ██████╔╝██║██║  ██║██║ ╚═╝ ██║                       ║
║     ╚═════╝ ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝                       ║
║                                                           ║
║                      by : didinska                        ║
║                                                           ║
║            🚀 AUTO SENDER & TRANSACTION BOT 🚀            ║
║                      Version 2.0                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;
  console.log('\x1b[36m' + banner + '\x1b[0m');
}

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(seconds, message = "Waiting") {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  
  for (let i = seconds; i > 0; i--) {
    const mins = Math.floor(i / 60);
    const secs = i % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    
    // Progress bar
    const totalBars = 30;
    const filledBars = Math.floor((seconds - i) / seconds * totalBars);
    const emptyBars = totalBars - filledBars;
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    
    process.stdout.write(
      `\r\x1b[33m${frames[frameIndex]} ${message}: [${progressBar}] ${timeStr} remaining...\x1b[0m`
    );
    
    frameIndex = (frameIndex + 1) % frames.length;
    await sleep(1000);
  }
  
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}

async function showLoading(message = "Processing", duration = 2000) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const dots = ['   ', '.  ', '.. ', '...'];
  let frameIndex = 0;
  let dotIndex = 0;
  
  const interval = 100;
  const iterations = Math.floor(duration / interval);
  
  for (let i = 0; i < iterations; i++) {
    process.stdout.write(
      `\r\x1b[36m${frames[frameIndex]} ${message}${dots[dotIndex]}\x1b[0m`
    );
    frameIndex = (frameIndex + 1) % frames.length;
    dotIndex = Math.floor(i / 3) % dots.length;
    await sleep(interval);
  }
  
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}

function randomAmount(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4));
}

function generateRandomAddress() {
  const wallet = Wallet.createRandom();
  return wallet.address;
}

// ============================================================
// FILE LOADERS
// ============================================================

function loadAddresses() {
  try {
    const data = fs.readFileSync("user.txt", "utf8");
    const addresses = data.split("\n")
      .map(addr => addr.trim())
      .filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/))
      .map(addr => getAddress(addr));
    
    log(`Loaded ${addresses.length} addresses from user.txt`, 'success');
    return addresses;
  } catch (error) {
    log(`Failed to load addresses: ${error.message}`, 'error');
    return [];
  }
}

function loadRecipients() {
  try {
    const data = fs.readFileSync("wallet.txt", "utf8");
    const recipients = data.split("\n")
      .map(addr => addr.trim())
      .filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/))
      .map(addr => getAddress(addr));
    
    log(`Loaded ${recipients.length} recipient addresses from wallet.txt`, 'success');
    return recipients;
  } catch (error) {
    log(`Failed to load recipients: ${error.message}`, 'error');
    return [];
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    const proxies = data.split("\n")
      .map(proxy => proxy.trim())
      .filter(proxy => proxy);
    
    log(`Loaded ${proxies.length} proxies from proxy.txt`, 'success');
    return proxies;
  } catch (error) {
    log(`No proxies loaded, running without proxy`, 'warn');
    return [];
  }
}

function loadAccountData() {
  try {
    if (fs.existsSync("account_data.json")) {
      const data = fs.readFileSync("account_data.json", "utf8");
      accountData = JSON.parse(data);
      log('Loaded existing account data', 'success');
    }
  } catch (error) {
    log('No account data found, starting fresh', 'warn');
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync("account_data.json", JSON.stringify(accountData, null, 2));
  } catch (error) {
    log(`Failed to save account data: ${error.message}`, 'error');
  }
}

// ============================================================
// INTERACTIVE CONFIG - ENHANCED
// ============================================================

async function askConfiguration() {
  console.log('\n' + '┌' + '─'.repeat(58) + '┐');
  console.log('│' + ' '.repeat(18) + '\x1b[1m\x1b[36mKONFIGURASI BOT\x1b[0m' + ' '.repeat(18) + '│');
  console.log('└' + '─'.repeat(58) + '┘\n');

  // 1. Mode kirim
  console.log('\x1b[1m📤 Mode Pengiriman:\x1b[0m');
  console.log('  \x1b[32m1.\x1b[0m Random Address (Generate otomatis pakai ethers)');
  console.log('  \x1b[32m2.\x1b[0m Dari wallet.txt (Daftar address yang sudah ada)');
  console.log('  \x1b[32m3.\x1b[0m Manual - Kirim ke 1 address tertentu saja\n');
  
  let modeInput = await question('Pilih mode (1/2/3) [default: 1]: ');
  modeInput = modeInput.trim() || '1';
  
  if (modeInput === '3') {
    CONFIG.sendMode = 'manual';
    let targetAddr = await question('\n🎯 Masukkan target address (0x...): ');
    targetAddr = targetAddr.trim();
    
    try {
      CONFIG.targetAddress = getAddress(targetAddr);
      log(`Target address set: ${getShortAddress(CONFIG.targetAddress)}`, 'success');
    } catch (error) {
      log('Invalid address format! Using random generation mode instead.', 'error');
      CONFIG.sendMode = 'random-generated';
    }
  } else if (modeInput === '2') {
    CONFIG.sendMode = 'random-from-file';
    log('Mode: Random recipient dari wallet.txt', 'success');
  } else {
    CONFIG.sendMode = 'random-generated';
    log('Mode: Generate random address otomatis', 'success');
  }

  // 2. Jumlah kirim
  console.log('\n' + '─'.repeat(60));
  console.log('\x1b[1m💰 Jumlah DIAM Per Transaksi:\x1b[0m');
  console.log('─'.repeat(60));
  
  let amountType = await question('\n  \x1b[32m1.\x1b[0m Fixed (jumlah tetap)\n  \x1b[32m2.\x1b[0m Random (acak dalam range)\n\nPilih (1/2) [default: 1]: ');
  amountType = amountType.trim() || '1';
  
  if (amountType === '2') {
    let minAmount = await question('\n📉 Jumlah minimal (contoh: 0.001) [default: 0.001]: ');
    minAmount = parseFloat(minAmount.trim() || '0.001');
    
    let maxAmount = await question('📈 Jumlah maksimal (contoh: 0.01) [default: 0.01]: ');
    maxAmount = parseFloat(maxAmount.trim() || '0.01');
    
    if (minAmount >= maxAmount) {
      log('Min harus lebih kecil dari Max! Menggunakan default.', 'error');
      CONFIG.sendAmountMin = 0.001;
      CONFIG.sendAmountMax = 0.01;
    } else {
      CONFIG.sendAmountMin = minAmount;
      CONFIG.sendAmountMax = maxAmount;
    }
    
    log(`Amount: Random ${CONFIG.sendAmountMin} - ${CONFIG.sendAmountMax} DIAM`, 'success');
  } else {
    let fixedAmount = await question('\n💵 Jumlah DIAM yang dikirim (contoh: 0.01) [default: 0.001]: ');
    fixedAmount = parseFloat(fixedAmount.trim() || '0.001');
    CONFIG.sendAmountMin = fixedAmount;
    CONFIG.sendAmountMax = fixedAmount;
    log(`Amount: Fixed ${fixedAmount} DIAM`, 'success');
  }

  // 3. Berapa kali kirim
  console.log('\n' + '─'.repeat(60));
  let sendCount = await question('🔁 Berapa kali kirim per account? [default: 1]: ');
  sendCount = parseInt(sendCount.trim() || '1');
  
  if (isNaN(sendCount) || sendCount < 1) {
    log('Invalid! Using default: 1x', 'error');
    CONFIG.sendCount = 1;
  } else {
    CONFIG.sendCount = sendCount;
    log(`Akan mengirim ${sendCount}x per account`, 'success');
  }

  // 4. Delay settings
  console.log('\n' + '─'.repeat(60));
  console.log('\x1b[1m⏱️  Delay Settings (dalam detik):\x1b[0m');
  console.log('─'.repeat(60));
  
  let delaySend = await question('\n⏳ Delay antar transaksi (detik) [default: 60]: ');
  delaySend = parseInt(delaySend.trim() || '60');
  if (delaySend < 60) {
    log('⚠️  Delay minimal 60 detik untuk menghindari rate limit!', 'warn');
    delaySend = 60;
  }
  CONFIG.delayBetweenSends = delaySend * 1000;
  
  let delayAccount = await question('⏳ Delay antar account (detik) [default: 60]: ');
  delayAccount = parseInt(delayAccount.trim() || '60');
  if (delayAccount < 60) {
    log('⚠️  Delay minimal 60 detik untuk menghindari rate limit!', 'warn');
    delayAccount = 60;
  }
  CONFIG.delayBetweenAccounts = delayAccount * 1000;
  
  log(`Delay: ${delaySend}s antar transaksi, ${delayAccount}s antar account`, 'success');

  // Summary
  console.log('\n' + '┌' + '─'.repeat(58) + '┐');
  console.log('│' + ' '.repeat(16) + '\x1b[1m\x1b[35mRINGKASAN KONFIGURASI\x1b[0m' + ' '.repeat(15) + '│');
  console.log('└' + '─'.repeat(58) + '┘\n');
  
  let modeText = '';
  if (CONFIG.sendMode === 'random-generated') {
    modeText = '🎲 Random Address (Generate otomatis)';
  } else if (CONFIG.sendMode === 'random-from-file') {
    modeText = '📋 Random dari wallet.txt';
  } else {
    modeText = '🎯 Manual ke ' + getShortAddress(CONFIG.targetAddress);
  }
  
  console.log(`  Mode         : ${modeText}`);
  console.log(`  Amount       : ${CONFIG.sendAmountMin === CONFIG.sendAmountMax ? '💰 ' + CONFIG.sendAmountMin + ' DIAM (fixed)' : '💰 ' + CONFIG.sendAmountMin + ' - ' + CONFIG.sendAmountMax + ' DIAM (random)'}`);
  console.log(`  Send count   : 🔁 ${CONFIG.sendCount}x per account`);
  console.log(`  Delay send   : ⏱️  ${CONFIG.delayBetweenSends / 1000}s`);
  console.log(`  Delay account: ⏱️  ${CONFIG.delayBetweenAccounts / 1000}s`);
  console.log('\n' + '─'.repeat(60) + '\n');

  let confirm = await question('✅ Lanjutkan dengan konfigurasi ini? (y/n) [default: y]: ');
  confirm = confirm.trim().toLowerCase() || 'y';
  
  return confirm === 'y' || confirm === 'yes';
}

// ============================================================
// API FUNCTIONS
// ============================================================

async function makeApiRequest(method, url, data = null, proxyUrl = null, customHeaders = {}) {
  try {
    const agent = proxyUrl ? createAgent(proxyUrl) : null;
    const headers = { ...CONFIG_DEFAULT_HEADERS, ...customHeaders };
    
    const config = {
      method,
      url,
      data,
      headers,
      ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
      timeout: 10000,
      withCredentials: true
    };

    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('No response from server');
    } else {
      throw new Error(error.message);
    }
  }
}

async function loginAccount(address, proxyUrl = null) {
  try {
    await showLoading('Logging in', 1500);
    
    const checksummedAddress = getAddress(address);
    
    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(24).substr(2, 5).toUpperCase()}`;
      accountData[checksummedAddress.toLowerCase()] = deviceId;
      saveAccountData();
    }

    const payload = {
      address: checksummedAddress,
      deviceId: deviceId,
      deviceSource: "web_app",
      deviceType: "Windows",
      browser: "Chrome",
      ipAddress: "0.0.0.0",
      latitude: 12.9715987,
      longitude: 77.5945627,
      countryCode: "Unknown",
      country: "Unknown",
      continent: "Unknown",
      continentCode: "Unknown",
      region: "Unknown",
      regionCode: "Unknown",
      city: "Unknown"
    };

    const response = await makeApiRequest("post", `${API_BASE_URL}/user/connect-wallet`, payload, proxyUrl);

    if (response.data.success) {
      const userId = response.data.data.userId;
      const setCookie = response.headers['set-cookie'];
      let accessToken = null;

      if (setCookie) {
        const cookieStr = setCookie[0] || "";
        const match = cookieStr.match(/access_token=([^;]+)/);
        if (match) accessToken = match[1];
      }

      if (!accessToken) {
        throw new Error('Failed to extract access token');
      }

      accountTokens[checksummedAddress] = { userId, accessToken };
      
      log(`Login success: ${getShortAddress(checksummedAddress)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`Login failed for ${getShortAddress(address)}: ${error.message}`, 'error');
    return false;
  }
}

async function getBalance(address, proxyUrl = null) {
  try {
    const userId = accountTokens[address]?.userId;
    if (!userId) throw new Error('No userId found');

    const headers = {
      Cookie: `access_token=${accountTokens[address].accessToken}`
    };

    const response = await makeApiRequest(
      "get",
      `${API_BASE_URL}/transaction/get-balance/${userId}`,
      null,
      proxyUrl,
      headers
    );

    if (response.data.success) {
      return response.data.data.balance;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`Failed to get balance: ${error.message}`, 'error');
    return 0;
  }
}

async function sendDiam(fromAddress, toAddress, amount, proxyUrl = null) {
  try {
    await showLoading('Sending transaction', 1500);
    
    const userId = accountTokens[fromAddress]?.userId;
    if (!userId) throw new Error('No userId found');

    const payload = {
      toAddress: getAddress(toAddress),
      amount: amount,
      userId: userId
    };

    const headers = {
      Cookie: `access_token=${accountTokens[fromAddress].accessToken}`,
      "Content-Type": "application/json"
    };

    const response = await makeApiRequest(
      "post",
      `${API_BASE_URL}/transaction/transfer`,
      payload,
      proxyUrl,
      headers
    );

    if (response.data.success) {
      const hash = response.data.data.transferData.hash;
      log(`Sent ${amount} DIAM → ${getShortAddress(toAddress)} | Hash: ${getShortHash(hash)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`Send failed: ${error.message}`, 'error');
    return false;
  }
}

// ============================================================
// MAIN PROCESS - ENHANCED
// ============================================================

async function processAccount(address, recipients, proxyUrl, accountIndex, totalAccounts) {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log(`║  \x1b[1m\x1b[36mAccount ${accountIndex + 1}/${totalAccounts}: ${getShortAddress(address)}\x1b[0m${' '.repeat(58 - 25 - String(accountIndex + 1).length - String(totalAccounts).length - getShortAddress(address).length)}║`);
  console.log('╚' + '═'.repeat(58) + '╝');

  const loginSuccess = await loginAccount(address, proxyUrl);
  if (!loginSuccess) {
    log(`Skipping account ${accountIndex + 1} due to login failure`, 'error');
    return;
  }

  const balance = await getBalance(address, proxyUrl);
  log(`Current balance: 💰 ${balance.toFixed(4)} DIAM`, 'highlight');

  const totalNeeded = CONFIG.sendAmountMax * CONFIG.sendCount;
  if (balance < totalNeeded) {
    log(`Insufficient balance! Need ${totalNeeded.toFixed(4)} DIAM, have ${balance.toFixed(4)} DIAM`, 'warn');
    log(`Akan mengirim sebanyak mungkin dengan balance yang ada...`, 'warn');
  }

  let successCount = 0;
  for (let i = 0; i < CONFIG.sendCount; i++) {
    let recipient;
    if (CONFIG.sendMode === 'manual' && CONFIG.targetAddress) {
      recipient = CONFIG.targetAddress;
    } else if (CONFIG.sendMode === 'random-generated') {
      recipient = generateRandomAddress();
      log(`Generated random address: ${getShortAddress(recipient)}`, 'info');
    } else {
      do {
        recipient = recipients[Math.floor(Math.random() * recipients.length)];
      } while (recipient.toLowerCase() === address.toLowerCase());
    }

    const amount = randomAmount(CONFIG.sendAmountMin, CONFIG.sendAmountMax);

    console.log('\n' + '┌' + '─'.repeat(58) + '┐');
    console.log(`│  \x1b[1mTransaction ${i + 1}/${CONFIG.sendCount}\x1b[0m${' '.repeat(58 - 15 - String(i + 1).length - String(CONFIG.sendCount).length)}│`);
    console.log('└' + '─'.repeat(58) + '┘');
    log(`Amount: 💸 ${amount} DIAM → ${getShortAddress(recipient)}`, 'highlight');
    
    const success = await sendDiam(address, recipient, amount, proxyUrl);
    
    if (success) successCount++;

    if (i < CONFIG.sendCount - 1) {
      await countdown(CONFIG.delayBetweenSends / 1000, 'Next transaction in');
    }
  }

  console.log('\n' + '─'.repeat(60));
  log(`Account Summary: ${successCount}/${CONFIG.sendCount} successful ✨`, 'success');
  
  const finalBalance = await getBalance(address, proxyUrl);
  log(`Final balance: 💰 ${finalBalance.toFixed(4)} DIAM (Used: ${(balance - finalBalance).toFixed(4)} DIAM)`, 'highlight');
  console.log('─'.repeat(60));
}

async function main() {
  printBanner();

  loadAccountData();
  const addresses = loadAddresses();
  const recipients = loadRecipients();
  const proxies = loadProxies();

  if (addresses.length === 0) {
    log('No addresses found in user.txt!', 'error');
    rl.close();
    return;
  }

  console.log(`\n📊 Total accounts: \x1b[1m${addresses.length}\x1b[0m`);
  console.log(`🌐 Total proxies: \x1b[1m${proxies.length}\x1b[0m\n`);

  const confirmed = await askConfiguration();
  
  if (!confirmed) {
    log('Cancelled by user.', 'warn');
    rl.close();
    return;
  }

  if (CONFIG.sendMode === 'random-from-file') {
    if (recipients.length === 0) {
      log('No recipients found in wallet.txt!', 'error');
      rl.close();
      return;
    }
    console.log(`\n📋 Total recipients in wallet.txt: \x1b[1m${recipients.length}\x1b[0m\n`);
  } else if (CONFIG.sendMode === 'random-generated') {
    log('Will generate random addresses on-the-fly 🎲', 'info');
  }

  rl.close();

  console.log('\n' + '═'.repeat(60));
  log('🚀 Starting bot in 3 seconds...', 'highlight');
  console.log('═'.repeat(60) + '\n');
  await countdown(3, 'Starting in');

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const proxyUrl = proxies.length > 0 ? proxies[i % proxies.length] : null;
    
    if (proxyUrl) {
      log(`Using proxy: 🌐 ${proxyUrl.substring(0, 30)}...`, 'info');
    }

    await processAccount(address, recipients, proxyUrl, i, addresses.length);

    if (i < addresses.length - 1) {
      await countdown(CONFIG.delayBetweenAccounts / 1000, 'Next account in');
    }
  }

  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(14) + '\x1b[1m\x1b[32m🎉 ALL ACCOUNTS PROCESSED! 🎉\x1b[0m' + ' '.repeat(12) + '║');
  console.log('╚' + '═'.repeat(58) + '╝\n');
}

// ============================================================
// RUN
// ============================================================

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error.stack);
  rl.close();
  process.exit(1);
});
