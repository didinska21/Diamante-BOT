// ============================================================
// FILE: src/utils/logger.js
// ============================================================

import { isDebug } from '../config/constants.js';

/**
 * Transaction logs storage
 */
let transactionLogs = [];

/**
 * Maximum logs to keep in memory
 */
const MAX_LOGS = 500;

/**
 * Reference to UI update function (will be set from UI module)
 */
let updateLogsCallback = null;

/**
 * Set callback function for UI updates
 * @param {Function} callback - Function to call when logs are updated
 */
export function setUpdateLogsCallback(callback) {
  updateLogsCallback = callback;
}

/**
 * Add log message with timestamp and color
 * @param {string} message - Log message
 * @param {string} type - Log type: 'info', 'success', 'error', 'wait', 'debug'
 */
export function addLog(message, type = "info") {
  // Skip debug logs if debug mode is off
  if (type === "debug" && !isDebug) return;

  const timestamp = new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" });
  
  let coloredMessage;
  switch (type) {
    case "error":
      coloredMessage = `{red-fg}${message}{/red-fg}`;
      break;
    case "success":
      coloredMessage = `{green-fg}${message}{/green-fg}`;
      break;
    case "wait":
      coloredMessage = `{yellow-fg}${message}{/yellow-fg}`;
      break;
    case "debug":
      coloredMessage = `{blue-fg}${message}{/blue-fg}`;
      break;
    default:
      coloredMessage = message;
  }

  const logEntry = `{bright-cyan-fg}[{/bright-cyan-fg} {bold}{grey-fg}${timestamp}{/grey-fg}{/bold} {bright-cyan-fg}]{/bright-cyan-fg} {bold}${coloredMessage}{/bold}`;
  
  transactionLogs.push(logEntry);

  // Limit logs in memory to prevent memory leak
  if (transactionLogs.length > MAX_LOGS) {
    transactionLogs.shift();
  }

  // Call UI update callback if set
  if (updateLogsCallback) {
    updateLogsCallback();
  }
}

/**
 * Clear all transaction logs
 */
export function clearTransactionLogs() {
  transactionLogs = [];
  addLog("Transaction logs cleared.", "success");
}

/**
 * Get all transaction logs
 * @returns {Array<string>} Array of log entries
 */
export function getTransactionLogs() {
  return transactionLogs;
}

/**
 * Get formatted logs as string
 * @returns {string} All logs joined with newlines
 */
export function getFormattedLogs() {
  return transactionLogs.join("\n") || "{grey-fg}No logs available.{/grey-fg}";
}

/**
 * Export logs to file (optional feature)
 * @param {string} filename - Output filename
 */
export function exportLogs(filename = "logs.txt") {
  try {
    const fs = require('fs');
    const plainLogs = transactionLogs.map(log => {
      // Remove blessed color tags for plain text export
      return log.replace(/\{[^}]+\}/g, '');
    }).join('\n');
    
    fs.writeFileSync(filename, plainLogs);
    addLog(`Logs exported to ${filename}`, "success");
    return true;
  } catch (error) {
    addLog(`Failed to export logs: ${error.message}`, "error");
    return false;
  }
}

