// ============================================================
// FILE: src/services/transaction.js
// ============================================================

import { getAddress } from 'ethers';
import { addLog } from '../utils/logger.js';
import { getShortAddress, getShortHash } from '../utils/helpers.js';
import { makeApiRequest, getTweetContent } from './api.js';
import { API_BASE_URL } from '../config/constants.js';

/**
 * Send DIAM tokens to recipient
 * @param {string} address - Sender wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {string} recipient - Recipient wallet address
 * @param {number} amount - Amount to send
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<boolean>} True if successful
 */
export async function performSendDiam(address, proxyUrl, recipient, amount, accountTokens) {
  const userId = accountTokens[address]?.userId;
  if (!userId) {
    addLog(`No userId for send DIAM.`, "error");
    return false;
  }

  try {
    const sendUrl = `${API_BASE_URL}/transaction/transfer`;
    const payload = {
      "toAddress": getAddress(recipient),
      "amount": amount,
      "userId": userId
    };

    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`,
      "Content-Type": "application/json"
    };

    const response = await makeApiRequest("post", sendUrl, payload, proxyUrl, headers);

    if (response.data.success) {
      const txHash = response.data.data.transferData.hash;
      addLog(
        `Sent ${amount} DIAM to ${getShortAddress(recipient)}. Hash: ${getShortHash(txHash)}`,
        "success"
      );

      // Get tweet content for sharing (optional)
      await getTweetContent(userId, proxyUrl, address, accountTokens);
      
      return true;
    } else {
      addLog(`Send failed: ${response.data.message}`, "error");
      return false;
    }
  } catch (error) {
    addLog(`Send DIAM failed: ${error.message}`, "error");
    return false;
  }
}

/**
 * Send multiple DIAM transactions
 * @param {string} address - Sender wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {Array<Object>} transactions - Array of {recipient, amount}
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<Object>} Results summary
 */
export async function performBatchSendDiam(address, proxyUrl, transactions, accountTokens) {
  const results = {
    total: transactions.length,
    success: 0,
    failed: 0,
    transactions: []
  };

  for (const tx of transactions) {
    const success = await performSendDiam(
      address, 
      proxyUrl, 
      tx.recipient, 
      tx.amount, 
      accountTokens
    );

    results.transactions.push({
      recipient: tx.recipient,
      amount: tx.amount,
      success
    });

    if (success) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  return results;
}

/**
 * Estimate transaction fee (if needed)
 * @param {string} address - Wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {number} amount - Amount to send
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<number>} Estimated fee
 */
export async function estimateTransactionFee(address, proxyUrl, amount, accountTokens) {
  try {
    // This is a placeholder - adjust based on actual API
    // Most likely the fee is included in the API or is zero
    return 0;
  } catch (error) {
    addLog(`Failed to estimate fee: ${error.message}`, "error");
    return 0;
  }
}

/**
 * Get transaction history
 * @param {string} address - Wallet address
 * @param {string} proxyUrl - Proxy URL
 * @param {Object} accountTokens - Account tokens object
 * @param {number} limit - Number of transactions to fetch
 * @returns {Promise<Array>} Transaction history
 */
export async function getTransactionHistory(address, proxyUrl, accountTokens, limit = 10) {
  try {
    const userId = accountTokens[address]?.userId;
    if (!userId) {
      return [];
    }

    // This is a placeholder - adjust based on actual API endpoint
    const historyUrl = `${API_BASE_URL}/transaction/history/${userId}?limit=${limit}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };

    const response = await makeApiRequest("get", historyUrl, null, proxyUrl, headers);

    if (response.data.success) {
      return response.data.data.transactions || [];
    } else {
      return [];
    }
  } catch (error) {
    addLog(`Failed to get transaction history: ${error.message}`, "error");
    return [];
  }
}
