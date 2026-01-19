// ============================================================
// DIAM WALLET SWAP - Ping-Pong Transfer Between 2 Wallets
// Wallet 1 → Wallet 2 (sampai habis) → Wallet 2 → Wallet 1 (return all)
// ============================================================

import fs from "fs";
import { getAddress } from "ethers";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CAMPAIGN_URL = "https://campaign.diamante.io";
const ACCOUNT_DATA_FILE = "account_data.json";
const WALLET_SWAP_FILE = "wallet_swap.txt"; // Format: wallet1_address\nwallet2_address
const PROXY_FILE = "proxy.txt";

const CONFIG = {
  sendAmountMin: 0.001,
  sendAmountMax: 0.01,
  feeReserve: 0.05, // Reserve for transaction fees
  delayBetweenSends: 90, // detik
  maxSendsBeforeReturn: 100 // Max transfer sebelum return (safety limit)
};

let wallet1 = "";
let wallet2 = "";
let proxies = [];
let accountData = {};
let browser = null;

// ==================== UTILITIES ====================

function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  const colors = { error: "\x1b[31m", success: "\x1b[32m", wait: "\x1b[33m", info: "\x1b[36m", highlight: "\x1b[35m", reset: "\x1b[0m" };
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
    const mins = Math.floor(i / 60);
    const secs = i % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
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

function loadWalletSwap() {
  try {
    if (!fs.existsSync(WALLET_SWAP_FILE)) {
      log(`❌ File ${WALLET_SWAP_FILE} not found!`, 'error');
      log(`📝 Create ${WALLET_SWAP_FILE} with format:`, 'info');
      log(`   Line 1: Wallet 1 address (0x...)`, 'info');
      log(`   Line 2: Wallet 2 address (0x...)`, 'info');
      return false;
    }

    const data = fs.readFileSync(WALLET_SWAP_FILE, "utf8");
    const lines = data.split("\n").map(line => line.trim()).filter(line => line.match(/^0x[0-9a-fA-F]{40}$/));
    
    if (lines.length < 2) {
      log(`❌ Need 2 wallet addresses in ${WALLET_SWAP_FILE}`, 'error');
      return false;
    }

    wallet1 = getAddress(lines[0]);
    wallet2 = getAddress(lines[1]);
    
    log(`✅ Wallet 1: ${getShortAddress(wallet1)}`, 'success');
    log(`✅ Wallet 2: ${getShortAddress(wallet2)}`, 'success');
    
    return true;
  } catch (error) {
    log(`Failed to load wallets: ${error.message}`, 'error');
    return false;
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

    log(`✅ Login: ${getShortAddress(checksummedAddress)}`, 'success');
    
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
      log(`✅ Sent ${amount.toFixed(4)} DIAM → ${getShortAddress(toAddress)}`, 'success');
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

async function transferUntilEmpty(page, fromWallet, toWallet, fromUserId, proxyAuth) {
  log(`\n💸 Starting transfer: ${getShortAddress(fromWallet)} → ${getShortAddress(toWallet)}`, 'highlight');
  
  let balance = await getBalanceWithBrowser(page, fromUserId);
  log(`💰 Starting balance: ${balance.toFixed(4)} DIAM`, 'info');
  
  let totalSent = 0;
  let sendCount = 0;
  
  while (balance > CONFIG.feeReserve && sendCount < CONFIG.maxSendsBeforeReturn) {
    const amount = Math.min(randomAmount(CONFIG.sendAmountMin, CONFIG.sendAmountMax), balance - CONFIG.feeReserve);
    
    if (amount <= 0) break;

    log(`📤 [${sendCount + 1}] Sending ${amount.toFixed(4)} DIAM...`, 'info');
    const sendSuccess = await sendDiamWithBrowser(page, fromWallet, toWallet, amount, fromUserId);
    
    if (sendSuccess) {
      totalSent += amount;
      sendCount++;
      
      // Update balance
      balance = await getBalanceWithBrowser(page, fromUserId);
      log(`💰 Remaining: ${balance.toFixed(4)} DIAM`, 'info');
      
      // Delay
      if (balance > CONFIG.feeReserve) {
        await countdown(CONFIG.delayBetweenSends, '⏳ Next send in');
      }
    } else {
      log(`⚠️ Send failed, stopping`, 'wait');
      break;
    }
  }
  
  if (sendCount >= CONFIG.maxSendsBeforeReturn) {
    log(`⚠️ Reached safety limit (${CONFIG.maxSendsBeforeReturn} transfers)`, 'wait');
  }
  
  log(`\n📊 Transfer Summary:`, 'success');
  log(`   Transfers: ${sendCount}x`, 'info');
  log(`   Total Sent: ${totalSent.toFixed(4)} DIAM`, 'info');
  log(`   Remaining: ${balance.toFixed(4)} DIAM`, 'info');
  
  return { totalSent, sendCount, remainingBalance: balance };
}

async function returnAllToWallet1(page, wallet2UserId, proxyAuth) {
  log(`\n🔄 RETURNING ALL TO WALLET 1...`, 'highlight');
  
  let balance = await getBalanceWithBrowser(page, wallet2UserId);
  log(`💰 Wallet 2 balance: ${balance.toFixed(4)} DIAM`, 'info');
  
  if (balance <= CONFIG.feeReserve) {
    log(`⚠️ Balance too low to return (≤ ${CONFIG.feeReserve} DIAM)`, 'wait');
    return { success: false, returned: 0 };
  }
  
  const amountToReturn = balance - CONFIG.feeReserve;
  log(`📤 Returning ${amountToReturn.toFixed(4)} DIAM → ${getShortAddress(wallet1)}`, 'info');
  
  const sendSuccess = await sendDiamWithBrowser(page, wallet2, wallet1, amountToReturn, wallet2UserId);
  
  if (sendSuccess) {
    const finalBalance = await getBalanceWithBrowser(page, wallet2UserId);
    log(`✅ Return successful!`, 'success');
    log(`💰 Wallet 2 final: ${finalBalance.toFixed(4)} DIAM`, 'info');
    return { success: true, returned: amountToReturn };
  } else {
    log(`❌ Return failed`, 'error');
    return { success: false, returned: 0 };
  }
}

async function runSwapCycle(proxyAuth) {
  let page1 = null;
  let page2 = null;
  
  try {
    // ===== PHASE 1: WALLET 1 → WALLET 2 =====
    console.log("\n" + "═".repeat(70));
    log("🔵 PHASE 1: Wallet 1 → Wallet 2", 'highlight');
    console.log("═".repeat(70));
    
    page1 = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page1.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page1.setViewport({ width: 1920, height: 1080 });
    
    // Login Wallet 1
    log(`🔐 Logging in Wallet 1...`, 'info');
    const login1 = await loginWithBrowser(page1, wallet1);
    if (!login1.success || !login1.verified) {
      log(`❌ Wallet 1 login failed`, 'error');
      return;
    }
    
    // Transfer Wallet 1 → Wallet 2 until empty
    const phase1Result = await transferUntilEmpty(page1, wallet1, wallet2, login1.userId, proxyAuth);
    
    await page1.close();
    page1 = null;
    
    if (phase1Result.totalSent === 0) {
      log(`⚠️ No DIAM sent in Phase 1, skipping Phase 2`, 'wait');
      return;
    }
    
    // ===== PHASE 2: WALLET 2 → WALLET 1 (RETURN ALL) =====
    console.log("\n" + "═".repeat(70));
    log("🟢 PHASE 2: Wallet 2 → Wallet 1 (Return All)", 'highlight');
    console.log("═".repeat(70));
    
    // Wait before starting Phase 2
    await countdown(60, '⏳ Preparing Phase 2 in');
    
    page2 = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page2.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page2.setViewport({ width: 1920, height: 1080 });
    
    // Login Wallet 2
    log(`🔐 Logging in Wallet 2...`, 'info');
    const login2 = await loginWithBrowser(page2, wallet2);
    if (!login2.success || !login2.verified) {
      log(`❌ Wallet 2 login failed`, 'error');
      return;
    }
    
    // Return all from Wallet 2 → Wallet 1
    const phase2Result = await returnAllToWallet1(page2, login2.userId, proxyAuth);
    
    await page2.close();
    page2 = null;
    
    // ===== FINAL SUMMARY =====
    console.log("\n" + "╔" + "═".repeat(68) + "╗");
    console.log("║" + " ".repeat(20) + "\x1b[1m\x1b[32mSWAP CYCLE COMPLETE\x1b[0m" + " ".repeat(25) + "║");
    console.log("╠" + "═".repeat(68) + "╣");
    console.log(`║  Phase 1: Sent ${phase1Result.totalSent.toFixed(4)} DIAM (${phase1Result.sendCount}x)${" ".repeat(35 - phase1Result.totalSent.toFixed(4).length - phase1Result.sendCount.toString().length)}║`);
    console.log(`║  Phase 2: Returned ${phase2Result.returned.toFixed(4)} DIAM${" ".repeat(40 - phase2Result.returned.toFixed(4).length)}║`);
    console.log("╚" + "═".repeat(68) + "╝\n");
    
  } catch (error) {
    log(`Swap cycle error: ${error.message}`, 'error');
  } finally {
    if (page1) await page1.close();
    if (page2) await page2.close();
  }
}

// ==================== MAIN ====================

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(68) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(15) + "\x1b[1m\x1b[33mDIAM WALLET SWAP\x1b[0m" + " ".repeat(31) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(12) + "\x1b[90mPing-Pong Transfer Between 2 Wallets\x1b[0m" + " ".repeat(17) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(68) + "╝\x1b[0m\n");

  loadAccountData();
  loadProxies();
  
  const walletsLoaded = loadWalletSwap();
  if (!walletsLoaded) {
    return;
  }

  log(`\n📋 Config:`, 'info');
  log(`   Amount per send: ${CONFIG.sendAmountMin} - ${CONFIG.sendAmountMax} DIAM`, 'info');
  log(`   Fee reserve: ${CONFIG.feeReserve} DIAM`, 'info');
  log(`   Delay between sends: ${CONFIG.delayBetweenSends}s`, 'info');

  const proxyUrl = proxies.length > 0 ? proxies[0] : null;
  
  log(`\n🚀 Launching browser...`, 'info');
  const browserData = await initBrowser(proxyUrl);
  browser = browserData.browser;
  const proxyAuth = browserData.proxyAuth;

  try {
    await runSwapCycle(proxyAuth);
    
    log('\n✅ Swap cycle completed!', 'success');
    
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
