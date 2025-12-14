// ============================================================
// FILE: src/ui/renderer.js (PART 1/2)
// ============================================================

import figlet from 'figlet';
import { getFormattedLogs } from '../utils/logger.js';
import { getShortAddress } from '../utils/helpers.js';
import { dailyActivityConfig } from '../utils/fileLoader.js';
import { LOADING_SPINNER, BORDER_BLINK_COLORS } from '../config/constants.js';

let renderQueue = [];
let isRendering = false;
let isHeaderRendered = false;
let spinnerIndex = 0;
let borderBlinkIndex = 0;
let blinkCounter = 0;

/**
 * Safe render function with queue
 * @param {Object} screen - Blessed screen
 */
export function safeRender(screen) {
  renderQueue.push(true);
  if (isRendering) return;

  isRendering = true;
  setTimeout(() => {
    try {
      screen.render();
    } catch (error) {
      console.error(`UI render error: ${error.message}`);
    }
    renderQueue.shift();
    isRendering = false;
    if (renderQueue.length > 0) safeRender(screen);
  }, 100);
}

/**
 * Render header with figlet
 * @param {Object} headerBox - Header box
 * @param {Object} screen - Blessed screen
 */
export function renderHeader(headerBox, screen) {
  if (!isHeaderRendered) {
    figlet.text("NT EXHAUST", { font: "ANSI Shadow" }, (err, data) => {
      if (!err) {
        headerBox.setContent(`{center}{bold}{cyan-fg}${data}{/cyan-fg}{/bold}{/center}`);
        isHeaderRendered = true;
        safeRender(screen);
      }
    });
  }
}

/**
 * Update status box
 * @param {Object} statusBox - Status box
 * @param {Object} state - Global state
 * @param {Object} screen - Blessed screen
 */
export function updateStatus(statusBox, state, screen) {
  const isProcessing = state.activityRunning || state.isCycleRunning;
  const status = state.activityRunning
    ? `${LOADING_SPINNER[spinnerIndex]} {yellow-fg}Running{/yellow-fg}`
    : state.isCycleRunning
      ? `${LOADING_SPINNER[spinnerIndex]} {yellow-fg}Waiting for next cycle{/yellow-fg}`
      : "{green-fg}Idle{/green-fg}";

  const statusText = `Status: ${status} | Active Account: ${getShortAddress(state.walletInfo.address)} | Total Accounts: ${state.addresses.length} | Send: ${dailyActivityConfig.sendDiamRepetitions}x | DIAM TESTNET AUTO BOT - PRO VERSION`;

  try {
    statusBox.setContent(statusText);
  } catch (error) {
    console.error(`Status update error: ${error.message}`);
  }

  // Blink border when processing
  if (isProcessing) {
    if (blinkCounter % 1 === 0) {
      statusBox.style.border.fg = BORDER_BLINK_COLORS[borderBlinkIndex];
      borderBlinkIndex = (borderBlinkIndex + 1) % BORDER_BLINK_COLORS.length;
    }
    blinkCounter++;
  } else {
    statusBox.style.border.fg = "cyan";
  }

  spinnerIndex = (spinnerIndex + 1) % LOADING_SPINNER.length;
  safeRender(screen);
}

/**
 * Update wallet box
 * @param {Object} walletBox - Wallet box
 * @param {Array} walletData - Wallet data array
 * @param {Object} screen - Blessed screen
 */
export function updateWalletBox(walletBox, walletData, screen) {
  const header = `{bold}{cyan-fg}     Address{/cyan-fg}{/bold}       {bold}{cyan-fg}DIAM{/cyan-fg}{/bold}`;
  const separator = "{grey-fg}----------------------------------{/grey-fg}";

  try {
    const entries = walletData.map(w => w.entry);
    walletBox.setItems([header, separator, ...entries]);
    walletBox.select(0);
  } catch (error) {
    console.error(`Wallet update error: ${error.message}`);
  }

  safeRender(screen);
}

/**
 * Update logs box
 * @param {Object} logBox - Log box
 * @param {Object} screen - Blessed screen
 */
export function updateLogs(logBox, screen) {
  try {
    logBox.setContent(getFormattedLogs());
    logBox.setScrollPerc(100);
  } catch (error) {
    console.error(`Log update error: ${error.message}`);
  }

  safeRender(screen);
}

/**
 * Update menu box
 * @param {Object} menuBox - Menu box
 * @param {Object} state - Global state
 * @param {Object} screen - Blessed screen
 */
export function updateMenu(menuBox, state, screen) {
  try {
    menuBox.setItems(
      state.isCycleRunning
        ? [
            "Stop Activity",
            "Create Auto Reff",
            "Set Manual Config",
            "Refresh Wallet Info",
            "Clear Logs",
            "Exit"
          ]
        : [
            "Start Auto Daily Activity",
            "Create Auto Reff",
            "Set Manual Config",
            "Refresh Wallet Info",
            "Clear Logs",
            "Exit"
          ]
    );
  } catch (error) {
    console.error(`Menu update error: ${error.message}`);
  }

  safeRender(screen);
}

/**
 * Adjust layout based on screen size
 * @param {Object} components - All UI components
 * @param {Object} screen - Blessed screen
 */
export function adjustLayout(components, screen) {
  const screenHeight = screen.height || 24;
  const screenWidth = screen.width || 80;

  const { headerBox, statusBox, walletBox, logBox, menuBox, dailyActivitySubMenu, forms } = components;

  headerBox.height = Math.max(6, Math.floor(screenHeight * 0.15));
  statusBox.top = headerBox.height;
  statusBox.height = Math.max(3, Math.floor(screenHeight * 0.07));

  walletBox.top = headerBox.height + statusBox.height;
  walletBox.width = Math.floor(screenWidth * 0.4);
  walletBox.height = Math.floor(screenHeight * 0.35);

  logBox.top = headerBox.height + statusBox.height;
  logBox.left = Math.floor(screenWidth * 0.41);
  logBox.width = Math.floor(screenWidth * 0.6);
  logBox.height = screenHeight - (headerBox.height + statusBox.height);

  menuBox.top = headerBox.height + statusBox.height + walletBox.height;
  menuBox.width = Math.floor(screenWidth * 0.4);
  menuBox.height = screenHeight - (headerBox.height + statusBox.height + walletBox.height);

  if (menuBox.top != null) {
    dailyActivitySubMenu.top = menuBox.top;
    dailyActivitySubMenu.width = menuBox.width;
    dailyActivitySubMenu.height = menuBox.height;
    dailyActivitySubMenu.left = menuBox.left;

    forms.repetitionsForm.width = Math.floor(screenWidth * 0.3);
    forms.repetitionsForm.height = Math.floor(screenHeight * 0.3);
    forms.sendAmountConfigForm.width = Math.floor(screenWidth * 0.3);
    forms.sendAmountConfigForm.height = Math.floor(screenHeight * 0.5);
    forms.reffForm.width = Math.floor(screenWidth * 0.3);
    forms.reffForm.height = Math.floor(screenHeight * 0.6);
  }

  safeRender(screen);
}

