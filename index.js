// ============================================================
// FILE: src/index.js (Main Entry Point)
// ============================================================

import { addLog, setUpdateLogsCallback } from './utils/logger.js';
import { initializeState } from './utils/helpers.js';
import {
  loadConfig,
  loadAccountData,
  loadReffData,
  loadAddresses,
  loadProxies,
  loadRecipientAddresses
} from './utils/fileLoader.js';
import { updateWalletData } from './core/dailyActivity.js';
import {
  createScreen,
  createHeaderBox,
  createStatusBox,
  createWalletBox,
  createLogBox,
  createMenuBox,
  createDailyActivitySubMenu,
  createForms
} from './ui/screen.js';
import {
  safeRender,
  renderHeader,
  updateStatus,
  updateWalletBox,
  updateLogs,
  updateMenu,
  adjustLayout
} from './ui/renderer.js';
import {
  setupMenuHandlers,
  setupDailyActivitySubMenuHandlers,
  setupRepetitionsFormHandlers,
  setupSendAmountFormHandlers,
  setupReferralFormHandlers
} from './ui/handlers.js';

// ============================================================
// Global State
// ============================================================

const state = {
  walletInfo: {
    address: "N/A",
    balanceDIAM: "0.00",
    activeAccount: "N/A",
    cycleCount: 0,
    nextCycle: "N/A"
  },
  activityRunning: false,
  isCycleRunning: false,
  shouldStop: false,
  dailyActivityInterval: null,
  addresses: [],
  proxies: [],
  recipientAddresses: [],
  selectedWalletIndex: 0,
  hasLoggedSleepInterrupt: false,
  accountTokens: {},
  activeProcesses: 0,
  accountData: {},
  reffData: [],
  statusInterval: null
};

// ============================================================
// Error Handlers
// ============================================================

process.on("unhandledRejection", (reason, promise) => {
  addLog(`Unhandled Rejection at: ${promise}, reason: ${reason}`, "error");
});

process.on("uncaughtException", (error) => {
  addLog(`Uncaught Exception: ${error.message}\n${error.stack}`, "error");
  process.exit(1);
});

// ============================================================
// Initialize Application
// ============================================================

async function initialize() {
  // Load all data
  state.accountData = loadAccountData();
  state.reffData = loadReffData();
  loadConfig();
  state.addresses = loadAddresses();
  state.proxies = loadProxies();
  state.recipientAddresses = loadRecipientAddresses();

  // Initialize state for helpers
  initializeState(state);

  // Create UI
  const screen = createScreen();
  const headerBox = createHeaderBox(screen);
  const statusBox = createStatusBox(screen);
  const walletBox = createWalletBox(screen);
  const logBox = createLogBox(screen);
  const menuBox = createMenuBox(screen);
  const dailyActivitySubMenu = createDailyActivitySubMenu(screen);
  const forms = createForms(screen);

  // Render header
  renderHeader(headerBox, screen);

  // Setup components object
  const components = {
    screen,
    headerBox,
    statusBox,
    walletBox,
    logBox,
    menuBox,
    dailyActivitySubMenu,
    ...forms
  };

  // Setup callbacks
  const updateStatusCallback = () => updateStatus(statusBox, state, screen);
  const updateWalletsCallback = async () => {
    const walletData = await updateWalletData(
      state.addresses,
      state.proxies,
      state.accountTokens,
      state.selectedWalletIndex
    );

    // Update wallet info for selected wallet
    const selectedWallet = walletData.find(w => w.isSelected);
    if (selectedWallet) {
      state.walletInfo.address = selectedWallet.address;
      state.walletInfo.balanceDIAM = selectedWallet.balance;
      state.walletInfo.activeAccount = `Account ${state.selectedWalletIndex + 1}`;
    }

    updateWalletBox(walletBox, walletData, screen);
  };
  const updateLogsCallback = () => updateLogs(logBox, screen);
  const updateMenuCallback = () => updateMenu(menuBox, state, screen);
  const safeRenderCallback = () => safeRender(screen);

  // Set logger callback
  setUpdateLogsCallback(updateLogsCallback);

  // Setup callbacks object
  const callbacks = {
    updateMenu: updateMenuCallback,
    updateStatus: updateStatusCallback,
    updateWallets: updateWalletsCallback,
    safeRender: safeRenderCallback
  };

  // Setup all event handlers
  setupMenuHandlers(menuBox, state, components, callbacks);
  setupDailyActivitySubMenuHandlers(dailyActivitySubMenu, components, safeRenderCallback);
  setupRepetitionsFormHandlers(forms, components, updateStatusCallback, safeRenderCallback);
  setupSendAmountFormHandlers(forms, components, updateStatusCallback, safeRenderCallback);
  setupReferralFormHandlers(forms, components, state, safeRenderCallback);

  // Setup screen exit handlers
  screen.key(["escape", "q", "C-c"], () => {
    addLog("Exiting application", "info");
    if (state.statusInterval) clearInterval(state.statusInterval);
    process.exit(0);
  });

  // Setup layout adjustment
  setTimeout(() => {
    adjustLayout(components, screen);
    screen.on("resize", () => adjustLayout(components, screen));
  }, 100);

  // Start status update interval
  state.statusInterval = setInterval(updateStatusCallback, 100);

  // Initial updates
  updateStatusCallback();
  await updateWalletsCallback();
  updateLogsCallback();
  safeRenderCallback();

  // Focus menu
  menuBox.focus();

  addLog("=".repeat(60), "info");
  addLog("DIAM TESTNET AUTO BOT - PRO VERSION", "success");
  addLog("Application started successfully!", "success");
  addLog("=".repeat(60), "info");
}

// ============================================================
// Start Application
// ============================================================

initialize().catch((error) => {
  console.error("Failed to initialize application:", error);
  process.exit(1);
});
