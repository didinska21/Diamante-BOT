import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { Wallet, getAddress } from "ethers";
import fs from "fs";
import readline from "readline";

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const ACCOUNT_DATA_FILE = "account_data.json";
const WALLET_DATA_FILE = "wallet_data.json";
const USERS_FILE = "users.txt";
const X_ACCOUNTS_FILE = "x_accounts.txt";
const MAIN_WALLET_FILE = "main_wallet.txt";

const CONFIG_DEFAULT_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Cache-Control": "no-cache",
  "Origin": "https://campaign.diamante.io",
  "Pragma": "no-cache",
  "Priority": "u=1, i",
  "Referer": "https://campaign.diamante.io/",
  "Sec-Ch-Ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
};

let addresses = [];
let proxies = [];
let xAccounts = [];
let mainWallet = "";
let accountTokens = {};
let accountData = {};
let walletData = {};

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

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      const data = fs.readFileSync(ACCOUNT_DATA_FILE, "utf8");
      accountData = JSON.parse(data);
      log(`Loaded account data from ${ACCOUNT_DATA_FILE}`, "success");
    } else {
      accountData = {};
    }
  } catch (error) {
    log(`Failed to load account data: ${error.message}`, "error");
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
      const data = fs.readFileSync(WALLET_DATA_FILE, "utf8");
      walletData = JSON.parse(data);
      log(`Loaded ${Object.keys(walletData).length} wallets from ${WALLET_DATA_FILE}`, "success");
    } else {
      walletData = {};
    }
  } catch (error) {
    log(`Failed to load wallet data: ${error.message}`, "error");
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
      log(`Loaded ${addresses.length} addresses from ${USERS_FILE}`, "success");
    } else {
      addresses = [];
      log("No users.txt found", "info");
    }
  } catch (error) {
    log(`Failed to load addresses: ${error.message}`, "error");
    addresses = [];
  }
}

function appendAddress(newAddress) {
  try {
    const checksummed = getAddress(newAddress);
    fs.appendFileSync(USERS_FILE, `${checksummed}\n`);
    log(`✅ Added address ${getShortAddress(checksummed)} to ${USERS_FILE}`, "success");
    loadAddresses();
  } catch (error) {
    log(`Failed to append address: ${error.message}`, "error");
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    if (proxies.length === 0) throw new Error("No proxies found in proxy.txt");
    log(`Loaded ${proxies.length} proxies from proxy.txt`, "success");
  } catch (error) {
    log(`No proxy.txt found, running without proxies`, "wait");
    proxies = [];
  }
}

function loadXAccounts() {
  try {
    const data = fs.readFileSync(X_ACCOUNTS_FILE, "utf8");
    xAccounts = data.split("\n").map(line => line.trim()).filter(line => line);
    if (xAccounts.length === 0) throw new Error("No X accounts found");
    log(`Loaded ${xAccounts.length} X accounts from ${X_ACCOUNTS_FILE}`, "success");
  } catch (error) {
    log(`Failed to load X accounts: ${error.message}`, "error");
    xAccounts = [];
  }
}

function loadMainWallet() {
  try {
    const data = fs.readFileSync(MAIN_WALLET_FILE, "utf8");
    mainWallet = data.trim();
    if (!mainWallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      throw new Error("Invalid main wallet address");
    }
    mainWallet = getAddress(mainWallet);
    log(`Main wallet loaded: ${getShortAddress(mainWallet)}`, "success");
  } catch (error) {
    log(`Failed to load main wallet: ${error.message}`, "error");
    mainWallet = "";
  }
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}

async function makeApiRequest(method, url, data, proxyUrl, customHeaders = {}, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
      lastError = error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw lastError;
}

async function loginAccount(address, proxyUrl) {
  try {
    const loginUrl = `${API_BASE_URL}/user/connect-wallet`;
    const checksummedAddress = getAddress(address);

    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(24).substr(2, 5).toUpperCase()}`;
    }

    const payload = {
      "address": checksummedAddress,
      "deviceId": deviceId,
      "deviceSource": "web_app",
      "deviceType": "Windows",
      "browser": "Chrome",
      "ipAddress": "0.0.0.0",
      "latitude": 12.9715987,
      "longitude": 77.5945627,
      "countryCode": "Unknown",
      "country": "Unknown",
      "continent": "Unknown",
      "continentCode": "Unknown",
      "region": "Unknown",
      "regionCode": "Unknown",
      "city": "Unknown"
    };

    const response = await makeApiRequest("post", loginUrl, payload, proxyUrl, {});
    
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
        log(`❌ Failed to extract access_token`, "error");
        return { success: false };
      }

      accountTokens[checksummedAddress] = { userId, accessToken };

      if (!accountData[checksummedAddress.toLowerCase()]) {
        accountData[checksummedAddress.toLowerCase()] = deviceId;
        saveAccountData();
      }

      if (response.data.data.isSocialExists === "VERIFIED") {
        log(`✅ Login successful!`, "success");
        return { success: true, verified: true };
      } else if (response.data.data.isSocialExists === "INITIAL") {
        log(`⚠️  Account needs registration`, "wait");
        return { success: true, verified: false, userId, accessToken };
      }
    } else {
      log(`❌ Login failed: ${response.data.message}`, "error");
      return { success: false };
    }
  } catch (error) {
    log(`❌ Login error: ${error.message}`, "error");
    return { success: false };
  }
}

async function registerAccount(userId, address, socialHandle, referralCode, accessToken, proxyUrl) {
  try {
    const registerUrl = `${API_BASE_URL}/auth/register`;
    const checksummedAddress = getAddress(address);
    const payload = {
      "userId": userId,
      "walletAddress": checksummedAddress,
      "socialHandle": socialHandle,
      "referralCode": referralCode || ""
    };
    const headers = {
      "Cookie": `access_token=${accessToken}`,
      "Content-Type": "application/json"
    };
    const response = await makeApiRequest("post", registerUrl, payload, proxyUrl, headers);
    if (response.data.success) {
      log(`✅ Registration successful! Social: ${socialHandle}`, "success");
      return true;
    } else {
      log(`❌ Registration failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    log(`❌ Registration error: ${error.message}`, "error");
    return false;
  }
}

async function getBalance(userId, address, proxyUrl) {
  try {
    const balanceUrl = `${API_BASE_URL}/transaction/get-balance/${userId}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };
    const response = await makeApiRequest("get", balanceUrl, null, proxyUrl, headers);
    if (response.data.success) {
      return response.data.data.balance;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    log(`Failed to get balance: ${error.message}`, "error");
    return 0;
  }
}

async function claimFaucet(address, proxyUrl) {
  const userId = accountTokens[address]?.userId;
  if (!userId) {
    log(`❌ No userId available for faucet claim`, "error");
    return null;
  }

  log(`🎁 Claiming faucet...`, "wait");

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const faucetUrl = `${API_BASE_URL}/transaction/fund-wallet/${userId}`;
      const headers = {
        "Cookie": `access_token=${accountTokens[address].accessToken}`
      };
      const response = await makeApiRequest("get", faucetUrl, null, proxyUrl, headers);
      
      if (response.data.success) {
        log(`✅ Faucet claimed! Funded: ${response.data.data.fundedAmount} DIAM`, "success");
        const balance = await getBalance(userId, address, proxyUrl);
        log(`💰 Current balance: ${balance.toFixed(4)} DIAM`, "success");
        return { success: true, balance };
      } else {
        if (response.data.message.includes("once per day")) {
          log(`⚠️  Already claimed today`, "wait");
          const balance = await getBalance(userId, address, proxyUrl);
          log(`💰 Current balance: ${balance.toFixed(4)} DIAM`, "info");
          return { success: false, alreadyClaimed: true, balance };
        }
        if (response.data.message.includes("network guardians") || response.data.message.includes("Something went wrong")) {
          log(`⚠️  Rate limited, waiting longer... (${response.data.message})`, "wait");
          if (attempt < 5) {
            const waitTime = 10000 + (attempt * 5000); // 10s, 15s, 20s, 25s
            log(`⏳ Waiting ${waitTime/1000} seconds before retry...`, "wait");
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        log(`❌ Attempt ${attempt}/5 failed: ${response.data.message}`, "error");
      }
    } catch (error) {
      log(`❌ Attempt ${attempt}/5 error: ${error.message}`, "error");
    }
    
    if (attempt < 5) {
      log(`⏳ Retrying in 5 seconds...`, "wait");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  log(`❌ Failed to claim faucet after 5 attempts`, "error");
  return { success: false };
}

async function sendDiam(fromAddress, toAddress, amount, proxyUrl) {
  const userId = accountTokens[fromAddress]?.userId;
  if (!userId) {
    log(`❌ No userId for send DIAM`, "error");
    return false;
  }

  try {
    const sendUrl = `${API_BASE_URL}/transaction/transfer`;
    const payload = {
      "toAddress": getAddress(toAddress),
      "amount": amount,
      "userId": userId
    };
    const headers = {
      "Cookie": `access_token=${accountTokens[fromAddress].accessToken}`,
      "Content-Type": "application/json"
    };
    const response = await makeApiRequest("post", sendUrl, payload, proxyUrl, headers);
    if (response.data.success) {
      log(`✅ Sent ${amount} DIAM to ${getShortAddress(toAddress)}`, "success");
      return true;
    } else {
      log(`❌ Send failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    log(`❌ Send DIAM error: ${error.message}`, "error");
    return false;
  }
}

async function createNewAccount(proxyUrl, referralCode = "") {
  const wallet = Wallet.createRandom();
  const address = getAddress(wallet.address);
  const privateKey = wallet.privateKey;
  
  // Generate random username without faker
  const randomUsername = () => {
    const adjectives = ['cool', 'fast', 'smart', 'brave', 'quick', 'wild', 'bright', 'dark'];
    const nouns = ['tiger', 'eagle', 'wolf', 'fox', 'hawk', 'bear', 'lion', 'dragon'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9999);
    return `${adj}_${noun}${num}`;
  };
  
  const socialHandle = xAccounts.length > 0 
    ? xAccounts[Math.floor(Math.random() * xAccounts.length)]
    : randomUsername();

  log(`🆕 Creating new account...`, "info");
  log(`📍 Address: ${getShortAddress(address)}`, "info");
  log(`🐦 X Account: ${socialHandle}`, "info");

  const loginResult = await loginAccount(address, proxyUrl);
  
  if (loginResult.success && !loginResult.verified) {
    const registerSuccess = await registerAccount(
      loginResult.userId,
      address,
      socialHandle,
      referralCode,
      loginResult.accessToken,
      proxyUrl
    );

    if (registerSuccess) {
      walletData[address.toLowerCase()] = {
        privateKey,
        socialHandle,
        createdAt: new Date().toISOString()
      };
      saveWalletData();
      appendAddress(address);
      return { success: true, address };
    }
  }

  return { success: false };
}

async function countdown(seconds, message) {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r${message} ${i} seconds...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  process.stdout.write(`\r${' '.repeat(60)}\r`); // Clear line
}
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

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(8) + "\x1b[1m\x1b[33mDIAM AUTO REGISTER & CLAIM FAUCET\x1b[0m" + " ".repeat(12) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
  console.log();

  loadAccountData();
  loadWalletData();
  loadAddresses();
  loadProxies();
  loadXAccounts();
  loadMainWallet();

  console.log("\n\x1b[1m\x1b[33mSelect Mode:\x1b[0m");
  console.log("1. Create New Accounts");
  console.log("2. Claim Faucet (Existing Accounts)");
  console.log("3. Send All to Main Wallet");
  console.log("4. Full Auto (Create → Claim → Send)");
  
  const mode = await promptUser("\nEnter mode (1-4): ");

  if (mode === "1") {
    const count = parseInt(await promptUser("How many accounts to create? "));
    const referralCode = await promptUser("Referral code (optional, press enter to skip): ");

    console.log("\n\x1b[36m" + "─".repeat(60) + "\x1b[0m\n");

    for (let i = 0; i < count; i++) {
      console.log(`\x1b[1m\x1b[35m┌─ Creating Account ${i + 1}/${count} ${"─".repeat(30)}\x1b[0m`);
      const proxyUrl = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : null;
      
      const result = await createNewAccount(proxyUrl, referralCode);
      if (result.success) {
        log(`✅ Account created successfully!`, "success");
      } else {
        log(`❌ Failed to create account`, "error");
      }

      console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);

      if (i < count - 1) {
        log(`⏳ Waiting 10 seconds before next account...\n`, "wait");
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  } else if (mode === "2") {
    if (addresses.length === 0) {
      log("❌ No addresses found in users.txt", "error");
      return;
    }

    console.log("\n\x1b[36m" + "─".repeat(60) + "\x1b[0m\n");

    let successCount = 0;
    let alreadyClaimed = 0;
    let failCount = 0;

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const proxyUrl = proxies[i % proxies.length] || null;

      console.log(`\x1b[1m\x1b[35m┌─ Account ${i + 1}/${addresses.length} ${"─".repeat(40)}\x1b[0m`);
      log(`📍 Address: ${getShortAddress(address)}`, "info");
      if (proxyUrl) log(`🔌 Proxy: ${proxyUrl.substring(0, 35)}...`, "info");

      log(`🔐 Logging in...`);
      const loginResult = await loginAccount(address, proxyUrl);

      if (loginResult.success && loginResult.verified) {
        log(`⏳ Waiting 60 seconds before claiming faucet...`, "wait");
        await countdown(60, "⏱️  Countdown:");
        
        const claimResult = await claimFaucet(address, proxyUrl);
        
        if (claimResult.success) {
          successCount++;
        } else if (claimResult.alreadyClaimed) {
          alreadyClaimed++;
        } else {
          failCount++;
        }
      } else {
        log(`⏭️  Skipping claim due to login failure`, "wait");
        failCount++;
      }

      console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);

      if (i < addresses.length - 1) {
        log(`⏳ Waiting 60 seconds before next account...\n`, "wait");
        await countdown(60, "⏱️  Countdown:");
      }
    }

    console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
    console.log("\x1b[36m║\x1b[0m" + " ".repeat(18) + "\x1b[1m\x1b[32mSUMMARY REPORT\x1b[0m" + " ".repeat(23) + "\x1b[36m║\x1b[0m");
    console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m✓ Successfully Claimed:\x1b[0m ${successCount.toString().padEnd(25)} \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[33m⊙ Already Claimed Today:\x1b[0m ${alreadyClaimed.toString().padEnd(24)} \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[31m✗ Failed:\x1b[0m ${failCount.toString().padEnd(42)} \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[36m━ Total Processed:\x1b[0m ${addresses.length.toString().padEnd(33)} \x1b[36m║\x1b[0m`);
    console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
  } else if (mode === "3") {
    if (!mainWallet) {
      log("❌ Main wallet not configured in main_wallet.txt", "error");
      return;
    }

    if (addresses.length === 0) {
      log("❌ No addresses found in users.txt", "error");
      return;
    }

    console.log("\n\x1b[36m" + "─".repeat(60) + "\x1b[0m\n");
    log(`💼 Main Wallet: ${getShortAddress(mainWallet)}`, "info");
    console.log();

    let totalSent = 0;
    let successCount = 0;

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      if (address.toLowerCase() === mainWallet.toLowerCase()) {
        log(`⏭️  Skipping main wallet itself`, "wait");
        continue;
      }

      const proxyUrl = proxies[i % proxies.length] || null;

      console.log(`\x1b[1m\x1b[35m┌─ Account ${i + 1}/${addresses.length} ${"─".repeat(40)}\x1b[0m`);
      log(`📍 Address: ${getShortAddress(address)}`, "info");

      const loginResult = await loginAccount(address, proxyUrl);

      if (loginResult.success && loginResult.verified) {
        const balance = await getBalance(accountTokens[address].userId, address, proxyUrl);
        log(`💰 Balance: ${balance.toFixed(4)} DIAM`, "info");

        if (balance > 0.1) {
          const amountToSend = balance - 0.05;
          log(`⏳ Waiting 60 seconds before sending...`, "wait");
          await countdown(60, "⏱️  Countdown:");
          
          log(`📤 Sending ${amountToSend.toFixed(4)} DIAM to main wallet...`, "wait");
          
          const sendSuccess = await sendDiam(address, mainWallet, amountToSend, proxyUrl);
          if (sendSuccess) {
            totalSent += amountToSend;
            successCount++;
          }
        } else {
          log(`⚠️  Balance too low to send (< 0.1 DIAM)`, "wait");
        }
      }

      console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);

      if (i < addresses.length - 1) {
        log(`⏳ Waiting 60 seconds before next account...\n`, "wait");
        await countdown(60, "⏱️  Countdown:");
      }
    }

    console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
    console.log("\x1b[36m║\x1b[0m" + " ".repeat(18) + "\x1b[1m\x1b[32mSEND SUMMARY\x1b[0m" + " ".repeat(25) + "\x1b[36m║\x1b[0m");
    console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m✓ Successful Sends:\x1b[0m ${successCount.toString().padEnd(28)} \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[33m💰 Total Sent:\x1b[0m ${totalSent.toFixed(4).padEnd(35)} DIAM \x1b[36m║\x1b[0m`);
    console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
  } else if (mode === "4") {
    const count = parseInt(await promptUser("How many accounts to create? "));
    const referralCode = await promptUser("Referral code (optional): ");

    if (!mainWallet) {
      log("❌ Main wallet not configured in main_wallet.txt", "error");
      return;
    }

    console.log("\n\x1b[36m" + "═".repeat(60) + "\x1b[0m");
    log("🚀 Starting FULL AUTO mode...", "info");
    console.log("\x1b[36m" + "═".repeat(60) + "\x1b[0m\n");

    // Step 1: Create accounts
    log("📝 STEP 1: Creating accounts...", "info");
    for (let i = 0; i < count; i++) {
      console.log(`\x1b[1m\x1b[35m┌─ Creating ${i + 1}/${count} ${"─".repeat(35)}\x1b[0m`);
      const proxyUrl = proxies.length > 0 ? proxies[Math.floor(Math.random() * proxies.length)] : null;
      await createNewAccount(proxyUrl, referralCode);
      console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
      if (i < count - 1) await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Step 2: Claim faucets
    log("\n🎁 STEP 2: Claiming faucets...", "info");
    loadAddresses();
    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      const proxyUrl = proxies[i % proxies.length] || null;
      console.log(`\x1b[1m\x1b[35m┌─ Claiming ${i + 1}/${addresses.length} ${"─".repeat(35)}\x1b[0m`);
      log(`📍 ${getShortAddress(address)}`, "info");
      const loginResult = await loginAccount(address, proxyUrl);
      if (loginResult.success && loginResult.verified) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await claimFaucet(address, proxyUrl);
      }
      console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
      if (i < addresses.length - 1) await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Step 3: Send to main wallet
    log("\n💸 STEP 3: Sending all to main wallet...", "info");
    let totalSent = 0;
    let sendSuccessCount = 0;

    for (let i = 0; i < addresses.length; i++) {
      const address = addresses[i];
      if (address.toLowerCase() === mainWallet.toLowerCase()) {
        log(`⏭️  Skipping main wallet itself`, "wait");
        continue;
      }

      const proxyUrl = proxies[i % proxies.length] || null;
      console.log(`\x1b[1m\x1b[35m┌─ Sending ${i + 1}/${addresses.length} ${"─".repeat(35)}\x1b[0m`);
      log(`📍 ${getShortAddress(address)}`, "info");

      const loginResult = await loginAccount(address, proxyUrl);
      if (loginResult.success && loginResult.verified) {
        const balance = await getBalance(accountTokens[address].userId, address, proxyUrl);
        log(`💰 Balance: ${balance.toFixed(4)} DIAM`, "info");

        if (balance > 0.1) {
          const amountToSend = balance - 0.05;
          log(`📤 Sending ${amountToSend.toFixed(4)} DIAM...`, "wait");
          
          const sendSuccess = await sendDiam(address, mainWallet, amountToSend, proxyUrl);
          if (sendSuccess) {
            totalSent += amountToSend;
            sendSuccessCount++;
          }
        } else {
          log(`⚠️  Balance too low (< 0.1 DIAM)`, "wait");
        }
      }

      console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);
      if (i < addresses.length - 1) await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Final summary
    console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
    console.log("\x1b[36m║\x1b[0m" + " ".repeat(15) + "\x1b[1m\x1b[32mFULL AUTO SUMMARY\x1b[0m" + " ".repeat(22) + "\x1b[36m║\x1b[0m");
    console.log("\x1b[36m╠" + "═".repeat(58) + "╣\x1b[0m");
    console.log(`\x1b[36m║\x1b[0m  \x1b[33m📝 Accounts Created:\x1b[0m ${count.toString().padEnd(28)} \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[32m✓ Successful Sends:\x1b[0m ${sendSuccessCount.toString().padEnd(28)} \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[33m💰 Total Sent to Main:\x1b[0m ${totalSent.toFixed(4).padEnd(25)} DIAM \x1b[36m║\x1b[0m`);
    console.log(`\x1b[36m║\x1b[0m  \x1b[36m💼 Main Wallet:\x1b[0m ${getShortAddress(mainWallet).padEnd(32)} \x1b[36m║\x1b[0m`);
    console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
  } else {
    log("❌ Invalid mode selected!", "error");
  }

  console.log();
  log("🎉 All operations completed!", "success");
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, "error");
  console.error(error);
  process.exit(1);
});
