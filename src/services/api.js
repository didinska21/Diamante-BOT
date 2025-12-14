// ============================================================
// FILE: src/services/api.js
// ============================================================

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { addLog } from '../utils/logger.js';
import { sleep, incrementActiveProcesses, decrementActiveProcesses, shouldStop } from '../utils/helpers.js';
import { 
  API_BASE_URL, 
  CONFIG_DEFAULT_HEADERS,
  API_MAX_RETRIES,
  API_RETRY_DELAY 
} from '../config/constants.js';

/**
 * Create proxy agent based on URL
 * @param {string} proxyUrl - Proxy URL
 * @returns {HttpsProxyAgent|SocksProxyAgent|null} Proxy agent or null
 */
export function createAgent(proxyUrl) {
  if (!proxyUrl) return null;

  if (proxyUrl.startsWith("socks")) {
    return new SocksProxyAgent(proxyUrl);
  } else {
    return new HttpsProxyAgent(proxyUrl);
  }
}

/**
 * Make API request with retry logic
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {Object} data - Request data
 * @param {string} proxyUrl - Proxy URL
 * @param {Object} customHeaders - Additional headers
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} retryDelay - Delay between retries
 * @param {boolean} useProxy - Whether to use proxy
 * @returns {Promise<Object>} API response
 */
export async function makeApiRequest(
  method, 
  url, 
  data = null, 
  proxyUrl = null, 
  customHeaders = {}, 
  maxRetries = API_MAX_RETRIES, 
  retryDelay = API_RETRY_DELAY, 
  useProxy = true
) {
  incrementActiveProcesses();
  let lastError = null;

  try {
    for (let attempt = 1; attempt <= maxRetries && !shouldStop(); attempt++) {
      try {
        const agent = useProxy && proxyUrl ? createAgent(proxyUrl) : null;
        const headers = { ...CONFIG_DEFAULT_HEADERS, ...customHeaders };
        
        const config = {
          method,
          url,
          data,
          headers,
          ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
          timeout: 10000,
          withCredentials: true
        };

        const response = await axios(config);
        return response;

      } catch (error) {
        lastError = error;
        
        let errorMessage = `Attempt ${attempt}/${maxRetries} failed for API request to ${url}`;
        if (error.response) {
          errorMessage += `: HTTP ${error.response.status} - ${JSON.stringify(error.response.data || error.response.statusText)}`;
        } else if (error.request) {
          errorMessage += `: No response received`;
        } else {
          errorMessage += `: ${error.message}`;
        }
        
        addLog(errorMessage, "error");

        if (attempt < maxRetries) {
          addLog(`Retrying API request in ${retryDelay / 1000} seconds...`, "wait");
          await sleep(retryDelay);
        }
      }
    }

    throw new Error(`Failed to make API request to ${url} after ${maxRetries} attempts: ${lastError.message}`);
  } finally {
    decrementActiveProcesses();
  }
}

/**
 * Get user balance
 * @param {string} userId - User ID
 * @param {string} proxyUrl - Proxy URL
 * @param {string} address - Wallet address
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<Object>} Balance data
 */
export async function getBalance(userId, proxyUrl, address, accountTokens) {
  try {
    const balanceUrl = `${API_BASE_URL}/transaction/get-balance/${userId}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };

    const response = await makeApiRequest("get", balanceUrl, null, proxyUrl, headers);
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    addLog(`Failed to get balance: ${error.message}`, "error");
    return { balance: 0 };
  }
}

/**
 * Get tweet content for transaction
 * @param {string} userId - User ID
 * @param {string} proxyUrl - Proxy URL
 * @param {string} address - Wallet address
 * @param {Object} accountTokens - Account tokens object
 * @returns {Promise<void>}
 */
export async function getTweetContent(userId, proxyUrl, address, accountTokens) {
  try {
    const tweetUrl = `${API_BASE_URL}/transaction/tweet-content/${userId}`;
    const headers = {
      "Cookie": `access_token=${accountTokens[address].accessToken}`
    };

    const response = await makeApiRequest("get", tweetUrl, null, proxyUrl, headers);
    
    if (response.data.success) {
      addLog(`Tweet Content: ${response.data.data.content}`, "debug");
    } else {
      addLog(`Failed to get tweet content: ${response.data.message}`, "error");
    }
  } catch (error) {
    addLog(`Tweet content request error: ${error.message}`, "error");
  }
}
