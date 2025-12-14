import axios from "axios";
import fs from "fs";
import { getAddress } from "ethers";

/* ================= CONFIG ================= */

const API = "https://campapi.diamante.io/api/v1";
const ACCOUNT_FILE = "account_data.json";
const WALLET_FILE = "wallet.txt";

/* ================= STATE ================= */

let tokens = {};
let deviceMap = fs.existsSync(ACCOUNT_FILE)
  ? JSON.parse(fs.readFileSync(ACCOUNT_FILE))
  : {};

/* ================= HEADERS ================= */

const HEADERS = {
  "accept": "application/json, text/plain, */*",
  "content-type": "application/json",
  "origin": "https://campaign.diamante.io",
  "referer": "https://campaign.diamante.io/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134 Safari/537.36"
};

/* ================= LOGIN ================= */

export async function loginAccount(address, log) {
  try {
    const deviceId =
      deviceMap[address.toLowerCase()] ||
      `DEV-${Math.random().toString(36).slice(2, 8)}`;

    const res = await axios.post(
      `${API}/user/connect-wallet`,
      {
        address,
        deviceId,
        deviceSource: "web_app",
        deviceType: "Windows",
        browser: "Chrome",
        ipAddress: "0.0.0.0",
        latitude: 0,
        longitude: 0
      },
      { headers: HEADERS, withCredentials: true }
    );

    const cookie = res.headers["set-cookie"]?.join(";") || "";
    const token = cookie.match(/access_token=([^;]+)/)?.[1];

    if (!token) throw new Error("access_token tidak ditemukan");

    tokens[address] = {
      userId: res.data.data.userId,
      accessToken: token
    };

    deviceMap[address.toLowerCase()] = deviceId;
    fs.writeFileSync(ACCOUNT_FILE, JSON.stringify(deviceMap, null, 2));

    return true;
  } catch (e) {
    log(`❌ Login error: ${e.message}`);
    return false;
  }
}

/* ================= SEND ================= */

export async function sendDiamFlow(log) {
  if (!fs.existsSync(WALLET_FILE)) {
    log("❌ wallet.txt tidak ada");
    return;
  }

  const recipients = fs.readFileSync(WALLET_FILE, "utf8")
    .split("\n")
    .map(v => v.trim())
    .filter(Boolean)
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
          ...HEADERS,
          Cookie: `access_token=${tokens[sender].accessToken}`
        }
      }
    );

    log(`✅ Sent ${amount} DIAM → ${recipient}`);
    log(`TxHash: ${res.data.data.transferData.hash}`);
  } catch (e) {
    log(`❌ Send gagal`);
  }
}
