// ============================================================
// DIAM AUTO REGISTER & CLAIM - test3.js
// With Main Wallet Auto-Register Fix
// ============================================================

import fs from "fs";
import { Wallet, getAddress } from "ethers";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import readline from "readline";

puppeteer.use(StealthPlugin());

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CAMPAIGN_URL = "https://campaign.diamante.io";

const ACCOUNT_DATA_FILE = "account_data.json";
const WALLET_DATA_FILE = "wallet_data.json";
const USERS_FILE = "users.txt";
const X_ACCOUNTS_FILE = "x_accounts.txt";
const MAIN_WALLET_FILE = "main_wallet.txt";

let addresses = [];
let proxies = [];
let xAccounts = [];
let mainWallet = "";
let accountTokens = {};
let accountData = {};
let walletData = {};
let browser = null;

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
    process.stdout.write(`\r${message} ${i}s...`);
    await sleep(1000);
  }
  process.stdout.write(`\r${' '.repeat(60)}\r`);
}

function promptUser(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      accountData = JSON.parse(fs.readFileSync(ACCOUNT_DATA_FILE, "utf8"));
      log(`Loaded account data`, "success");
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

function loadWalletData() {
  try {
    if (fs.existsSync(WALLET_DATA_FILE)) {
      walletData = JSON.parse(fs.readFileSync(WALLET_DATA_FILE, "utf8"));
      log(`Loaded ${Object.keys(walletData).length} wallets`, "success");
    } else {
      walletData = {};
    }
  } catch (error) {
    walletData = {};
  }
}

function saveWalletData() {
  try {
    fs.writeFileSync(WALLET_DATA_FILE, JSON.stringify(walletData, null, 2));
  } catch (error) {
    log(`Failed to save wallet data: ${error.message}`, "error");
  }
}

function loadAddresses() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      addresses = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
      addresses = addresses.map(addr => {
        try {
          return getAddress(addr);
        } catch (error) {
          return null;
        }
      }).filter(Boolean);
      log(`Loaded ${addresses.length} addresses`, "success");
    } else {
      addresses = [];
    }
  } catch (error) {
    addresses = [];
  }
}

function appendAddress(newAddress) {
  try {
    const checksummed = getAddress(newAddress);
    fs.appendFileSync(USERS_FILE, `${checksummed}\n`);
    log(`✅ Added ${getShortAddress(checksummed)}`, "success");
    loadAddresses();
  } catch (error) {
    log(`Failed to append address: ${error.message}`, "error");
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    log(`Loaded ${proxies.length} proxies`, "success");
  } catch (error) {
    proxies = [];
  }
}

function loadXAccounts() {
  try {
    const data = fs.readFileSync(X_ACCOUNTS_FILE, "utf8");
    xAccounts = data.split("\n").map(line => line.trim()).filter(line => line);
    log(`Loaded ${xAccounts.length} X accounts`, "success");
  } catch (error) {
    xAccounts = [];
  }
}

function loadMainWallet() {
  try {
    const data = fs.readFileSync(MAIN_WALLET_FILE, "utf8");
    mainWallet = data.trim();
    if (!mainWallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new Error("Invalid main wallet");
    }
    mainWallet = getAddress(mainWallet);
    log(`Main wallet: ${getShortAddress(mainWallet)}`, "success");
  } catch (error) {
    mainWallet = "";
  }
}

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

    accountTokens[checksummedAddress] = { userId: userId, accessToken: accessToken };
    log(`✅ Login success: ${getShortAddress(checksummedAddress)}`, 'success');
    
    return { success: true, verified: isSocialExists === "VERIFIED", userId, accessToken };
  } catch (error) {
    log(`Login failed: ${error.message}`, 'error');
    return { success: false };
  }
}

async function registerWithBrowser(page, userId, address, socialHandle, referralCode) {
  try {
    const payload = {
      userId: userId, walletAddress: getAddress(address),
      socialHandle: socialHandle, referralCode: referralCode || ""
    };

    const response = await page.evaluate(async (apiUrl, data) => {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include'
        });
        const jsonData = await res.json();
        return { status: res.status, ok: res.ok, data: jsonData };
      } catch (error) {
        return { status: 0, ok: false, error: error.message };
      }
    }, `${API_BASE_URL}/auth/register`, payload);

    if (response.ok && response.data.success) {
      log(`✅ Registration successful! Social: ${socialHandle}`, 'success');
      return true;
    } else {
      log(`❌ Registration failed: ${response.data.message}`, 'error');
      return false;
    }
  } catch (error) {
    log(`❌ Registration error: ${error.message}`, 'error');
    return false;
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

async function claimFaucetWithBrowser(page, userId) {
  try {
    log(`🎁 Claiming faucet...`, 'wait');

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
        log(`⚠️  Already claimed today`, 'wait');
        const balance = await getBalanceWithBrowser(page, userId);
        return { success: false, alreadyClaimed: true, balance };
      }
      log(`❌ Claim failed: ${response.data?.message}`, 'error');
      return { success: false };
    }
  } catch (error) {
    log(`❌ Claim error: ${error.message}`, 'error');
    return { success: false };
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

// ============================================================
// NEW: ENSURE MAIN WALLET IS REGISTERED
// ============================================================

async function ensureMainWalletRegistered(proxyAuth) {
  if (!mainWallet) {
    log('⚠️  No main wallet configured', 'warn');
    return false;
  }

  log(`🔍 Checking main wallet registration...`, 'info');
  
  let page = null;
  try {
    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    const loginResult = await loginWithBrowser(page, mainWallet);
    
    if (loginResult.success && loginResult.verified) {
      const balance = await getBalanceWithBrowser(page, loginResult.userId);
      log(`✅ Main wallet already registered! Balance: ${balance.toFixed(4)} DIAM`, 'success');
      await page.close();
      return true;
    } else if (loginResult.success && !loginResult.verified) {
      // Need to register
      log(`📝 Main wallet needs registration...`, 'info');
      
      const randomUsername = () => {
        const prefix = ['main', 'primary', 'master', 'hub', 'vault'];
        const suffix = ['wallet', 'account', 'box', 'safe'];
        return `${prefix[Math.floor(Math.random() * prefix.length)]}_${suffix[Math.floor(Math.random() * suffix.length)]}${Math.floor(Math.random() * 9999)}`;
      };
      
      const socialHandle = randomUsername();
      const registerSuccess = await registerWithBrowser(page, loginResult.userId, mainWallet, socialHandle, "");
      
      if (registerSuccess) {
        log(`✅ Main wallet registered successfully!`, 'success');
        await page.close();
        return true;
      } else {
        log(`❌ Failed to register main wallet`, 'error');
        await page.close();
        return false;
      }
    } else {
      log(`❌ Failed to login main wallet`, 'error');
      await page.close();
      return false;
    }
  } catch (error) {
    log(`❌ Error ensuring main wallet: ${error.message}`, 'error');
    if (page) await page.close();
    return false;
  }
}

async function createNewAccount(proxyUrl, proxyAuth, referralCode = "") {
  const wallet = Wallet.createRandom();
  const address = getAddress(wallet.address);
  const privateKey = wallet.privateKey;
  
  const randomUsername = () => {
    const adj = ['cool', 'choco', 'matcha', 'vanilla', 'coffee', 'tea', 'juice'];
    const noun = ['sky', 'weather', 'mountain', 'camp', 'tent', 'view', 'beauty'];
    return `${adj[Math.floor(Math.random() * adj.length)]}_${noun[Math.floor(Math.random() * noun.length)]}${Math.floor(Math.random() * 9999)}`;
  };
  
  const socialHandle = xAccounts.length > 0 ? xAccounts[Math.floor(Math.random() * xAccounts.length)] : randomUsername();

  log(`🆕 Creating new account...`, 'info');
  log(`📍 Address: ${getShortAddress(address)}`, 'info');
  log(`🐦 X Account: ${socialHandle}`, 'info');

  let page = null;
  try {
    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    const loginResult = await loginWithBrowser(page, address);
    if (loginResult.success && !loginResult.verified) {
      const registerSuccess = await registerWithBrowser(page, loginResult.userId, address, socialHandle, referralCode);
      if (registerSuccess) {
        walletData[address.toLowerCase()] = { privateKey, socialHandle, createdAt: new Date().toISOString() };
        saveWalletData();
        appendAddress(address);
        return { success: true, address };
      }
    }
    return { success: false };
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    return { success: false };
  } finally {
    if (page) await page.close();
  }
}

async function processClaimFaucet(address, proxyAuth) {
  let page = null;
  try {
    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    log(`📍 Address: ${getShortAddress(address)}`, 'info');
    log(`🔐 Logging in...`);
    
    const loginResult = await loginWithBrowser(page, address);
    if (loginResult.success && loginResult.verified) {
      const claimResult = await claimFaucetWithBrowser(page, loginResult.userId);
      return claimResult;
    } else {
      log(`⏭️  Skipping claim`, 'wait');
      return { success: false };
    }
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    return { success: false };
  } finally {
    if (page) await page.close();
  }
}

async function processSendToMain(address, proxyAuth, mainWallet) {
  let page = null;
  try {
    if (address.toLowerCase() === mainWallet.toLowerCase()) {
      log(`⏭️  Skipping main wallet itself`, 'wait');
      return { success: false, skipped: true };
    }

    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    // ⬇️⬇️⬇️ TAMBAHKAN INI: VERIFY MAIN WALLET BISA NERIMA ⬇️⬇️⬇️
    log(`🔍 Verifying main wallet can receive...`, 'info');
    const mainPage = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await mainPage.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await mainPage.setViewport({ width: 1920, height: 1080 });
    
    const mainLoginResult = await loginWithBrowser(mainPage, mainWallet);
    if (!mainLoginResult.success || !mainLoginResult.verified) {
      log(`❌ Main wallet not ready to receive!`, 'error');
      await mainPage.close();
      await page.close();
      return { success: false, mainWalletNotReady: true };
    }
    
    const mainBalanceBefore = await getBalanceWithBrowser(mainPage, mainLoginResult.userId);
    log(`💼 Main wallet balance before: ${mainBalanceBefore.toFixed(4)} DIAM`, 'info');
    await mainPage.close();
    // ⬆️⬆️⬆️ SAMPAI SINI ⬆️⬆️⬆️

    log(`📍 Address: ${getShortAddress(address)}`, 'info');
    const loginResult = await loginWithBrowser(page, address);

    if (loginResult.success && loginResult.verified) {
      const balance = await getBalanceWithBrowser(page, loginResult.userId);
      log(`💰 Balance: ${balance.toFixed(4)} DIAM`, 'info');

      if (balance > 0.11) {
        const amountToSend = balance - 0.1;
        log(`📤 Sending ${amountToSend.toFixed(4)} DIAM to main wallet...`, 'wait');
        
        const sendSuccess = await sendDiamWithBrowser(page, address, mainWallet, amountToSend, loginResult.userId);
        
        if (sendSuccess) {
          // ⬇️⬇️⬇️ VERIFY BALANCE BERTAMBAH ⬇️⬇️⬇️
          await sleep(3000); // Wait for transaction to process
          const verifyPage = await browser.newPage();
          if (proxyAuth && proxyAuth.username && proxyAuth.password) {
            await verifyPage.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
          }
          await verifyPage.setViewport({ width: 1920, height: 1080 });
          
          const verifyLoginResult = await loginWithBrowser(verifyPage, mainWallet);
          if (verifyLoginResult.success) {
            const mainBalanceAfter = await getBalanceWithBrowser(verifyPage, verifyLoginResult.userId);
            log(`💼 Main wallet balance after: ${mainBalanceAfter.toFixed(4)} DIAM`, 'success');
            
            const actualReceived = mainBalanceAfter - mainBalanceBefore;
            if (actualReceived > 0) {
              log(`✅ VERIFIED! Main received: ${actualReceived.toFixed(4)} DIAM`, 'success');
            } else {
              log(`⚠️  WARNING: Balance didn't increase!`, 'warn');
            }
          }
          await verifyPage.close();
          // ⬆️⬆️⬆️ SAMPAI SINI ⬆️⬆️⬆️
        }
        
        return { success: sendSuccess, amountSent: sendSuccess ? amountToSend : 0 };
      } else {
        log(`⚠️  Balance too low (< 0.11 DIAM)`, 'wait');
        return { success: false, lowBalance: true };
      }
    }
    return { success: false };
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    return { success: false };
  } finally {
    if (page) await page.close();
  }
  }

async function checkMainWalletBalance(proxyAuth) {
  if (!mainWallet) {
    log('❌ No main wallet configured', 'error');
    return;
  }

  let page = null;
  try {
    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    log(`💼 Checking main wallet: ${getShortAddress(mainWallet)}`, 'info');
    const loginResult = await loginWithBrowser(page, mainWallet);
    
    if (loginResult.success && loginResult.verified) {
      const balance = await getBalanceWithBrowser(page, loginResult.userId);
      console.log('\n' + '═'.repeat(60));
      log(`✅ Main Wallet Balance: ${balance.toFixed(4)} DIAM`, 'success');
      console.log('═'.repeat(60) + '\n');
    } else {
      log(`⚠️  Main wallet not registered or login failed`, 'warn');
    }
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
  } finally {
    if (page) await page.close();
  }
}

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(10) + "\x1b[1m\x1b[33mDIAM BOT - test3.js (FIXED)\x1b[0m" + " ".repeat(13) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m\n");

  loadAccountData();
  loadWalletData();
  loadAddresses();
  loadProxies();
  loadXAccounts();
  loadMainWallet();

  console.log("\n\x1b[1m\x1b[33mSelect Mode:\x1b[0m");
  console.log("1. Create New Accounts");
  console.log("2. Claim Faucet");
  console.log("3. Send All to Main");
  console.log("4. Full Auto");
  console.log("5. Check Main Wallet Balance");
  
  const mode = await promptUser("\nMode (1-5): ");
  const proxyUrl = proxies.length > 0 ? proxies[0] : null;
  
  log(`🚀 Launching browser...`, 'info');
  const browserData = await initBrowser(proxyUrl);
  browser = browserData.browser;
  const proxyAuth = browserData.proxyAuth;

  try {
    if (mode === "1") {
      const count = parseInt(await promptUser("How many? "));
      const referralCode = await promptUser("Referral (optional): ");
      console.log("\n" + "─".repeat(60) + "\n");

      for (let i = 0; i < count; i++) {
        console.log(`\x1b[35m┌─ ${i + 1}/${count} ${"─".repeat(30)}\x1b[0m`);
        const result = await createNewAccount(proxyUrl, proxyAuth, referralCode);
        log(result.success ? `✅ Created!` : `❌ Failed`, result.success ? 'success' : 'error');
        console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
        if (i < count - 1) await countdown(10, '⏳');
      }
      
    } else if (mode === "2") {
      if (addresses.length === 0) {
        log("❌ No addresses", 'error');
        return;
      }

      console.log("\n" + "─".repeat(60) + "\n");
      let successCount = 0;
      let alreadyClaimed = 0;

      for (let i = 0; i < addresses.length; i++) {
        console.log(`\x1b[35m┌─ ${i + 1}/${addresses.length} ${"─".repeat(30)}\x1b[0m`);
        const result = await processClaimFaucet(addresses[i], proxyAuth);
        if (result.success) successCount++;
        else if (result.alreadyClaimed) alreadyClaimed++;
        console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
        if (i < addresses.length - 1) await countdown(60, '⏳');
      }

      console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
      console.log("\x1b[36m║\x1b[0m  \x1b[1m\x1b[32mSUMMARY\x1b[0m" + " ".repeat(45) + "\x1b[36m║\x1b[0m");
      console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
      console.log(`\x1b[36m║\x1b[0m  Claimed: ${successCount}${" ".repeat(45)}║`);
      console.log(`\x1b[36m║\x1b[0m  Already: ${alreadyClaimed}${" ".repeat(45)}║`);
      console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
      
    } else if (mode === "3") {
      if (!mainWallet) {
        log("❌ No main wallet", 'error');
        return;
      }

      // ✅ ENSURE MAIN WALLET IS REGISTERED FIRST
      log('\n🔧 Ensuring main wallet is registered...', 'info');
      const mainWalletReady = await ensureMainWalletRegistered(proxyAuth);
      
      if (!mainWalletReady) {
        log('❌ Main wallet registration failed! Cannot receive funds.', 'error');
        return;
      }
      
      console.log("\n" + "─".repeat(60) + "\n");
      log(`💼 Main: ${getShortAddress(mainWallet)}`, 'info');

      let totalSent = 0;
      let successCount = 0;

      for (let i = 0; i < addresses.length; i++) {
        console.log(`\x1b[35m┌─ ${i + 1}/${addresses.length} ${"─".repeat(30)}\x1b[0m`);
        const result = await processSendToMain(addresses[i], proxyAuth, mainWallet);
        if (result.success) {
          totalSent += result.amountSent;
          successCount++;
        }
        console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
        if (i < addresses.length - 1) await countdown(60, '⏳');
      }

      console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
      console.log("\x1b[36m║\x1b[0m  \x1b[1m\x1b[32mSUMMARY\x1b[0m" + " ".repeat(45) + "\x1b[36m║\x1b[0m");
      console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
      console.log(`\x1b[36m║\x1b[0m  Sent: ${successCount}${" ".repeat(48)}║`);
      console.log(`\x1b[36m║\x1b[0m  Total: ${totalSent.toFixed(4)} DIAM${" ".repeat(39)}║`);
      console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
      
      // Check final main wallet balance
      log('\n💰 Checking final main wallet balance...', 'info');
      await checkMainWalletBalance(proxyAuth);
      
    } else if (mode === "4") {
  const count = parseInt(await promptUser("How many? "));
  const referralCode = await promptUser("Referral: ");
  if (!mainWallet) {
    log("❌ No main wallet", 'error');
    return;
  }

  log('\n🔧 Ensuring main wallet is registered...', 'info');
  const mainWalletReady = await ensureMainWalletRegistered(proxyAuth);
  
  if (!mainWalletReady) {
    log('❌ Main wallet registration failed!', 'error');
    return;
  }

  console.log("\n" + "═".repeat(60));
  log("🚀 FULL AUTO MODE", 'info');
  console.log("═".repeat(60) + "\n");

  log("📝 STEP 1: Creating...", 'info');
  for (let i = 0; i < count; i++) {
    console.log(`\x1b[35m┌─ ${i + 1}/${count}\x1b[0m`);
    await createNewAccount(proxyUrl, proxyAuth, referralCode);
    console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
    if (i < count - 1) await countdown(10, '⏳');
  }

  // ⬇️⬇️⬇️ TAMBAH DELAY LEBIH LAMA ⬇️⬇️⬇️
  log("\n⏰ Waiting 60 seconds for accounts to sync...", 'wait');
  await countdown(60, '⏳ Syncing');
  // ⬆️⬆️⬆️ SAMPAI SINI ⬆️⬆️⬆️

  log("\n🎁 STEP 2: Claiming...", 'info');
  loadAddresses();
  
  let claimSuccessCount = 0;
  for (let i = 0; i < addresses.length; i++) {
    console.log(`\x1b[35m┌─ ${i + 1}/${addresses.length}\x1b[0m`);
    
    // ⬇️⬇️⬇️ RETRY LOGIC ⬇️⬇️⬇️
    let claimSuccess = false;
    for (let retry = 0; retry < 3; retry++) {
      const result = await processClaimFaucet(addresses[i], proxyAuth);
      if (result.success) {
        claimSuccess = true;
        claimSuccessCount++;
        break;
      } else if (result.alreadyClaimed) {
        claimSuccess = true;
        break;
      } else {
        if (retry < 2) {
          log(`⏳ Retry ${retry + 1}/3 in 30 seconds...`, 'wait');
          await countdown(30, '⏳ Retrying');
        }
      }
    }
    
    if (!claimSuccess) {
      log(`❌ Failed to claim after 3 retries`, 'error');
    }
    // ⬆️⬆️⬆️ SAMPAI SINI ⬆️⬆️⬆️
    
    console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
    if (i < addresses.length - 1) await countdown(60, '⏳');
  }

  log(`\n📊 Claim Summary: ${claimSuccessCount}/${addresses.length} successful`, 'info');
  
  if (claimSuccessCount === 0) {
    log('❌ No successful claims! Skipping send step.', 'error');
  } else {
    log("\n💸 STEP 3: Sending to main...", 'info');
    let totalSent = 0;
    let successCount = 0;

    for (let i = 0; i < addresses.length; i++) {
      console.log(`\x1b[35m┌─ ${i + 1}/${addresses.length}\x1b[0m`);
      const result = await processSendToMain(addresses[i], proxyAuth, mainWallet);
      if (result.success) {
        totalSent += result.amountSent;
        successCount++;
      }
      console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
      if (i < addresses.length - 1) await countdown(60, '⏳');
    }

    console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
    console.log("\x1b[36m║\x1b[0m  \x1b[1m\x1b[32mFULL AUTO SUMMARY\x1b[0m" + " ".repeat(38) + "\x1b[36m║\x1b[0m");
    console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
    console.log(`\x1b[36m║\x1b[0m  Created: ${count}${" ".repeat(47)}║`);
    console.log(`\x1b[36m║\x1b[0m  Claimed: ${claimSuccessCount}${" ".repeat(47)}║`);
    console.log(`\x1b[36m║\x1b[0m  Sent: ${successCount}${" ".repeat(50)}║`);
    console.log(`\x1b[36m║\x1b[0m  Total: ${totalSent.toFixed(4)} DIAM${" ".repeat(40)}║`);
    console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
    
    log('\n💰 Checking final main wallet balance...', 'info');
    await checkMainWalletBalance(proxyAuth);
    }
      
    } else if (mode === "5") {
      // NEW MODE: Check Main Wallet Balance
      await checkMainWalletBalance(proxyAuth);
    }
    
  } catch (error) {
    log(`Fatal: ${error.message}`, 'error');
  } finally {
    if (browser) {
      await browser.close();
      log('Browser closed', 'info');
    }
  }

  console.log();
  log("🎉 Completed!", 'success');
}

main().catch(error => {
  console.error('Fatal error:', error);
  if (browser) browser.close();
  process.exit(1);
});
