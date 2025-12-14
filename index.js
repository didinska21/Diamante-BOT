// ============================================================
// FILE: index.js (ROOT DIRECTORY - FIXED VERSION)
// ============================================================

// Fix terminal compatibility BEFORE any imports
if (!process.env.TERM || process.env.TERM === 'dumb') {
  process.env.TERM = 'xterm-256color';
}
process.env.BLESSED_DEBUG = '0';

import { addLog, setUpdateLogsCallback } from './src/utils/logger.js';
import { initializeState } from './src/utils/helpers.js';
import {
  loadConfig,
  loadAccountData,
  loadReffData,
  loadAddresses,
  loadProxies,
  loadRecipientAddresses
} from './src/utils/fileLoader.js';
import { updateWalletData } from './src/core/dailyActivity.js';
import {
  createScreen,
  createHeaderBox,
  createStatusBox,
  createWalletBox,
  createLogBox,
  createMenuBox,
  createDailyActivitySubMenu,
  createForms
} from './src/ui/screen.js';
import {
  safeRender,
  renderHeader,
  updateStatus,
  updateWalletBox,
  updateLogs,
  updateMenu,
  adjustLayout
} from './src/ui/renderer.js';
import {
  setupMenuHandlers,
  setupDailyActivitySubMenuHandlers,
  setupRepetitionsFormHandlers,
  setupSendAmountFormHandlers,
  setupReferralFormHandlers
} from './src/ui/handlers.js';

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
// Error Handlers with Delay
// ============================================================

process.on("unhandledRejection", (reason, promise) => {
  console.error("\n" + "=".repeat(60));
  console.error("UNHANDLED REJECTION:");
  console.error("=".repeat(60));
  console.error(reason);
  console.error("=".repeat(60));
  
  setTimeout(() => {
    process.exit(1);
  }, 3000);
});

process.on("uncaughtException", (error) => {
  console.error("\n" + "=".repeat(60));
  console.error("UNCAUGHT EXCEPTION:");
  console.error("=".repeat(60));
  console.error(error.message);
  console.error(error.stack);
  console.error("=".repeat(60));
  
  setTimeout(() => {
    process.exit(1);
  }, 3000);
});

// ============================================================
// Initialize Application with Fallback
// ============================================================

async function initialize() {
  try {
    console.log("Initializing DIAM Testnet Bot...");
    
    // Load all data
    console.log("Loading data files...");
    state.accountData = loadAccountData();
    state.reffData = loadReffData();
    loadConfig();
    state.addresses = loadAddresses();
    state.proxies = loadProxies();
    state.recipientAddresses = loadRecipientAddresses();

    console.log(`✓ Loaded ${state.addresses.length} addresses`);
    console.log(`✓ Loaded ${state.proxies.length} proxies`);
    console.log(`✓ Loaded ${state.recipientAddresses.length} recipients`);

    // Initialize state for helpers
    initializeState(state);

    // Try to create UI with fallback to console mode
    try {
      console.log("Starting UI mode...");
      
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

    } catch (uiError) {
      // Fallback to console mode
      console.error("\n⚠️  UI initialization failed:", uiError.message);
      console.error("Error details:", uiError.stack);
      console.error("\n🔄 Falling back to console mode...\n");
      
      console.log("=".repeat(60));
      console.log("DIAM TESTNET AUTO BOT - CONSOLE MODE");
      console.log("=".repeat(60));
      console.log(`✓ Loaded ${state.addresses.length} addresses`);
      console.log(`✓ Loaded ${state.proxies.length} proxies`);
      console.log(`✓ Loaded ${state.recipientAddresses.length} recipients`);
      console.log("\n⚠️  UI mode not available on this terminal.");
      console.log("Bot is running in console mode.");
      console.log("Press Ctrl+C to exit.\n");
      console.log("=".repeat(60));
      
      // Keep process running
      process.stdin.resume();
    }

  } catch (error) {
    console.error("\n" + "=".repeat(60));
    console.error("❌ FATAL ERROR - Initialization failed:");
    console.error("=".repeat(60));
    console.error("Error:", error.message);
    console.error("\nStack trace:");
    console.error(error.stack);
    console.error("=".repeat(60));
    console.error("\nPlease check:");
    console.error("1. All required files exist (user.txt, wallet.txt, proxy.txt)");
    console.error("2. All dependencies are installed (npm install)");
    console.error("3. Node.js version is 16+ (node --version)");
    console.error("=".repeat(60) + "\n");
    
    setTimeout(() => {
      process.exit(1);
    }, 5000);
  }
}

// ============================================================
// Start Application
// ============================================================

console.log("\n" + "=".repeat(60));
console.log("  DIAM TESTNET AUTO BOT - Starting...");
console.log("=".repeat(60) + "\n");

initialize().catch((error) => {
  console.error("Failed to initialize application:", error);
  setTimeout(() => {
    process.exit(1);
  }, 3000);
});
