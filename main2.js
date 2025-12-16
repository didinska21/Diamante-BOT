// ============================================================
// SIMPLE DIAM BOT - Enhanced Cloudflare Bypass Version
// ============================================================

import fs from 'fs';
import axios from 'axios';
import { getAddress, Wallet } from 'ethers';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import readline from 'readline';

// ============================================================
// ENHANCED CONFIGURATION - CLOUDFLARE BYPASS
// ============================================================

const API_BASE_URL = "https://campapi.diamante.io/api/v1";

// Enhanced headers untuk bypass Cloudflare
const CONFIG_DEFAULT_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Connection": "keep-alive",
  "Origin": "https://campaign.diamante.io",
  "Pragma": "no-cache",
  "Referer": "https://campaign.diamante.io/",
  "Sec-Ch-Ua": '"Google Chrome";v="134", "Chromium";v="134", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
};

const CONFIG = {
  sendAmountMin: 0.001,
  sendAmountMax: 0.001,
  sendCount: 1,
  sendMode: 'random-generated',
  targetAddress: null,
  delayBetweenSends: 60000,
  delayBetweenAccounts: 60000,
  // ANTI-CLOUDFLARE SETTINGS
  retryAttempts: 3,
  retryDelay: 5000,
  requestTimeout: 30000,
  randomizeUserAgent: true
};

// ============================================================
// GLOBAL STATE
// ============================================================

let accountTokens = {};
let accountData = {};

// User Agent pool untuk rotasi
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0"
];

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
║         🚀 CLOUDFLARE BYPASS ENHANCED V2.1 🚀             ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`;
  console.log('\x1b[35m' + banner + '\x1b[0m');
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
    
    const totalBars = 30;
    const filledBars = Math.floor((seconds - i) / seconds * totalBars);
    const emptyBars = totalBars - filledBars;
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    
    process.stdout.write(
      `\r\x1b[36m${frames[frameIndex]} ${message}: [${progressBar}] ${timeStr} remaining...\x1b[0m`
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
      `\r\x1b[35m${frames[frameIndex]} ${message}${dots[dotIndex]}\x1b[0m`
    );
    frameIndex = (frameIndex + 1) % frames.length;
    dotIndex = Math.floor(i / 3) % dots.length;
    await sleep(interval);
  }
  
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  
  try {
    if (proxyUrl.startsWith("socks")) {
      return new SocksProxyAgent(proxyUrl);
    } else {
      return new HttpsProxyAgent(proxyUrl);
    }
  } catch (error) {
    log(`Failed to create proxy agent: ${error.message}`, 'error');
    return null;
  }
}

function randomAmount(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4));
}

function generateRandomAddress() {
  const wallet = Wallet.createRandom();
  return wallet.address;
}

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
// ENHANCED API FUNCTIONS - CLOUDFLARE BYPASS
// ============================================================

async function makeApiRequest(method, url, data = null, proxyUrl = null, customHeaders = {}, retryCount = 0) {
  try {
    const agent = proxyUrl ? createAgent(proxyUrl) : null;
    
    // Randomize User-Agent jika enabled
    let headers = { ...CONFIG_DEFAULT_HEADERS, ...customHeaders };
    if (CONFIG.randomizeUserAgent) {
      headers["User-Agent"] = getRandomUserAgent();
    }
    
    // Add random delays untuk simulate human behavior
    const randomDelay = Math.floor(Math.random() * 2000) + 1000;
    await sleep(randomDelay);
    
    const config = {
      method,
      url,
      data,
      headers,
      ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
      timeout: CONFIG.requestTimeout,
      withCredentials: true,
      maxRedirects: 5,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Accept 4xx untuk handle manual
      }
    };

    const response = await axios(config);
    
    // Check untuk Cloudflare block
    if (response.status === 403 || response.status === 429) {
      const responseText = typeof response.data === 'string' ? response.data : '';
      
      if (responseText.includes('Cloudflare') || responseText.includes('cloudflare')) {
        throw new Error('CLOUDFLARE_BLOCK');
      }
      
      if (response.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      
      throw new Error(`HTTP ${response.status}`);
    }
    
    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }
    
    return response;
    
  } catch (error) {
    // Retry logic dengan exponential backoff
    if (retryCount < CONFIG.retryAttempts) {
      const isCloudflareBlock = error.message === 'CLOUDFLARE_BLOCK';
      const isRateLimited = error.message === 'RATE_LIMITED';
      
      if (isCloudflareBlock || isRateLimited) {
        const backoffTime = CONFIG.retryDelay * Math.pow(2, retryCount);
        const waitTime = isCloudflareBlock ? backoffTime * 2 : backoffTime;
        
        log(`${isCloudflareBlock ? '🛡️ Cloudflare block' : '⏱️ Rate limited'} detected. Retry ${retryCount + 1}/${CONFIG.retryAttempts} in ${waitTime/1000}s...`, 'warn');
        await countdown(Math.floor(waitTime/1000), 'Retrying in');
        
        return makeApiRequest(method, url, data, proxyUrl, customHeaders, retryCount + 1);
      }
    }
    
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      throw new Error('No response from server (possible network/proxy issue)');
    } else {
      throw new Error(error.message);
    }
  }
}

async function loginAccount(address, proxyUrl = null) {
  try {
    await showLoading('Authenticating', 2000);
    
    const checksummedAddress = getAddress(address);
    
    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
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
    await showLoading('Preparing transaction', 1500);
    
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
// INTERACTIVE CONFIG
// ============================================================

async function askConfiguration() {
  console.log('\n' + '┌' + '─'.repeat(58) + '┐');
  console.log('│' + ' '.repeat(18) + '\x1b[1m\x1b[36mKONFIGURASI BOT\x1b[0m' + ' '.repeat(18) + '│');
  console.log('└' + '─'.repeat(58) + '┘\n');

  // Mode kirim
  console.log('\x1b[1m📤 Mode Pengiriman:\x1b[0m');
  console.log('  \x1b[32m1.\x1b[0m Random Address (Generate otomatis)');
  console.log('  \x1b[32m2.\x1b[0m Dari wallet.txt');
  console.log('  \x1b[32m3.\x1b[0m Manual - Kirim ke 1 address\n');
  
  let modeInput = await question('Pilih mode (1/2/3) [default: 1]: ');
  modeInput = modeInput.trim() || '1';
  
  if (modeInput === '3') {
    CONFIG.sendMode = 'manual';
    let targetAddr = await question('\n🎯 Target address (0x...): ');
    targetAddr = targetAddr.trim();
    
    try {
      CONFIG.targetAddress = getAddress(targetAddr);
      log(`Target: ${getShortAddress(CONFIG.targetAddress)}`, 'success');
    } catch (error) {
      log('Invalid address! Using random mode.', 'error');
      CONFIG.sendMode = 'random-generated';
    }
  } else if (modeInput === '2') {
    CONFIG.sendMode = 'random-from-file';
    log('Mode: Random dari wallet.txt', 'success');
  } else {
    CONFIG.sendMode = 'random-generated';
    log('Mode: Generate random address', 'success');
  }

  // Jumlah DIAM
  console.log('\n' + '─'.repeat(60));
  console.log('\x1b[1m💰 Jumlah DIAM:\x1b[0m');
  
  let amountType = await question('\n  1. Fixed\n  2. Random\n\nPilih (1/2) [default: 1]: ');
  amountType = amountType.trim() || '1';
  
  if (amountType === '2') {
    let minAmount = await question('\n📉 Min (0.001): ');
    minAmount = parseFloat(minAmount.trim() || '0.001');
    
    let maxAmount = await question('📈 Max (0.01): ');
    maxAmount = parseFloat(maxAmount.trim() || '0.01');
    
    if (minAmount >= maxAmount) {
      CONFIG.sendAmountMin = 0.001;
      CONFIG.sendAmountMax = 0.01;
    } else {
      CONFIG.sendAmountMin = minAmount;
      CONFIG.sendAmountMax = maxAmount;
    }
    
    log(`Amount: ${CONFIG.sendAmountMin} - ${CONFIG.sendAmountMax} DIAM`, 'success');
  } else {
    let fixedAmount = await question('\n💵 Jumlah (0.001): ');
    fixedAmount = parseFloat(fixedAmount.trim() || '0.001');
    CONFIG.sendAmountMin = fixedAmount;
    CONFIG.sendAmountMax = fixedAmount;
    log(`Amount: ${fixedAmount} DIAM`, 'success');
  }

  // Berapa kali
  console.log('\n' + '─'.repeat(60));
  let sendCount = await question('🔁 Berapa kali per account? [1]: ');
  sendCount = parseInt(sendCount.trim() || '1');
  CONFIG.sendCount = sendCount > 0 ? sendCount : 1;
  log(`Send: ${CONFIG.sendCount}x per account`, 'success');

  // Delays - MINIMUM 90 detik untuk bypass Cloudflare
  console.log('\n' + '─'.repeat(60));
  console.log('\x1b[1m⏱️  Delay Settings:\x1b[0m');
  console.log('\x1b[33m⚠️  Minimum 90 detik untuk bypass Cloudflare!\x1b[0m\n');
  
  let delaySend = await question('⏳ Delay antar transaksi (detik) [90]: ');
  delaySend = parseInt(delaySend.trim() || '90');
  if (delaySend < 90) {
    log('⚠️  Delay minimal 90 detik! Auto-set to 90s', 'warn');
    delaySend = 90;
  }
  CONFIG.delayBetweenSends = delaySend * 1000;
  
  let delayAccount = await question('⏳ Delay antar account (detik) [90]: ');
  delayAccount = parseInt(delayAccount.trim() || '90');
  if (delayAccount < 90) {
    log('⚠️  Delay minimal 90 detik! Auto-set to 90s', 'warn');
    delayAccount = 90;
  }
  CONFIG.delayBetweenAccounts = delayAccount * 1000;
  
  log(`Delays: ${delaySend}s / ${delayAccount}s`, 'success');

  // Summary
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(15) + '\x1b[1m\x1b[35mRINGKASAN KONFIGURASI\x1b[0m' + ' '.repeat(14) + '║');
  console.log('╚' + '═'.repeat(58) + '╝\n');
  
  console.log(`  Mode    : ${CONFIG.sendMode === 'manual' ? '🎯 ' + getShortAddress(CONFIG.targetAddress) : CONFIG.sendMode === 'random-from-file' ? '📋 wallet.txt' : '🎲 Random'}`);
  console.log(`  Amount  : 💰 ${CONFIG.sendAmountMin}${CONFIG.sendAmountMin !== CONFIG.sendAmountMax ? ' - ' + CONFIG.sendAmountMax : ''} DIAM`);
  console.log(`  Count   : 🔁 ${CONFIG.sendCount}x`);
  console.log(`  Delays  : ⏱️  ${CONFIG.delayBetweenSends/1000}s / ${CONFIG.delayBetweenAccounts/1000}s`);
  console.log(`  Retry   : 🔄 ${CONFIG.retryAttempts}x with backoff`);
  console.log('\n' + '─'.repeat(60) + '\n');

  let confirm = await question('✅ Continue? (y/n) [y]: ');
  return (confirm.trim().toLowerCase() || 'y') === 'y';
}

// ============================================================
// MAIN PROCESS
// ============================================================

async function processAccount(address, recipients, proxyUrl, accountIndex, totalAccounts) {
  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log(`║  \x1b[1m\x1b[35mAccount ${accountIndex + 1}/${totalAccounts}: ${getShortAddress(address)}\x1b[0m${' '.repeat(58 - 25 - String(accountIndex + 1).length - String(totalAccounts).length - getShortAddress(address).length)}║`);
  console.log('╚' + '═'.repeat(58) + '╝');

  const loginSuccess = await loginAccount(address, proxyUrl);
  if (!loginSuccess) {
    log(`Skipping account ${accountIndex + 1}`, 'error');
    return;
  }

  const balance = await getBalance(address, proxyUrl);
  log(`Balance: 💰 ${balance.toFixed(4)} DIAM`, 'info');

  let successCount = 0;
  for (let i = 0; i < CONFIG.sendCount; i++) {
    let recipient;
    if (CONFIG.sendMode === 'manual') {
      recipient = CONFIG.targetAddress;
    } else if (CONFIG.sendMode === 'random-generated') {
      recipient = generateRandomAddress();
    } else {
      do {
        recipient = recipients[Math.floor(Math.random() * recipients.length)];
      } while (recipient.toLowerCase() === address.toLowerCase());
    }

    const amount = randomAmount(CONFIG.sendAmountMin, CONFIG.sendAmountMax);

    console.log('\n' + '┌' + '─'.repeat(58) + '┐');
    console.log(`│  \x1b[1mTx ${i + 1}/${CONFIG.sendCount}\x1b[0m${' '.repeat(58 - 8 - String(i + 1).length - String(CONFIG.sendCount).length)}│`);
    console.log('└' + '─'.repeat(58) + '┘');
    
    const success = await sendDiam(address, recipient, amount, proxyUrl);
    if (success) successCount++;

    if (i < CONFIG.sendCount - 1) {
      await countdown(CONFIG.delayBetweenSends / 1000, 'Next tx in');
    }
  }

  console.log('\n' + '─'.repeat(60));
  log(`Summary: ${successCount}/${CONFIG.sendCount} successful ✨`, 'success');
  
  const finalBalance = await getBalance(address, proxyUrl);
  log(`Final: 💰 ${finalBalance.toFixed(4)} DIAM`, 'info');
  console.log('─'.repeat(60));
}

async function main() {
  printBanner();

  loadAccountData();
  const addresses = loadAddresses();
  const recipients = loadRecipients();
  const proxies = loadProxies();

  if (addresses.length === 0) {
    log('No addresses in user.txt!', 'error');
    rl.close();
    return;
  }

  console.log(`\n📊 Accounts: \x1b[1m${addresses.length}\x1b[0m`);
  console.log(`🌐 Proxies: \x1b[1m${proxies.length || 'None (Direct connection)'}\x1b[0m`);
  console.log(`🛡️  Anti-CF: \x1b[1mEnabled (${CONFIG.retryAttempts}x retry)\x1b[0m\n`);

  const confirmed = await askConfiguration();
  
  if (!confirmed) {
    log('Cancelled.', 'warn');
    rl.close();
    return;
  }

  if (CONFIG.sendMode === 'random-from-file' && recipients.length === 0) {
    log('No recipients in wallet.txt!', 'error');
    rl.close();
    return;
  }

  rl.close();

  console.log('\n' + '═'.repeat(60));
  log('🚀 Starting in 3s...', 'info');
  console.log('═'.repeat(60) + '\n');
  await countdown(3, 'Starting');

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const proxyUrl = proxies.length > 0 ? proxies[i % proxies.length] : null;
    
    if (proxyUrl) {
      log(`Proxy: 🌐 ${proxyUrl.substring(0, 30)}...`, 'info');
    }

    await processAccount(address, recipients, proxyUrl, i, addresses.length);

    if (i < addresses.length - 1) {
      await countdown(CONFIG.delayBetweenAccounts / 1000, 'Next account');
    }
  }

  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(14) + '\x1b[1m\x1b[32m🎉 COMPLETED! 🎉\x1b[0m' + ' '.repeat(19) + '║');
  console.log('╚' + '═'.repeat(58) + '╝\n');
}

main().catch(error => {
  log(`Fatal: ${error.message}`, 'error');
  console.error(error.stack);
  rl.close();
  process.exit(1);
});
