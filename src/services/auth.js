// ============================================================
// FILE: src/services/auth.js
// ============================================================

import { getAddress } from 'ethers';
import { addLog } from '../utils/logger.js';
import { getShortAddress, shouldStop } from '../utils/helpers.js';
import { makeApiRequest } from './api.js';
import { API_BASE_URL } from '../config/constants.js';
import { saveAccountData } from '../utils/fileLoader.js';

/**
 * Login account to API
 * @param {string} address - Wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {Object} accountData - Account data object
 * @param {Object} accountTokens - Account tokens object
 * @param {boolean} useProxy - Whether to use proxy
 * @returns {Promise<boolean|Object>} True if logged in, object if initial state, false if failed
 */
export async function loginAccount(address, proxyUrl, accountData, accountTokens, useProxy = true) {
  if (shouldStop()) {
    addLog("Login stopped due to stop request.", "info");
    return false;
  }

  try {
    const loginUrl = `${API_BASE_URL}/user/connect-wallet`;
    const checksummedAddress = getAddress(address);
    addLog(`Logging in with address: ${getShortAddress(address)}`, "debug");

    // Get or generate device ID
    let deviceId = accountData[checksummedAddress.toLowerCase()];
    if (!deviceId) {
      deviceId = `DEV${Math.random().toString(24).substr(2, 5).toUpperCase()}`;
      addLog(`Generated new deviceId for ${getShortAddress(checksummedAddress)}: ${deviceId}`, "info");
    } else {
      addLog(`Using existing deviceId for ${getShortAddress(checksummedAddress)}: ${deviceId}`, "info");
    }

    const payload = {
      "address": checksummedAddress,
      "deviceId": deviceId,
      "deviceSource": "web_app",
      "deviceType": "Windows",
      "browser": "Chrome",
      "ipAddress": "0.0.0.0",
      "latitude": 12.9715987,
      "longitude": 77.5945627,
      "countryCode": "Unknown",
      "country": "Unknown",
      "continent": "Unknown",
      "continentCode": "Unknown",
      "region": "Unknown",
      "regionCode": "Unknown",
      "city": "Unknown"
    };

    const response = await makeApiRequest("post", loginUrl, payload, proxyUrl, {}, 3, 2000, useProxy);

    if (response.data.success) {
      const userId = response.data.data.userId;
      const setCookie = response.headers['set-cookie'];
      let accessToken = null;

      // Extract access token from cookies
      if (setCookie) {
        const cookieStr = setCookie[0] || "";
        const match = cookieStr.match(/access_token=([^;]+)/);
        if (match) accessToken = match[1];
      }

      if (!accessToken) {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Failed to extract access_token from cookies.`, "error");
        return false;
      }

      // Store tokens
      accountTokens[checksummedAddress] = {
        userId,
        accessToken
      };

      // Save device ID if new
      if (!accountData[checksummedAddress.toLowerCase()]) {
        accountData[checksummedAddress.toLowerCase()] = deviceId;
        saveAccountData(accountData);
      }

      // Check account status
      if (response.data.data.isSocialExists === "VERIFIED") {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Login Successfully`, "success");
        return true;
      } else if (response.data.data.isSocialExists === "INITIAL") {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Not Registered Yet. Ready for registration.`, "info");
        return { initial: true, userId, accessToken };
      } else {
        addLog(`Account ${getShortAddress(checksummedAddress)}: Unexpected state: ${response.data.data.isSocialExists}`, "error");
        return false;
      }
    } else {
      addLog(`Account ${getShortAddress(checksummedAddress)}: Login failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    addLog(`Account ${getShortAddress(address)}: Login error: ${error.message}`, "error");
    return false;
  }
}

/**
 * Register new account
 * @param {string} userId - User ID
 * @param {string} address - Wallet address
 * @param {string} socialHandle - Social media handle
 * @param {string} referralCode - Referral code
 * @param {string} accessToken - Access token
 * @param {string} proxyUrl - Proxy URL
 * @returns {Promise<boolean>} True if successful
 */
export async function registerAccount(userId, address, socialHandle, referralCode, accessToken, proxyUrl) {
  try {
    const registerUrl = `${API_BASE_URL}/auth/register`;
    const checksummedAddress = getAddress(address);
    
    const payload = {
      "userId": userId,
      "walletAddress": checksummedAddress,
      "socialHandle": socialHandle,
      "referralCode": referralCode
    };

    const headers = {
      "Cookie": `access_token=${accessToken}`,
      "Content-Type": "application/json"
    };

    const response = await makeApiRequest("post", registerUrl, payload, proxyUrl, headers);
    
    if (response.data.success) {
      addLog(`Account ${getShortAddress(checksummedAddress)}: Registration successful with referral ${referralCode}. Social: ${socialHandle}`, "success");
      return true;
    } else {
      addLog(`Account ${getShortAddress(checksummedAddress)}: Registration failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    addLog(`Account ${getShortAddress(address)}: Registration error: ${error.message}`, "error");
    return false;
  }
}
