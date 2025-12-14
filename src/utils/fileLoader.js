// ============================================================
// FILE: src/utils/fileLoader.js
// ============================================================

import fs from 'fs';
import { getAddress } from 'ethers';
import { addLog } from './logger.js';
import { getShortAddress, isValidEthAddress } from './helpers.js';
import {
  CONFIG_FILE,
  ACCOUNT_DATA_FILE,
  REFF_DATA_FILE,
  USER_FILE,
  PROXY_FILE,
  WALLET_FILE,
  DEFAULT_ACTIVITY_CONFIG
} from '../config/constants.js';

/**
 * Daily Activity Configuration
 */
export let dailyActivityConfig = { ...DEFAULT_ACTIVITY_CONFIG };

/**
 * Load configuration from file
 * @returns {Object} Configuration object
 */
export function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, "utf8");
      const config = JSON.parse(data);
      
      dailyActivityConfig.sendDiamRepetitions = Number(config.sendDiamRepetitions) || 1;
      dailyActivityConfig.minSendAmount = Number(config.minSendAmount) || 0.01;
      dailyActivityConfig.maxSendAmount = Number(config.maxSendAmount) || 0.02;
      
      addLog(`Loaded Config Successfully`, "success");
      return dailyActivityConfig;
    } else {
      addLog("No config file found, using default settings.", "info");
      return dailyActivityConfig;
    }
  } catch (error) {
    addLog(`Failed to load config: ${error.message}, using default settings.`, "error");
    return dailyActivityConfig;
  }
}

/**
 * Save configuration to file
 * @returns {boolean} Success status
 */
export function saveConfig() {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(dailyActivityConfig, null, 2));
    addLog("Configuration saved successfully.", "success");
    return true;
  } catch (error) {
    addLog(`Failed to save config: ${error.message}`, "error");
    return false;
  }
}

/**
 * Update configuration values
 * @param {Object} newConfig - New configuration values
 */
export function updateConfig(newConfig) {
  dailyActivityConfig = { ...dailyActivityConfig, ...newConfig };
  return saveConfig();
}

/**
 * Load account data from file
 * @returns {Object} Account data object
 */
export function loadAccountData() {
  try {
    if (fs.existsSync(ACCOUNT_DATA_FILE)) {
      const data = fs.readFileSync(ACCOUNT_DATA_FILE, "utf8");
      const accountData = JSON.parse(data);
      addLog(`Loaded account data from ${ACCOUNT_DATA_FILE}`, "success");
      return accountData;
    } else {
      addLog("No account data file found, starting with empty data.", "info");
      return {};
    }
  } catch (error) {
    addLog(`Failed to load account data: ${error.message}, starting with empty data.`, "error");
    return {};
  }
}

/**
 * Save account data to file
 * @param {Object} accountData - Account data to save
 * @returns {boolean} Success status
 */
export function saveAccountData(accountData) {
  try {
    fs.writeFileSync(ACCOUNT_DATA_FILE, JSON.stringify(accountData, null, 2));
    addLog("Account data saved successfully.", "success");
    return true;
  } catch (error) {
    addLog(`Failed to save account data: ${error.message}`, "error");
    return false;
  }
}

/**
 * Load referral data from file
 * @returns {Array} Referral data array
 */
export function loadReffData() {
  try {
    if (fs.existsSync(REFF_DATA_FILE)) {
      const data = fs.readFileSync(REFF_DATA_FILE, "utf8");
      const reffData = JSON.parse(data);
      addLog(`Loaded referral data from ${REFF_DATA_FILE}`, "success");
      return reffData;
    } else {
      addLog("No referral data file found, starting with empty data.", "info");
      return [];
    }
  } catch (error) {
    addLog(`Failed to load referral data: ${error.message}, starting with empty data.`, "error");
    return [];
  }
}

/**
 * Save referral data to file
 * @param {Array} reffData - Referral data to save
 * @returns {boolean} Success status
 */
export function saveReffData(reffData) {
  try {
    fs.writeFileSync(REFF_DATA_FILE, JSON.stringify(reffData, null, 2));
    addLog("Referral data saved successfully.", "success");
    return true;
  } catch (error) {
    addLog(`Failed to save referral data: ${error.message}`, "error");
    return false;
  }
}

/**
 * Load addresses from user.txt
 * @returns {Array<string>} Array of checksummed addresses
 */
export function loadAddresses() {
  try {
    const data = fs.readFileSync(USER_FILE, "utf8");
    let addresses = data.split("\n")
      .map(addr => addr.trim())
      .filter(addr => isValidEthAddress(addr));

    addresses = addresses.map(addr => {
      try {
        const checksummed = getAddress(addr);
        addLog(`Converted address ${getShortAddress(addr)} to checksum: ${getShortAddress(checksummed)}`, "debug");
        return checksummed;
      } catch (error) {
        addLog(`Invalid address format: ${addr} - Skipping. Error: ${error.message}`, "error");
        return null;
      }
    }).filter(Boolean);

    if (addresses.length === 0) {
      throw new Error("No valid address in user.txt");
    }

    addLog(`Loaded ${addresses.length} address(es) from ${USER_FILE}`, "success");
    return addresses;
  } catch (error) {
    addLog(`Failed to load addresses: ${error.message}`, "error");
    return [];
  }
}

/**
 * Append new address to user.txt
 * @param {string} newAddress - New address to append
 * @returns {boolean} Success status
 */
export function appendAddress(newAddress) {
  try {
    const checksummed = getAddress(newAddress);
    fs.appendFileSync(USER_FILE, `\n${checksummed}`);
    addLog(`Added new address ${getShortAddress(checksummed)} to ${USER_FILE}`, "success");
    return true;
  } catch (error) {
    addLog(`Failed to append address: ${error.message}`, "error");
    return false;
  }
}

/**
 * Load proxies from proxy.txt
 * @returns {Array<string>} Array of proxy URLs
 */
export function loadProxies() {
  try {
    const data = fs.readFileSync(PROXY_FILE, "utf8");
    const proxies = data.split("\n")
      .map(proxy => proxy.trim())
      .filter(proxy => proxy);

    if (proxies.length === 0) {
      throw new Error("No proxies found in proxy.txt");
    }

    addLog(`Loaded ${proxies.length} proxies from ${PROXY_FILE}`, "success");
    return proxies;
  } catch (error) {
    addLog(`No ${PROXY_FILE} found or failed to load, running without proxies: ${error.message}`, "warn");
    return [];
  }
}

/**
 * Load recipient addresses from wallet.txt
 * @returns {Array<string>} Array of recipient addresses
 */
export function loadRecipientAddresses() {
  try {
    const data = fs.readFileSync(WALLET_FILE, "utf8");
    let recipients = data.split("\n")
      .map(addr => addr.trim())
      .filter(addr => isValidEthAddress(addr));

    recipients = recipients.map(addr => {
      try {
        return getAddress(addr);
      } catch (error) {
        addLog(`Invalid recipient address: ${addr} - Skipping.`, "error");
        return null;
      }
    }).filter(Boolean);

    if (recipients.length === 0) {
      throw new Error("No valid addresses in wallet.txt");
    }

    addLog(`Loaded ${recipients.length} recipient address(es) from ${WALLET_FILE}`, "success");
    return recipients;
  } catch (error) {
    addLog(`No ${WALLET_FILE} found or failed to load, skipping DIAM transfers: ${error.message}`, "warn");
    return [];
  }
                              }
