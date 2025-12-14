// ============================================================
// FILE: src/ui/handlers.js
// ============================================================

import { addLog, clearTransactionLogs } from '../utils/logger.js';
import { setShouldStop, getActiveProcesses } from '../utils/helpers.js';
import { 
  dailyActivityConfig, 
  saveConfig, 
  loadAddresses,
  updateConfig 
} from '../utils/fileLoader.js';
import { runCreateAutoReff } from '../services/referral.js';
import { runDailyActivity, updateWalletData } from '../core/dailyActivity.js';

/**
 * Setup menu handlers
 * @param {Object} menuBox - Menu box
 * @param {Object} state - Global state
 * @param {Object} components - All UI components
 * @param {Object} callbacks - Callback functions
 */
export function setupMenuHandlers(menuBox, state, components, callbacks) {
  const { updateMenu, updateStatus, updateWallets, safeRender } = callbacks;
  const { reffForm, referralCodeInput, countInput, proxyInput, dailyActivitySubMenu, screen } = components;

  menuBox.on("select", async (item) => {
    const action = item.getText();

    switch (action) {
      case "Start Auto Daily Activity":
        if (state.isCycleRunning) {
          addLog("Cycle is still running. Stop the current cycle first.", "error");
        } else {
          await runDailyActivity(state, updateMenu, updateStatus, updateWallets, safeRender);
        }
        break;

      case "Stop Activity":
        setShouldStop(true);
        state.shouldStop = true;
        if (state.dailyActivityInterval) {
          clearTimeout(state.dailyActivityInterval);
          state.dailyActivityInterval = null;
        }
        addLog("Stopping daily activity... Please wait for ongoing processes to complete.", "info");

        const stopCheckInterval = setInterval(() => {
          if (getActiveProcesses() <= 0) {
            clearInterval(stopCheckInterval);
            state.activityRunning = false;
            state.isCycleRunning = false;
            setShouldStop(false);
            state.shouldStop = false;
            state.hasLoggedSleepInterrupt = false;
            state.activeProcesses = 0;
            addLog(`Daily activity stopped successfully.`, "success");
            updateMenu();
            updateStatus();
            safeRender(screen);
          } else {
            addLog(`Waiting for ${getActiveProcesses()} process to complete...`, "info");
          }
        }, 1000);
        break;

      case "Create Auto Reff":
        reffForm.show();
        setTimeout(() => {
          if (reffForm.visible) {
            screen.focusPush(referralCodeInput);
            countInput.setValue("1");
            proxyInput.setValue("");
            safeRender(screen);
          }
        }, 100);
        break;

      case "Set Manual Config":
        menuBox.hide();
        dailyActivitySubMenu.show();
        setTimeout(() => {
          if (dailyActivitySubMenu.visible) {
            screen.focusPush(dailyActivitySubMenu);
            dailyActivitySubMenu.select(0);
            safeRender(screen);
          }
        }, 100);
        break;

      case "Refresh Wallet Info":
        loadAddresses();
        state.addresses = loadAddresses();
        await updateWallets();
        addLog("Wallet information refreshed.", "success");
        break;

      case "Clear Logs":
        clearTransactionLogs();
        break;

      case "Exit":
        if (state.statusInterval) clearInterval(state.statusInterval);
        process.exit(0);
        break;
    }

    menuBox.focus();
    safeRender(screen);
  });
}

/**
 * Setup daily activity sub menu handlers
 * @param {Object} dailyActivitySubMenu - Sub menu box
 * @param {Object} components - All UI components
 * @param {Function} safeRender - Safe render function
 */
export function setupDailyActivitySubMenuHandlers(dailyActivitySubMenu, components, safeRender) {
  const { 
    screen, 
    menuBox, 
    repetitionsForm, 
    repetitionsInput, 
    sendAmountConfigForm, 
    minAmountInput, 
    maxAmountInput 
  } = components;

  dailyActivitySubMenu.on("select", (item) => {
    const action = item.getText();

    switch (action) {
      case "Set Send DIAM Config":
        repetitionsForm.show();
        repetitionsForm.configType = "sendDiam";
        setTimeout(() => {
          if (repetitionsForm.visible) {
            screen.focusPush(repetitionsInput);
            repetitionsInput.setValue(dailyActivityConfig.sendDiamRepetitions.toString());
            safeRender(screen);
          }
        }, 100);
        break;

      case "Set Send Amount Config":
        sendAmountConfigForm.show();
        setTimeout(() => {
          if (sendAmountConfigForm.visible) {
            screen.focusPush(minAmountInput);
            minAmountInput.setValue(dailyActivityConfig.minSendAmount.toString());
            maxAmountInput.setValue(dailyActivityConfig.maxSendAmount.toString());
            safeRender(screen);
          }
        }, 100);
        break;

      case "Back to Main Menu":
        dailyActivitySubMenu.hide();
        menuBox.show();
        setTimeout(() => {
          if (menuBox.visible) {
            screen.focusPush(menuBox);
            menuBox.select(0);
            safeRender(screen);
          }
        }, 100);
        break;
    }
  });

  // Escape key handler
  dailyActivitySubMenu.key(["escape"], () => {
    dailyActivitySubMenu.hide();
    menuBox.show();
    setTimeout(() => {
      if (menuBox.visible) {
        screen.focusPush(menuBox);
        menuBox.select(0);
        safeRender(screen);
      }
    }, 100);
  });
}

/**
 * Setup repetitions form handlers
 * @param {Object} forms - Form components
 * @param {Object} components - All UI components
 * @param {Function} updateStatus - Update status callback
 * @param {Function} safeRender - Safe render function
 */
export function setupRepetitionsFormHandlers(forms, components, updateStatus, safeRender) {
  const { repetitionsForm, repetitionsInput, repetitionsSubmitButton } = forms;
  const { screen, dailyActivitySubMenu } = components;

  // Enter key on input
  repetitionsInput.key(["enter"], () => {
    repetitionsForm.submit();
  });

  // Submit button handlers
  const handleRepSubmit = () => {
    repetitionsForm.submit();
  };

  repetitionsSubmitButton.on("press", handleRepSubmit);
  repetitionsSubmitButton.on("click", () => {
    try {
      screen.focusPush(repetitionsSubmitButton);
    } catch (e) {}
    handleRepSubmit();
  });

  // Form submit handler
  repetitionsForm.on("submit", () => {
    const repetitionsText = repetitionsInput.getValue().trim();
    let repetitions;

    try {
      repetitions = parseInt(repetitionsText, 10);
      if (isNaN(repetitions) || repetitions < 1 || repetitions > 1000) {
        addLog("Invalid input. Please enter a number between 1 and 1000.", "error");
        repetitionsInput.setValue("");
        screen.focusPush(repetitionsInput);
        safeRender(screen);
        return;
      }
    } catch (error) {
      addLog(`Invalid format: ${error.message}`, "error");
      repetitionsInput.setValue("");
      screen.focusPush(repetitionsInput);
      safeRender(screen);
      return;
    }

    if (repetitionsForm.configType === "sendDiam") {
      updateConfig({ sendDiamRepetitions: repetitions });
      addLog(`Send DIAM Config set to ${repetitions}`, "success");
    }

    updateStatus();

    repetitionsForm.hide();
    dailyActivitySubMenu.show();
    setTimeout(() => {
      if (dailyActivitySubMenu.visible) {
        screen.focusPush(dailyActivitySubMenu);
        dailyActivitySubMenu.select(0);
        safeRender(screen);
      }
    }, 100);
  });

  // Escape key handler
  repetitionsForm.key(["escape"], () => {
    repetitionsForm.hide();
    dailyActivitySubMenu.show();
    setTimeout(() => {
      if (dailyActivitySubMenu.visible) {
        screen.focusPush(dailyActivitySubMenu);
        dailyActivitySubMenu.select(0);
        safeRender(screen);
      }
    }, 100);
  });
}

/**
 * Setup send amount form handlers
 * @param {Object} forms - Form components
 * @param {Object} components - All UI components
 * @param {Function} updateStatus - Update status callback
 * @param {Function} safeRender - Safe render function
 */
export function setupSendAmountFormHandlers(forms, components, updateStatus, safeRender) {
  const { sendAmountConfigForm, minAmountInput, maxAmountInput, sendAmountSubmitButton } = forms;
  const { screen, dailyActivitySubMenu } = components;

  // Enter key handlers
  minAmountInput.key(["enter"], () => {
    screen.focusPush(maxAmountInput);
  });

  maxAmountInput.key(["enter"], () => {
    sendAmountConfigForm.submit();
  });

  // Submit button handlers
  const handleSendSubmit = () => {
    sendAmountConfigForm.submit();
  };

  sendAmountSubmitButton.on("press", handleSendSubmit);
  sendAmountSubmitButton.on("click", () => {
    try {
      screen.focusPush(sendAmountSubmitButton);
    } catch (e) {}
    handleSendSubmit();
  });

  // Form submit handler
  sendAmountConfigForm.on("submit", () => {
    const minText = minAmountInput.getValue().trim();
    const maxText = maxAmountInput.getValue().trim();
    let minAmount, maxAmount;

    try {
      minAmount = parseFloat(minText);
      maxAmount = parseFloat(maxText);

      if (isNaN(minAmount) || isNaN(maxAmount) || minAmount <= 0 || maxAmount <= 0 || minAmount >= maxAmount) {
        addLog("Invalid input. Min and Max must be positive numbers with Min < Max.", "error");
        minAmountInput.setValue("");
        maxAmountInput.setValue("");
        screen.focusPush(minAmountInput);
        safeRender(screen);
        return;
      }
    } catch (error) {
      addLog(`Invalid format: ${error.message}`, "error");
      minAmountInput.setValue("");
      maxAmountInput.setValue("");
      screen.focusPush(minAmountInput);
      safeRender(screen);
      return;
    }

    updateConfig({ 
      minSendAmount: minAmount, 
      maxSendAmount: maxAmount 
    });
    addLog(`Send Amount Config set to Min: ${minAmount}, Max: ${maxAmount}`, "success");
    updateStatus();

    sendAmountConfigForm.hide();
    dailyActivitySubMenu.show();
    setTimeout(() => {
      if (dailyActivitySubMenu.visible) {
        screen.focusPush(dailyActivitySubMenu);
        dailyActivitySubMenu.select(0);
        safeRender(screen);
      }
    }, 100);
  });

  // Escape key handler
  sendAmountConfigForm.key(["escape"], () => {
    sendAmountConfigForm.hide();
    dailyActivitySubMenu.show();
    setTimeout(() => {
      if (dailyActivitySubMenu.visible) {
        screen.focusPush(dailyActivitySubMenu);
        dailyActivitySubMenu.select(0);
        safeRender(screen);
      }
    }, 100);
  });
}

/**
 * Setup referral form handlers
 * @param {Object} forms - Form components
 * @param {Object} components - All UI components
 * @param {Object} state - Global state
 * @param {Function} safeRender - Safe render function
 */
export function setupReferralFormHandlers(forms, components, state, safeRender) {
  const { reffForm, referralCodeInput, countInput, proxyInput, reffSubmitButton } = forms;
  const { screen, menuBox } = components;

  // Enter key handlers
  referralCodeInput.key(["enter"], () => {
    screen.focusPush(countInput);
  });

  countInput.key(["enter"], () => {
    screen.focusPush(proxyInput);
  });

  proxyInput.key(["enter"], () => {
    reffForm.submit();
  });

  // Submit button handlers
  const handleReffSubmit = () => {
    reffForm.submit();
  };

  reffSubmitButton.on("press", handleReffSubmit);
  reffSubmitButton.on("click", () => {
    try {
      screen.focusPush(reffSubmitButton);
    } catch (e) {}
    handleReffSubmit();
  });

  // Form submit handler
  reffForm.on("submit", async () => {
    const referralCode = referralCodeInput.getValue().trim();
    const countText = countInput.getValue().trim();
    const proxiesText = proxyInput.getValue().trim();
    let count;

    try {
      count = parseInt(countText, 10);
      if (isNaN(count) || count < 1 || count > 100) {
        addLog("Invalid count. Please enter a number between 1 and 100.", "error");
        countInput.setValue("1");
        screen.focusPush(countInput);
        safeRender(screen);
        return;
      }
    } catch (error) {
      addLog(`Invalid format: ${error.message}`, "error");
      countInput.setValue("1");
      screen.focusPush(countInput);
      safeRender(screen);
      return;
    }

    if (!referralCode) {
      addLog("Referral code is required.", "error");
      screen.focusPush(referralCodeInput);
      safeRender(screen);
      return;
    }

    const proxiesForReff = proxiesText 
      ? proxiesText.split(',').map(p => p.trim()).filter(p => p) 
      : [];

    reffForm.hide();
    menuBox.show();
    setTimeout(() => {
      if (menuBox.visible) {
        screen.focusPush(menuBox);
        menuBox.select(0);
        safeRender(screen);
      }
    }, 100);

    await runCreateAutoReff(
      referralCode,
      count,
      proxiesForReff,
      state.accountData,
      state.accountTokens,
      state.reffData
    );
  });

  // Escape key handler
  reffForm.key(["escape"], () => {
    reffForm.hide();
    menuBox.show();
    setTimeout(() => {
      if (menuBox.visible) {
        screen.focusPush(menuBox);
        menuBox.select(0);
        safeRender(screen);
      }
    }, 100);
  });
          }
