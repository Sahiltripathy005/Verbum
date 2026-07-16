/**
 * WordVault Background Service Worker
 * Manages extension events, context menu items, keyboard shortcuts, and desktop notifications.
 */

import { saveWord, updateWord, updateChromeBadge } from './storage.js';
import { fetchWordDefinition } from './dictionary.js';

console.log("WordVault: Background service worker started (Extension started).");

// Update badge on load
updateChromeBadge();

chrome.runtime.onStartup.addListener(() => {
  updateChromeBadge();
});

// Setup context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-to-wordvault",
    title: "Save '%s' to WordVault",
    contexts: ["selection"]
  });
  console.log("WordVault: Context menu created.");
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log("WordVault LOG (Context Menu): Clicked. info.menuItemId =", info.menuItemId, "info.selectionText =", info.selectionText, "tab =", tab);
  if (info.menuItemId === "save-to-wordvault") {
    const selectedText = info.selectionText;
    if (selectedText && tab) {
      console.log("WordVault LOG (Context Menu): Calling handleSaveProcess");
      handleSaveProcess(tab, selectedText);
    } else {
      console.warn("WordVault LOG (Context Menu): Missing selectedText or tab. selectedText =", selectedText, "tab =", tab);
    }
  }
});

// Handle keyboard command shortcuts (Alt+Shift+S / Alt+Shift+E)
chrome.commands.onCommand.addListener((command) => {
  console.log("WordVault: Command received:", command);
  if (command === "save-word") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let activeTab = tabs[0];
      if (!activeTab) {
        // Fallback to last focused window (helps if DevTools is focused)
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (fallbackTabs) => {
          activeTab = fallbackTabs[0];
          if (activeTab) {
            console.log("WordVault: Active tab found (lastFocusedWindow):", activeTab.id, activeTab.url);
            handleSaveProcess(activeTab, null);
          } else {
            console.warn("WordVault: No active tab found.");
          }
        });
      } else {
        console.log("WordVault: Active tab found (currentWindow):", activeTab.id, activeTab.url);
        handleSaveProcess(activeTab, null);
      }
    });
  } else if (command === "edit-last-word") {
    console.log("WordVault: edit-last-word command triggered.");
    chrome.storage.local.set({ editLastOnOpen: true }, () => {
      if (chrome.action && chrome.action.openPopup) {
        chrome.action.openPopup().catch((err) => {
          console.error("WordVault background: openPopup failed, falling back to tab creation:", err);
          chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?focus=last") });
        });
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL("popup.html?focus=last") });
      }
    });
  } else if (command === "open-dashboard") {
    console.log("WordVault: open-dashboard command triggered.");
    const optionsUrl = chrome.runtime.getURL("options.html");
    chrome.tabs.query({}, (tabs) => {
      const existingTab = tabs.find(t => t.url && t.url.startsWith(optionsUrl));
      if (existingTab) {
        chrome.tabs.update(existingTab.id, { active: true }, (updatedTab) => {
          chrome.windows.update(updatedTab.windowId, { focused: true });
        });
      } else {
        chrome.tabs.create({ url: optionsUrl });
      }
    });
  }
});

/**
 * Orchestrates the text collection and storage workflow.
 * Queries the active tab's content script to extract selection context.
 * Falls back to Chrome's native selection if page scripting is restricted.
 * Saves the word and triggers a desktop notification.
 */
/**
 * Helper to determine if a tab is displaying a PDF file or using Chrome's native PDF viewer.
 */
function isPdfTab(tab) {
  if (!tab || !tab.url) return false;
  const url = tab.url.toLowerCase();
  
  if (url.includes('.pdf') || url.startsWith('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehxai/')) {
    return true;
  }
  
  try {
    const parsed = new URL(tab.url);
    const pathname = parsed.pathname.toLowerCase();
    if (pathname.endsWith('.pdf')) {
      return true;
    }
  } catch (e) {}
  
  return false;
}

/**
 * Ensures that content.js is injected into the specified tab.
 * If not already present, it attempts dynamic injection.
 * Calls callback(success).
 */
function ensureContentScript(tabId, callback) {
  console.log("WordVault LOG (ensureContentScript): Pinging Tab ID =", tabId);
  chrome.tabs.sendMessage(tabId, { action: "PING" }, (response) => {
    const lastError = chrome.runtime.lastError;
    console.log("WordVault LOG (ensureContentScript): Ping callback fired. response =", response, "lastError =", lastError);
    if (lastError) {
      console.log("WordVault LOG (ensureContentScript): Content script ping failed, injecting content.js. Error =", lastError.message);
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["content.js"]
      }, () => {
        const injectError = chrome.runtime.lastError;
        if (injectError) {
          console.error("WordVault LOG (ensureContentScript): Dynamic script injection failed. Error =", injectError.message);
          callback(false);
        } else {
          console.log("WordVault LOG (ensureContentScript): Dynamic script injection succeeded.");
          callback(true);
        }
      });
    } else {
      console.log("WordVault LOG (ensureContentScript): Content script ping succeeded.");
      callback(true);
    }
  });
}

/**
 * Orchestrates the text collection and storage workflow.
 * Queries the active tab's content script to extract selection context.
 * Falls back to Chrome's native selection if page scripting is restricted.
 * Saves the word and triggers a desktop notification.
 */
function handleSaveProcess(tab, fallbackWord) {
  console.log("WordVault LOG (handleSaveProcess): Starting for Tab ID:", tab ? tab.id : 'undefined', "fallbackWord:", fallbackWord);
  
  const isPdf = isPdfTab(tab);

  // Detect if the tab is a PDF page/viewer
  if (isPdf) {
    console.log("WordVault LOG (handleSaveProcess): Detected PDF tab. fallbackWord:", fallbackWord);
    if (fallbackWord && fallbackWord.trim()) {
      console.log("WordVault LOG (handleSaveProcess): PDF tab saving directly using fallbackWord");
      saveAndNotify(tab, fallbackWord.trim(), "", tab?.title || "Web Page", tab?.url || "");
      return;
    }
    // Keyboard Shortcut workflow (fallbackWord is absent) proceeds to queryContentScript()
  }

  // Check if tab has a valid URL we can communicate with
  // Restricted chrome://, edge://, or file:// (unless allowed) cannot run content scripts
  if (!tab || !tab.id || (tab.url && !isPdf && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")))) {
    console.log("WordVault LOG (handleSaveProcess): Restricted tab URL, falling back to direct context selection. url =", tab?.url);
    // If we have context menu fallback text, save it directly
    if (fallbackWord && fallbackWord.trim()) {
      console.log("WordVault LOG (handleSaveProcess): Restricted URL saving directly using fallbackWord");
      saveAndNotify(tab, fallbackWord.trim(), "", tab?.title || "Web Page", tab?.url || "");
    } else {
      console.log("WordVault LOG (handleSaveProcess): Restricted URL but no fallbackWord, showing warning");
      showNotification("WordVault Error", "Cannot capture text on browser system pages.");
    }
    return;
  }

  // Ask content script for precise selection and surrounding sentence
  const queryContentScript = () => {
    console.log("WordVault LOG (queryContentScript): Ensuring content script is injected.");
    ensureContentScript(tab.id, (success) => {
      let isPdf = isPdfTab(tab);
      let tabUrl = tab?.url || "";
      let tabTitle = tab?.title || "";

      if (!success) {
        console.warn("WordVault LOG (queryContentScript): content.js injection/presence failed.");
        if (fallbackWord && fallbackWord.trim()) {
          console.log("WordVault LOG (queryContentScript): Injection failed, saving directly using fallbackWord");
          saveAndNotify(tab, fallbackWord.trim(), "", tabTitle || "Web Page", tabUrl || "");
        } else {
          if (isPdf) {
            showNotification("WordVault Error", "Chrome's built-in PDF viewer does not expose the selected text.");
          } else {
            showNotification("WordVault Error", "Failed to inject content script. Please refresh the page.");
          }
        }
        return;
      }

      console.log("WordVault LOG (queryContentScript): Content script guaranteed. Sending GET_SELECTION message.");
      chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTION" }, (response) => {
        const lastError = chrome.runtime.lastError;
        console.log("WordVault LOG (queryContentScript): GET_SELECTION response callback fired. response =", response, "lastError =", lastError);
        
        let word = fallbackWord || "";
        let sentence = "";

        if (response) {
          if (response.word) word = response.word;
          if (response.sentence) sentence = response.sentence;
          if (response.isPdf) isPdf = true;
          if (response.url) tabUrl = response.url;
          if (response.title) tabTitle = response.title;
        }

        word = word.trim();
        console.log("WordVault LOG (queryContentScript): Resulting word =", word, "sentence =", sentence, "isPdf =", isPdf, "tabUrl =", tabUrl, "tabTitle =", tabTitle);

        if (!word) {
          console.log("WordVault LOG (queryContentScript): Word is empty.");
          if (isPdf) {
            showNotification("WordVault Error", "Chrome's built-in PDF viewer does not expose the selected text.");
          } else {
            showNotification("WordVault Error", "Please select a word or phrase first.");
          }
          return;
        }

        console.log("WordVault LOG (queryContentScript): Succeeded in obtaining word. Calling saveAndNotify.");
        saveAndNotify(tab, word, sentence, tabTitle || "Word Page", tabUrl || "");
      });
    });
  };

  queryContentScript();
}

/**
 * Saves a word to local storage and triggers the corresponding notification.
 */
function saveAndNotify(tab, word, sentence, pageTitle, url) {
  console.log("WordVault LOG (saveAndNotify): Sourced arguments. word =", word, "sentence =", sentence, "pageTitle =", pageTitle, "url =", url);
  console.log("WordVault LOG (saveAndNotify): Calling saveWord");
  saveWord({
    word: word,
    sentence: sentence,
    pageTitle: pageTitle,
    url: url
  })
  .then(async ({ status, word: savedWord }) => {
    console.log("WordVault LOG (saveAndNotify): saveWord promise resolved. status =", status, "savedWord =", savedWord);
    
    // Retrieve workflow settings and trigger after-capture popup action
    chrome.storage.local.get("settings", (data) => {
      const settings = data.settings || {};
      const workflow = settings.afterCaptureWorkflow || "popup";
      
      if (workflow === "popup") {
        chrome.storage.local.set({ focusLastOnOpen: true }, () => {
          setTimeout(() => {
            if (chrome.action && chrome.action.openPopup) {
              chrome.action.openPopup().catch((err) => {
                console.error("WordVault background: openPopup failed:", err);
              });
            }
          }, 150);
        });
      } else if (workflow === "edit") {
        chrome.storage.local.set({ editLastOnOpen: true }, () => {
          setTimeout(() => {
            if (chrome.action && chrome.action.openPopup) {
              chrome.action.openPopup().catch((err) => {
                console.error("WordVault background: openPopup failed:", err);
              });
            }
          }, 150);
        });
      }
    });
    
    // Automatically trigger background definition enrichment if meaning is missing
    if (!savedWord.meaning || !savedWord.meaning.trim()) {
      try {
        console.log("WordVault LOG (saveAndNotify): Triggering fetchWordDefinition for", savedWord.word);
        const enriched = await fetchWordDefinition(savedWord.word);
        if (enriched) {
          console.log("WordVault LOG (saveAndNotify): fetchWordDefinition succeeded. enriched =", enriched);
          await updateWord(savedWord.id, enriched);
          // Merge enriched properties into savedWord reference for notifications
          Object.assign(savedWord, enriched);
        }
      } catch (err) {
        console.info("WordVault LOG (saveAndNotify): auto dictionary enrichment failed:", err.message);
      }
    }

    let messageText = `✓ Saved "${savedWord.word}"! Press Alt + Shift + E to edit`;
    if (savedWord.dictionaryStatus === "skipped_phrase") {
      messageText = `✓ Saved "${savedWord.word}"! Dictionary lookup skipped for phrases.`;
    }
    
    console.log("WordVault LOG (saveAndNotify): Deciding toast/system notification. tab =", tab, "url =", url);
    // Check if we have a valid tab and can send a message to content.js
    if (tab && tab.id && url && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://") && !url.startsWith("edge://") && !url.startsWith("about:")) {
      console.log("WordVault LOG (saveAndNotify): Ensuring content script is injected before toast.");
      ensureContentScript(tab.id, (success) => {
        if (success) {
          console.log("WordVault LOG (saveAndNotify): Sending SHOW_TOAST message to Tab ID:", tab.id, "messageText =", messageText);
          chrome.tabs.sendMessage(tab.id, {
            action: "SHOW_TOAST",
            text: messageText
          }, (response) => {
            const lastError = chrome.runtime.lastError;
            console.log("WordVault LOG (saveAndNotify): SHOW_TOAST response callback fired. response =", response, "lastError =", lastError);
            if (lastError) {
              console.warn("WordVault LOG (saveAndNotify): Failed to send SHOW_TOAST message, falling back to system notification. Error =", lastError.message);
              triggerSystemNotification(status, savedWord);
            }
          });
        } else {
          console.log("WordVault LOG (saveAndNotify): Could not ensure content script, falling back to system notification.");
          triggerSystemNotification(status, savedWord);
        }
      });
    } else {
      console.log("WordVault LOG (saveAndNotify): Tab not eligible for inline toast, calling triggerSystemNotification. url =", url);
      triggerSystemNotification(status, savedWord);
    }
  })
  .catch((error) => {
    console.error("WordVault LOG (saveAndNotify): saveWord promise rejected. Error =", error);
    showNotification("WordVault Error", "Failed to save: " + error.message);
  });
}

function triggerSystemNotification(status, savedWord) {
  const message = savedWord.dictionaryStatus === "skipped_phrase"
    ? `"${savedWord.word}". Dictionary lookup skipped for phrases.`
    : `"${savedWord.word}". Press Alt + Shift + E to edit.`;
  showNotification("✓ Saved to WordVault", message);
}

/**
 * Triggers a native chrome.notifications notification.
 */
function showNotification(title, message) {
  chrome.storage.local.get("settings", (data) => {
    const settings = data.settings || {};
    if (settings.notifications === false) {
      console.log("WordVault: Notifications are disabled in settings.");
      return;
    }
    chrome.notifications.create("", {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: title,
      message: message,
      priority: 2
    });
  });
}
