// ============================================================
// DIAMANTE FAUCET AUTO CLAIM - 24/7 Loop
// ============================================================

import fs from "fs";
import { getAddress } from "ethers";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CAMPAIGN_URL = "https://campaign.diamante.io";
const ACCOUNT_DATA_FILE = "account_data.json";
const ADDRESS_FAUCET_FILE = "address_faucet.txt";

let accountData = {};
let accountTokens = {};
let browser = null;

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  const colors = {
    error: "\x1b[31m",
    success: "\x1b[32m",
    wait: "\x1b[33m",
    info: "\x1b[36m",
    highlight: "\x1b[35m",
    reset: "\x1b[0m"
  };
  const color = colors[type] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function countdown(seconds, message = "Next action in") {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let frameIndex = 0;
  
  for (let i = seconds; i > 0; i--) {
    const hours = Math.floor(i / 3600);
    const mins = Math.floor((i % 3600) / 60);
    const secs = i % 60;
    
    let timeStr = '';
    if (hours > 0) timeStr += `${hours}h `;
    if (mins > 0) timeStr += `${mins}m `;
    timeStr += `${secs}s`;
    
    const totalBars = 40;
    const filledBars = Math.floor((seconds - i) / seconds * totalBars);
    const emptyBars = totalBars - filledBars;
    const progressBar = '█'.repeat(filledBars) + '░'.repeat(emptyBars);
    
    process.stdout.write(
      `\r\x1b[36m${frames[frameIndex]} ${message}: [${progressBar}] ${timeStr}\x1b[0m`
    );
    
    frameIndex = (frameIndex + 1) % frames.length;
    await sleep(1000);
  }
  
  process.stdout.write('\r' + ' '.repeat(100) + '\r');
}

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      accountData = JSON.parse(fs.readFileSync(ACCOUNT_DATA_FILE, "utf8"));
      log(`Loaded ${Object.keys(accountData).length} accounts from cache`, "success");
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
    if (!fs.existsSync(ADDRESS_FAUCET_FILE)) {
      log(`❌ ${ADDRESS_FAUCET_FILE} not found!`, "error");
      log(`📝 Create it with: echo "0xYourAddress" > ${ADDRESS_FAUCET_FILE}`, "info");
      process.exit(1);
    }

    const data = fs.readFileSync(ADDRESS_FAUCET_FILE, "utf8");
    const addresses = data.split("\n")
      .map(addr => addr.trim())
      .filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/))
      .map(addr => {
        try {
          return getAddress(addr);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean);

    if (addresses.length === 0) {
      log(`❌ No valid addresses in ${ADDRESS_FAUCET_FILE}!`, "error");
      process.exit(1);
    }

    log(`✅ Loaded ${addresses.length} addresses`, "success");
    return addresses;
  } catch (error) {
    log(`Failed to load addresses: ${error.message}`, "error");
    process.exit(1);
  }
}

// ============================================================
// BROWSER FUNCTIONS
// ============================================================

async function initBrowser() {
  try {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1920,1080',
      '--disable-blink-features=AutomationControlled'
    ];

    const launchOptions = {
      headless: 'new',
      args: args,
      slowMo: 50,
      defaultViewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    };

    const chromePaths = [
      '/snap/bin/chromium',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome'
    ];

    for (const path of chromePaths) {
      if (fs.existsSync(path)) {
        launchOptions.executablePath = path;
        break;
      }
    }

    browser = await puppeteer.launch(launchOptions);
    log('✅ Browser initialized', 'success');
    return browser;
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
        try {
          jsonData = JSON.parse(text);
        } catch {
          jsonData = { error: 'Parse failed' };
        }
        return { status: res.status, ok: res.ok, data: jsonData };
      } catch (error) {
        return { status: 0, ok: false, error: error.message };
      }
    }, `${API_BASE_URL}/user/connect-wallet`, payload);

    if (!response.ok || !response.data?.success) {
      throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
    }

    const userId = response.data.data.userId;
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
      name: 'access_token',
      value: accessToken,
      domain: '.diamante.io',
      path: '/',
      httpOnly: false,
      secure: true,
      sameSite: 'None'
    });

    accountTokens[checksummedAddress] = { userId: userId, accessToken: accessToken };
    return { success: true, userId, accessToken };
  } catch (error) {
    log(`Login failed: ${error.message}`, 'error');
    return { success: false, error: error.message };
  }
}

async function getBalanceWithBrowser(page, userId) {
  try {
    const response = await page.evaluate(async (apiUrl, uid) => {
      try {
        const res = await fetch(`${apiUrl}/transaction/get-balance/${uid}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
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
    return null;
  }
}

async function claimFaucetWithBrowser(page, userId, retryCount = 0) {
  try {
    const response = await page.evaluate(async (apiUrl, uid) => {
      try {
        const res = await fetch(`${apiUrl}/transaction/fund-wallet/${uid}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        const data = await res.json();
        return { ok: res.ok, status: res.status, data };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    }, API_BASE_URL, userId);

    if (response.ok && response.data.success) {
      const balance = await getBalanceWithBrowser(page, userId);
      return {
        success: true,
        funded: response.data.data.fundedAmount,
        balance: balance
      };
    } else {
      const message = response.data?.message || 'Unknown error';

      if (message.includes("once per day")) {
        return { success: false, alreadyClaimed: true, message };
      }

      if (message.includes("network guardians") || message.includes("sync")) {
        return { success: false, needRetry: true, message };
      }

      return { success: false, message };
    }
  } catch (error) {
    return { success: false, error: error.message, needRetry: true };
  }
}

// ============================================================
// MAIN CLAIM LOGIC WITH RETRY
// ============================================================

async function claimWithRetry(page, address, userId, maxRetries = 5) {
  let retryDelay = 30; // Start with 30 seconds

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    log(`🎁 Attempt ${attempt}/${maxRetries}: Claiming faucet...`, 'wait');

    const result = await claimFaucetWithBrowser(page, userId, attempt - 1);

    if (result.success) {
      log(`✅ SUCCESS! Funded: ${result.funded} DIAM`, 'success');
      log(`💰 Balance: ${result.balance ? result.balance.toFixed(4) : 'N/A'} DIAM`, 'success');
      return { success: true, balance: result.balance };
    }

    if (result.alreadyClaimed) {
      log(`⏭️  Already claimed today`, 'wait');
      const balance = await getBalanceWithBrowser(page, userId);
      return { success: false, alreadyClaimed: true, balance };
    }

    if (result.needRetry && attempt < maxRetries) {
      log(`⚠️  ${result.message || result.error}`, 'wait');
      log(`🔄 Retrying in ${retryDelay} seconds (delay increases each retry)...`, 'info');
      await countdown(retryDelay, '⏳ Retry countdown');
      retryDelay += 30; // Increase delay: 30s, 60s, 90s, 120s, 150s
    } else if (attempt === maxRetries) {
      log(`❌ FAILED after ${maxRetries} attempts: ${result.message || result.error}`, 'error');
      return { success: false, failed: true };
    } else {
      log(`❌ ${result.message || result.error}`, 'error');
      return { success: false };
    }
  }

  return { success: false };
}

async function processAddress(address, index, total) {
  let page = null;

  try {
    console.log('\n' + '╔' + '═'.repeat(68) + '╗');
    console.log(`║  \x1b[1m\x1b[35mAccount ${index + 1}/${total}: ${getShortAddress(address)}\x1b[0m${' '.repeat(68 - 20 - String(index + 1).length - String(total).length - getShortAddress(address).length)}║`);
    console.log('╚' + '═'.repeat(68) + '╝');

    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    log(`🔐 Logging in...`, 'info');
    const loginResult = await loginWithBrowser(page, address);

    if (!loginResult.success) {
      log(`❌ Login failed: ${loginResult.error}`, 'error');
      return { success: false, status: 'login_failed' };
    }

    log(`✅ Login successful`, 'success');

    // Get balance before claim
    const balanceBefore = await getBalanceWithBrowser(page, loginResult.userId);
    if (balanceBefore !== null) {
      log(`💰 Balance before: ${balanceBefore.toFixed(4)} DIAM`, 'info');
    }

    // Claim with retry logic
    const claimResult = await claimWithRetry(page, address, loginResult.userId);

    // Get balance after
    const balanceAfter = await getBalanceWithBrowser(page, loginResult.userId);

    console.log('─'.repeat(70));

    if (claimResult.success) {
      log(`📊 CLAIMED! Balance: ${balanceAfter ? balanceAfter.toFixed(4) : 'N/A'} DIAM`, 'success');
      return { success: true, status: 'claimed', balance: balanceAfter };
    } else if (claimResult.alreadyClaimed) {
      log(`📊 Already claimed. Balance: ${balanceAfter ? balanceAfter.toFixed(4) : 'N/A'} DIAM`, 'wait');
      return { success: false, status: 'already_claimed', balance: balanceAfter };
    } else {
      log(`📊 FAILED. Balance: ${balanceAfter ? balanceAfter.toFixed(4) : 'N/A'} DIAM`, 'error');
      return { success: false, status: 'failed', balance: balanceAfter };
    }
  } catch (error) {
    log(`❌ Process error: ${error.message}`, 'error');
    return { success: false, status: 'error' };
  } finally {
    if (page) await page.close();
  }
}

// ============================================================
// MAIN LOOP - 24/7
// ============================================================

async function main() {
  console.clear();
  console.log('\x1b[35m');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + ' '.repeat(15) + '🎁 DIAMANTE AUTO FAUCET CLAIM 24/7 🎁' + ' '.repeat(15) + '║');
  console.log('║' + ' '.repeat(25) + 'by: didinska' + ' '.repeat(31) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  console.log('\x1b[0m\n');

  loadAccountData();
  const addresses = loadAddresses();

  log(`📋 Total addresses: ${addresses.length}`, 'info');
  log(`🔄 Starting 24/7 auto-claim loop...`, 'highlight');
  console.log('═'.repeat(70) + '\n');

  let cycleCount = 0;

  while (true) {
    cycleCount++;

    console.log('\n' + '╔' + '═'.repeat(68) + '╗');
    console.log(`║  \x1b[1m\x1b[33mCYCLE #${cycleCount} - ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\x1b[0m${' '.repeat(68 - 12 - String(cycleCount).length - 28)}║`);
    console.log('╚' + '═'.repeat(68) + '╝\n');

    try {
      log('🚀 Launching browser...', 'info');
      await initBrowser();

      let claimed = 0;
      let alreadyClaimed = 0;
      let failed = 0;

      for (let i = 0; i < addresses.length; i++) {
        const result = await processAddress(addresses[i], i, addresses.length);

        if (result.status === 'claimed') claimed++;
        else if (result.status === 'already_claimed') alreadyClaimed++;
        else failed++;

        // Delay between accounts
        if (i < addresses.length - 1) {
          await countdown(10, '⏳ Next account in');
        }
      }

      console.log('\n' + '╔' + '═'.repeat(68) + '╗');
      console.log('║  \x1b[1m\x1b[32mCYCLE SUMMARY\x1b[0m' + ' '.repeat(51) + '║');
      console.log('╠' + '═'.repeat(68) + '╣');
      console.log(`║  ✅ Claimed: ${claimed}${' '.repeat(68 - 15 - String(claimed).length)}║`);
      console.log(`║  ⏭️  Already Claimed: ${alreadyClaimed}${' '.repeat(68 - 23 - String(alreadyClaimed).length)}║`);
      console.log(`║  ❌ Failed: ${failed}${' '.repeat(68 - 14 - String(failed).length)}║`);
      console.log('╚' + '═'.repeat(68) + '╝\n');

    } catch (error) {
      log(`❌ Cycle error: ${error.message}`, 'error');
    } finally {
      if (browser) {
        await browser.close();
        log('Browser closed', 'info');
      }
    }

    // Wait 24 hours before next cycle
    log('\n⏰ Waiting 24 hours before next claim cycle...', 'highlight');
    console.log('💡 Tip: Press Ctrl+C to stop the bot\n');
    
    const twentyFourHours = 24 * 60 * 60; // 86400 seconds
    await countdown(twentyFourHours, '⏳ Next cycle in');
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
