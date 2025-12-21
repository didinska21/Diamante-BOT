// ============================================================
// DIAM AUTO CLAIM FAUCET 24/7 - Claim Only Version
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

let addresses = [];
let proxies = [];
let accountData = {};
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

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    log(`Loaded ${proxies.length} proxies`, "success");
  } catch (error) {
    proxies = [];
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

async function processClaimWithRetry(address, proxyAuth) {
  let page = null;
  try {
    page = await browser.newPage();
    if (proxyAuth && proxyAuth.username && proxyAuth.password) {
      await page.authenticate({ username: proxyAuth.username, password: proxyAuth.password });
    }
    await page.setViewport({ width: 1920, height: 1080 });

    log(`📍 Address: ${getShortAddress(address)}`, 'info');
    log(`🔐 Logging in...`, 'info');
    
    const loginResult = await loginWithBrowser(page, address);
    if (!loginResult.success || !loginResult.verified) {
      log(`⏭️  Skipping (not registered or login failed)`, 'wait');
      return { success: false, skipped: true };
    }

    // DELAY 1 MENIT SETELAH LOGIN
    log(`⏰ Waiting 1 minute before claiming...`, 'wait');
    await countdown(60, '⏳ Preparing');

    // RETRY LOGIC: 3 kali dengan delay bertingkat
    const retryDelays = [60, 180, 300]; // 1 menit, 3 menit, 5 menit
    
    for (let attempt = 0; attempt < 3; attempt++) {
      const claimResult = await claimFaucetWithBrowser(page, loginResult.userId);
      
      if (claimResult.success || claimResult.alreadyClaimed) {
        return { success: true, claimed: claimResult.success };
      }
      
      // Jika gagal dan masih ada retry
      if (attempt < 2) {
        const delaySeconds = retryDelays[attempt];
        const delayMinutes = Math.floor(delaySeconds / 60);
        log(`⏳ Retry ${attempt + 1}/3 in ${delayMinutes} minute(s)...`, 'wait');
        await countdown(delaySeconds, '⏳ Retrying');
      }
    }
    
    log(`❌ Failed after 3 retries`, 'error');
    return { success: false };
    
  } catch (error) {
    log(`Error: ${error.message}`, 'error');
    return { success: false };
  } finally {
    if (page) await page.close();
  }
}

async function runClaimCycle(proxyAuth) {
  console.log("\n" + "═".repeat(60));
  log("🎁 STARTING CLAIM CYCLE", 'info');
  console.log("═".repeat(60) + "\n");

  let successCount = 0;
  let alreadyClaimedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < addresses.length; i++) {
    console.log(`\x1b[35m┌─ Account ${i + 1}/${addresses.length} ${"─".repeat(30)}\x1b[0m`);
    
    const result = await processClaimWithRetry(addresses[i], proxyAuth);
    
    if (result.success && result.claimed) {
      successCount++;
    } else if (result.success && !result.claimed) {
      alreadyClaimedCount++;
    } else {
      failedCount++;
    }
    
    console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
    
    // DELAY 10 DETIK SEBELUM AKUN BERIKUTNYA
    if (i < addresses.length - 1) {
      await countdown(10, '⏳ Next account in');
    }
  }

  // SUMMARY
  console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m  \x1b[1m\x1b[32mCYCLE SUMMARY\x1b[0m" + " ".repeat(42) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
  console.log(`\x1b[36m║\x1b[0m  ✅ Successfully Claimed: ${successCount}${" ".repeat(30)}║`);
  console.log(`\x1b[36m║\x1b[0m  ⚠️  Already Claimed: ${alreadyClaimedCount}${" ".repeat(34)}║`);
  console.log(`\x1b[36m║\x1b[0m  ❌ Failed: ${failedCount}${" ".repeat(44)}║`);
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m\n");
}

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(8) + "\x1b[1m\x1b[33mDIAM AUTO CLAIM FAUCET 24/7\x1b[0m" + " ".repeat(15) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m\n");

  loadAccountData();
  loadAddresses();
  loadProxies();

  if (addresses.length === 0) {
    log("❌ No addresses found in users.txt", 'error');
    return;
  }

  const proxyUrl = proxies.length > 0 ? proxies[0] : null;
  
  log(`🚀 Launching browser...`, 'info');
  const browserData = await initBrowser(proxyUrl);
  browser = browserData.browser;
  const proxyAuth = browserData.proxyAuth;

  try {
    let cycleNumber = 1;
    
    while (true) {
      log(`\n🔄 CYCLE #${cycleNumber}`, 'info');
      
      // RUN CLAIM CYCLE
      await runClaimCycle(proxyAuth);
      
      // COUNTDOWN 24 JAM
      console.log("\n" + "═".repeat(60));
      log("⏰ Waiting 24 hours before next cycle...", 'wait');
      console.log("═".repeat(60) + "\n");
      
      const twentyFourHours = 24 * 60 * 60; // 86400 seconds
      await countdown(twentyFourHours, '⏳ Next cycle in');
      
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
