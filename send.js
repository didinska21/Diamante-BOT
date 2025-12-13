import axios from "axios";
import fs from "fs";
import { getAddress } from "ethers";
import { HttpsProxyAgent } from "https-proxy-agent";

/* ================= CONFIG ================= */
const API = "https://campapi.diamante.io/api/v1";
const ACCOUNT_DATA = "account_data.json";
const WALLET_FILE = "wallet.txt";

/* ================= STATE ================= */
let tokens = {};
let accountData = fs.existsSync(ACCOUNT_DATA)
  ? JSON.parse(fs.readFileSync(ACCOUNT_DATA))
  : {};

/* ================= LOGIN ================= */
export async function loginAccount(address, proxy = null) {
  try {
    const deviceId =
      accountData[address.toLowerCase()] ||
      `DEV-${Math.random().toString(36).slice(2, 7)}`;

    const res = await axios.post(
      `${API}/user/connect-wallet`,
      {
        address,
        deviceId,
        deviceSource: "web_app",
        deviceType: "Windows",
        browser: "Chrome"
      },
      proxy ? { httpsAgent: new HttpsProxyAgent(proxy) } : {}
    );

    const cookie = res.headers["set-cookie"]?.[0];
    const token = cookie?.match(/access_token=([^;]+)/)?.[1];

    tokens[address] = {
      userId: res.data.data.userId,
      accessToken: token
    };

    accountData[address.toLowerCase()] = deviceId;
    fs.writeFileSync(ACCOUNT_DATA, JSON.stringify(accountData, null, 2));
    return true;
  } catch {
    return false;
  }
}

/* ================= SEND FLOW ================= */
export async function sendDiamFlow(log) {
  if (!fs.existsSync(WALLET_FILE)) {
    log("❌ wallet.txt tidak ada");
    return;
  }

  const recipients = fs
    .readFileSync(WALLET_FILE, "utf8")
    .split("\n")
    .map(v => v.trim())
    .filter(v => v)
    .map(v => getAddress(v));

  const sender = Object.keys(tokens)[0];
  if (!sender) {
    log("❌ Belum login");
    return;
  }

  const recipient = recipients[Math.floor(Math.random() * recipients.length)];
  const amount = 0.01;

  try {
    const res = await axios.post(
      `${API}/transaction/transfer`,
      {
        toAddress: recipient,
        amount,
        userId: tokens[sender].userId
      },
      {
        headers: {
          Cookie: `access_token=${tokens[sender].accessToken}`
        }
      }
    );

    log(`✅ Sent ${amount} DIAM → ${recipient}`);
    log(`Tx: ${res.data.data.transferData.hash}`);
  } catch (e) {
    log(`❌ Send gagal`);
  }
}
