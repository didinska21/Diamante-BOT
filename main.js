import blessed from "blessed";
import fs from "fs";
import { getAddress, isAddress } from "ethers";
import { loginAccount, sendDiamFlow } from "./send.js";

/* ================= FILE ================= */
const USER_FILE = "user.txt";
const WALLET_FILE = "wallet.txt";

/* ================= VALIDATION ================= */

function validateFile(file, required = true) {
  if (!fs.existsSync(file)) {
    if (required) {
      console.error(`❌ File ${file} TIDAK ditemukan`);
      process.exit(1);
    } else {
      console.warn(`⚠️ File ${file} tidak ditemukan (opsional)`);
      return [];
    }
  }

  const raw = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .map(v => v.trim())
    .filter(v => v);

  if (!raw.length) {
    if (required) {
      console.error(`❌ File ${file} kosong`);
      process.exit(1);
    } else {
      console.warn(`⚠️ File ${file} kosong`);
      return [];
    }
  }

  const valid = [];
  for (const addr of raw) {
    if (!isAddress(addr)) {
      console.error(`❌ Address INVALID di ${file}: ${addr}`);
      process.exit(1);
    }
    valid.push(getAddress(addr));
  }

  console.log(`✅ ${file} valid (${valid.length} address)`);
  return valid;
}

/* ================= RUN VALIDATION ================= */

const USER_ADDRESSES = validateFile(USER_FILE, true);
validateFile(WALLET_FILE, false);

/* ================= STATE ================= */

let logs = [];
let activeWallet = USER_ADDRESSES[0];

/* ================= UI ================= */

const screen = blessed.screen({
  smartCSR: true,
  title: "DIAM TESTNET BOT"
});

const header = blessed.box({
  top: 0,
  height: 3,
  width: "100%",
  tags: true,
  content: "{center}{bold}DIAM TESTNET BOT{/bold}{/center}"
});

const walletBox = blessed.box({
  top: 3,
  height: 4,
  width: "100%",
  tags: true,
  content:
    `Wallet Loaded : ${USER_ADDRESSES.length}\n` +
    `Active Wallet : ${activeWallet}`
});

const logBox = blessed.log({
  top: 7,
  height: "100%-13",
  width: "100%",
  tags: true,
  scrollable: true,
  alwaysScroll: true
});

const menu = blessed.list({
  bottom: 0,
  height: 6,
  width: "100%",
  keys: true,
  mouse: true,
  items: [
    "Login Account",
    "Send DIAM",
    "Exit"
  ],
  style: {
    selected: {
      bg: "green",
      fg: "black"
    }
  }
});

/* ================= APPEND ================= */

screen.append(header);
screen.append(walletBox);
screen.append(logBox);
screen.append(menu);
menu.focus();

/* ================= LOG ================= */

function log(msg) {
  logs.push(msg);
  logBox.setContent(logs.join("\n"));
  logBox.setScrollPerc(100);
  screen.render();
}

/* ================= MENU ACTION ================= */

menu.on("select", async item => {
  const action = item.getText();

  if (action === "Login Account") {
    log(`🔐 Login ${activeWallet}`);
    const ok = await loginAccount(activeWallet);
    ok ? log("✅ Login sukses") : log("❌ Login gagal");
  }

  if (action === "Send DIAM") {
    await sendDiamFlow(log);
  }

  if (action === "Exit") {
    process.exit(0);
  }

  menu.focus();
});

/* ================= EXIT ================= */

screen.key(["q", "C-c"], () => process.exit(0));
screen.render();
