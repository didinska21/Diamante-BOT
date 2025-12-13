// ============================================================
// FILE: src/config/constants.js
// ============================================================

/**
 * API Configuration
 */
export const API_BASE_URL = "https://campapi.diamante.io/api/v1";

/**
 * File Paths
 */
export const CONFIG_FILE = "config.json";
export const ACCOUNT_DATA_FILE = "account_data.json";
export const REFF_DATA_FILE = "reff_data.json";
export const USER_FILE = "user.txt";
export const PROXY_FILE = "proxy.txt";
export const WALLET_FILE = "wallet.txt";

/**
 * Debug Mode
 */
export const isDebug = false;

/**
 * Default HTTP Headers untuk API Request
 */
export const CONFIG_DEFAULT_HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Cache-Control": "no-cache",
  "Origin": "https://campaign.diamante.io",
  "Pragma": "no-cache",
  "Priority": "u=1, i",
  "Referer": "https://campaign.diamante.io/",
  "Sec-Ch-Ua": '"Chromium";v="134", "Not:A-Brand";v="24", "Google Chrome";v="134"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
};

/**
 * UI Configuration
 */
export const LOADING_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const BORDER_BLINK_COLORS = ["cyan", "blue", "magenta", "red", "yellow", "green"];

/**
 * Default Activity Configuration
 */
export const DEFAULT_ACTIVITY_CONFIG = {
  sendDiamRepetitions: 1,
  minSendAmount: 0.01,
  maxSendAmount: 0.02
};

/**
 * Retry Configuration
 */
export const API_MAX_RETRIES = 3;
export const API_RETRY_DELAY = 2000;
export const FAUCET_MAX_RETRIES = 10;
export const FAUCET_RETRY_DELAY = 5000;

/**
 * Delay Configuration (in milliseconds)
 */
export const DELAY = {
  BEFORE_FAUCET: { min: 8000, max: 12000 },
  BEFORE_PROCESS: { min: 8000, max: 12000 },
  BETWEEN_SEND: { min: 15000, max: 30000 },
  BETWEEN_ACCOUNTS: 60000,
  BETWEEN_REFERRALS: { min: 15000, max: 20000 },
  NEXT_CYCLE: 24 * 60 * 60 * 1000 // 24 hours
};
