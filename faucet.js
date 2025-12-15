import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { getAddress } from "ethers";
import fs from "fs";

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const ACCOUNT_DATA_FILE = "account_data.json";
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
let accountTokens = {};
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

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      const data = fs.readFileSync(ACCOUNT_DATA_FILE, "utf8");
      accountData = JSON.parse(data);
      log(`Loaded account data from ${ACCOUNT_DATA_FILE}`, "success");
    } else {
      accountData = {};
      log("No account data file found, starting with empty data.", "info");
    }
  } catch (error) {
    log(`Failed to load account data: ${error.message}`, "error");
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accountData, null, 2));
    log("Account data saved successfully.", "success");
  } catch (error) {
    log(`Failed to save account data: ${error.message}`, "error");
  }
}

function loadAddresses() {
  try {
    const data = fs.readFileSync("user.txt", "utf8");
    addresses = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
    addresses = addresses.map(addr => {
      try {
        return getAddress(addr);
      } catch (error) {
        log(`Invalid address format: ${addr} - Skipping.`, "error");
        return null;
      }
    }).filter(Boolean);

    if (addresses.length === 0) throw new Error("No valid address in user.txt");
    log(`Loaded ${addresses.length} addresses from user.txt`, "success");
  } catch (error) {
    log(`Failed to load addresses: ${error.message}`, "error");
    addresses = [];
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    if (proxies.length === 0) throw new Error("No proxies found in proxy.txt");
    log(`Loaded ${proxies.length} proxies from proxy.txt`, "success");
  } catch (error) {
    log(`No proxy.txt found or failed to load, running without proxies`, "wait");
    proxies = [];
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
      let errorMessage = `Attempt ${attempt}/${maxRetries} failed`;
      if (error.response) {
        errorMessage += `: HTTP ${error.response.status}`;
      } else if (error.request) {
        errorMessage += `: No response`;
      } else {
        errorMessage += `: ${error.message}`;
      }
      log(errorMessage, "error");
      if (attempt < maxRetries) {
        log(`Retrying in 2 seconds...`, "wait");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError.message}`);
}

async function loginAccount(address, proxyUrl) {
  try {
    const loginUrl = `${API_BASE_URL}/user/connect-wallet`;
    const checksummedAddress = getAddress(address);
    log(`🔐 Logging in...`);

    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(24).substr(2, 5).toUpperCase()}`;
      log(`🆕 Generated new deviceId: ${deviceId}`, "info");
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
        return false;
      }

      accountTokens[checksummedAddress] = { userId, accessToken };

      if (!accountData[checksummedAddress.toLowerCase()]) {
        accountData[checksummedAddress.toLowerCase()] = deviceId;
        saveAccountData();
      }

      if (response.data.data.isSocialExists === "VERIFIED") {
        log(`✅ Login successful!`, "success");
        return true;
      } else {
        log(`⚠️  Account not registered yet`, "wait");
        return false;
      }
    } else {
      log(`❌ Login failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    log(`❌ Login error: ${error.message}`, "error");
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
        return true;
      } else {
        if (response.data.message.includes("once per day")) {
          log(`⚠️  Already claimed today`, "wait");
          const balance = await getBalance(userId, address, proxyUrl);
          log(`💰 Current balance: ${balance.toFixed(4)} DIAM`, "info");
          return false;
        }
        log(`❌ Attempt ${attempt}/5 failed: ${response.data.message}`, "error");
      }
    } catch (error) {
      log(`❌ Attempt ${attempt}/5 error: ${error.message}`, "error");
    }
    
    if (attempt < 5) {
      log(`⏳ Retrying in 3 seconds...`, "wait");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  
  log(`❌ Failed to claim faucet after 5 attempts`, "error");
  return null;
}

async function main() {
  console.clear();
  console.log("\x1b[36m╔" + "═".repeat(58) + "╗\x1b[0m");
  console.log("\x1b[36m║\x1b[0m" + " ".repeat(12) + "\x1b[1m\x1b[33mDIAM TESTNET FAUCET CLAIMER\x1b[0m" + " ".repeat(18) + "\x1b[36m║\x1b[0m");
  console.log("\x1b[36m╚" + "═".repeat(58) + "╝\x1b[0m");
  console.log();
  
  loadAccountData();
  loadAddresses();
  loadProxies();

  if (addresses.length === 0) {
    log("❌ No addresses found in user.txt", "error");
    return;
  }

  log(`📋 Total Accounts: ${addresses.length}`, "info");
  log(`🔗 Total Proxies: ${proxies.length || 0}`, "info");
  console.log("\x1b[36m" + "─".repeat(60) + "\x1b[0m\n");

  let successCount = 0;
  let failCount = 0;
  let alreadyClaimed = 0;

  for (let i = 0; i < addresses.length; i++) {
    const address = addresses[i];
    const proxyUrl = proxies[i % proxies.length] || null;

    console.log(`\x1b[1m\x1b[35m┌─ Account ${i + 1}/${addresses.length} ${"─".repeat(40)}\x1b[0m`);
    log(`📍 Address: ${getShortAddress(address)}`, "info");
    if (proxyUrl) log(`🔌 Proxy: ${proxyUrl.substring(0, 35)}...`, "info");

    const loginSuccess = await loginAccount(address, proxyUrl);
    
    if (loginSuccess) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const claimResult = await claimFaucet(address, proxyUrl);
      if (claimResult === true) {
        successCount++;
      } else if (claimResult === false) {
        alreadyClaimed++;
      } else {
        failCount++;
      }
    } else {
      log(`⏭️  Skipping faucet claim due to login failure`, "wait");
      failCount++;
    }

    console.log(`\x1b[1m\x1b[35m└${"─".repeat(59)}\x1b[0m\n`);

    if (i < addresses.length - 1) {
      log(`⏳ Waiting 5 seconds before next account...\n`, "wait");
      await new Promise(resolve => setTimeout(resolve, 5000));
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
  console.log();
  log("🎉 All accounts processed!", "success");
}

main().catch(error => {
  log(`Fatal error: ${error.message}`, "error");
  process.exit(1);
});
