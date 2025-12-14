// ============================================================
// FILE: src/core/dailyActivity.js
// ============================================================

import { addLog } from '../utils/logger.js';
import { 
  getShortAddress, 
  sleep, 
  randomDelay,
  setShouldStop,
  getActiveProcesses 
} from '../utils/helpers.js';
import { getBalance } from '../services/api.js';
import { loginAccount } from '../services/auth.js';
import { claimFaucetForAccount } from '../services/faucet.js';
import { performSendDiam } from '../services/transaction.js';
import { dailyActivityConfig } from '../utils/fileLoader.js';
import { DELAY } from '../config/constants.js';

/**
 * Update wallet data for all addresses
 * @param {Array<string>} addresses - Array of addresses
 * @param {Array<string>} proxies - Array of proxies
 * @param {Object} accountTokens - Account tokens object
 * @param {number} selectedWalletIndex - Currently selected wallet
 * @returns {Promise<Object>} Wallet data
 */
export async function updateWalletData(addresses, proxies, accountTokens, selectedWalletIndex) {
  const walletDataPromises = addresses.map(async (address, i) => {
    try {
      const proxyUrl = proxies[i % proxies.length] || null;
      let formattedDIAM = "N/A";

      if (accountTokens[address] && accountTokens[address].userId) {
        const balanceResponse = await getBalance(
          accountTokens[address].userId,
          proxyUrl,
          address,
          accountTokens
        );
        formattedDIAM = balanceResponse.balance.toFixed(4);
      }

      const formattedEntry = `${i === selectedWalletIndex ? "→ " : "  "}${getShortAddress(address)}   ${formattedDIAM.padEnd(8)}`;

      return {
        entry: formattedEntry,
        address,
        balance: formattedDIAM,
        isSelected: i === selectedWalletIndex
      };
    } catch (error) {
      addLog(`Failed to fetch wallet data for account #${i + 1}: ${error.message}`, "error");
      return {
        entry: `${i === selectedWalletIndex ? "→ " : "  "}N/A 0.00`,
        address: "N/A",
        balance: "0.00",
        isSelected: i === selectedWalletIndex
      };
    }
  });

  const walletData = await Promise.all(walletDataPromises);
  addLog("Wallet data updated.", "info");
  return walletData;
}

/**
 * Run daily activity for all accounts
 * @param {Object} state - Global state object
 * @param {Function} updateMenu - Update menu callback
 * @param {Function} updateStatus - Update status callback
 * @param {Function} updateWallets - Update wallets callback
 * @param {Function} safeRender - Safe render callback
 * @returns {Promise<void>}
 */
export async function runDailyActivity(state, updateMenu, updateStatus, updateWallets, safeRender) {
  if (state.addresses.length === 0) {
    addLog("No valid addresses found.", "error");
    return;
  }

  addLog(
    `Starting daily activity for all accounts. Auto Send DIAM: ${dailyActivityConfig.sendDiamRepetitions}`,
    "info"
  );

  state.activityRunning = true;
  state.isCycleRunning = true;
  setShouldStop(false);
  state.hasLoggedSleepInterrupt = false;
  state.activeProcesses = Math.max(0, state.activeProcesses);
  updateMenu();

  try {
    for (let accountIndex = 0; accountIndex < state.addresses.length; accountIndex++) {
      if (state.shouldStop) break;

      addLog(`Starting processing for account ${accountIndex + 1}`, "info");
      state.selectedWalletIndex = accountIndex;
      
      const proxyUrl = state.proxies[accountIndex % state.proxies.length] || null;
      addLog(`Account ${accountIndex + 1}: Using Proxy ${proxyUrl || "none"}...`, "info");

      const address = state.addresses[accountIndex];
      addLog(`Processing account ${accountIndex + 1}: ${getShortAddress(address)}`, "info");

      // Login account
      const loginResult = await loginAccount(
        address,
        proxyUrl,
        state.accountData,
        state.accountTokens
      );

      if (typeof loginResult === 'object' && loginResult.initial) {
        addLog(`Account ${accountIndex + 1}: Skipping daily activity due to initial state.`, "error");
        continue;
      } else if (!loginResult) {
        addLog(`Account ${accountIndex + 1}: Skipping daily activity due to login failure.`, "error");
        continue;
      }

      // Wait before faucet
      if (!state.shouldStop) {
        const delay = randomDelay(DELAY.BEFORE_FAUCET.min, DELAY.BEFORE_FAUCET.max);
        addLog(
          `Account ${accountIndex + 1}: Waiting ${Math.floor(delay / 1000)} seconds before faucet...`,
          "wait"
        );
        await sleep(delay);
      }

      // Claim faucet
      if (!state.shouldStop) {
        await claimFaucetForAccount(address, proxyUrl, accountIndex, state.accountTokens);
        await updateWallets();
      }

      // Wait before sending
      if (!state.shouldStop) {
        const delay = randomDelay(DELAY.BEFORE_PROCESS.min, DELAY.BEFORE_PROCESS.max);
        addLog(
          `Account ${accountIndex + 1}: Waiting ${Math.floor(delay / 1000)} seconds before next process...`,
          "wait"
        );
        await sleep(delay);
      }

      // Send DIAM transactions
      if (!state.shouldStop) {
        let successfulTransfers = 0;

        if (state.recipientAddresses.length > 0) {
          for (let i = 0; i < dailyActivityConfig.sendDiamRepetitions && !state.shouldStop; i++) {
            // Select random recipient (not self)
            let recipient;
            do {
              recipient = state.recipientAddresses[
                Math.floor(Math.random() * state.recipientAddresses.length)
              ];
            } while (recipient.toLowerCase() === address.toLowerCase());

            // Calculate random amount
            const amount = Math.random() * 
              (dailyActivityConfig.maxSendAmount - dailyActivityConfig.minSendAmount) + 
              dailyActivityConfig.minSendAmount;
            const amountFixed = Number(amount.toFixed(4));

            addLog(
              `Account ${accountIndex + 1}: Sending ${amountFixed} DIAM to ${getShortAddress(recipient)}...`,
              "info"
            );

            const success = await performSendDiam(
              address,
              proxyUrl,
              recipient,
              amountFixed,
              state.accountTokens
            );

            if (success) {
              successfulTransfers++;
              await updateWallets();
            }

            // Wait between sends (except last one)
            if (i < dailyActivityConfig.sendDiamRepetitions - 1 && !state.shouldStop) {
              const delay = randomDelay(DELAY.BETWEEN_SEND.min, DELAY.BETWEEN_SEND.max);
              addLog(
                `Account ${accountIndex + 1}: Waiting ${Math.floor(delay / 1000)} seconds before next send...`,
                "wait"
              );
              await sleep(delay);
            }
          }

          addLog(
            `Account ${accountIndex + 1}: Completed ${successfulTransfers} successful DIAM transfers.`,
            "success"
          );
        } else {
          addLog(
            `No recipient addresses loaded, skipping Auto Send DIAM for account ${accountIndex + 1}.`,
            "warn"
          );
        }
      }

      // Wait before next account (except last one)
      if (accountIndex < state.addresses.length - 1 && !state.shouldStop) {
        addLog(`Waiting 60 seconds before next account...`, "wait");
        await sleep(DELAY.BETWEEN_ACCOUNTS);
      }
    }

    // Schedule next cycle if not stopped
    if (!state.shouldStop && getActiveProcesses() <= 0) {
      addLog("All accounts processed. Waiting 24 hours for next cycle.", "success");
      state.dailyActivityInterval = setTimeout(() => {
        runDailyActivity(state, updateMenu, updateStatus, updateWallets, safeRender);
      }, DELAY.NEXT_CYCLE);
    }
  } catch (error) {
    addLog(`Daily activity failed: ${error.message}`, "error");
  } finally {
    if (state.shouldStop) {
      const stopCheckInterval = setInterval(() => {
        if (getActiveProcesses() <= 0) {
          clearInterval(stopCheckInterval);
          state.activityRunning = false;
          state.isCycleRunning = false;
          setShouldStop(false);
          state.hasLoggedSleepInterrupt = false;
          state.activeProcesses = 0;
          addLog(`Daily activity stopped successfully.`, "success");
          updateMenu();
          updateStatus();
          safeRender();
        } else {
          addLog(`Waiting for ${getActiveProcesses()} process to complete...`, "info");
        }
      }, 1000);
    } else {
      state.activityRunning = false;
      state.isCycleRunning = getActiveProcesses() > 0 || state.dailyActivityInterval !== null;
      updateMenu();
      updateStatus();
      safeRender();
    }
  }
}
