// ============================================================
// FILE: src/services/referral.js
// ============================================================

import { Wallet, getAddress } from 'ethers';
import { faker } from '@faker-js/faker';
import { addLog } from '../utils/logger.js';
import { getShortAddress, sleep, randomDelay } from '../utils/helpers.js';
import { appendAddress, saveReffData, loadAddresses } from '../utils/fileLoader.js';
import { loginAccount, registerAccount } from './auth.js';
import { DELAY } from '../config/constants.js';

/**
 * Create a new referral account
 * @param {string} referralCode - Referral code to use
 * @param {string} proxyUrl - Proxy URL
 * @param {Object} accountData - Account data object
 * @param {Object} accountTokens - Account tokens object
 * @param {Array} reffData - Referral data array
 * @returns {Promise<boolean>} True if successful
 */
export async function createReferralAccount(referralCode, proxyUrl, accountData, accountTokens, reffData) {
  // Generate new wallet
  const wallet = Wallet.createRandom();
  const address = getAddress(wallet.address);
  const privateKey = wallet.privateKey;
  const socialHandle = faker.internet.username();

  addLog(
    `Generating new account: Address ${getShortAddress(address)}, Social: ${socialHandle}`,
    "info"
  );

  // Try to login (will return initial state for new account)
  const loginResult = await loginAccount(address, proxyUrl, accountData, accountTokens);

  if (loginResult && loginResult.initial) {
    const { userId, accessToken } = loginResult;

    // Register the account with referral code
    const registerSuccess = await registerAccount(
      userId,
      address,
      socialHandle,
      referralCode,
      accessToken,
      proxyUrl
    );

    if (registerSuccess) {
      // Save to user.txt
      appendAddress(address);

      // Save referral data
      reffData.push({
        address,
        privateKey,
        socialHandle,
        referralCode,
        createdAt: new Date().toISOString()
      });
      saveReffData(reffData);

      return true;
    }
  }

  return false;
}

/**
 * Run auto referral creation
 * @param {string} referralCode - Referral code to use
 * @param {number} count - Number of accounts to create
 * @param {Array<string>} proxiesForReff - Proxies to use
 * @param {Object} accountData - Account data object
 * @param {Object} accountTokens - Account tokens object
 * @param {Array} reffData - Referral data array
 * @returns {Promise<Object>} Results summary
 */
export async function runCreateAutoReff(
  referralCode,
  count,
  proxiesForReff,
  accountData,
  accountTokens,
  reffData
) {
  addLog(
    `Starting auto referral with Reff-Code ${referralCode} for ${count} accounts.`,
    "info"
  );

  let successCount = 0;
  const results = [];

  for (let i = 0; i < count; i++) {
    // Select random proxy if available
    const proxyUrl = proxiesForReff.length > 0 
      ? proxiesForReff[Math.floor(Math.random() * proxiesForReff.length)] 
      : null;

    // Create referral account
    const success = await createReferralAccount(
      referralCode,
      proxyUrl,
      accountData,
      accountTokens,
      reffData
    );

    results.push({
      index: i + 1,
      success,
      proxy: proxyUrl
    });

    if (success) successCount++;

    // Wait before next account (except for last one)
    if (i < count - 1) {
      const delay = randomDelay(DELAY.BETWEEN_REFERRALS.min, DELAY.BETWEEN_REFERRALS.max);
      addLog(
        `Waiting ${Math.floor(delay / 1000)} seconds before next process...`,
        "wait"
      );
      await sleep(delay);
    }
  }

  addLog(
    `Completed auto referral: ${successCount}/${count} successful.`,
    "success"
  );

  // Reload addresses to include new ones
  loadAddresses();

  return {
    total: count,
    success: successCount,
    failed: count - successCount,
    results
  };
}

/**
 * Get referral statistics
 * @param {string} referralCode - Referral code
 * @param {Array} reffData - Referral data array
 * @returns {Object} Referral statistics
 */
export function getReferralStats(referralCode, reffData) {
  const referrals = reffData.filter(r => r.referralCode === referralCode);
  
  return {
    referralCode,
    totalReferrals: referrals.length,
    accounts: referrals.map(r => ({
      address: getShortAddress(r.address),
      socialHandle: r.socialHandle,
      createdAt: r.createdAt
    }))
  };
}

/**
 * Export referral data to CSV
 * @param {Array} reffData - Referral data array
 * @param {string} filename - Output filename
 * @returns {boolean} Success status
 */
export function exportReferralData(reffData, filename = "referrals.csv") {
  try {
    const fs = require('fs');
    
    const headers = "Address,Private Key,Social Handle,Referral Code,Created At\n";
    const rows = reffData.map(r => {
      return `${r.address},${r.privateKey},${r.socialHandle},${r.referralCode},${r.createdAt}`;
    }).join('\n');

    fs.writeFileSync(filename, headers + rows);
    addLog(`Referral data exported to ${filename}`, "success");
    return true;
  } catch (error) {
    addLog(`Failed to export referral data: ${error.message}`, "error");
    return false;
  }
}

/**
 * Validate referral code format (if needed)
 * @param {string} referralCode - Referral code to validate
 * @returns {boolean} True if valid
 */
export function validateReferralCode(referralCode) {
  if (!referralCode || typeof referralCode !== 'string') {
    return false;
  }

  // Add your validation logic here
  // For example: minimum length, allowed characters, etc.
  if (referralCode.length < 3) {
    return false;
  }

  return true;
}

/**
 * Check if referral code is already used
 * @param {string} referralCode - Referral code
 * @param {Array} reffData - Referral data array
 * @returns {boolean} True if already used
 */
export function isReferralCodeUsed(referralCode, reffData) {
  return reffData.some(r => r.referralCode === referralCode);
}

/**
 * Get unique referral codes from data
 * @param {Array} reffData - Referral data array
 * @returns {Array<string>} Unique referral codes
 */
export function getUniqueReferralCodes(reffData) {
  const codes = reffData.map(r => r.referralCode);
  return [...new Set(codes)];
        }
