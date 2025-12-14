// ============================================================
// FILE: src/ui/renderer.js (FIXED VERSION)
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
  if (!screen) return;
  
  renderQueue.push(true);
  if (isRendering) return;

  isRendering = true;
  
  // Use setImmediate instead of setTimeout for better performance
  setImmediate(() => {
    try {
      if (screen && typeof screen.render === 'function') {
        screen.render();
      }
    } catch (error) {
      console.error(`UI render error: ${error.message}`);
    } finally {
      renderQueue.shift();
      isRendering = false;
      if (renderQueue.length > 0) {
        safeRender(screen);
      }
    }
  });
}

/**
 * Render header with figlet
 * @param {Object} headerBox - Header box
 * @param {Object} screen - Blessed screen
 */
export function renderHeader(headerBox, screen) {
  if (!headerBox || !screen) return;
  
  if (!isHeaderRendered) {
    try {
      figlet.text("NT EXHAUST", { font: "ANSI Shadow" }, (err, data) => {
        if (!err && data) {
          try {
            headerBox.setContent(`{center}{bold}{cyan-fg}${data}{/cyan-fg}{/bold}{/center}`);
            isHeaderRendered = true;
            safeRender(screen);
          } catch (e) {
            console.error('Failed to set header content:', e.message);
          }
        }
      });
    } catch (error) {
      console.error('Figlet error:', error.message);
      // Fallback to simple text header
      headerBox.setContent(`{center}{bold}{cyan-fg}DIAM TESTNET AUTO BOT{/cyan-fg}{/bold}{/center}`);
      isHeaderRendered = true;
      safeRender(screen);
    }
  }
}

/**
 * Update status box
 * @param {Object} statusBox - Status box
 * @param {Object} state - Global state
 * @param {Object} screen - Blessed screen
 */
export function updateStatus(statusBox, state, screen) {
  if (!statusBox || !state || !screen) return;

  try {
    const isProcessing = state.activityRunning || state.isCycleRunning;
    const status = state.activityRunning
      ? `${LOADING_SPINNER[spinnerIndex]} {yellow-fg}Running{/yellow-fg}`
      : state.isCycleRunning
        ? `${LOADING_SPINNER[spinnerIndex]} {yellow-fg}Waiting for next cycle{/yellow-fg}`
        : "{green-fg}Idle{/green-fg}";

    const statusText = `Status: ${status} | Active: ${getShortAddress(state.walletInfo.address)} | Accounts: ${state.addresses.length} | Send: ${dailyActivityConfig.sendDiamRepetitions}x`;

    statusBox.setContent(statusText);

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
  } catch (error) {
    console.error(`Status update error: ${error.message}`);
  }
}

/**
 * Update wallet box
 * @param {Object} walletBox - Wallet box
 * @param {Array} walletData - Wallet data array
 * @param {Object} screen - Blessed screen
 */
export function updateWalletBox(walletBox, walletData, screen) {
  if (!walletBox || !walletData || !screen) return;

  try {
    const header = `{bold}{cyan-fg}     Address{/cyan-fg}{/bold}       {bold}{cyan-fg}DIAM{/cyan-fg}{/bold}`;
    const separator = "{grey-fg}----------------------------------{/grey-fg}";

    const entries = walletData.map(w => w.entry);
    walletBox.setItems([header, separator, ...entries]);
    walletBox.select(0);
    safeRender(screen);
  } catch (error) {
    console.error(`Wallet update error: ${error.message}`);
  }
}

/**
 * Update logs box
 * @param {Object} logBox - Log box
 * @param {Object} screen - Blessed screen
 */
export function updateLogs(logBox, screen) {
  if (!logBox || !screen) return;

  try {
    logBox.setContent(getFormattedLogs());
    logBox.setScrollPerc(100);
    safeRender(screen);
  } catch (error) {
    console.error(`Log update error: ${error.message}`);
  }
}

/**
 * Update menu box
 * @param {Object} menuBox - Menu box
 * @param {Object} state - Global state
 * @param {Object} screen - Blessed screen
 */
export function updateMenu(menuBox, state, screen) {
  if (!menuBox || !state || !screen) return;

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
    safeRender(screen);
  } catch (error) {
    console.error(`Menu update error: ${error.message}`);
  }
}

/**
 * Adjust layout based on screen size with error handling
 * @param {Object} components - All UI components
 * @param {Object} screen - Blessed screen
 */
export function adjustLayout(components, screen) {
  if (!components || !screen) return;

  try {
    const screenHeight = screen.height || 24;
    const screenWidth = screen.width || 80;

    const { 
      headerBox, 
      statusBox, 
      walletBox, 
      logBox, 
      menuBox, 
      dailyActivitySubMenu, 
      repetitionsForm,
      sendAmountConfigForm,
      reffForm
    } = components;

    // Safely update components that exist
    if (headerBox) {
      headerBox.height = Math.max(6, Math.floor(screenHeight * 0.15));
    }

    if (statusBox && headerBox) {
      statusBox.top = headerBox.height;
      statusBox.height = Math.max(3, Math.floor(screenHeight * 0.07));
    }

    if (walletBox && headerBox && statusBox) {
      walletBox.top = headerBox.height + statusBox.height;
      walletBox.width = Math.floor(screenWidth * 0.4);
      walletBox.height = Math.floor(screenHeight * 0.35);
    }

    if (logBox && headerBox && statusBox) {
      logBox.top = headerBox.height + statusBox.height;
      logBox.left = Math.floor(screenWidth * 0.41);
      logBox.width = Math.floor(screenWidth * 0.6);
      logBox.height = screenHeight - (headerBox.height + statusBox.height);
    }

    if (menuBox && headerBox && statusBox && walletBox) {
      menuBox.top = headerBox.height + statusBox.height + walletBox.height;
      menuBox.width = Math.floor(screenWidth * 0.4);
      menuBox.height = screenHeight - (headerBox.height + statusBox.height + walletBox.height);
    }

    if (menuBox && menuBox.top != null) {
      if (dailyActivitySubMenu) {
        dailyActivitySubMenu.top = menuBox.top;
        dailyActivitySubMenu.width = menuBox.width;
        dailyActivitySubMenu.height = menuBox.height;
        dailyActivitySubMenu.left = menuBox.left;
      }

      if (repetitionsForm) {
        repetitionsForm.width = Math.floor(screenWidth * 0.3);
        repetitionsForm.height = Math.floor(screenHeight * 0.3);
      }

      if (sendAmountConfigForm) {
        sendAmountConfigForm.width = Math.floor(screenWidth * 0.3);
        sendAmountConfigForm.height = Math.floor(screenHeight * 0.5);
      }

      if (reffForm) {
        reffForm.width = Math.floor(screenWidth * 0.3);
        reffForm.height = Math.floor(screenHeight * 0.6);
      }
    }

    safeRender(screen);
  } catch (error) {
    console.error(`Layout adjustment error: ${error.message}`);
  }
}

/**
 * Initialize renderer (for cleanup/reset if needed)
 */
export function initializeRenderer() {
  renderQueue = [];
  isRendering = false;
  isHeaderRendered = false;
  spinnerIndex = 0;
  borderBlinkIndex = 0;
  blinkCounter = 0;
}

/**
 * Cleanup renderer resources
 */
export function cleanupRenderer() {
  renderQueue = [];
  isRendering = false;
}
