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
  console.log("WordVault: Context menu clicked. Info:", info);
  if (info.menuItemId === "save-to-wordvault") {
    const selectedText = info.selectionText;
    if (selectedText && tab) {
      handleSaveProcess(tab, selectedText);
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
function handleSaveProcess(tab, fallbackWord) {
  console.log("WordVault: Starting handleSaveProcess for Tab ID:", tab.id);
  // Check if tab has a valid URL we can communicate with
  // Restricted chrome://, edge://, or file:// (unless allowed) cannot run content scripts
  if (!tab || !tab.id || (tab.url && (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://") || tab.url.startsWith("edge://") || tab.url.startsWith("about:")))) {
    console.log("WordVault: Restricted tab URL, falling back to direct context selection.");
    // If we have context menu fallback text, save it directly
    if (fallbackWord && fallbackWord.trim()) {
      saveAndNotify(tab, fallbackWord.trim(), "", tab?.title || "Web Page", tab?.url || "");
    } else {
      showNotification("WordVault Error", "Cannot capture text on browser system pages.");
    }
    return;
  }

  // Ask content script for precise selection and surrounding sentence
  const queryContentScript = (isRetry = false) => {
    console.log("WordVault: Message sent (GET_SELECTION) to Tab ID:", tab.id, "isRetry:", isRetry);
    chrome.tabs.sendMessage(tab.id, { action: "GET_SELECTION", selectedText: fallbackWord }, (response) => {
      let word = fallbackWord || "";
      let sentence = "";
      let pageTitle = tab.title || "Word Page";
      let url = tab.url || "";
      let isConnectionError = false;
      
      if (chrome.runtime.lastError) {
        console.warn("WordVault: Messaging channel unavailable:", chrome.runtime.lastError.message);
        isConnectionError = true;
      }

      console.log("WordVault: Response received from content script. Response:", response);

      if (response) {
        if (response.word) word = response.word;
        if (response.sentence) sentence = response.sentence;
        if (response.pageTitle) pageTitle = response.pageTitle;
        if (response.url) url = response.url;
      }

      word = word.trim();

      if (!word) {
        // If content script was not injected and this is the first attempt, try injecting it dynamically
        if (isConnectionError && !isRetry) {
          console.log("WordVault: Injecting content.js dynamically into Tab ID:", tab.id);
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["content.js"]
          }, () => {
            if (chrome.runtime.lastError) {
              console.error("WordVault: Dynamic script injection failed:", chrome.runtime.lastError.message);
              // Fall back to direct selection if available
              if (fallbackWord && fallbackWord.trim()) {
                saveAndNotify(tab, fallbackWord.trim(), "", tab.title || "Web Page", tab.url || "");
              } else {
                showNotification("WordVault Error", "Failed to inject content script. Please refresh the page.");
              }
            } else {
              console.log("WordVault: Dynamic script injection succeeded. Retrying selection capture...");
              queryContentScript(true);
            }
          });
        } else {
          // No text selected, or retry failed
          if (isConnectionError) {
            showNotification("WordVault", "Please refresh this tab to enable selection capture.");
          } else {
            showNotification("WordVault Error", "Please select a word or phrase first.");
          }
        }
        return;
      }

      saveAndNotify(tab, word, sentence, pageTitle, url);
    });
  };

  queryContentScript(false);
}

/**
 * Saves a word to local storage and triggers the corresponding notification.
 */
function saveAndNotify(tab, word, sentence, pageTitle, url) {
  console.log("WordVault: saveWord called for word:", word);
  saveWord({
    word: word,
    sentence: sentence,
    pageTitle: pageTitle,
    url: url
  })
  .then(async ({ status, word: savedWord }) => {
    console.log("WordVault: saveWord succeeded. Status:", status, "Saved Object:", savedWord);
    
    // Automatically trigger background definition enrichment if meaning is missing
    if (!savedWord.meaning || !savedWord.meaning.trim()) {
      try {
        const enriched = await fetchWordDefinition(savedWord.word);
        if (enriched) {
          await updateWord(savedWord.id, enriched);
          // Merge enriched properties into savedWord reference for notifications
          Object.assign(savedWord, enriched);
        }
      } catch (err) {
        console.info("WordVault background: auto dictionary enrichment failed:", err.message);
      }
    }

    let messageText = `✓ Saved "${savedWord.word}"! Press Alt + Shift + E to edit`;
    if (savedWord.dictionaryStatus === "skipped_phrase") {
      messageText = `✓ Saved "${savedWord.word}"! Dictionary lookup skipped for phrases.`;
    }
    
    const isRestrictedUrl = url && (
      url.startsWith("chrome://") || 
      url.startsWith("chrome-extension://") || 
      url.startsWith("edge://") || 
      url.startsWith("about:")
    );

    // Check if we have a valid tab and can send a message to content.js
    if (tab && tab.id && !isRestrictedUrl) {
      console.log("WordVault background.js: Sending SHOW_TOAST message to Tab ID:", tab.id);
      chrome.tabs.sendMessage(tab.id, {
        action: "SHOW_TOAST",
        text: messageText
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("WordVault background.js: Failed to send SHOW_TOAST message, falling back to system notification:", chrome.runtime.lastError.message);
          triggerSystemNotification(status, savedWord);
        }
      });
    } else {
      triggerSystemNotification(status, savedWord);
    }
  })
  .catch((error) => {
    console.error("WordVault Error: Save failed", error);
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
