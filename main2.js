// ============================================================
// DIAM BOT - Puppeteer Version (Real Browser Cloudflare Bypass)
// ============================================================

import fs from 'fs';
import { getAddress, Wallet } from 'ethers';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import readline from 'readline';

// Use stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

// ============================================================
// CONFIGURATION
// ============================================================

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CAMPAIGN_URL = "https://campaign.diamante.io";

const CONFIG = {
  sendAmountMin: 0.001,
  sendAmountMax: 0.001,
  sendCount: 1,
  sendMode: 'random-generated',
  targetAddress: null,
  delayBetweenSends: 90000,
  delayBetweenAccounts: 90000,
  headless: true, // Set false untuk debug
  slowMo: 100 // Slow motion untuk simulate human
};

// ============================================================
// GLOBAL STATE
// ============================================================

let accountTokens = {};
let accountData = {};
let browser = null;

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
║                    by : didinska                          ║
║                                                           ║
║          🌐 PUPPETEER CLOUDFLARE BYPASS V3.0 🌐           ║
║                   Real Browser Edition                    ║
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
      `\r\x1b[36m${frames[frameIndex]} ${message}: [${progressBar}] ${timeStr}\x1b[0m`
    );
    
    frameIndex = (frameIndex + 1) % frames.length;
    await sleep(1000);
  }
  
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
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
    
    log(`Loaded ${recipients.length} recipients`, 'success');
    return recipients;
  } catch (error) {
    log(`No recipients loaded`, 'warn');
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
    log(`No proxies loaded`, 'warn');
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
    log('Starting fresh', 'warn');
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync("account_data.json", JSON.stringify(accountData, null, 2));
  } catch (error) {
    log(`Failed to save: ${error.message}`, 'error');
  }
}

// ============================================================
// PUPPETEER FUNCTIONS
// ============================================================

async function initBrowser(proxyUrl = null) {
  try {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled'
    ];

    if (proxyUrl) {
      // Parse proxy URL
      const proxyMatch = proxyUrl.match(/^(https?|socks[45]?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)/);
      if (proxyMatch) {
        const [, protocol, username, password, host, port] = proxyMatch;
        args.push(`--proxy-server=${protocol}://${host}:${port}`);
      }
    }

    browser = await puppeteer.launch({
      headless: CONFIG.headless ? 'new' : false,
      args: args,
      slowMo: CONFIG.slowMo,
      defaultViewport: {
        width: 1920,
        height: 1080
      }
    });

    log('Browser initialized', 'success');
    return browser;
  } catch (error) {
    log(`Failed to init browser: ${error.message}`, 'error');
    throw error;
  }
}

async function makeApiRequestWithPage(page, method, url, data = null, extraHeaders = {}) {
  try {
    // Set extra headers
    await page.setExtraHTTPHeaders({
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://campaign.diamante.io',
      'Referer': 'https://campaign.diamante.io/',
      ...extraHeaders
    });

    // Evaluate API call in browser context
    const response = await page.evaluate(async (method, url, data) => {
      const options = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*'
        },
        credentials: 'include'
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      const res = await fetch(url, options);
      const text = await res.text();
      
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch {
        jsonData = { error: 'Failed to parse JSON', raw: text };
      }

      return {
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        data: jsonData
      };
    }, method, url, data);

    return response;
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

async function loginWithBrowser(page, address) {
  try {
    log('Opening campaign page...', 'info');
    
    // Navigate to campaign page
    await page.goto(CAMPAIGN_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    // Wait for Cloudflare to pass
    await sleep(5000);

    log('Sending login request...', 'info');

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

    const response = await makeApiRequestWithPage(
      page,
      'POST',
      `${API_BASE_URL}/user/connect-wallet`,
      payload
    );

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(response.data)}`);
    }

    if (response.data.success) {
      const userId = response.data.data.userId;
      
      // Get cookies from browser
      const cookies = await page.cookies();
      const accessTokenCookie = cookies.find(c => c.name === 'access_token');
      
      if (!accessTokenCookie) {
        throw new Error('No access token in cookies');
      }

      accountTokens[checksummedAddress] = {
        userId: userId,
        accessToken: accessTokenCookie.value
      };

      log(`Login success: ${getShortAddress(checksummedAddress)}`, 'success');
      return true;
    } else {
      throw new Error(response.data.message || 'Login failed');
    }
  } catch (error) {
    log(`Login failed: ${error.message}`, 'error');
    return false;
  }
}

async function getBalanceWithPage(page, address) {
  try {
    const userId = accountTokens[address]?.userId;
    if (!userId) throw new Error('No userId');

    const response = await makeApiRequestWithPage(
      page,
      'GET',
      `${API_BASE_URL}/transaction/get-balance/${userId}`
    );

    if (response.data.success) {
      return response.data.data.balance;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`Get balance failed: ${error.message}`, 'error');
    return 0;
  }
}

async function sendDiamWithPage(page, fromAddress, toAddress, amount) {
  try {
    const userId = accountTokens[fromAddress]?.userId;
    if (!userId) throw new Error('No userId');

    const payload = {
      toAddress: getAddress(toAddress),
      amount: amount,
      userId: userId
    };

    log(`Sending ${amount} DIAM to ${getShortAddress(toAddress)}...`, 'info');

    const response = await makeApiRequestWithPage(
      page,
      'POST',
      `${API_BASE_URL}/transaction/transfer`,
      payload
    );

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (response.data.success) {
      const hash = response.data.data.transferData.hash;
      log(`✓ Sent ${amount} DIAM | Hash: ${getShortHash(hash)}`, 'success');
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
  console.log('│' + ' '.repeat(18) + '\x1b[1m\x1b[36mKONFIGURASI\x1b[0m' + ' '.repeat(18) + '│');
  console.log('└' + '─'.repeat(58) + '┘\n');

  console.log('\x1b[1m📤 Mode:\x1b[0m');
  console.log('  1. Random Address (auto-generate)');
  console.log('  2. Dari wallet.txt');
  console.log('  3. Manual address\n');
  
  let mode = await question('Pilih (1/2/3) [1]: ');
  mode = mode.trim() || '1';
  
  if (mode === '3') {
    CONFIG.sendMode = 'manual';
    let addr = await question('\n🎯 Target address: ');
    try {
      CONFIG.targetAddress = getAddress(addr.trim());
    } catch {
      log('Invalid! Using random.', 'error');
      CONFIG.sendMode = 'random-generated';
    }
  } else if (mode === '2') {
    CONFIG.sendMode = 'random-from-file';
  } else {
    CONFIG.sendMode = 'random-generated';
  }

  console.log('\n' + '─'.repeat(60));
  let amountType = await question('💰 Amount: 1=Fixed, 2=Random [1]: ');
  
  if (amountType.trim() === '2') {
    let min = parseFloat((await question('Min: ')).trim() || '0.001');
    let max = parseFloat((await question('Max: ')).trim() || '0.01');
    CONFIG.sendAmountMin = min;
    CONFIG.sendAmountMax = max;
  } else {
    let fixed = parseFloat((await question('Amount: ')).trim() || '0.001');
    CONFIG.sendAmountMin = fixed;
    CONFIG.sendAmountMax = fixed;
  }

  console.log('\n' + '─'.repeat(60));
  let count = parseInt((await question('🔁 Berapa kali per account? [1]: ')).trim() || '1');
  CONFIG.sendCount = count > 0 ? count : 1;

  console.log('\n' + '─'.repeat(60));
  let delaySend = parseInt((await question('⏳ Delay antar tx (detik) [90]: ')).trim() || '90');
  CONFIG.delayBetweenSends = Math.max(delaySend, 60) * 1000;
  
  let delayAcc = parseInt((await question('⏳ Delay antar account (detik) [90]: ')).trim() || '90');
  CONFIG.delayBetweenAccounts = Math.max(delayAcc, 60) * 1000;

  console.log('\n' + '─'.repeat(60));
  let headless = await question('🖥️  Headless mode? (y/n) [y]: ');
  CONFIG.headless = (headless.trim().toLowerCase() || 'y') === 'y';

  console.log('\n' + '╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(20) + '\x1b[1mRINGKASAN\x1b[0m' + ' '.repeat(20) + '║');
  console.log('╚' + '═'.repeat(58) + '╝\n');
  console.log(`  Mode     : ${CONFIG.sendMode}`);
  console.log(`  Amount   : ${CONFIG.sendAmountMin}-${CONFIG.sendAmountMax}`);
  console.log(`  Count    : ${CONFIG.sendCount}x`);
  console.log(`  Delays   : ${CONFIG.delayBetweenSends/1000}s / ${CONFIG.delayBetweenAccounts/1000}s`);
  console.log(`  Headless : ${CONFIG.headless ? 'Yes' : 'No (visible)'}`);
  console.log('\n' + '─'.repeat(60) + '\n');

  let confirm = await question('✅ Continue? (y/n) [y]: ');
  return (confirm.trim().toLowerCase() || 'y') === 'y';
}

// ============================================================
// MAIN PROCESS
// ============================================================

async function processAccount(address, recipients, proxyUrl, index, total) {
  let page = null;
  
  try {
    console.log('\n' + '╔' + '═'.repeat(58) + '╗');
    console.log(`║  \x1b[1m\x1b[35mAccount ${index + 1}/${total}: ${getShortAddress(address)}\x1b[0m` + ' '.repeat(58 - 21 - String(index+1).length - String(total).length - getShortAddress(address).length) + '║');
    console.log('╚' + '═'.repeat(58) + '╝');

    // Create new page
    page = await browser.newPage();
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Login
    const loginSuccess = await loginWithBrowser(page, address);
    if (!loginSuccess) {
      log(`Skipping account ${index + 1}`, 'error');
      return;
    }

    // Get balance
    const balance = await getBalanceWithPage(page, address);
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

      console.log(`\n┌─ Tx ${i + 1}/${CONFIG.sendCount} ─┐`);
      
      const success = await sendDiamWithPage(page, address, recipient, amount);
      if (success) successCount++;

      if (i < CONFIG.sendCount - 1) {
        await countdown(CONFIG.delayBetweenSends / 1000, 'Next tx');
      }
    }

    console.log('\n' + '─'.repeat(60));
    log(`Summary: ${successCount}/${CONFIG.sendCount} success`, 'success');
    
    const finalBalance = await getBalanceWithPage(page, address);
    log(`Final: 💰 ${finalBalance.toFixed(4)} DIAM`, 'info');
    
  } catch (error) {
    log(`Process error: ${error.message}`, 'error');
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function main() {
  printBanner();

  loadAccountData();
  const addresses = loadAddresses();
  const recipients = loadRecipients();
  const proxies = loadProxies();

  if (addresses.length === 0) {
    log('No addresses!', 'error');
    rl.close();
    return;
  }

  console.log(`\n📊 Accounts: ${addresses.length}`);
  console.log(`🌐 Proxies: ${proxies.length || 'None'}`);
  console.log(`🌐 Engine: Puppeteer + Stealth\n`);

  const confirmed = await askConfiguration();
  
  if (!confirmed) {
    log('Cancelled', 'warn');
    rl.close();
    return;
  }

  rl.close();

  console.log('\n' + '═'.repeat(60));
  log('🚀 Launching browser...', 'info');
  console.log('═'.repeat(60) + '\n');

  try {
    const proxyUrl = proxies.length > 0 ? proxies[0] : null;
    await initBrowser(proxyUrl);

    for (let i = 0; i < addresses.length; i++) {
      await processAccount(addresses[i], recipients, proxyUrl, i, addresses.length);

      if (i < addresses.length - 1) {
        await countdown(CONFIG.delayBetweenAccounts / 1000, 'Next account');
      }
    }

    console.log('\n' + '╔' + '═'.repeat(58) + '╗');
    console.log('║' + ' '.repeat(18) + '\x1b[1m\x1b[32m🎉 DONE! 🎉\x1b[0m' + ' '.repeat(18) + '║');
    console.log('╚' + '═'.repeat(58) + '╝\n');

  } catch (error) {
    log(`Fatal: ${error.message}`, 'error');
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed', 'info');
    }
  }
}

// ============================================================
// RUN
// ============================================================

main().catch(error => {
  console.error('Fatal error:', error);
  if (browser) browser.close();
  process.exit(1);
});
