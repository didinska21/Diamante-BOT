import blessed from "blessed";
import figlet from "figlet";
import fs from "fs";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { Wallet, getAddress } from "ethers";
import { faker } from "@faker-js/faker";

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CONFIG_FILE = "config.json";
const ACCOUNT_DATA_FILE = "account_data.json";
const REFF_DATA_FILE = "reff_data.json";
const isDebug = false;
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

let walletInfo = {
  address: "N/A",
  balanceDIAM: "0.00",
  activeAccount: "N/A",
  cycleCount: 0,
  nextCycle: "N/A"
};
let transactionLogs = [];
let activityRunning = false;
let isCycleRunning = false;
let shouldStop = false;
let dailyActivityInterval = null;
let addresses = [];
let proxies = [];
let recipientAddresses = [];
let selectedWalletIndex = 0;
let loadingSpinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const borderBlinkColors = ["cyan", "blue", "magenta", "red", "yellow", "green"];
let borderBlinkIndex = 0;
let blinkCounter = 0;
let spinnerIndex = 0;
let hasLoggedSleepInterrupt = false;
let accountTokens = {};
let isHeaderRendered = false;
let activeProcesses = 0;
let accountData = {};
let reffData = []; 

let dailyActivityConfig = {
  sendDiamRepetitions: 1,
  minSendAmount: 0.01,
  maxSendAmount: 0.02
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf8");
      const config = JSON.parse(data);
      dailyActivityConfig.sendDiamRepetitions = Number(config.sendDiamRepetitions) || 1;
      dailyActivityConfig.minSendAmount = Number(config.minSendAmount) || 0.01;
      dailyActivityConfig.maxSendAmount = Number(config.maxSendAmount) || 0.02;
      addLog(`Loaded Config Successfully`, "success");
    } else {
      addLog("No config file found, using default settings.", "info");
    }
  } catch (error) {
    addLog(`Failed to load config: ${error.message}, using default settings.`, "error");
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dailyActivityConfig, null, 2));
    addLog("Configuration saved successfully.", "success");
  } catch (error) {
    addLog(`Failed to save config: ${error.message}`, "error");
  }
}

function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      const data = fs.readFileSync(ACCOUNT_DATA_FILE, "utf8");
      accountData = JSON.parse(data);
      addLog(`Loaded account data from ${ACCOUNT_DATA_FILE}`, "success");
    } else {
      accountData = {};
      addLog("No account data file found, starting with empty data.", "info");
    }
  } catch (error) {
    addLog(`Failed to load account data: ${error.message}, starting with empty data.`, "error");
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accountData, null, 2));
    addLog("Account data saved successfully.", "success");
  } catch (error) {
    addLog(`Failed to save account data: ${error.message}`, "error");
  }
}

function loadReffData() {
  try {
    if (fs.existsSync(REFF_DATA_FILE)) {
      const data = fs.readFileSync(REFF_DATA_FILE, "utf8");
      reffData = JSON.parse(data);
      addLog(`Loaded referral data from ${REFF_DATA_FILE}`, "success");
    } else {
      reffData = [];
      addLog("No referral data file found, starting with empty data.", "info");
    }
  } catch (error) {
    addLog(`Failed to load referral data: ${error.message}, starting with empty data.`, "error");
    reffData = [];
  }
}

function saveReffData() {
  try {
    fs.writeFileSync(REFF_DATA_FILE, JSON.stringify(reffData, null, 2));
    addLog("Referral data saved successfully.", "success");
  } catch (error) {
    addLog(`Failed to save referral data: ${error.message}`, "error");
  }
}

process.on("unhandledRejection", (reason, promise) => {
  addLog(`Unhandled Rejection at: ${promise}, reason: ${reason}`, "error");
});

process.on("uncaughtException", (error) => {
  addLog(`Uncaught Exception: ${error.message}\n${error.stack}`, "error");
  process.exit(1);
});

function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

function addLog(message, type = "info") {
  if (type === "debug" && !isDebug) return;
  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  let coloredMessage;
  switch (type) {
    case "error":
      coloredMessage = `{red-fg}${message}{/red-fg}`;
      break;
    case "success":
      coloredMessage = `{green-fg}${message}{/green-fg}`;
      break;
    case "wait":
      coloredMessage = `{yellow-fg}${message}{/yellow-fg}`;
      break;
    case "debug":
      coloredMessage = `{blue-fg}${message}{/blue-fg}`;
      break;
    default:
      coloredMessage = message;
  }
  transactionLogs.push(`{bright-cyan-fg}[{/bright-cyan-fg} {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} {bright-cyan-fg}]{/bright-cyan-fg} {bold}${coloredMessage}{/bold}`);
  updateLogs();
}

function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

function clearTransactionLogs() {
  transactionLogs = [];
  addLog("Transaction logs cleared.", "success");
  updateLogs();
}

async function sleep(ms) {
  if (shouldStop) {
    if (!hasLoggedSleepInterrupt) {
      addLog("Process stopped successfully.", "info");
      hasLoggedSleepInterrupt = true;
    }
    return;
  }
  activeProcesses++;
  try {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);
      const checkStop = setInterval(() => {
        if (shouldStop) {
          clearTimeout(timeout);
          clearInterval(checkStop);
          if (!hasLoggedSleepInterrupt) {
            addLog("Process stopped successfully.", "info");
            hasLoggedSleepInterrupt = true;
          }
          resolve();
        }
      }, 100);
    });
  } finally {
    activeProcesses = Math.max(0, activeProcesses - 1);
  }
}

function loadAddresses() {
  try {
    const data = fs.readFileSync("user.txt", "utf8");
    addresses = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
    addresses = addresses.map(addr => {
      try {
        const checksummed = getAddress(addr);
        addLog(`Converted address ${getShortAddress(addr)} to checksum: ${getShortAddress(checksummed)}`, "debug");
        return checksummed;
      } catch (error) {
        addLog(`Invalid address format: ${addr} - Skipping. Error: ${error.message}`, "error");
        return null;
      }
    }).filter(Boolean);

    if (addresses.length === 0) throw new Error("No valid address in user.txt");
    addLog(`Loaded ${addresses.length} address from user.txt`, "success");
  } catch (error) {
    addLog(`Failed to load addresses: ${error.message}`, "error");
    addresses = [];
  }
}

function appendAddress(newAddress) {
  try {
    const checksummed = getAddress(newAddress);
    fs.appendFileSync("user.txt", `\n${checksummed}`);
    addLog(`Added new address ${getShortAddress(checksummed)} to user.txt`, "success");
    loadAddresses();
  } catch (error) {
    addLog(`Failed to append address: ${error.message}`, "error");
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data.split("\n").map(proxy => proxy.trim()).filter(proxy => proxy);
    if (proxies.length === 0) throw new Error("No proxies found in proxy.txt");
    addLog(`Loaded ${proxies.length} proxies from proxy.txt`, "success");
  } catch (error) {
    addLog(`No proxy.txt found or failed to load, running without proxies: ${error.message}`, "warn");
    proxies = [];
  }
}

function loadRecipientAddresses() {
  try {
    const data = fs.readFileSync("wallet.txt", "utf8");
    let recipients = data.split("\n").map(addr => addr.trim()).filter(addr => addr.match(/^0x[0-9a-fA-F]{40}$/));
    recipients = recipients.map(addr => {
      try {
        return getAddress(addr);
      } catch (error) {
        addLog(`Invalid recipient address: ${addr} - Skipping.`, "error");
        return null;
      }
    }).filter(Boolean);

    if (recipients.length === 0) throw new Error("No valid addresses in wallet.txt");
    addLog(`Loaded ${recipients.length} recipient addresses from wallet.txt`, "success");
    return recipients;
  } catch (error) {
    addLog(`No wallet.txt found or failed to load, skipping DIAM transfers: ${error.message}`, "warn");
    return [];
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

async function makeApiRequest(method, url, data, proxyUrl, customHeaders = {}, maxRetries = 3, retryDelay = 2000, useProxy = true) {
  activeProcesses++;
  let lastError = null;
  try {
    for (let attempt = 1; attempt <= maxRetries && !shouldStop; attempt++) {
      try {
        const agent = useProxy && proxyUrl ? createAgent(proxyUrl) : null;
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
        let errorMessage = `Attempt ${attempt}/${maxRetries} failed for API request to ${url}`;
        if (error.response) errorMessage += `: HTTP ${error.response.status} - ${JSON.stringify(error.response.data || error.response.statusText)}`;
        else if (error.request) errorMessage += `: No response received`;
        else errorMessage += `: ${error.message}`;
        addLog(errorMessage, "error");
        if (attempt < maxRetries) {
          addLog(`Retrying API request in ${retryDelay/1000} seconds...`, "wait");
          await sleep(retryDelay);
        }
      }
    }
    throw new Error(`Failed to make API request to ${url} after ${maxRetries} attempts: ${lastError.message}`);
  } finally {
    activeProcesses = Math.max(0, activeProcesses - 1);
  }
}

async function updateWalletData() {
  const walletDataPromises = addresses.map(async (address, i) => {
    try {
      const proxyUrl = proxies[i % proxies.length] || null;
      let formattedDIAM = "N/A";
      if (accountTokens[address] && accountTokens[address].userId) {
        const balanceResponse = await getBalance(accountTokens[address].userId, proxyUrl, address);
        formattedDIAM = balanceResponse.balance.toFixed(4);
      }
      const formattedEntry = `${i === selectedWalletIndex ? "→ " : "  "}${getShortAddress(address)}   ${formattedDIAM.padEnd(8)}`;
      if (i === selectedWalletIndex) {
        walletInfo.address = address;
        walletInfo.activeAccount = `Account ${i + 1}`;
        walletInfo.balanceDIAM = formattedDIAM;
      }
      return formattedEntry;
    } catch (error) {
      addLog(`Failed to fetch wallet data for account #${i + 1}: ${error.message}`, "error");
      return `${i === selectedWalletIndex ? "→ " : "  "}N/A 0.00`;
    }
  });
  const walletData = await Promise.all(walletDataPromises);
  addLog("Wallet data updated.", "info");
  return walletData;
}

async function loginAccount(address, proxyUrl, useProxy = true) {
  if (shouldStop) {
    addLog("Login stopped due to stop request.", "info");
    return false;
  }
  try {
    const loginUrl = `${API_BASE_URL}/user/connect-wallet`;
    const checksummedAddress = getAddress(address);
    addLog(`Logging in with address:${getShortAddress(address)}`, "debug");

    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(24).substr(2, 5).toUpperCase()}`;
      addLog(`Generated new deviceId for ${getShortAddress(checksummedAddress)}: ${deviceId}`, "info");
    } else {
      addLog(`Using existing deviceId for ${getShortAddress(checksummedAddress)}: ${deviceId}`, "info");
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
    const response = await makeApiRequest("post", loginUrl, payload, proxyUrl, {}, 3, 2000, useProxy);
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
        addLog(`Account ${getShortAddress(checksummedAddress)}: Failed to extract access_token from cookies.`, "error");
        return false;
      }
      accountTokens[checksummedAddress] = {
        userId,
        accessToken
      };
      if (!accountData[checksummedAddress.toLowerCase()]) {
        accountData[checksummedAddress.toLowerCase()] = deviceId;
        saveAccountData();
      }
      if (response.data.data.isSocialExists === "VERIFIED") {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Login Successfully`, "success");
        await updateWallets();
        return true;
      } else if (response.data.data.isSocialExists === "INITIAL") {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Not Registed Yet. Ready for registration.`, "info");
        return { initial: true, userId, accessToken };
      } else {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Unexpected state: ${response.data.data.isSocialExists}`, "error");
        return false;
      }
    } else {
      addLog(`Account ${getShortAddress(checksummedAddress)}: Login failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    addLog(`Account ${getShortAddress(address)}: Login error: ${error.message}`, "error");
    return false;
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
      "referralCode": referralCode
    };
    const headers = {
      "Cookie": `access_token=${accessToken}`,
      "Content-Type": "application/json"
    };
    const response = await makeApiRequest("post", registerUrl, payload, proxyUrl, headers);
    if (response.data.success) {
      addLog(`Account ${getShortAddress(checksummedAddress)}: Registration successful with referral ${referralCode}. Social: ${socialHandle}`, "success");
      return true;
    } else {
      addLog(`Account ${getShortAddress(checksummedAddress)}: Registration failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    addLog(`Account ${getShortAddress(address)}: Registration error: ${error.message}`, "error");
    return false;
  }
}

async function createReferralAccount(referralCode, proxyUrl = null) {
  const wallet = Wallet.createRandom();
  const address = getAddress(wallet.address);
  const privateKey = wallet.privateKey;
  const socialHandle = faker.internet.username();

  addLog(`Generating new account: Address ${getShortAddress(address)}, Social: ${socialHandle}`, "info");

  const loginResult = await loginAccount(address, proxyUrl);
  if (loginResult && loginResult.initial) {
    const { userId, accessToken } = loginResult;
    const registerSuccess = await registerAccount(userId, address, socialHandle, referralCode, accessToken, proxyUrl);
    if (registerSuccess) {
      appendAddress(address);
      reffData.push({
        address,
        privateKey,
        socialHandle,
        referralCode
      });
      saveReffData();
      return true;
    }
  }
  return false;
}

async function runCreateAutoReff(referralCode, count = 1, proxiesForReff = []) {
  addLog(`Starting auto referral with Reff-Code ${referralCode} for ${count} accounts.`, "info");
  let successCount = 0;
  for (let i = 0; i < count; i++) {
    const proxyUrl = proxiesForReff.length > 0 ? proxiesForReff[Math.floor(Math.random() * proxiesForReff.length)] : null;
    const success = await createReferralAccount(referralCode, proxyUrl);
    if (success) successCount++;
    if (i < count - 1) {
      const randomDelay = Math.floor(Math.random() * (20000 - 15000 + 1)) + 15000;
      addLog(`Waiting ${Math.floor(randomDelay / 1000)} seconds before next process...`, "wait");
      await sleep(randomDelay);
    }
  }
  addLog(`Completed auto referral: ${successCount}/${count} successful.`, "success");
  loadAddresses();
}

async function getBalance(userId, proxyUrl, address) {
  try {
    const balanceUrl = `${API_BASE_URL}/transaction/get-balance/${userId}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };
    const response = await makeApiRequest("get", balanceUrl, null, proxyUrl, headers);
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    addLog(`Failed to get balance: ${error.message}`, "error");
    return { balance: 0 };
  }
}

async function claimFaucetForAccount(address, proxyUrl, accountIndex) {
  addLog(`Processing Claiming Faucet for account ${accountIndex + 1}`, "warn");
  const userId = accountTokens[address]?.userId;
  if (!userId) {
    addLog(`Account ${accountIndex + 1}: No userId available for faucet claim.`, "error");
    return;
  }
  let maxRetries = 10;
  let retryDelay = 5000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const faucetUrl = `${API_BASE_URL}/transaction/fund-wallet/${userId}`;
      const headers = {
        "Cookie": `access_token=${accountTokens[address].accessToken}`
      };
      const response = await makeApiRequest("get", faucetUrl, null, proxyUrl, headers);
      if (response.data.success) {
        addLog(`Account ${accountIndex + 1}: DIAM faucet claimed successfully. Funded: ${response.data.data.fundedAmount}`, "success");
        await updateWallets();
        return;
      } else {
        if (response.data.message.includes("You can claim from the faucet once per day")) {
          addLog(`Account ${accountIndex + 1}: ${response.data.message}`, "wait");
          return;
        }
        addLog(`Account ${accountIndex + 1}: Faucet claim attempt ${attempt} failed: ${response.data.message}`, "error");
      }
    } catch (error) {
      addLog(`Account ${accountIndex + 1}: Faucet claim attempt ${attempt} error: ${error.message}`, "error");
    }
    if (attempt < maxRetries) {
      addLog(`Account ${accountIndex + 1}: Retrying faucet claim in ${retryDelay / 1000} seconds...`, "wait");
      await sleep(retryDelay);
    }
  }
  addLog(`Account ${accountIndex + 1}: Failed to claim faucet after ${maxRetries} attempts.`, "error");
}

async function getTweetContent(userId, proxyUrl, address) {
  try {
    const tweetUrl = `${API_BASE_URL}/transaction/tweet-content/${userId}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };
    const response = await makeApiRequest("get", tweetUrl, null, proxyUrl, headers);
    if (response.data.success) {
      addLog(`Tweet Content: ${response.data.data.content}`, "debug");
    } else {
      addLog(`Failed to get tweet content: ${response.data.message}`, "error");
    }
  } catch (error) {
    addLog(`Tweet content request error: ${error.message}`, "error");
  }
}

async function performSendDiam(address, proxyUrl, recipient, amount) {
  const userId = accountTokens[address]?.userId;
  if (!userId) {
    addLog(`No userId for send DIAM.`, "error");
    return false;
  }
  try {
    const sendUrl = `${API_BASE_URL}/transaction/transfer`;
    const payload = {
      "toAddress": getAddress(recipient),
      "amount": amount,
      "userId": userId
    };
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`,
      "Content-Type": "application/json"
    };
    const response = await makeApiRequest("post", sendUrl, payload, proxyUrl, headers);
    if (response.data.success) {
      addLog(`Sent ${amount} DIAM to ${getShortAddress(recipient)}. Hash: ${getShortHash(response.data.data.transferData.hash)}`, "success");
      await updateWallets();
      await getTweetContent(userId, proxyUrl, address);
      return true;
    } else {
      addLog(`Send failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    addLog(`Send DIAM failed: ${error.message}`, "error");
    return false;
  }
}

async function runDailyActivity() {
  if (addresses.length === 0) {
    addLog("No valid addresses found.", "error");
    return;
  }
  addLog(`Starting daily activity for all accounts. Auto Send DIAM: ${dailyActivityConfig.sendDiamRepetitions}`, "info");
  activityRunning = true;
  isCycleRunning = true;
  shouldStop = false;
  hasLoggedSleepInterrupt = false;
  activeProcesses = Math.max(0, activeProcesses);
  updateMenu();
  try {
    for (let accountIndex = 0; accountIndex < addresses.length && !shouldStop; accountIndex++) {
      addLog(`Starting processing for account ${accountIndex + 1}`, "info");
      selectedWalletIndex = accountIndex;
      const proxyUrl = proxies[accountIndex % proxies.length] || null;
      addLog(`Account ${accountIndex + 1}: Using Proxy ${proxyUrl || "none"}...`, "info");
      const address = addresses[accountIndex];
      addLog(`Processing account ${accountIndex + 1}: ${getShortAddress(address)}`, "info");
      const loginResult = await loginAccount(address, proxyUrl);
      if (typeof loginResult === 'object' && loginResult.initial) {
        addLog(`Account ${accountIndex + 1}: Skipping daily activity due to initial state.`, "error");
        continue;
      } else if (!loginResult) {
        addLog(`Account ${accountIndex + 1}: Skipping daily activity due to login failure.`, "error");
        continue;
      }

      if (!shouldStop) {
        const randomDelay = Math.floor(Math.random() * (12000 - 8000 + 1)) + 8000;
        addLog(`Account ${accountIndex + 1}: Waiting ${Math.floor(randomDelay / 1000)} seconds before faucet...`, "wait");
        await sleep(randomDelay);
      }

      if (!shouldStop) {
        await claimFaucetForAccount(address, proxyUrl, accountIndex);
      }

      if (!shouldStop) {
        const randomDelay = Math.floor(Math.random() * (12000 - 8000 + 1)) + 8000;
        addLog(`Account ${accountIndex + 1}: Waiting ${Math.floor(randomDelay / 1000)} seconds before next process...`, "wait");
        await sleep(randomDelay);
      }

      if (!shouldStop) {
        let successfulTransfers = 0;
        if (recipientAddresses.length > 0) {
          for (let i = 0; i < dailyActivityConfig.sendDiamRepetitions && !shouldStop; i++) {
            let recipient;
            do {
              recipient = recipientAddresses[Math.floor(Math.random() * recipientAddresses.length)];
            } while (recipient.toLowerCase() === address.toLowerCase());
            const amount = Math.random() * (dailyActivityConfig.maxSendAmount - dailyActivityConfig.minSendAmount) + dailyActivityConfig.minSendAmount;
            const amountFixed = Number(amount.toFixed(4));
            addLog(`Account ${accountIndex + 1}: Sending ${amountFixed} DIAM to ${getShortAddress(recipient)}...`, "info");
            const success = await performSendDiam(address, proxyUrl, recipient, amountFixed);
            if (success) successfulTransfers++;
            if (i < dailyActivityConfig.sendDiamRepetitions - 1 && !shouldStop) {
              const randomDelay = Math.floor(Math.random() * (30000 - 15000 + 1)) + 15000;
              addLog(`Account ${accountIndex + 1}: Waiting ${Math.floor(randomDelay / 1000)} seconds before next send...`, "wait");
              await sleep(randomDelay);
            }
          }
          addLog(`Account ${accountIndex + 1}: Completed ${successfulTransfers} successful DIAM transfers.`, "success");
        } else {
          addLog(`No recipient addresses loaded, skipping Auto Send DIAM for account ${accountIndex + 1}.`, "warn");
        }
      }

      if (accountIndex < addresses.length - 1 && !shouldStop) {
        addLog(`Waiting 60 seconds before next account...`, "wait");
        await sleep(60000);
      }
    }
    if (!shouldStop && activeProcesses <= 0) {
      addLog("All accounts processed. Waiting 24 hours for next cycle.", "success");
      dailyActivityInterval = setTimeout(runDailyActivity, 24 * 60 * 60 * 1000);
    }
  } catch (error) {
    addLog(`Daily activity failed: ${error.message}`, "error");
  } finally {
    if (shouldStop) {
      const stopCheckInterval = setInterval(() => {
        if (activeProcesses <= 0) {
          clearInterval(stopCheckInterval);
          activityRunning = false;
          isCycleRunning = false;
          shouldStop = false;
          hasLoggedSleepInterrupt = false;
          activeProcesses = 0;
          addLog(`Daily activity stopped successfully.`, "success");
          updateMenu();
          updateStatus();
          safeRender();
        } else {
          addLog(`Waiting for ${activeProcesses} process to complete...`, "info");
        }
      }, 1000);
    } else {
      activityRunning = false;
      isCycleRunning = activeProcesses > 0 || dailyActivityInterval !== null;
      updateMenu();
      updateStatus();
      safeRender();
    }
  }
}

/* ================= CLEAN UI ================= */

const screen = blessed.screen({
  smartCSR: true,
  title: "DIAM TESTNET AUTO BOT",
  fullUnicode: true,
  mouse: true
});

/* HEADER */
const headerBox = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  content: "{center}{bold}DIAM TESTNET AUTO BOT{/bold}{/center}"
});

/* STATUS */
const statusBox = blessed.box({
  top: 3,
  left: 0,
  width: "100%",
  height: 5,
  tags: true,
  content: "Status: Initializing..."
});

/* WALLET INFO */
const walletBox = blessed.box({
  top: 8,
  left: 0,
  width: "100%",
  height: 4,
  tags: true,
  content: ""
});

/* LOG */
const logBox = blessed.log({
  top: 12,
  left: 0,
  width: "100%",
  height: "100%-18",
  tags: true,
  scrollable: true,
  alwaysScroll: true
});

/* MENU */
const menuBox = blessed.list({
  bottom: 0,
  left: 0,
  width: "100%",
  height: 6,
  keys: true,
  mouse: true,
  style: {
    selected: {
      bg: "green",
      fg: "black"
    }
  },
  items: [
    "Start Auto Daily Activity",
    "Create Auto Reff",
    "Set Manual Config",
    "Refresh Wallet Info",
    "Clear Logs",
    "Exit"
  ]
});

/* APPEND */
screen.append(headerBox);
screen.append(statusBox);
screen.append(walletBox);
screen.append(logBox);
screen.append(menuBox);

// === SAFE RENDER (COMPAT WITH BASE LOGIC) ===
function safeRender() {
  try {
    screen.render();
  } catch (e) {}
}

/* ================= UI UPDATE OVERRIDE ================= */

function updateStatus() {
  const statusText =
    activityRunning
      ? "Running"
      : isCycleRunning
        ? "Waiting for next cycle"
        : "Idle";

  statusBox.setContent(
    `Status   : ${statusText}\n` +
    `Account  : ${getShortAddress(walletInfo.address)}\n` +
    `Balance  : ${walletInfo.balanceDIAM} DIAM\n` +
    `Accounts : ${addresses.length}`
  );
  screen.render();
}

async function updateWallets() {
  walletBox.setContent(
    `Active Account : ${getShortAddress(walletInfo.address)}\n` +
    `Balance        : ${walletInfo.balanceDIAM} DIAM`
  );
  screen.render();
}

function updateLogs() {
  logBox.setContent(transactionLogs.join("\n"));
  logBox.setScrollPerc(100);
  screen.render();
}

function updateMenu() {
  menuBox.setItems(
    isCycleRunning
      ? [
          "Stop Activity",
          "Create Auto Reff",
          "Set Manual Config",
          "Refresh Wallet Info",
          "Clear Logs",
          "Exit"
        ]
      : [
          "Start Auto Daily Activity",
          "Create Auto Reff",
          "Set Manual Config",
          "Refresh Wallet Info",
          "Clear Logs",
          "Exit"
        ]
  );
  screen.render();
}

/* ================= MENU HANDLER ================= */

menuBox.on("select", async item => {
  const action = item.getText();

  switch (action) {
    case "Start Auto Daily Activity":
      if (!isCycleRunning) await runDailyActivity();
      break;
    case "Stop Activity":
      shouldStop = true;
      break;
    case "Create Auto Reff":
      reffForm.show(); // logic lama tetap
      break;
    case "Set Manual Config":
      dailyActivitySubMenu.show();
      break;
    case "Refresh Wallet Info":
      loadAddresses();
      await updateWallets();
      addLog("Wallet refreshed", "success");
      break;
    case "Clear Logs":
      clearTransactionLogs();
      break;
    case "Exit":
      process.exit(0);
  }

  menuBox.focus();
});

/* EXIT KEYS */
screen.key(["escape", "q", "C-c"], () => {
  addLog("Exiting application", "info");
  process.exit(0);
});

menuBox.focus();
screen.render();
