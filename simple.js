// ============================================================
// SIMPLE DIAM BOT - Login & Send (INTERACTIVE VERSION)
// ============================================================

import fs from 'fs';
import axios from 'axios';
import { getAddress } from 'ethers';
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

// CONFIG - Akan diisi dari user input
const CONFIG = {
  sendAmountMin: 0.001,
  sendAmountMax: 0.001,
  sendCount: 1,
  sendMode: 'random-generated',  // 'random-generated', 'random-from-file', atau 'manual'
  targetAddress: null,           // Untuk mode manual
  delayBetweenSends: 10000,
  delayBetweenAccounts: 30000
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
// HELPER FUNCTIONS
// ============================================================

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('id-ID');
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m',    // Yellow
    reset: '\x1b[0m'
  };
  
  const color = colors[type] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    
    log(`Loaded ${addresses.length} addresses`, 'success');
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
    
    log(`Loaded ${recipients.length} recipient addresses`, 'success');
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
    
    log(`Loaded ${proxies.length} proxies`, 'success');
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
      log('Loaded account data', 'success');
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
// RANDOM ADDRESS GENERATOR
// ============================================================

import { Wallet } from 'ethers';

function generateRandomAddress() {
  const wallet = Wallet.createRandom();
  return wallet.address;
}

// ============================================================
// INTERACTIVE CONFIG
// ============================================================

async function askConfiguration() {
  console.log('\n' + '='.repeat(60));
  console.log('  KONFIGURASI BOT');
  console.log('='.repeat(60) + '\n');

  // 1. Mode kirim
  console.log('Mode pengiriman:');
  console.log('  1. Random Address (Generate otomatis pakai ethers)');
  console.log('  2. Dari wallet.txt (Daftar address yang sudah ada)');
  console.log('  3. Manual - Kirim ke 1 address tertentu saja\n');
  
  let modeInput = await question('Pilih mode (1/2/3) [default: 1]: ');
  modeInput = modeInput.trim() || '1';
  
  if (modeInput === '3') {
    CONFIG.sendMode = 'manual';
    let targetAddr = await question('\nMasukkan target address (0x...): ');
    targetAddr = targetAddr.trim();
    
    try {
      CONFIG.targetAddress = getAddress(targetAddr);
      log(`Target address: ${getShortAddress(CONFIG.targetAddress)}`, 'success');
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
  console.log('\n' + '-'.repeat(60));
  console.log('JUMLAH DIAM PER TRANSAKSI:');
  console.log('-'.repeat(60));
  
  let amountType = await question('\nMau kirim jumlah:\n  1. Fixed (jumlah tetap)\n  2. Random (acak dalam range)\nPilih (1/2) [default: 1]: ');
  amountType = amountType.trim() || '1';
  
  if (amountType === '2') {
    let minAmount = await question('\nJumlah minimal (contoh: 0.001) [default: 0.001]: ');
    minAmount = parseFloat(minAmount.trim() || '0.001');
    
    let maxAmount = await question('Jumlah maksimal (contoh: 0.01) [default: 0.01]: ');
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
    let fixedAmount = await question('\nJumlah DIAM yang dikirim (contoh: 0.01) [default: 0.001]: ');
    fixedAmount = parseFloat(fixedAmount.trim() || '0.001');
    CONFIG.sendAmountMin = fixedAmount;
    CONFIG.sendAmountMax = fixedAmount;
    log(`Amount: Fixed ${fixedAmount} DIAM`, 'success');
  }

  // 3. Berapa kali kirim
  console.log('\n' + '-'.repeat(60));
  let sendCount = await question('Berapa kali kirim per account? [default: 1]: ');
  sendCount = parseInt(sendCount.trim() || '1');
  
  if (isNaN(sendCount) || sendCount < 1) {
    log('Invalid! Using default: 1x', 'error');
    CONFIG.sendCount = 1;
  } else {
    CONFIG.sendCount = sendCount;
    log(`Akan mengirim ${sendCount}x per account`, 'success');
  }

  // 4. Delay settings
  console.log('\n' + '-'.repeat(60));
  console.log('DELAY SETTINGS (dalam detik):');
  console.log('-'.repeat(60));
  
  let delaySend = await question('\nDelay antar transaksi (detik) [default: 10]: ');
  delaySend = parseInt(delaySend.trim() || '10');
  CONFIG.delayBetweenSends = delaySend * 1000;
  
  let delayAccount = await question('Delay antar account (detik) [default: 30]: ');
  delayAccount = parseInt(delayAccount.trim() || '30');
  CONFIG.delayBetweenAccounts = delayAccount * 1000;
  
  log(`Delay: ${delaySend}s antar transaksi, ${delayAccount}s antar account`, 'success');

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  RINGKASAN KONFIGURASI');
  console.log('='.repeat(60));
  
  let modeText = '';
  if (CONFIG.sendMode === 'random-generated') {
    modeText = 'Random Address (Generate otomatis)';
  } else if (CONFIG.sendMode === 'random-from-file') {
    modeText = 'Random dari wallet.txt';
  } else {
    modeText = 'Manual ke ' + getShortAddress(CONFIG.targetAddress);
  }
  
  console.log(`Mode         : ${modeText}`);
  console.log(`Amount       : ${CONFIG.sendAmountMin === CONFIG.sendAmountMax ? CONFIG.sendAmountMin + ' DIAM (fixed)' : CONFIG.sendAmountMin + ' - ' + CONFIG.sendAmountMax + ' DIAM (random)'}`);
  console.log(`Send count   : ${CONFIG.sendCount}x per account`);
  console.log(`Delay send   : ${CONFIG.delayBetweenSends / 1000} detik`);
  console.log(`Delay account: ${CONFIG.delayBetweenAccounts / 1000} detik`);
  console.log('='.repeat(60) + '\n');

  let confirm = await question('Lanjutkan dengan konfigurasi ini? (y/n) [default: y]: ');
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
      
      log(`✓ Login success: ${getShortAddress(checksummedAddress)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`✗ Login failed for ${getShortAddress(address)}: ${error.message}`, 'error');
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
      log(`✓ Sent ${amount} DIAM to ${getShortAddress(toAddress)} | Hash: ${getShortHash(hash)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`✗ Send failed: ${error.message}`, 'error');
    return false;
  }
}

// ============================================================
// MAIN PROCESS
// ============================================================

async function processAccount(address, recipients, proxyUrl, accountIndex) {
  log(`\n${'='.repeat(60)}`, 'info');
  log(`Processing Account ${accountIndex + 1}: ${getShortAddress(address)}`, 'info');
  log(`${'='.repeat(60)}`, 'info');

  // Login
  const loginSuccess = await loginAccount(address, proxyUrl);
  if (!loginSuccess) {
    log(`Skipping account ${accountIndex + 1} due to login failure`, 'error');
    return;
  }

  // Get balance
  const balance = await getBalance(address, proxyUrl);
  log(`Current balance: ${balance.toFixed(4)} DIAM`, 'info');

  const totalNeeded = CONFIG.sendAmountMax * CONFIG.sendCount;
  if (balance < totalNeeded) {
    log(`Insufficient balance! Need ${totalNeeded.toFixed(4)} DIAM, have ${balance.toFixed(4)} DIAM`, 'warn');
    log(`Akan mengirim sebanyak mungkin dengan balance yang ada...`, 'warn');
  }

  // Send DIAM
  let successCount = 0;
  for (let i = 0; i < CONFIG.sendCount; i++) {
    // Determine recipient
    let recipient;
    if (CONFIG.sendMode === 'manual' && CONFIG.targetAddress) {
      recipient = CONFIG.targetAddress;
    } else if (CONFIG.sendMode === 'random-generated') {
      // Generate random address using ethers
      recipient = generateRandomAddress();
      log(`Generated random address: ${getShortAddress(recipient)}`, 'info');
    } else {
      // random-from-file mode
      do {
        recipient = recipients[Math.floor(Math.random() * recipients.length)];
      } while (recipient.toLowerCase() === address.toLowerCase());
    }

    // Determine amount
    const amount = randomAmount(CONFIG.sendAmountMin, CONFIG.sendAmountMax);

    log(`\nTransaction ${i + 1}/${CONFIG.sendCount}:`, 'info');
    log(`Amount: ${amount} DIAM → ${getShortAddress(recipient)}`, 'info');
    
    const success = await sendDiam(address, recipient, amount, proxyUrl);
    
    if (success) successCount++;

    // Delay between sends (except last one)
    if (i < CONFIG.sendCount - 1) {
      log(`Waiting ${CONFIG.delayBetweenSends / 1000}s before next send...`, 'warn');
      await sleep(CONFIG.delayBetweenSends);
    }
  }

  log(`\nAccount ${accountIndex + 1} Summary: ${successCount}/${CONFIG.sendCount} successful`, 'success');
  
  // Get final balance
  const finalBalance = await getBalance(address, proxyUrl);
  log(`Final balance: ${finalBalance.toFixed(4)} DIAM (Used: ${(balance - finalBalance).toFixed(4)} DIAM)`, 'info');
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  SIMPLE DIAM BOT - Login & Send (Interactive)');
  console.log('='.repeat(60) + '\n');

  // Load data
  loadAccountData();
  const addresses = loadAddresses();
  const recipients = loadRecipients();
  const proxies = loadProxies();

  if (addresses.length === 0) {
    log('No addresses found in user.txt!', 'error');
    rl.close();
    return;
  }

  // Ask configuration first to know which mode
  console.log(`\nTotal accounts: ${addresses.length}`);
  console.log(`Total proxies: ${proxies.length}\n`);

  // Ask configuration
  const confirmed = await askConfiguration();
  
  if (!confirmed) {
    log('Cancelled by user.', 'warn');
    rl.close();
    return;
  }

  // Load recipients only if needed
  if (CONFIG.sendMode === 'random-from-file') {
    if (recipients.length === 0) {
      log('No recipients found in wallet.txt!', 'error');
      rl.close();
      return;
    }
    console.log(`Total recipients in wallet.txt: ${recipients.length}\n`);
  } else if (CONFIG.sendMode === 'random-generated') {
    log('Will generate random addresses on-the-fly', 'info');
  }

  rl.close();

  log(`\nStarting in 3 seconds...`, 'warn');
  await sleep(3000);

  // Process each account
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const proxyUrl = proxies.length > 0 ? proxies[i % proxies.length] : null;
    
    if (proxyUrl) {
      log(`Using proxy: ${proxyUrl}`, 'info');
    }

    await processAccount(address, recipients, proxyUrl, i);

    // Delay between accounts (except last one)
    if (i < addresses.length - 1) {
      log(`\nWaiting ${CONFIG.delayBetweenAccounts / 1000}s before next account...`, 'warn');
      await sleep(CONFIG.delayBetweenAccounts);
    }
  }

  console.log('\n' + '='.repeat(60));
  log('All accounts processed!', 'success');
  console.log('='.repeat(60) + '\n');
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

// ============================================================
// GLOBAL STATE
// ============================================================

let accountTokens = {};
let accountData = {};

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function log(message, type = 'info') {
  const timestamp = new Date().toLocaleTimeString('id-ID');
  const colors = {
    info: '\x1b[36m',    // Cyan
    success: '\x1b[32m', // Green
    error: '\x1b[31m',   // Red
    warn: '\x1b[33m',    // Yellow
    reset: '\x1b[0m'
  };
  
  const color = colors[type] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
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
    
    log(`Loaded ${addresses.length} addresses`, 'success');
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
    
    log(`Loaded ${recipients.length} recipient addresses`, 'success');
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
    
    log(`Loaded ${proxies.length} proxies`, 'success');
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
      log('Loaded account data', 'success');
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
    const checksummedAddress = getAddress(address);
    
    // Get or generate device ID
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
      
      log(`✓ Login success: ${getShortAddress(checksummedAddress)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`✗ Login failed for ${getShortAddress(address)}: ${error.message}`, 'error');
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
      log(`✓ Sent ${amount} DIAM to ${getShortAddress(toAddress)} | Hash: ${getShortHash(hash)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`✗ Send failed: ${error.message}`, 'error');
    return false;
  }
}

// ============================================================
// MAIN PROCESS
// ============================================================

async function processAccount(address, recipients, proxyUrl, accountIndex) {
  log(`\n${'='.repeat(60)}`, 'info');
  log(`Processing Account ${accountIndex + 1}: ${getShortAddress(address)}`, 'info');
  log(`${'='.repeat(60)}`, 'info');

  // Login
  const loginSuccess = await loginAccount(address, proxyUrl);
  if (!loginSuccess) {
    log(`Skipping account ${accountIndex + 1} due to login failure`, 'error');
    return;
  }

  // Get balance
  const balance = await getBalance(address, proxyUrl);
  log(`Current balance: ${balance.toFixed(4)} DIAM`, 'info');

  if (balance < CONFIG.sendAmount * CONFIG.sendCount) {
    log(`Insufficient balance for ${CONFIG.sendCount} transactions`, 'warn');
    return;
  }

  // Send DIAM
  let successCount = 0;
  for (let i = 0; i < CONFIG.sendCount; i++) {
    // Pick random recipient (not self)
    let recipient;
    do {
      recipient = recipients[Math.floor(Math.random() * recipients.length)];
    } while (recipient.toLowerCase() === address.toLowerCase());

    log(`\nTransaction ${i + 1}/${CONFIG.sendCount}:`, 'info');
    const success = await sendDiam(address, recipient, CONFIG.sendAmount, proxyUrl);
    
    if (success) successCount++;

    // Delay between sends (except last one)
    if (i < CONFIG.sendCount - 1) {
      log(`Waiting ${CONFIG.delayBetweenSends / 1000}s before next send...`, 'warn');
      await sleep(CONFIG.delayBetweenSends);
    }
  }

  log(`\nAccount ${accountIndex + 1} Summary: ${successCount}/${CONFIG.sendCount} successful`, 'success');
  
  // Get final balance
  const finalBalance = await getBalance(address, proxyUrl);
  log(`Final balance: ${finalBalance.toFixed(4)} DIAM`, 'info');
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  SIMPLE DIAM BOT - Login & Send');
  console.log('='.repeat(60) + '\n');

  // Load data
  loadAccountData();
  const addresses = loadAddresses();
  const recipients = loadRecipients();
  const proxies = loadProxies();

  if (addresses.length === 0) {
    log('No addresses found in user.txt!', 'error');
    return;
  }

  if (recipients.length === 0) {
    log('No recipients found in wallet.txt!', 'error');
    return;
  }

  log(`\nConfiguration:`, 'info');
  log(`- Send Amount: ${CONFIG.sendAmount} DIAM`, 'info');
  log(`- Send Count: ${CONFIG.sendCount}x per account`, 'info');
  log(`- Total Accounts: ${addresses.length}`, 'info');
  log(`- Total Recipients: ${recipients.length}`, 'info');
  log(`\nStarting in 3 seconds...`, 'warn');
  await sleep(3000);

  // Process each account
  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const proxyUrl = proxies.length > 0 ? proxies[i % proxies.length] : null;
    
    if (proxyUrl) {
      log(`Using proxy: ${proxyUrl}`, 'info');
    }

    await processAccount(address, recipients, proxyUrl, i);

    // Delay between accounts (except last one)
    if (i < addresses.length - 1) {
      log(`\nWaiting ${CONFIG.delayBetweenAccounts / 1000}s before next account...`, 'warn');
      await sleep(CONFIG.delayBetweenAccounts);
    }
  }

  console.log('\n' + '='.repeat(60));
  log('All accounts processed!', 'success');
  console.log('='.repeat(60) + '\n');
}

// ============================================================
// RUN
// ============================================================

main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error.stack);
  process.exit(1);
});
