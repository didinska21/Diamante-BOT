import blessed from "blessed";
import fs from "fs";
import { getAddress } from "ethers";
import { loginAccount } from "./send.js";

/* ================= CONFIG ================= */
const USER_FILE = "user.txt";

/* ================= STATE ================= */
let addresses = [];
let selectedIndex = 0;
let logs = [];

/* ================= HELPERS ================= */
function log(msg) {
  logs.push(msg);
  logBox.setContent(logs.join("\n"));
  logBox.setScrollPerc(100);
  screen.render();
}

function loadAddresses() {
  if (!fs.existsSync(USER_FILE)) return [];
  return fs
    .readFileSync(USER_FILE, "utf8")
    .split("\n")
    .map(v => v.trim())
    .filter(v => v)
    .map(v => getAddress(v));
}

/* ================= UI ================= */
const screen = blessed.screen({
  smartCSR: true,
  title: "DIAM BOT"
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
  content: "Wallet: -"
});

const logBox = blessed.log({
  top: 7,
  height: "100%-13",
  width: "100%",
  scrollable: true,
  alwaysScroll: true,
  tags: true
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
    selected: { bg: "green", fg: "black" }
  }
});

/* ================= APPEND ================= */
screen.append(header);
screen.append(walletBox);
screen.append(logBox);
screen.append(menu);
menu.focus();

/* ================= ACTION ================= */
menu.on("select", async item => {
  const action = item.getText();

  if (action === "Login Account") {
    addresses = loadAddresses();
    if (!addresses.length) {
      log("❌ user.txt kosong");
      return;
    }

    const addr = addresses[selectedIndex];
    walletBox.setContent(`Wallet: ${addr}`);
    screen.render();

    log(`🔐 Login ${addr}`);
    const ok = await loginAccount(addr);
    ok ? log("✅ Login sukses") : log("❌ Login gagal");
  }

  if (action === "Send DIAM") {
    const mod = await import("./send.js");
    await mod.sendDiamFlow(log);
  }

  if (action === "Exit") {
    process.exit(0);
  }
});

/* ================= EXIT ================= */
screen.key(["q", "C-c"], () => process.exit(0));
screen.render();
