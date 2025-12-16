import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import readline from 'readline';

// Apply stealth plugin
chromium.use(stealth());

const USERS_FILE = "users.txt";
const ACCOUNT_DATA_FILE = "account_data.json";

let addresses = [];
let accountData = {};

function log(message, type = "info") {
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  const colors = {
    error: "\x1b[31m",
    success: "\x1b[32m",
    wait: "\x1b[33m",
    info: "\x1b[36m",
    reset: "\x1b[0m"
  };
  const color = colors[type] || colors.info;
  console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function loadAddresses() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf8");
      addresses = data.split("\n")
        .map(addr => addr.trim())
        .filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
      log(`Loaded ${addresses.length} addresses`, "success");
    }
  } catch (error) {
    log(`Failed to load addresses: ${error.message}`, "error");
    addresses = [];
  }
}

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      const data = fs.readFileSync(ACCOUNT_DATA_FILE, "utf8");
      accountData = JSON.parse(data);
    }
  } catch (error) {
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accountData, null, 2));
  } catch (error) {
    log(`Failed to save: ${error.message}`, "error");
  }
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

async function promptUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function claimWithBrowser(address, headless = true) {
  let browser = null;
  let context = null;
  
  try {
    log(`🌐 Launching browser (${headless ? 'headless' : 'visible'})...`, "info");
    
    // Launch browser with stealth mode
    browser = await chromium.launch({
      headless: headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security'
      ]
    });

    // Create context with realistic settings
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
      locale: 'en-US',
      timezoneId: 'Asia/Jakarta',
      permissions: ['clipboard-read', 'clipboard-write']
    });

    const page = await context.newPage();
    
    // Add extra stealth
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {} };
    });
    
    log(`📱 Navigating to campaign.diamante.io...`, "info");
    await page.goto('https://campaign.diamante.io', { 
      waitUntil: 'domcontentloaded',
      timeout: 60000 
    });
    
    // Random delay (human-like)
    await sleep(3000 + Math.random() * 2000);
    
    log(`🔍 Looking for Connect Wallet button...`, "info");
    
    // Try multiple selectors for connect button
    const connectButtonSelectors = [
      'text=Connect Wallet',
      'button:has-text("Connect")',
      '[class*="connect"]:has-text("Connect")',
      'button[class*="ConnectButton"]'
    ];
    
    let connected = false;
    for (const selector of connectButtonSelectors) {
      try {
        const button = await page.locator(selector).first();
        if (await button.isVisible({ timeout: 5000 })) {
          await button.click();
          log(`✅ Clicked Connect Wallet`, "success");
          connected = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!connected) {
      log(`⚠️  Connect button not found, trying JavaScript click...`, "wait");
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const connectBtn = buttons.find(b => 
          b.textContent.toLowerCase().includes('connect')
        );
        if (connectBtn) connectBtn.click();
      });
    }
    
    await sleep(2000);
    
    // Look for wallet selection modal
    log(`💼 Selecting MetaMask wallet option...`, "info");
    
    const walletSelectors = [
      'text=MetaMask',
      '[class*="metamask"]',
      'button:has-text("MetaMask")'
    ];
    
    for (const selector of walletSelectors) {
      try {
        const walletBtn = await page.locator(selector).first();
        if (await walletBtn.isVisible({ timeout: 3000 })) {
          await walletBtn.click();
          log(`✅ Selected MetaMask`, "success");
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    await sleep(2000);
    
    // Inject wallet into page
    log(`🔐 Injecting wallet: ${getShortAddress(address)}`, "info");
    
    await page.evaluate((addr) => {
      window.ethereum = {
        isMetaMask: true,
        selectedAddress: addr,
        chainId: '0x1',
        request: async ({ method, params }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') {
            return [addr];
          }
          if (method === 'eth_chainId') {
            return '0x1';
          }
          if (method === 'personal_sign') {
            // Generate fake signature
            return '0x' + Array(130).fill(0).map(() => 
              Math.floor(Math.random() * 16).toString(16)
            ).join('');
          }
          return null;
        },
        on: () => {},
        removeListener: () => {}
      };
      
      // Trigger wallet connected event
      window.dispatchEvent(new Event('ethereum#initialized'));
    }, address);
    
    await sleep(3000);
    
    // Try to trigger connection again if needed
    await page.evaluate(() => {
      if (window.ethereum && window.ethereum.selectedAddress) {
        window.dispatchEvent(new CustomEvent('accountsChanged', { 
          detail: [window.ethereum.selectedAddress] 
        }));
      }
    });
    
    await sleep(2000);
    
    log(`🎁 Looking for Claim/Faucet button...`, "wait");
    
    // Look for claim button
    const claimSelectors = [
      'text=Claim',
      'text=Get DIAM',
      'text=Claim Faucet',
      'button:has-text("Claim")',
      '[class*="claim"]',
      '[data-testid*="claim"]'
    ];
    
    let claimed = false;
    for (const selector of claimSelectors) {
      try {
        const claimBtn = await page.locator(selector).first();
        if (await claimBtn.isVisible({ timeout: 5000 })) {
          log(`✅ Found claim button, clicking...`, "success");
          await claimBtn.click();
          claimed = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!claimed) {
      log(`⚠️  Trying JavaScript click for claim...`, "wait");
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
        const claimBtn = buttons.find(b => 
          b.textContent.toLowerCase().includes('claim') ||
          b.textContent.toLowerCase().includes('faucet') ||
          b.textContent.toLowerCase().includes('get diam')
        );
        if (claimBtn) {
          claimBtn.click();
          return true;
        }
        return false;
      });
    }
    
    // Wait for response
    await sleep(5000);
    
    // Check for success indicators
    log(`🔍 Checking claim status...`, "info");
    
    const pageText = await page.textContent('body');
    const lowerText = pageText.toLowerCase();
    
    if (lowerText.includes('success') || 
        lowerText.includes('claimed') ||
        lowerText.includes('funded') ||
        lowerText.includes('congratulation')) {
      log(`✅ FAUCET CLAIMED SUCCESSFULLY!`, "success");
      
      // Try to get balance
      const balanceMatch = pageText.match(/(\d+\.?\d*)\s*DIAM/i);
      if (balanceMatch) {
        log(`💰 Balance: ${balanceMatch[0]}`, "info");
      }
      
      // Save to account data
      accountData[address.toLowerCase()] = {
        lastClaim: new Date().toISOString(),
        status: 'success'
      };
      saveAccountData();
      
      await browser.close();
      return { success: true };
      
    } else if (lowerText.includes('already claimed') || 
               lowerText.includes('once per day') ||
               lowerText.includes('try again')) {
      log(`⚠️  Already claimed today`, "wait");
      
      accountData[address.toLowerCase()] = {
        lastClaim: new Date().toISOString(),
        status: 'already_claimed'
      };
      saveAccountData();
      
      await browser.close();
      return { success: false, alreadyClaimed: true };
      
    } else {
      log(`❌ Could not verify claim status`, "error");
      log(`💾 Taking screenshot for debugging...`, "info");
      
      await page.screenshot({ 
        path: `debug_${address.slice(2, 8)}_${Date.now()}.png`,
        fullPage: true 
      });
      
      await browser.close();
      return { success: false, error: 'Cannot verify' };
    }
    
  } catch (error) {
    log(`❌ Error: ${error.message}`, "error");
    if (browser) await browser.close();
    return { success: false, error: error.message };
  }
}

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(6) + "\x1b[1m\x1b[33mDIAMANTE AUTO BOT - PLAYWRIGHT STEALTH\x1b[0m" + " ".repeat(9) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
  console.log();

  loadAddresses();
  loadAccountData();

  if (addresses.length === 0) {
    log("❌ No addresses in users.txt", "error");
    return;
  }

  log(`📋 Found ${addresses.length} addresses`, "info");
  
  const headlessInput = await promptUser("\nRun in headless mode? (y/n, default: y): ");
  const headless = headlessInput.toLowerCase() !== 'n';
  
  const proceed = await promptUser("Start claiming? (y/n): ");
  if (proceed.toLowerCase() !== 'y') {
    log("❌ Cancelled", "error");
    return;
  }

  console.log("\n" + "─".repeat(60) + "\n");

  let successCount = 0;
  let alreadyClaimed = 0;
  let failCount = 0;

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    
    console.log(`\x1b[35m┌─ Account ${i + 1}/${addresses.length} ${"─".repeat(40)}\x1b[0m`);
    log(`📍 Address: ${getShortAddress(address)}`, "info");

    const result = await claimWithBrowser(address, headless);

    if (result.success) {
      successCount++;
    } else if (result.alreadyClaimed) {
      alreadyClaimed++;
    } else {
      failCount++;
    }

    console.log(`\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);

    if (i < addresses.length - 1) {
      const waitTime = 180 + Math.floor(Math.random() * 60); // 3-4 min
      log(`⏳ Waiting ${waitTime}s before next account...`, "wait");
      await countdown(waitTime, "⏱️  Countdown:");
    }
  }

  console.log("\n\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║" + " ".repeat(20) + "\x1b[32mFINAL REPORT\x1b[0m" + " ".repeat(23) + "║\x1b[0m");
  console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
  console.log(`\x1b[36m║\x1b[0m  ✓ Success: ${successCount.toString().padEnd(43)} \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  ⊙ Already Claimed: ${alreadyClaimed.toString().padEnd(35)} \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m  ✗ Failed: ${failCount.toString().padEnd(44)} \x1b[36m║\x1b[0m`);
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, "error");
  process.exit(1);
});
