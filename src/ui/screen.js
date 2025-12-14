// ============================================================
// FILE: src/ui/screen.js (FIXED VERSION)
// ============================================================

import blessed from 'blessed';

/**
 * Create blessed screen with terminal compatibility fixes
 * @returns {Object} Screen object
 */
export function createScreen() {
  // Fix terminal compatibility
  if (!process.env.TERM || process.env.TERM === 'dumb') {
    process.env.TERM = 'xterm-256color';
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: "DIAM TESTNET AUTO BOT",
    autoPadding: true,
    fullUnicode: true,
    mouse: true,
    ignoreLocked: ["C-c", "q", "escape"],
    terminal: process.env.TERM || 'xterm-256color',
    forceUnicode: true,
    dockBorders: true,
    warnings: false,
    sendFocus: true,
    useBCE: true
  });

  // Handle screen errors gracefully
  screen.on('error', (err) => {
    console.error('Terminal error (non-fatal):', err.message);
  });

  // Prevent crashes on terminal resize
  process.on('SIGWINCH', () => {
    try {
      screen.alloc();
      screen.render();
    } catch (e) {
      // Ignore resize errors silently
    }
  });

  return screen;
}

/**
 * Create header box
 * @param {Object} screen - Blessed screen
 * @returns {Object} Header box
 */
export function createHeaderBox(screen) {
  const headerBox = blessed.box({
    top: 0,
    left: "center",
    width: "100%",
    height: 6,
    tags: true,
    style: { fg: "yellow", bg: "default" }
  });

  screen.append(headerBox);
  return headerBox;
}

/**
 * Create status box
 * @param {Object} screen - Blessed screen
 * @returns {Object} Status box
 */
export function createStatusBox(screen) {
  const statusBox = blessed.box({
    left: 0,
    top: 6,
    width: "100%",
    height: 3,
    tags: true,
    border: { type: "line", fg: "cyan" },
    style: { fg: "white", bg: "default", border: { fg: "cyan" } },
    content: "Status: Initializing...",
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    label: " Status ",
    wrap: true
  });

  screen.append(statusBox);
  return statusBox;
}

/**
 * Create wallet box
 * @param {Object} screen - Blessed screen
 * @returns {Object} Wallet box
 */
export function createWalletBox(screen) {
  const walletBox = blessed.list({
    label: " Wallet Information ",
    top: 9,
    left: 0,
    width: "40%",
    height: "35%",
    border: { type: "line", fg: "cyan" },
    style: { 
      border: { fg: "cyan" }, 
      fg: "white", 
      bg: "default", 
      item: { fg: "white" } 
    },
    scrollable: true,
    scrollbar: { bg: "cyan", fg: "black" },
    padding: { left: 1, right: 1, top: 0, bottom: 0 },
    tags: true,
    keys: true,
    vi: true,
    mouse: true,
    content: "Loading wallet data..."
  });

  screen.append(walletBox);
  return walletBox;
}

/**
 * Create log box
 * @param {Object} screen - Blessed screen
 * @returns {Object} Log box
 */
export function createLogBox(screen) {
  const logBox = blessed.log({
    label: " Transaction Logs ",
    top: 9,
    left: "41%",
    width: "60%",
    height: "100%-9",
    border: { type: "line", fg: "cyan" },
    style: { 
      fg: "white", 
      bg: "default", 
      border: { fg: "cyan" }, 
      scrollbar: { bg: "cyan" } 
    },
    scrollable: true,
    alwaysScroll: true,
    scrollbar: true,
    tags: true,
    mouse: true,
    keys: true,
    vi: true
  });

  screen.append(logBox);
  return logBox;
}

/**
 * Create menu box
 * @param {Object} screen - Blessed screen
 * @returns {Object} Menu box
 */
export function createMenuBox(screen) {
  const menuBox = blessed.list({
    label: " Main Menu ",
    top: "45%",
    left: 0,
    width: "40%",
    height: "55%",
    border: { type: "line", fg: "cyan" },
    style: { 
      fg: "white", 
      bg: "default", 
      border: { fg: "cyan" }, 
      selected: { bg: "green" } 
    },
    items: [
      "Start Auto Daily Activity",
      "Create Auto Reff",
      "Set Manual Config",
      "Refresh Wallet Info",
      "Clear Logs",
      "Exit"
    ],
    keys: true,
    vi: true,
    mouse: true
  });

  screen.append(menuBox);
  return menuBox;
}

/**
 * Create daily activity sub menu
 * @param {Object} screen - Blessed screen
 * @returns {Object} Sub menu box
 */
export function createDailyActivitySubMenu(screen) {
  const subMenu = blessed.list({
    label: " Daily Activity Config ",
    top: "45%",
    left: 0,
    width: "40%",
    height: "55%",
    border: { type: "line", fg: "cyan" },
    style: { 
      fg: "white", 
      bg: "default", 
      border: { fg: "cyan" }, 
      selected: { bg: "green" } 
    },
    items: [
      "Set Send DIAM Config",
      "Set Send Amount Config",
      "Back to Main Menu"
    ],
    keys: true,
    vi: true,
    mouse: true,
    hidden: true
  });

  screen.append(subMenu);
  return subMenu;
}

/**
 * Create forms (repetitions, send amount, referral)
 * @param {Object} screen - Blessed screen
 * @returns {Object} Forms object
 */
export function createForms(screen) {
  // Repetitions Form
  const repetitionsForm = blessed.form({
    label: " Enter Send Repetitions ",
    top: "center",
    left: "center",
    width: "30%",
    height: "30%",
    keys: true,
    mouse: true,
    border: { type: "line" },
    style: { fg: "white", bg: "default", border: { fg: "blue" } },
    padding: { left: 1, top: 1 },
    hidden: true
  });

  const repetitionsInput = blessed.textbox({
    parent: repetitionsForm,
    top: 1,
    left: 1,
    width: "90%",
    height: 3,
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "default",
      border: { fg: "white" },
      focus: { border: { fg: "green" } }
    }
  });

  const repetitionsSubmitButton = blessed.button({
    parent: repetitionsForm,
    top: 5,
    left: "center",
    width: 10,
    height: 3,
    content: "Submit",
    align: "center",
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "blue",
      border: { fg: "white" },
      hover: { bg: "green" },
      focus: { bg: "green" }
    }
  });

  // Send Amount Config Form
  const sendAmountConfigForm = blessed.form({
    label: " Set Send Amount Config ",
    top: "center",
    left: "center",
    width: "30%",
    height: "50%",
    keys: true,
    mouse: true,
    border: { type: "line" },
    style: { fg: "white", bg: "default", border: { fg: "blue" } },
    padding: { left: 1, top: 1 },
    hidden: true
  });

  const minAmountInput = blessed.textbox({
    parent: sendAmountConfigForm,
    top: 1,
    left: 1,
    width: "90%",
    height: 3,
    label: "Min Send Amount",
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "default",
      border: { fg: "white" },
      focus: { border: { fg: "green" } }
    }
  });

  const maxAmountInput = blessed.textbox({
    parent: sendAmountConfigForm,
    top: 5,
    left: 1,
    width: "90%",
    height: 3,
    label: "Max Send Amount",
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "default",
      border: { fg: "white" },
      focus: { border: { fg: "green" } }
    }
  });

  const sendAmountSubmitButton = blessed.button({
    parent: sendAmountConfigForm,
    top: 9,
    left: "center",
    width: 10,
    height: 3,
    content: "Submit",
    align: "center",
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "blue",
      border: { fg: "white" },
      hover: { bg: "green" },
      focus: { bg: "green" }
    }
  });

  // Referral Form
  const reffForm = blessed.form({
    label: " Create Auto Reff ",
    top: "center",
    left: "center",
    width: "30%",
    height: "60%",
    keys: true,
    mouse: true,
    border: { type: "line" },
    style: { fg: "white", bg: "default", border: { fg: "blue" } },
    padding: { left: 1, top: 1 },
    hidden: true
  });

  const referralCodeInput = blessed.textbox({
    parent: reffForm,
    top: 1,
    left: 1,
    width: "90%",
    height: 3,
    label: "Referral Code",
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "default",
      border: { fg: "white" },
      focus: { border: { fg: "green" } }
    }
  });

  const countInput = blessed.textbox({
    parent: reffForm,
    top: 5,
    left: 1,
    width: "90%",
    height: 3,
    label: "Number of Accounts",
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "default",
      border: { fg: "white" },
      focus: { border: { fg: "green" } }
    }
  });

  const proxyInput = blessed.textbox({
    parent: reffForm,
    top: 9,
    left: 1,
    width: "90%",
    height: 3,
    label: "Enter Your Proxy (OPTIONAL)",
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "default",
      border: { fg: "white" },
      focus: { border: { fg: "green" } }
    }
  });

  const reffSubmitButton = blessed.button({
    parent: reffForm,
    top: 13,
    left: "center",
    width: 10,
    height: 3,
    content: "Submit",
    align: "center",
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "blue",
      border: { fg: "white" },
      hover: { bg: "green" },
      focus: { bg: "green" }
    }
  });

  screen.append(repetitionsForm);
  screen.append(sendAmountConfigForm);
  screen.append(reffForm);

  return {
    repetitionsForm,
    repetitionsInput,
    repetitionsSubmitButton,
    sendAmountConfigForm,
    minAmountInput,
    maxAmountInput,
    sendAmountSubmitButton,
    reffForm,
    referralCodeInput,
    countInput,
    proxyInput,
    reffSubmitButton
  };
    }
