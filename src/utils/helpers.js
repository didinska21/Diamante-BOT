// ============================================================
// FILE: src/utils/helpers.js
// ============================================================

import { addLog } from './logger.js';

/**
 * Global state for process control
 */
let globalState = {
  shouldStop: false,
  hasLoggedSleepInterrupt: false,
  activeProcesses: 0
};

/**
 * Initialize global state reference
 * @param {Object} state - State object to use
 */
export function initializeState(state) {
  globalState = state;
}

/**
 * Shorten Ethereum address for display
 * @param {string} address - Full Ethereum address
 * @returns {string} Shortened address (e.g., "0x1234...5678")
 */
export function getShortAddress(address) {
  return address ? address.slice(0, 6) + "..." + address.slice(-4) : "N/A";
}

/**
 * Shorten transaction hash for display
 * @param {string} hash - Full transaction hash
 * @returns {string} Shortened hash (e.g., "0xabcd...ef12")
 */
export function getShortHash(hash) {
  return hash.slice(0, 6) + "..." + hash.slice(-4);
}

/**
 * Sleep function with stop check
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export async function sleep(ms) {
  if (globalState.shouldStop) {
    if (!globalState.hasLoggedSleepInterrupt) {
      addLog("Process stopped successfully.", "info");
      globalState.hasLoggedSleepInterrupt = true;
    }
    return;
  }

  globalState.activeProcesses++;
  
  try {
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, ms);

      const checkStop = setInterval(() => {
        if (globalState.shouldStop) {
          clearTimeout(timeout);
          clearInterval(checkStop);
          if (!globalState.hasLoggedSleepInterrupt) {
            addLog("Process stopped successfully.", "info");
            globalState.hasLoggedSleepInterrupt = true;
          }
          resolve();
        }
      }, 100);
    });
  } finally {
    globalState.activeProcesses = Math.max(0, globalState.activeProcesses - 1);
  }
}

/**
 * Generate random delay within range
 * @param {number} min - Minimum delay in milliseconds
 * @param {number} max - Maximum delay in milliseconds
 * @returns {number} Random delay
 */
export function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Format balance to fixed decimal places
 * @param {number} balance - Balance amount
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted balance
 */
export function formatBalance(balance, decimals = 4) {
  return Number(balance).toFixed(decimals);
}

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @returns {boolean} True if valid
 */
export function isValidEthAddress(address) {
  return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Wait for active processes to complete
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} True if all processes completed
 */
export async function waitForProcesses(maxWaitTime = 60000) {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      if (globalState.activeProcesses <= 0) {
        clearInterval(checkInterval);
        resolve(true);
      } else if (Date.now() - startTime > maxWaitTime) {
        clearInterval(checkInterval);
        addLog(`Timeout waiting for processes. ${globalState.activeProcesses} still active.`, "warn");
        resolve(false);
      } else {
        addLog(`Waiting for ${globalState.activeProcesses} process(es) to complete...`, "info");
      }
    }, 1000);
  });
}

/**
 * Increment active process counter
 */
export function incrementActiveProcesses() {
  globalState.activeProcesses++;
}

/**
 * Decrement active process counter
 */
export function decrementActiveProcesses() {
  globalState.activeProcesses = Math.max(0, globalState.activeProcesses - 1);
}

/**
 * Get current active processes count
 * @returns {number} Active processes count
 */
export function getActiveProcesses() {
  return globalState.activeProcesses;
}

/**
 * Check if stop is requested
 * @returns {boolean} True if should stop
 */
export function shouldStop() {
  return globalState.shouldStop;
}

/**
 * Set stop flag
 * @param {boolean} value - Stop flag value
 */
export function setShouldStop(value) {
  globalState.shouldStop = value;
  if (value) {
    globalState.hasLoggedSleepInterrupt = false;
  }
}

/**
 * Format time duration
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration (e.g., "2h 30m 15s")
 */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Pad string to specified length
 * @param {string} str - String to pad
 * @param {number} length - Target length
 * @param {string} padChar - Character to use for padding
 * @returns {string} Padded string
 */
export function padString(str, length, padChar = ' ') {
  return str.padEnd(length, padChar);
}

/**
 * Create a delay with random jitter
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} jitterPercent - Jitter percentage (0-100)
 * @returns {number} Delay with jitter applied
 */
export function delayWithJitter(baseDelay, jitterPercent = 20) {
  const jitter = baseDelay * (jitterPercent / 100);
  const randomJitter = Math.random() * jitter * 2 - jitter;
  return Math.floor(baseDelay + randomJitter);
}
