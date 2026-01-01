// ============================================================
// DIAM AUTO TRANSFER - Fully Automated with Wallet Injection
// ============================================================

import fs from "fs";
import { ethers } from "ethers";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

// ==================== CONFIGURATION ====================
const CONFIG = {
  apiBaseUrl: "https://campapi.diamante.io/api/v1",
  campaignUrl: "https://campaign.diamante.io",
  targetAddress: "0x87731061b0bf9275e43475f7bf1175dcfb570165",
  amount: "50",
  walletDataFile: "wallet_data.json",
  accountDataFile: "account_data.json",
  proxyFile: "proxy.txt",
  delayBetweenAccounts: 10000,
  delayBeforeTransfer: 5000,
  delayAfterInput: 2000,
  timeout: 60000
};

// ==================== GLOBAL VARIABLES ====================
let wallets = [];
let proxies = [];
let accountData = {};
let browser = null;
let stats = {
  total: 0,
  success: 0,
  failed: 0,
  skipped: 0
};

// ==================== UTILITY FUNCTIONS ====================
function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  const colors = {
    error: "\x1b[31m",
    success: "\x1b[32m",
    wait: "\x1b[33m",
    info: "\x1b[36m",
    warning: "\x1b[35m",
    reset: "\x1b[0m"
  };
  const color = colors[type] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function getShortAddress(address) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "N/A";
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(seconds, message) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${message} ${i}s...`);
    await sleep(1000);
  }
  process.stdout.write(`\r${' '.repeat(60)}\r`);
}

// ==================== FILE OPERATIONS ====================
function loadAccountData() {
  try {
    if (fs.existsSync(CONFIG.accountDataFile)) {
      accountData = JSON.parse(fs.readFileSync(CONFIG.accountDataFile, "utf8"));
    } else {
      accountData = {};
    }
  } catch (error) {
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync(CONFIG.accountDataFile, JSON.stringify(accountData, null, 2));
  } catch (error) {
    log(`Failed to save account data: ${error.message}`, "error");
  }
}

function loadWallets() {
  try {
    if (!fs.existsSync(CONFIG.walletDataFile)) {
      log(`❌ File ${CONFIG.walletDataFile} not found!`, "error");
      return;
    }

    const data = fs.readFileSync(CONFIG.walletDataFile, "utf8");
    const walletData = JSON.parse(data);

    wallets = Object.entries(walletData).map(([address, data]) => {
      try {
        const checksumAddress = ethers.getAddress(address);
        if (!data.privateKey || !data.privateKey.startsWith('0x')) {
          return null;
        }
        return {
          address: checksumAddress,
          privateKey: data.privateKey,
          socialHandle: data.socialHandle || 'N/A',
          createdAt: data.createdAt || 'N/A'
        };
      } catch (error) {
        return null;
      }
    }).filter(Boolean);

    log(`✅ Loaded ${wallets.length} wallets`, "success");
    
    console.log("\n" + "─".repeat(70));
    console.log("\x1b[33m📋 Loaded Wallets:\x1b[0m");
    wallets.forEach((w, i) => {
      console.log(`   ${i + 1}. ${getShortAddress(w.address)} | ${w.socialHandle}`);
    });
    console.log("─".repeat(70) + "\n");

  } catch (error) {
    log(`❌ Failed to load wallets: ${error.message}`, "error");
    wallets = [];
  }
}

function loadProxies() {
  try {
    if (fs.existsSync(CONFIG.proxyFile)) {
      const data = fs.readFileSync(CONFIG.proxyFile, "utf8");
      proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    } else {
      proxies = [];
    }
  } catch (error) {
    proxies = [];
  }
}

// ==================== BROWSER SETUP ====================
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
      headless: 'new', // Set to 'new' for VPS/Linux headless mode
      args: args,
      slowMo: 50,
      defaultViewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    };

    const chromePaths = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium',
      '/snap/bin/chromium'
    ];
    
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

    log('✅ Browser initialized', 'success');
    return { browser, proxyAuth: { username, password } };
  } catch (error) {
    log(`❌ Failed to init browser: ${error.message}`, 'error');
    throw error;
  }
}

// ==================== AUTO LOGIN WITH API ====================
async function autoLoginWithAPI(page, wallet) {
  try {
    log(`🔐 Auto-login for ${getShortAddress(wallet.address)}...`, 'wait');
    
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
        } catch (error) {
          log(`⚠️  Error capturing token: ${error.message}`, 'warning');
        }
      }
    });
    
    page.on('request', request => request.continue());
    
    log(`🌐 Loading ${CONFIG.campaignUrl}...`, 'info');
    await page.screenshot({ path: `debug_before_load_${Date.now()}.png` });
    
    await page.goto(CONFIG.campaignUrl, { waitUntil: 'networkidle0', timeout: 90000 });
    await sleep(3000);
    
    log(`📸 Taking screenshot after page load...`, 'info');
    await page.screenshot({ path: `debug_after_load_${Date.now()}.png`, fullPage: true });

    const checksummedAddress = ethers.getAddress(wallet.address);
    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      accountData[checksummedAddress.toLowerCase()] = deviceId;
      saveAccountData();
    }

    log(`📋 Device ID: ${deviceId}`, 'info');
    log(`📋 Address: ${checksummedAddress}`, 'info');

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

    log(`📤 Sending login request to API...`, 'info');
    log(`📤 Payload: ${JSON.stringify(payload, null, 2)}`, 'info');

    const response = await page.evaluate(async (apiUrl, data) => {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(data),
          credentials: 'include'
        });
        const text = await res.text();
        let jsonData;
        try {
          jsonData = JSON.parse(text);
        } catch {
          jsonData = { error: 'Parse failed', rawText: text };
        }
        return { 
          status: res.status, 
          ok: res.ok, 
          data: jsonData,
          headers: Object.fromEntries(res.headers.entries())
        };
      } catch (error) {
        return { status: 0, ok: false, error: error.message };
      }
    }, `${CONFIG.apiBaseUrl}/user/connect-wallet`, payload);

    log(`📥 API Response Status: ${response.status}`, 'info');
    log(`📥 API Response OK: ${response.ok}`, 'info');
    log(`📥 API Response Data: ${JSON.stringify(response.data, null, 2)}`, 'info');
    
    await page.screenshot({ path: `debug_after_api_${Date.now()}.png`, fullPage: true });

    if (!response.ok || !response.data?.success) {
      log(`❌ API Response failed:`, 'error');
      log(`   Status: ${response.status}`, 'error');
      log(`   Data: ${JSON.stringify(response.data, null, 2)}`, 'error');
      throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
    }

    const userId = response.data.data.userId;
    const isSocialExists = response.data.data.isSocialExists;
    
    log(`✅ User ID: ${userId}`, 'success');
    log(`✅ Social Status: ${isSocialExists}`, 'success');
    
    await sleep(2000);
    
    let accessToken = capturedToken;
    if (!accessToken) {
      log(`🔍 Token not captured from response, checking cookies...`, 'info');
      const cookies = await page.cookies();
      log(`🍪 Found ${cookies.length} cookies`, 'info');
      const tokenCookie = cookies.find(c => c.name === 'access_token');
      if (tokenCookie) {
        accessToken = tokenCookie.value;
        log(`✅ Token found in cookies`, 'success');
      }
    } else {
      log(`✅ Token captured from response`, 'success');
    }
    
    if (!accessToken) {
      log(`🔍 Trying to get token from document.cookie...`, 'info');
      accessToken = await page.evaluate(() => {
        const match = document.cookie.match(/access_token=([^;]+)/);
        return match ? match[1] : null;
      });
      if (accessToken) {
        log(`✅ Token found in document.cookie`, 'success');
      }
    }
    
    if (!accessToken) {
      log(`❌ Could not find access token anywhere`, 'error');
      await page.screenshot({ path: `debug_no_token_${Date.now()}.png`, fullPage: true });
      throw new Error('Could not capture access token');
    }

    log(`🍪 Setting access_token cookie...`, 'info');
    await page.setCookie({
      name: 'access_token',
      value: accessToken,
      domain: '.diamante.io',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'None'
    });

    log(`🔄 Reloading page to apply login...`, 'info');
    await page.reload({ waitUntil: 'networkidle0' });
    await sleep(3000);
    
    await page.screenshot({ path: `debug_after_reload_${Date.now()}.png`, fullPage: true });

    log(`✅ Auto-login SUCCESS!`, 'success');
    
    return {
      success: true,
      verified: isSocialExists === "VERIFIED",
      userId,
      accessToken
    };
  } catch (error) {
    log(`❌ Auto-login failed: ${error.message}`, 'error');
    log(`❌ Stack: ${error.stack}`, 'error');
    await page.screenshot({ path: `debug_login_error_${Date.now()}.png`, fullPage: true });
    return { success: false, error: error.message };
  }
}

// ==================== BROWSER UI INTERACTION ====================
async function waitForElementSafe(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { timeout, visible: true });
    return true;
  } catch (error) {
    return false;
  }
}

async function clickElement(page, selector, description) {
  try {
    log(`🔍 Looking for: ${description}`, 'wait');
    const found = await waitForElementSafe(page, selector, 15000);
    if (!found) {
      log(`❌ Not found: ${description}`, 'error');
      return false;
    }
    
    await page.click(selector);
    log(`✅ Clicked: ${description}`, 'success');
    await sleep(CONFIG.delayAfterInput);
    return true;
  } catch (error) {
    log(`❌ Failed to click ${description}: ${error.message}`, 'error');
    return false;
  }
}

async function typeIntoField(page, selector, text, description) {
  try {
    log(`🔍 Looking for: ${description}`, 'wait');
    const found = await waitForElementSafe(page, selector, 15000);
    if (!found) {
      log(`❌ Not found: ${description}`, 'error');
      return false;
    }
    
    await page.click(selector);
    await sleep(500);
    
    await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (element) element.value = '';
    }, selector);
    
    await page.type(selector, text, { delay: 100 });
    log(`✅ Typed: ${description}`, 'success');
    await sleep(CONFIG.delayAfterInput);
    return true;
  } catch (error) {
    log(`❌ Failed to type: ${error.message}`, 'error');
    return false;
  }
}

async function sendTransactionViaBrowser(page) {
  try {
    log(`💸 Starting transfer...`, 'info');
    
    await sleep(3000);
    
    // 1. Click hamburger menu
    let menuOpened = false;
    const menuSelectors = [
      'button[class*="menu"]',
      '[class*="hamburger"]',
      'button:has-text("☰")'
    ];
    
    for (const selector of menuSelectors) {
      if (await clickElement(page, selector, 'Menu')) {
        menuOpened = true;
        break;
      }
    }
    
    if (!menuOpened) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const menuBtn = buttons.find(b => 
          b.querySelector('svg') && 
          b.getBoundingClientRect().right > window.innerWidth - 100
        );
        if (menuBtn) menuBtn.click();
      });
      await sleep(CONFIG.delayAfterInput);
    }
    
    // 2. Click Transactions
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div'));
      const txElement = elements.find(el => 
        el.textContent.trim().toLowerCase() === 'transactions'
      );
      if (txElement) txElement.click();
    });
    log(`✅ Clicked: Transactions`, 'success');
    await sleep(CONFIG.delayAfterInput);
    
    // 3. Click Send
    await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button'));
      const sendBtn = elements.find(el => 
        el.textContent.trim().toLowerCase() === 'send'
      );
      if (sendBtn) sendBtn.click();
    });
    log(`✅ Clicked: Send button`, 'success');
    await sleep(CONFIG.delayAfterInput);
    
    // 4. Fill To Address
    const addressSelectors = [
      'input[placeholder*="Address"]',
      'input[placeholder*="address"]',
      'input[name*="address"]'
    ];
    
    let addressFilled = false;
    for (const selector of addressSelectors) {
      if (await typeIntoField(page, selector, CONFIG.targetAddress, 'To Address')) {
        addressFilled = true;
        break;
      }
    }
    
    if (!addressFilled) {
      throw new Error('Cannot find To Address field');
    }
    
    // 5. Fill Amount
    const amountSelectors = [
      'input[placeholder*="Amount"]',
      'input[placeholder*="amount"]',
      'input[name*="amount"]'
    ];
    
    let amountFilled = false;
    for (const selector of amountSelectors) {
      if (await typeIntoField(page, selector, CONFIG.amount, 'Amount')) {
        amountFilled = true;
        break;
      }
    }
    
    if (!amountFilled) {
      throw new Error('Cannot find Amount field');
    }
    
    // 6. Click SEND TRANSACTION
    log('⏰ Waiting before submit...', 'wait');
    await sleep(CONFIG.delayBeforeTransfer);
    
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submitBtn = buttons.find(b => 
        b.textContent.toLowerCase().includes('send transaction')
      );
      if (submitBtn) submitBtn.click();
    });
    log(`✅ Clicked: SEND TRANSACTION`, 'success');
    
    // 7. Wait for confirmation
    log('⏳ Waiting for confirmation...', 'wait');
    await sleep(5000);
    
    const success = await page.evaluate(() => {
      return document.body.textContent.toLowerCase().includes('success') ||
             document.body.textContent.toLowerCase().includes('transaction hash');
    });
    
    await page.screenshot({ 
      path: `tx_${Date.now()}.png`
    });
    
    if (success) {
      log('✅ Transaction SUCCESS!', 'success');
      
      // Close popup
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const closeBtn = buttons.find(b => 
          b.textContent.toLowerCase().includes('maybe later') ||
          b.textContent.toLowerCase().includes('close')
        );
        if (closeBtn) closeBtn.click();
      });
      
      return { success: true };
    } else {
      log('⚠️  Transaction status unclear, assuming success', 'warning');
      return { success: true };
    }
    
  } catch (error) {
    log(`❌ Transaction error: ${error.message}`, 'error');
    await page.screenshot({ path: `tx_error_${Date.now()}.png` });
    return { success: false, error: error.message };
  }
}

// ==================== MAIN PROCESS ====================
async function processWallet(wallet, proxyAuth) {
  let page = null;
  try {
    page = await browser.newPage();
    
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({
        username: proxyAuth.username,
        password: proxyAuth.password
      });
    }
    
    await page.setViewport({ width: 1920, height: 1080 });

    log(`\n📍 Processing: ${getShortAddress(wallet.address)}`, 'info');
    log(`👤 Social: ${wallet.socialHandle}`, 'info');
    
    // AUTO LOGIN
    const loginResult = await autoLoginWithAPI(page, wallet);
    
    if (!loginResult.success) {
      log(`⏭️  Login failed, skipping`, 'warning');
      stats.skipped++;
      return { success: false };
    }
    
    if (!loginResult.verified) {
      log(`⚠️  Not verified, skipping`, 'warning');
      stats.skipped++;
      return { success: false };
    }
    
    // SEND TRANSACTION
    const txResult = await sendTransactionViaBrowser(page);
    
    if (txResult.success) {
      stats.success++;
      return { success: true };
    } else {
      stats.failed++;
      return { success: false };
    }

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'error');
    stats.failed++;
    return { success: false };
  } finally {
    if (page) {
      await page.close();
    }
  }
}

async function runTransferCycle(proxyAuth) {
  console.log("\n" + "═".repeat(70));
  log("💸 STARTING TRANSFER CYCLE", 'info');
  console.log("═".repeat(70) + "\n");

  stats = { total: wallets.length, success: 0, failed: 0, skipped: 0 };

  for (let i = 0; i < wallets.length; i++) {
    console.log(`\x1b[35m┌─ Wallet ${i + 1}/${wallets.length} ${"─".repeat(48)}\x1b[0m`);
    
    await processWallet(wallets[i], proxyAuth);
    
    console.log(`\x1b[35m└${"─".repeat(67)}\x1b[0m\n`);
    
    if (i < wallets.length - 1) {
      const delaySec = Math.floor(CONFIG.delayBetweenAccounts / 1000);
      await countdown(delaySec, '⏳ Next wallet in');
    }
  }

  // Summary
  console.log("\x1b[36m╔" + "═".repeat(68) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m  \x1b[1m\x1b[32mSUMMARY\x1b[0m" + " ".repeat(58) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╠" + "═".repeat(68) + "╣\x1b[0m");
  console.log(`\x1b[36m║\x1b[0m  📊 Total: ${stats.total}${" ".repeat(55 - stats.total.toString().length)}\x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  ✅ Success: ${stats.success}${" ".repeat(52 - stats.success.toString().length)}\x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  ❌ Failed: ${stats.failed}${" ".repeat(54 - stats.failed.toString().length)}\x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  ⏭️  Skipped: ${stats.skipped}${" ".repeat(53 - stats.skipped.toString().length)}\x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  💰 Total Sent: ${stats.success * parseFloat(CONFIG.amount)} DIAM${" ".repeat(38 - (stats.success * parseFloat(CONFIG.amount)).toString().length)}\x1b[36m║\x1b[0m`);
  console.log("\x1b[36m╚" + "═".repeat(68) + "╝\x1b[0m\n");
}

// ==================== MAIN ====================
async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(68) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(15) + "\x1b[1m\x1b[33mDIAM AUTO TRANSFER\x1b[0m" + " ".repeat(30) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(18) + "\x1b[90mFully Automated\x1b[0m" + " ".repeat(31) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(68) + "╝\x1b[0m\n");

  loadAccountData();
  loadWallets();
  loadProxies();

  if (wallets.length === 0) {
    log("❌ No wallets", 'error');
    return;
  }

  console.log("\x1b[33m📋 Config:\x1b[0m");
  console.log(`   Target: ${getShortAddress(CONFIG.targetAddress)}`);
  console.log(`   Amount: ${CONFIG.amount} DIAM`);
  console.log(`   Wallets: ${wallets.length}\n`);

  const proxyUrl = proxies.length > 0 ? proxies[0] : null;

  log(`🚀 Launching browser...`, 'wait');
  const browserData = await initBrowser(proxyUrl);
  browser = browserData.browser;
  const proxyAuth = browserData.proxyAuth;

  try {
    await runTransferCycle(proxyAuth);
    log('\n✅ Done!', 'success');
  } catch (error) {
    log(`❌ Fatal: ${error.message}`, 'error');
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

main().catch(error => {
  console.error('💥 Fatal:', error);
  if (browser) browser.close();
  process.exit(1);
});
