import blessed from "blessed";
import fs from "fs";
import { isAddress, getAddress } from "ethers";
import { loginAccount, sendDiamFlow } from "./send.js";

/* ================= FILE ================= */
const USER_FILE = "user.txt";
const WALLET_FILE = "wallet.txt";

/* ================= VALIDATION ================= */

function validateFile(file, required = true) {
  if (!fs.existsSync(file)) {
    if (required) {
      console.error(`❌ ${file} tidak ditemukan`);
      process.exit(1);
    }
    console.warn(`⚠️ ${file} tidak ditemukan (opsional)`);
    return [];
  }

  const raw = fs.readFileSync(file, "utf8")
    .split("\n")
    .map(v => v.trim())
    .filter(Boolean);

  if (!raw.length && required) {
    console.error(`❌ ${file} kosong`);
    process.exit(1);
  }

  const valid = [];
  for (const addr of raw) {
    if (!isAddress(addr)) {
      console.error(`❌ Address INVALID di ${file}: ${addr}`);
      process.exit(1);
    }
    valid.push(getAddress(addr));
  }

  console.log(`✅ ${file} valid (${valid.length})`);
  return valid;
}

/* ================= BOOT ================= */

const SENDERS = validateFile(USER_FILE, true);
const RECIPIENTS = validateFile(WALLET_FILE, false);

let activeSender = SENDERS[0];
let logs = [];

/* ================= UI ================= */

const screen = blessed.screen({ smartCSR: true, title: "DIAM BOT" });

const header = blessed.box({
  top: 0, height: 3, width: "100%",
  tags: true,
  content: "{center}{bold}DIAM TESTNET BOT{/bold}{/center}"
});

const info = blessed.box({
  top: 3, height: 5, width: "100%",
  tags: true,
  content:
    `Sender Wallets   : ${SENDERS.length}\n` +
    `Active Sender    : ${activeSender}\n` +
    `Recipient Wallet : ${RECIPIENTS.length}`
});

const logBox = blessed.log({
  top: 8, height: "100%-14", width: "100%",
  tags: true, scrollable: true, alwaysScroll: true
});

const menu = blessed.list({
  bottom: 0, height: 6, width: "100%",
  keys: true, mouse: true,
  items: ["Login Account", "Send DIAM", "Exit"],
  style: { selected: { bg: "green", fg: "black" } }
});

screen.append(header);
screen.append(info);
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

/* ================= MENU ================= */

menu.on("select", async item => {
  const action = item.getText();

  if (action === "Login Account") {
    log(`🔐 Login ${activeSender}`);
    const ok = await loginAccount(activeSender, log);
    ok ? log("✅ Login berhasil") : log("❌ Login gagal");
  }

  if (action === "Send DIAM") {
    await sendDiamFlow(log);
  }

  if (action === "Exit") {
    process.exit(0);
  }
});

screen.key(["q", "C-c"], () => process.exit(0));
screen.render();
