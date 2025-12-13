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
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
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
// part 1

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf8");
      const config = JSON.parse(data);
      dailyActivityConfig.sendDiamRepetitions =
        Number(config.sendDiamRepetitions) || 1;
      dailyActivityConfig.minSendAmount =
        Number(config.minSendAmount) || 0.01;
      dailyActivityConfig.maxSendAmount =
        Number(config.maxSendAmount) || 0.02;
      addLog("Loaded Config Successfully", "success");
    } else {
      addLog("No config file found, using default settings.", "info");
    }
  } catch (error) {
    addLog(
      `Failed to load config: ${error.message}, using default settings.`,
      "error"
    );
  }
}

function saveConfig() {
  try {
    fs.writeFileSync(
      CONFIG_FILE,
      JSON.stringify(dailyActivityConfig, null, 2)
    );
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
      addLog(
        "No account data file found, starting with empty data.",
        "info"
      );
    }
  } catch (error) {
    addLog(
      `Failed to load account data: ${error.message}, starting with empty data.`,
      "error"
    );
    accountData = {};
  }
}

function saveAccountData() {
  try {
    fs.writeFileSync(
      ACCOUNT_DATA_FILE,
      JSON.stringify(accountData, null, 2)
    );
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
      addLog(
        "No referral data file found, starting with empty data.",
        "info"
      );
    }
  } catch (error) {
    addLog(
      `Failed to load referral data: ${error.message}, starting with empty data.`,
      "error"
    );
    reffData = [];
  }
}

function saveReffData() {
  try {
    fs.writeFileSync(
      REFF_DATA_FILE,
      JSON.stringify(reffData, null, 2)
    );
    addLog("Referral data saved successfully.", "success");
  } catch (error) {
    addLog(`Failed to save referral data: ${error.message}`, "error");
  }
        }
// part 2

process.on("unhandledRejection", (reason, promise) => {
  addLog(`Unhandled Rejection at: ${promise}, reason: ${reason}`, "error");
});

process.on("uncaughtException", (error) => {
  addLog(`Uncaught Exception: ${error.message}\n${error.stack}`, "error");
  process.exit(1);
});

function getShortAddress(address) {
  return address
    ? address.slice(0, 6) + "..." + address.slice(-4)
    : "N/A";
}

function addLog(message, type = "info") {
  if (type === "debug" && !isDebug) return;
  const timestamp = new Date().toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
  });

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

  transactionLogs.push(
    `{bright-cyan-fg}[{/bright-cyan-fg} {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} {bright-cyan-fg}]{/bright-cyan-fg} {bold}${coloredMessage}{/bold}`
  );
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
// part 3

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
      const timeout = setTimeout(resolve, ms);
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
    addresses = data
      .split("\n")
      .map(a => a.trim())
      .filter(a => /^0x[0-9a-fA-F]{40}$/.test(a))
      .map(a => getAddress(a));

    if (addresses.length === 0) throw new Error("No valid address in user.txt");
    addLog(`Loaded ${addresses.length} address from user.txt`, "success");
  } catch (error) {
    addLog(`Failed to load addresses: ${error.message}`, "error");
    addresses = [];
  }
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxy.txt", "utf8");
    proxies = data.split("\n").map(p => p.trim()).filter(Boolean);
    addLog(`Loaded ${proxies.length} proxies`, "success");
  } catch {
    proxies = [];
    addLog("No proxy.txt found, running without proxy", "info");
  }
}

function loadRecipientAddresses() {
  try {
    const data = fs.readFileSync("wallet.txt", "utf8");
    const list = data
      .split("\n")
      .map(a => a.trim())
      .filter(a => /^0x[0-9a-fA-F]{40}$/.test(a))
      .map(a => getAddress(a));

    if (list.length === 0) throw new Error("wallet.txt empty");
    addLog(`Loaded ${list.length} recipient addresses from wallet.txt`, "success");
    return list;
  } catch (error) {
    addLog(`Recipient load skipped: ${error.message}`, "warn");
    return [];
  }
}

function createAgent(proxyUrl) {
  if (!proxyUrl) return null;
  return proxyUrl.startsWith("socks")
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);
      }
//part 4

async function makeApiRequest(
  method,
  url,
  data,
  proxyUrl,
  customHeaders = {},
  maxRetries = 3,
  retryDelay = 2000
) {
  let lastError;
  activeProcesses++;

  try {
    for (let i = 1; i <= maxRetries && !shouldStop; i++) {
      try {
        const agent = proxyUrl ? createAgent(proxyUrl) : null;
        const res = await axios({
          method,
          url,
          data,
          headers: { ...CONFIG_DEFAULT_HEADERS, ...customHeaders },
          ...(agent ? { httpsAgent: agent } : {}),
          timeout: 10000,
          withCredentials: true
        });
        return res;
      } catch (err) {
        lastError = err;
        addLog(`API error (${i}/${maxRetries}): ${err.message}`, "error");
        if (i < maxRetries) await sleep(retryDelay);
      }
    }
    throw lastError;
  } finally {
    activeProcesses = Math.max(0, activeProcesses - 1);
  }
}

async function getBalance(userId, address) {
  try {
    const res = await makeApiRequest(
      "get",
      `${API_BASE_URL}/transaction/get-balance/${userId}`,
      null,
      null,
      { Cookie: `access_token=${accountTokens[address].accessToken}` }
    );
    return res.data.data.balance || 0;
  } catch {
    return 0;
  }
}
//part 5

async function loginAccount(address, proxyUrl) {
  try {
    const payload = {
      address,
      deviceId: accountData[address] || `DEV${Math.random().toString(36).slice(2,8)}`,
      deviceSource: "web_app",
      deviceType: "Windows",
      browser: "Chrome"
    };

    const res = await makeApiRequest(
      "post",
      `${API_BASE_URL}/user/connect-wallet`,
      payload,
      proxyUrl
    );

    const cookies = res.headers["set-cookie"]?.[0];
    const token = cookies?.match(/access_token=([^;]+)/)?.[1];

    if (!token) throw new Error("No access token");

    accountTokens[address] = {
      userId: res.data.data.userId,
      accessToken: token
    };

    accountData[address] = payload.deviceId;
    saveAccountData();

    addLog(`Login success: ${getShortAddress(address)}`, "success");
    return true;
  } catch (err) {
    addLog(`Login failed: ${err.message}`, "error");
    return false;
  }
}

async function claimFaucet(address, proxyUrl, index) {
  try {
    const userId = accountTokens[address].userId;
    await makeApiRequest(
      "get",
      `${API_BASE_URL}/transaction/fund-wallet/${userId}`,
      null,
      proxyUrl,
      { Cookie: `access_token=${accountTokens[address].accessToken}` }
    );
    addLog(`Account ${index+1}: Faucet claimed`, "success");
  } catch (err) {
    addLog(`Faucet skipped: ${err.message}`, "wait");
  }
}

async function sendDiam(address, proxyUrl, to, amount) {
  try {
    await makeApiRequest(
      "post",
      `${API_BASE_URL}/transaction/transfer`,
      { toAddress: to, amount, userId: accountTokens[address].userId },
      proxyUrl,
      {
        Cookie: `access_token=${accountTokens[address].accessToken}`,
        "Content-Type": "application/json"
      }
    );
    addLog(`Sent ${amount} DIAM → ${getShortAddress(to)}`, "success");
    return true;
  } catch (err) {
    addLog(`Send failed: ${err.message}`, "error");
    return false;
  }
}
//part 6

async function runDailyActivity() {
  if (!addresses.length) return addLog("No addresses loaded", "error");

  isCycleRunning = true;
  activityRunning = true;

  for (let i = 0; i < addresses.length && !shouldStop; i++) {
    const address = addresses[i];
    const proxy = proxies[i % proxies.length] || null;

    addLog(`Processing account ${i+1}: ${getShortAddress(address)}`, "info");

    if (!(await loginAccount(address, proxy))) continue;
    await sleep(8000);
    await claimFaucet(address, proxy, i);
    await sleep(8000);

    if (recipientAddresses.length) {
      const to = recipientAddresses[Math.floor(Math.random()*recipientAddresses.length)];
      const amount = +(Math.random()*(0.02-0.01)+0.01).toFixed(4);
      await sendDiam(address, proxy, to, amount);
    }
  }

  addLog("All accounts processed. Waiting 24h.", "success");
  activityRunning = false;
  isCycleRunning = true;

  setTimeout(runDailyActivity, 24 * 60 * 60 * 1000);
}
//part 7

const screen = blessed.screen({ smartCSR: true });
const logBox = blessed.log({ parent: screen, top: 0, left: 0, width: "100%", height: "100%", scrollable: true });

function updateLogs() {
  logBox.setContent(transactionLogs.join("\n"));
  logBox.setScrollPerc(100);
  screen.render();
}

screen.key(["q", "C-c"], () => process.exit(0));

loadConfig();
loadAccountData();
loadReffData();
loadAddresses();
loadProxies();
recipientAddresses = loadRecipientAddresses();

addLog("Bot initialized. Ready.", "success");
screen.render();
//part 8
