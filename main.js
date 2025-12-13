import blessed from "blessed";
import fs from "fs";
import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import { Wallet, getAddress } from "ethers";
import { faker } from "@faker-js/faker";

/* ================= CONFIG ================= */

const API_BASE_URL = "https://campapi.diamante.io/api/v1";
const CONFIG_FILE = "config.json";
const ACCOUNT_DATA_FILE = "account_data.json";
const REFF_DATA_FILE = "reff_data.json";
const isDebug = false;

const CONFIG_DEFAULT_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Origin": "https://campaign.diamante.io",
  "Pragma": "no-cache",
  "Referer": "https://campaign.diamante.io/",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari"
};

/* ================= GLOBAL STATE ================= */

let transactionLogs = [];
let activityRunning = false;
let isCycleRunning = false;
let shouldStop = false;
let dailyActivityInterval = null;

let addresses = [];
let recipientAddresses = [];
let proxies = [];

let accountTokens = {};
let accountData = {};
let reffData = {};
let activeProcesses = 0;
let hasLoggedSleepInterrupt = false;

let dailyActivityConfig = {
  sendDiamRepetitions: 1,
  minSendAmount: 0.01,
  maxSendAmount: 0.02
};

/* ================= UTILS ================= */

function addLog(message, type = "info") {
  if (type === "debug" && !isDebug) return;
  const time = new Date().toLocaleTimeString("id-ID");
  transactionLogs.push(`[ ${time} ] ${message}`);
  updateLogs();
}

function clearTransactionLogs() {
  transactionLogs = [];
  addLog("Transaction logs cleared.");
}

function sleep(ms) {
  activeProcesses++;
  return new Promise(resolve => {
    const t = setTimeout(() => {
      activeProcesses--;
      resolve();
    }, ms);

    if (shouldStop) {
      clearTimeout(t);
      activeProcesses--;
      resolve();
    }
  });
}

function createAgent(proxy) {
  if (!proxy) return null;
  return proxy.startsWith("socks")
    ? new SocksProxyAgent(proxy)
    : new HttpsProxyAgent(proxy);
}

/* ================= FILE LOADERS ================= */

function loadAddresses() {
  try {
    const data = fs.readFileSync("user.txt", "utf8");
    addresses = data
      .split("\n")
      .map(v => v.trim())
      .filter(v => /^0x[a-fA-F0-9]{40}$/.test(v))
      .map(v => getAddress(v));

    addLog(`Loaded ${addresses.length} address from user.txt`);
  } catch {
    addresses = [];
    addLog("user.txt not found or empty");
  }
}

function loadRecipientAddresses() {
  try {
    const data = fs.readFileSync("wallet.txt", "utf8");
    const list = data
      .split("\n")
      .map(v => v.trim())
      .filter(v => /^0x[a-fA-F0-9]{40}$/.test(v))
      .map(v => getAddress(v));

    addLog(`Loaded ${list.length} recipient addresses from wallet.txt`);
    return list;
  } catch {
    addLog("wallet.txt not found or empty");
    return [];
  }
}

function loadProxies() {
  try {
    proxies = fs
      .readFileSync("proxy.txt", "utf8")
      .split("\n")
      .map(v => v.trim())
      .filter(Boolean);
  } catch {
    proxies = [];
  }
}

/* ================= API ================= */

async function makeApiRequest(method, url, data, proxy, headers = {}) {
  const agent = proxy ? createAgent(proxy) : null;
  return axios({
    method,
    url,
    data,
    headers: { ...CONFIG_DEFAULT_HEADERS, ...headers },
    ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
    timeout: 15000
  });
}

/* ================= LOGIN ================= */

async function loginAccount(address, proxy) {
  const deviceId =
    accountData[address.toLowerCase()] ||
    `DEV${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const res = await makeApiRequest(
    "post",
    `${API_BASE_URL}/user/connect-wallet`,
    { address, deviceId },
    proxy
  );

  if (!res.data?.success) return false;

  const cookie = res.headers["set-cookie"]?.[0] || "";
  const token = cookie.match(/access_token=([^;]+)/)?.[1];
  if (!token) return false;

  accountTokens[address] = {
    userId: res.data.data.userId,
    accessToken: token
  };

  accountData[address.toLowerCase()] = deviceId;
  fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accountData, null, 2));

  addLog(`Login success: ${address.slice(0, 6)}...`);
  return true;
}

/* ================= FAUCET ================= */

async function claimFaucet(address, proxy, idx) {
  const { userId, accessToken } = accountTokens[address];
  try {
    const res = await makeApiRequest(
      "get",
      `${API_BASE_URL}/transaction/fund-wallet/${userId}`,
      null,
      proxy,
      { Cookie: `access_token=${accessToken}` }
    );

    if (res.data.success) {
      addLog(`Account ${idx + 1}: Faucet claimed`);
    } else {
      addLog(`Account ${idx + 1}: ${res.data.message}`);
    }
  } catch (e) {
    addLog(`Account ${idx + 1}: Faucet error`);
  }
}

/* ================= SEND ================= */

async function sendDiam(address, proxy, to, amount) {
  const { userId, accessToken } = accountTokens[address];

  const res = await makeApiRequest(
    "post",
    `${API_BASE_URL}/transaction/transfer`,
    { userId, toAddress: to, amount },
    proxy,
    {
      Cookie: `access_token=${accessToken}`,
      "Content-Type": "application/json"
    }
  );

  if (res.data.success) {
    addLog(`Sent ${amount} DIAM to ${to.slice(0, 6)}...`);
    return true;
  } else {
    addLog(`Send failed: ${res.data.message}`);
    return false;
  }
}

/* ================= MAIN ACTIVITY ================= */

async function runDailyActivity() {
  if (!addresses.length) {
    addLog("No address loaded");
    return;
  }

  activityRunning = true;
  isCycleRunning = true;
  shouldStop = false;
  updateMenu();
  updateStatus();

  for (let i = 0; i < addresses.length && !shouldStop; i++) {
    const address = addresses[i];
    const proxy = proxies[i % proxies.length] || null;

    addLog(`Processing account ${i + 1}`);
    const ok = await loginAccount(address, proxy);
    if (!ok) continue;

    await sleep(9000);
    await claimFaucet(address, proxy, i);
    await sleep(9000);

    if (recipientAddresses.length) {
      const to =
        recipientAddresses[Math.floor(Math.random() * recipientAddresses.length)];
      const amount =
        Math.random() *
          (dailyActivityConfig.maxSendAmount -
            dailyActivityConfig.minSendAmount) +
        dailyActivityConfig.minSendAmount;

      await sendDiam(address, proxy, to, Number(amount.toFixed(4)));
    }
  }

  addLog("All accounts processed. Waiting 24 hours.");
  dailyActivityInterval = setTimeout(runDailyActivity, 86400000);

  activityRunning = false;
  updateStatus();
}

/* ================= UI ================= */

const screen = blessed.screen({ smartCSR: true });
const statusBox = blessed.box({ top: 0, height: 3, width: "100%" });
const logBox = blessed.log({
  top: 3,
  height: "100%-9",
  width: "100%",
  scrollable: true
});
const menuBox = blessed.list({
  bottom: 0,
  height: 6,
  width: "100%",
  items: [
    "Start Auto Daily Activity",
    "Refresh Wallet Info",
    "Clear Logs",
    "Exit"
  ],
  keys: true
});

screen.append(statusBox);
screen.append(logBox);
screen.append(menuBox);

function updateStatus() {
  statusBox.setContent(
    `Status : ${
      activityRunning
        ? "Running"
        : isCycleRunning
        ? "Waiting for next cycle"
        : "Idle"
    }`
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
      ? ["Stop Activity", "Refresh Wallet Info", "Clear Logs", "Exit"]
      : ["Start Auto Daily Activity", "Refresh Wallet Info", "Clear Logs", "Exit"]
  );
  screen.render();
}

/* ================= MENU ================= */

menuBox.on("select", async item => {
  switch (item.getText()) {
    case "Start Auto Daily Activity":
      runDailyActivity();
      break;
    case "Stop Activity":
      shouldStop = true;
      break;
    case "Refresh Wallet Info":
      loadAddresses();
      recipientAddresses = loadRecipientAddresses();
      break;
    case "Clear Logs":
      clearTransactionLogs();
      break;
    case "Exit":
      process.exit(0);
  }
});

/* ================= INIT ================= */

loadAddresses();
recipientAddresses = loadRecipientAddresses();
loadProxies();
updateStatus();

menuBox.focus();
screen.render();
