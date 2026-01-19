// ============================================================
// DIAM AUTO CYCLE - Login → Claim → Send → Repeat 24/7
// ============================================================

import fs from "fs";
import { getAddress } from "ethers";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CAMPAIGN_URL = "https://campaign.diamante.io";
const ACCOUNT_DATA_FILE = "account_data.json";
const USERS_FILE = "users.txt";
const TARGETS_FILE = "targets.txt"; // File untuk address tujuan
const PROXY_FILE = "proxy.txt";

const CONFIG = {
  sendAmountMin: 0.001,
  sendAmountMax: 0.01,
  minBalanceToKeep: 0.1, // Minimum balance yang disimpan
  claimRetryMax: 3,
  claimRetryDelay: [60, 180, 300], // 1 min, 3 min, 5 min
  delayBetweenSends: 90, // detik
  delayBetweenAccounts: 60, // detik
  delay24Hours: 24 * 60 * 60 // 24 jam dalam detik
};

let addresses = [];
let targetAddresses = [];
let proxies = [];
let accountData = {};
let browser = null;

// ==================== UTILITIES ====================

function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  const colors = { error: "\x1b[31m", success: "\x1b[32m", wait: "\x1b[33m", info: "\x1b[36m", reset: "\x1b[0m" };
  const color = colors[type] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(seconds, message) {
  for (let i = seconds; i > 0; i--) {
    const hrs = Math.floor(i / 3600);
    const mins = Math.floor((i % 3600) / 60);
    const secs = i % 60;
    const timeStr = hrs > 0 ? `${hrs}h ${mins}m ${secs}s` : mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    process.stdout.write(`\r${message} ${timeStr}...`);
    await sleep(1000);
  }
  process.stdout.write(`\r${' '.repeat(80)}\r`);
}

function randomAmount(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(4));
}

// ==================== FILE LOADERS ====================

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      accountData = JSON.parse(fs.readFileSync(ACCOUNT_DATA_FILE, "utf8"));
    } else {
      accountData = {};
    }
  } catch (error) {
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accountData, null, 2));
  } catch (error) {
    log(`Failed to save account data: ${error.message}`, "error");
  }
}

function loadAddresses() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      addresses = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
      addresses = addresses.map(addr => getAddress(addr));
      log(`✅ Loaded ${addresses.length} accounts`, "success");
    }
  } catch (error) {
    addresses = [];
  }
}

function loadTargets() {
  try {
    if (fs.existsSync(TARGETS_FILE)) {
      const data = fs.readFileSync(TARGETS_FILE, "utf8");
      targetAddresses = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
      targetAddresses = targetAddresses.map(addr => getAddress(addr));
      log(`✅ Loaded ${targetAddresses.length} target addresses`, "success");
    }
  } catch (error) {
    targetAddresses = [];
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync(PROXY_FILE, "utf8");
    proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    log(`✅ Loaded ${proxies.length} proxies`, "success");
  } catch (error) {
    proxies = [];
  }
}

// ==================== BROWSER ====================

async function initBrowser(proxyUrl = null) {
  try {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled'
    ];

    let username = null;
    let password = null;

    if (proxyUrl) {
      const proxyMatch = proxyUrl.match(/^(https?|socks[45]?):\/\/(?:([^:]+):([^@]+)@)?([^:]+):(\d+)/);
      if (proxyMatch) {
        const [, protocol, user, pass, host, port] = proxyMatch;
        if (user && pass) {
          username = user;
          password = pass;
          args.push(`--proxy-server=${protocol}://${host}:${port}`);
        } else {
          args.push(`--proxy-server=${protocol}://${host}:${port}`);
        }
      }
    }

    const launchOptions = {
      headless: 'new',
      args: args,
      slowMo: 50,
      defaultViewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    };

    const chromePaths = ['/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome'];
    for (const path of chromePaths) {
      if (fs.existsSync(path)) {
        launchOptions.executablePath = path;
        break;
      }
    }

    browser = await puppeteer.launch(launchOptions);

    if (username && password) {
      const pages = await browser.pages();
      if (pages.length > 0) {
        await pages[0].authenticate({ username, password });
      }
    }

    log('Browser initialized', 'success');
    return { browser, proxyAuth: { username, password } };
  } catch (error) {
    log(`Failed to init browser: ${error.message}`, 'error');
    throw error;
  }
}

// ==================== API FUNCTIONS ====================

async function loginWithBrowser(page, address) {
  try {
    await page.setRequestInterception(true);
    let capturedToken = null;
    
    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/user/connect-wallet')) {
        try {
          const headers = response.headers();
          const setCookie = headers['set-cookie'];
          if (setCookie) {
            const match = setCookie.match(/access_token=([^;]+)/);
            if (match) capturedToken = match[1];
          }
        } catch (error) {}
      }
    });
    
    page.on('request', request => request.continue());
    
    await page.goto(CAMPAIGN_URL, { waitUntil: 'networkidle0', timeout: 90000 });
    await sleep(5000);

    const checksummedAddress = getAddress(address);
    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      accountData[checksummedAddress.toLowerCase()] = deviceId;
      saveAccountData();
    }

    const payload = {
      address: checksummedAddress, deviceId: deviceId, deviceSource: "web_app", deviceType: "Windows",
      browser: "Chrome", ipAddress: "0.0.0.0", latitude: 12.9715987, longitude: 77.5945627,
      countryCode: "Unknown", country: "Unknown", continent: "Unknown", continentCode: "Unknown",
      region: "Unknown", regionCode: "Unknown", city: "Unknown"
    };

    const response = await page.evaluate(async (apiUrl, data) => {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include'
        });
        const text = await res.text();
        let jsonData;
        try { jsonData = JSON.parse(text); } catch { jsonData = { error: 'Parse failed' }; }
        return { status: res.status, ok: res.ok, data: jsonData };
      } catch (error) {
        return { status: 0, ok: false, error: error.message };
      }
    }, `${API_BASE_URL}/user/connect-wallet`, payload);

    if (!response.ok || !response.data?.success) {
      throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
    }

    const userId = response.data.data.userId;
    const isSocialExists = response.data.data.isSocialExists;
    await sleep(2000);
    
    let accessToken = capturedToken;
    if (!accessToken) {
      const cookies = await page.cookies();
      const tokenCookie = cookies.find(c => c.name === 'access_token');
      if (tokenCookie) accessToken = tokenCookie.value;
    }
    if (!accessToken) {
      accessToken = await page.evaluate(() => {
        const match = document.cookie.match(/access_token=([^;]+)/);
        return match ? match[1] : null;
      });
    }
    if (!accessToken) throw new Error('Could not capture access token');

    await page.setCookie({
      name: 'access_token', value: accessToken, domain: '.diamante.io',
      path: '/', httpOnly: false, secure: true, sameSite: 'None'
    });

    log(`✅ Login success: ${getShortAddress(checksummedAddress)}`, 'success');
    
    return { success: true, verified: isSocialExists === "VERIFIED", userId, accessToken };
  } catch (error) {
    log(`Login failed: ${error.message}`, 'error');
    return { success: false };
  }
}

async function getBalanceWithBrowser(page, userId) {
  try {
    const response = await page.evaluate(async (apiUrl, uid) => {
      try {
        const res = await fetch(`${apiUrl}/transaction/get-balance/${uid}`, {
          method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include'
        });
        const data = await res.json();
        return { ok: res.ok, data };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, API_BASE_URL, userId);

    if (response.ok && response.data.success) {
      return response.data.data.balance;
    } else {
      throw new Error(response.data?.message || 'Failed to get balance');
    }
  } catch (error) {
    log(`Failed to get balance: ${error.message}`, 'error');
    return 0;
  }
}

async function claimFaucetWithRetry(page, userId) {
  for (let attempt = 0; attempt < CONFIG.claimRetryMax; attempt++) {
    try {
      log(`🎁 Claiming faucet (attempt ${attempt + 1}/${CONFIG.claimRetryMax})...`, 'wait');

      const response = await page.evaluate(async (apiUrl, uid) => {
        try {
          const res = await fetch(`${apiUrl}/transaction/fund-wallet/${uid}`, {
            method: 'GET', headers: { 'Accept': 'application/json' }, credentials: 'include'
          });
          const data = await res.json();
          return { ok: res.ok, data };
        } catch (error) {
          return { ok: false, error: error.message };
        }
      }, API_BASE_URL, userId);

      if (response.ok && response.data.success) {
        log(`✅ Faucet claimed! Funded: ${response.data.data.fundedAmount} DIAM`, 'success');
        const balance = await getBalanceWithBrowser(page, userId);
        log(`💰 Current balance: ${balance.toFixed(4)} DIAM`, 'success');
        return { success: true, balance };
      } else {
        if (response.data?.message.includes("once per day")) {
          log(`⚠️ Already claimed today`, 'wait');
          const balance = await getBalanceWithBrowser(page, userId);
          return { success: false, alreadyClaimed: true, balance };
        }
        
        if (attempt < CONFIG.claimRetryMax - 1) {
          const delaySeconds = CONFIG.claimRetryDelay[attempt];
          log(`⏳ Retry in ${Math.floor(delaySeconds / 60)} minutes...`, 'wait');
          await countdown(delaySeconds, '⏱️ Retrying');
        }
      }
    } catch (error) {
      log(`❌ Claim error: ${error.message}`, 'error');
      if (attempt < CONFIG.claimRetryMax - 1) {
        await countdown(CONFIG.claimRetryDelay[attempt], '⏱️ Retrying');
      }
    }
  }
  
  log(`❌ Failed to claim after ${CONFIG.claimRetryMax} attempts`, 'error');
  return { success: false };
}

async function sendDiamWithBrowser(page, fromAddress, toAddress, amount, userId) {
  try {
    const payload = { toAddress: getAddress(toAddress), amount: amount, userId: userId };

    const response = await page.evaluate(async (apiUrl, data) => {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include'
        });
        const jsonData = await res.json();
        return { ok: res.ok, data: jsonData };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, `${API_BASE_URL}/transaction/transfer`, payload);

    if (response.ok && response.data.success) {
      log(`✅ Sent ${amount} DIAM to ${getShortAddress(toAddress)}`, 'success');
      return true;
    } else {
      log(`❌ Send failed: ${response.data?.message}`, 'error');
      return false;
    }
  } catch (error) {
    log(`❌ Send error: ${error.message}`, 'error');
    return false;
  }
}

// ==================== MAIN PROCESS ====================

async function processAccountCycle(address, proxyAuth, index, total) {
  let page = null;
  try {
    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`\n\x1b[35m┌─ Account ${index + 1}/${total}: ${getShortAddress(address)} ${"─".repeat(30)}\x1b[0m`);
    
    // 1. LOGIN
    const loginResult = await loginWithBrowser(page, address);
    if (!loginResult.success || !loginResult.verified) {
      log(`⭕ Skipping (not registered or login failed)`, 'wait');
      return { success: false, skipped: true };
    }

    // 2. CLAIM FAUCET
    log(`⏰ Waiting 1 minute before claiming...`, 'wait');
    await countdown(60, '⏳ Preparing');
    
    const claimResult = await claimFaucetWithRetry(page, loginResult.userId);
    if (!claimResult.success && !claimResult.alreadyClaimed) {
      log(`❌ Failed to claim faucet`, 'error');
      return { success: false };
    }

    // 3. SEND TO TARGETS UNTIL BALANCE RUNS OUT
    let balance = await getBalanceWithBrowser(page, loginResult.userId);
    let totalSent = 0;
    let sendCount = 0;

    log(`\n💸 Starting send cycle...`, 'info');
    
    while (balance > CONFIG.minBalanceToKeep) {
      if (targetAddresses.length === 0) {
        log(`⚠️ No target addresses in ${TARGETS_FILE}`, 'wait');
        break;
      }

      // Random target
      const targetAddress = targetAddresses[Math.floor(Math.random() * targetAddresses.length)];
      const amount = Math.min(randomAmount(CONFIG.sendAmountMin, CONFIG.sendAmountMax), balance - CONFIG.minBalanceToKeep);
      
      if (amount <= 0) break;

      log(`📤 Sending ${amount.toFixed(4)} DIAM to ${getShortAddress(targetAddress)}...`, 'info');
      const sendSuccess = await sendDiamWithBrowser(page, address, targetAddress, amount, loginResult.userId);
      
      if (sendSuccess) {
        totalSent += amount;
        sendCount++;
        
        // Update balance
        balance = await getBalanceWithBrowser(page, loginResult.userId);
        log(`💰 Remaining balance: ${balance.toFixed(4)} DIAM`, 'info');
        
        // Delay before next send
        if (balance > CONFIG.minBalanceToKeep) {
          await countdown(CONFIG.delayBetweenSends, '⏳ Next send in');
        }
      } else {
        log(`⚠️ Send failed, stopping send cycle`, 'wait');
        break;
      }
    }

    log(`\n📊 Summary: Sent ${sendCount}x | Total: ${totalSent.toFixed(4)} DIAM`, 'success');
    log(`💰 Final balance: ${balance.toFixed(4)} DIAM`, 'info');
    
    console.log(`\x1b[35m└${"─".repeat(67)}\x1b[0m`);
    
    return { success: true, totalSent, sendCount };
    
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    return { success: false };
  } finally {
    if (page) await page.close();
  }
}

async function runFullCycle(proxyAuth) {
  console.log("\n" + "═".repeat(70));
  log("🔄 STARTING AUTO CYCLE", 'info');
  console.log("═".repeat(70));

  let cycleStats = { total: 0, success: 0, failed: 0, totalDiamSent: 0 };

  for (let i = 0; i < addresses.length; i++) {
    cycleStats.total++;
    
    const result = await processAccountCycle(addresses[i], proxyAuth, i, addresses.length);
    
    if (result.success) {
      cycleStats.success++;
      cycleStats.totalDiamSent += result.totalSent || 0;
    } else {
      cycleStats.failed++;
    }
    
    // Delay before next account
    if (i < addresses.length - 1) {
      await countdown(CONFIG.delayBetweenAccounts, '⏳ Next account in');
    }
  }

  // CYCLE SUMMARY
  console.log("\n\x1b[36m╔" + "═".repeat(68) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m  \x1b[1m\x1b[32mCYCLE SUMMARY\x1b[0m" + " ".repeat(52) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╠" + "═".repeat(68) + "╣\x1b[0m");
  console.log(`\x1b[36m║\x1b[0m  📊 Total Accounts: ${cycleStats.total}${" ".repeat(47)}║`);
  console.log(`\x1b[36m║\x1b[0m  ✅ Success: ${cycleStats.success}${" ".repeat(54)}║`);
  console.log(`\x1b[36m║\x1b[0m  ❌ Failed: ${cycleStats.failed}${" ".repeat(55)}║`);
  console.log(`\x1b[36m║\x1b[0m  💰 Total DIAM Sent: ${cycleStats.totalDiamSent.toFixed(4)}${" ".repeat(42)}║`);
  console.log("\x1b[36m╚" + "═".repeat(68) + "╝\x1b[0m\n");

  return cycleStats;
}

// ==================== MAIN ====================

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(68) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(12) + "\x1b[1m\x1b[33mDIAM AUTO CYCLE 24/7\x1b[0m" + " ".repeat(33) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(10) + "\x1b[90mLogin → Claim → Send → Repeat\x1b[0m" + " ".repeat(27) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(68) + "╝\x1b[0m\n");

  loadAccountData();
  loadAddresses();
  loadTargets();
  loadProxies();

  if (addresses.length === 0) {
    log("❌ No addresses found in users.txt", 'error');
    return;
  }

  if (targetAddresses.length === 0) {
    log("⚠️ No target addresses in targets.txt - will skip sending", 'wait');
  }

  log(`📊 Accounts: ${addresses.length}`, 'info');
  log(`🎯 Targets: ${targetAddresses.length}`, 'info');
  log(`🌐 Proxies: ${proxies.length || 'None'}`, 'info');

  const proxyUrl = proxies.length > 0 ? proxies[0] : null;
  
  log(`\n🚀 Launching browser...`, 'info');
  const browserData = await initBrowser(proxyUrl);
  browser = browserData.browser;
  const proxyAuth = browserData.proxyAuth;

  try {
    let cycleNumber = 1;
    
    while (true) {
      log(`\n🔄 CYCLE #${cycleNumber}`, 'info');
      
      // RUN FULL CYCLE
      await runFullCycle(proxyAuth);
      
      // WAIT 24 HOURS
      console.log("\n" + "═".repeat(70));
      log("⏰ Waiting 24 hours before next cycle...", 'wait');
      console.log("═".repeat(70) + "\n");
      
      await countdown(CONFIG.delay24Hours, '⏳ Next cycle in');
      
      cycleNumber++;
    }
    
  } catch (error) {
    log(`Fatal: ${error.message}`, 'error');
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed', 'info');
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  if (browser) browser.close();
  process.exit(1);
});
