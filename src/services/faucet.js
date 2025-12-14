// ============================================================
// FILE: src/services/faucet.js
// ============================================================

import { addLog } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { makeApiRequest } from './api.js';
import { 
  API_BASE_URL,
  FAUCET_MAX_RETRIES,
  FAUCET_RETRY_DELAY 
} from '../config/constants.js';

/**
 * Claim faucet for an account
 * @param {string} address - Wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {number} accountIndex - Account index for logging
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<boolean>} True if successful
 */
export async function claimFaucetForAccount(address, proxyUrl, accountIndex, accountTokens) {
  addLog(`Processing Claiming Faucet for account ${accountIndex + 1}`, "wait");

  const userId = accountTokens[address]?.userId;
  if (!userId) {
    addLog(`Account ${accountIndex + 1}: No userId available for faucet claim.`, "error");
    return false;
  }

  for (let attempt = 1; attempt <= FAUCET_MAX_RETRIES; attempt++) {
    try {
      const faucetUrl = `${API_BASE_URL}/transaction/fund-wallet/${userId}`;
      const headers = {
        "Cookie": `access_token=${accountTokens[address].accessToken}`
      };

      const response = await makeApiRequest("get", faucetUrl, null, proxyUrl, headers);

      if (response.data.success) {
        addLog(
          `Account ${accountIndex + 1}: DIAM faucet claimed successfully. Funded: ${response.data.data.fundedAmount}`,
          "success"
        );
        return true;
      } else {
        // Check if already claimed today
        if (response.data.message.includes("You can claim from the faucet once per day")) {
          addLog(`Account ${accountIndex + 1}: ${response.data.message}`, "wait");
          return true; // Return true as this is expected behavior
        }

        addLog(
          `Account ${accountIndex + 1}: Faucet claim attempt ${attempt} failed: ${response.data.message}`,
          "error"
        );
      }
    } catch (error) {
      addLog(
        `Account ${accountIndex + 1}: Faucet claim attempt ${attempt} error: ${error.message}`,
        "error"
      );
    }

    // Retry with delay if not last attempt
    if (attempt < FAUCET_MAX_RETRIES) {
      addLog(
        `Account ${accountIndex + 1}: Retrying faucet claim in ${FAUCET_RETRY_DELAY / 1000} seconds...`,
        "wait"
      );
      await sleep(FAUCET_RETRY_DELAY);
    }
  }

  addLog(
    `Account ${accountIndex + 1}: Failed to claim faucet after ${FAUCET_MAX_RETRIES} attempts.`,
    "error"
  );
  return false;
}

/**
 * Check if faucet is available for account
 * @param {string} address - Wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<Object>} Faucet availability info
 */
export async function checkFaucetAvailability(address, proxyUrl, accountTokens) {
  try {
    const userId = accountTokens[address]?.userId;
    if (!userId) {
      return { available: false, message: "No userId available" };
    }

    const faucetUrl = `${API_BASE_URL}/transaction/fund-wallet/${userId}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };

    const response = await makeApiRequest("get", faucetUrl, null, proxyUrl, headers);

    if (response.data.success) {
      return { available: true, message: "Faucet available" };
    } else {
      return { 
        available: false, 
        message: response.data.message 
      };
    }
  } catch (error) {
    return { 
      available: false, 
      message: error.message 
    };
  }
}
