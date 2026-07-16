/**
 * WordVault Content Script
 * Listens for requests from the background worker and extracts selected text and surrounding context.
 */

console.log("WordVault Content Script Loaded");

// Function to extract selection and surrounding sentence context
function getSelectionData() {
  let word = "";
  let sentence = "";

  const activeEl = document.activeElement;
  
  // 1. Handle selections within text inputs or textareas
  if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA")) {
    try {
      const text = activeEl.value;
      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      
      if (start !== null && end !== null && start !== end) {
        word = text.substring(start, end).trim();
        
        // Find sentence start boundary in the text field
        let sentenceStart = 0;
        for (let i = start - 1; i >= 0; i--) {
          const char = text[i];
          if (/[.!?]/.test(char) && (i === text.length - 1 || /\s/.test(text[i + 1]))) {
            sentenceStart = i + 1;
            break;
          }
        }
        
        // Find sentence end boundary in the text field
        let sentenceEnd = text.length;
        for (let i = end; i < text.length; i++) {
          const char = text[i];
          if (/[.!?]/.test(char) && (i === text.length - 1 || /\s/.test(text[i + 1]))) {
            sentenceEnd = i + 1;
            break;
          }
        }
        
        sentence = text.substring(sentenceStart, sentenceEnd).trim().replace(/\s+/g, ' ');
      }
    } catch (err) {
      console.error("WordVault: Failed to extract input text selection", err);
    }
  } else {
    // 2. Handle normal text selection in web content
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      word = selection.toString().trim();
      
      if (word) {
        const range = selection.getRangeAt(0);
        const container = range.startContainer;
        
        if (container.nodeType === Node.TEXT_NODE) {
          const text = container.textContent;
          const startOffset = range.startOffset;
          const endOffset = range.endOffset;
          
          if (range.startContainer === range.endContainer) {
            // Find start boundary of the sentence
            let sentenceStart = 0;
            for (let i = startOffset - 1; i >= 0; i--) {
              const char = text[i];
              if (/[.!?]/.test(char) && (i === text.length - 1 || /\s/.test(text[i + 1]))) {
                sentenceStart = i + 1;
                break;
              }
            }
            
            // Find end boundary of the sentence
            let sentenceEnd = text.length;
            for (let i = endOffset; i < text.length; i++) {
              const char = text[i];
              if (/[.!?]/.test(char) && (i === text.length - 1 || /\s/.test(text[i + 1]))) {
                sentenceEnd = i + 1;
                break;
              }
            }
            
            sentence = text.slice(sentenceStart, sentenceEnd).trim().replace(/\s+/g, ' ');
          } else {
            // Selection spans across multiple elements/text nodes
            const parent = range.commonAncestorContainer;
            sentence = parent.textContent.slice(0, 500).trim().replace(/\s+/g, ' ') + "...";
          }
        } else {
          // If the selection start node is not a text node
          sentence = container.textContent.slice(0, 500).trim().replace(/\s+/g, ' ') + "...";
        }
      }
    }
  }

  // Sanitization: If sentence is too long or doesn't actually contain the word, default/fallback
  if (sentence && word && !sentence.toLowerCase().includes(word.toLowerCase())) {
    sentence = word;
  }
  
  const isPdf = document.contentType === "application/pdf" || !!document.querySelector('embed[type="application/pdf"]');
  
  return {
    word: word,
    sentence: sentence,
    isPdf: isPdf,
    url: window.location.href,
    title: document.title
  };
}

let pageToastElement = null;
let pageToastTimeout = null;

// Display a beautiful, self-contained HUD toast directly on the active webpage
// Display a beautiful, self-contained HUD toast directly on the active webpage
function showInPageToast(message) {
  console.log("WordVault LOG (content.js): showInPageToast called with message =", message);
  
  if (!pageToastElement) {
    console.log("WordVault LOG (content.js): Creating new pageToastElement DOM node.");
    pageToastElement = document.createElement("div");
    pageToastElement.id = "wordvault-inpage-toast";
    
    // Self-contained styles to prevent pages' own CSS from breaking the HUD
    Object.assign(pageToastElement.style, {
      position: "fixed",
      bottom: "40px",
      left: "50%",
      transform: "translateX(-50%) translateY(12px)",
      background: "rgba(18, 20, 29, 0.95)",
      backdropFilter: "blur(20px)",
      webkitBackdropFilter: "blur(20px)",
      color: "#FFFFFF",
      padding: "12px 24px",
      borderRadius: "9999px",
      fontSize: "14px",
      fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      fontWeight: "500",
      boxShadow: "0 12px 32px rgba(0, 0, 0, 0.4), 0 4px 12px rgba(0,0,0,0.2)",
      border: "1px solid rgba(255, 255, 255, 0.08)",
      zIndex: "2147483647",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 200ms cubic-bezier(0.22, 1, 0.36, 1), transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      whiteSpace: "nowrap"
    });
    
    pageToastElement.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; vertical-align: middle;">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="toast-text" style="color:#FFFFFF !important; font-family: inherit !important; font-size: inherit !important;"></span>
    `;
    
    document.body.appendChild(pageToastElement);
    console.log("WordVault LOG (content.js): Toast element created and appended to document.body.");
  } else {
    console.log("WordVault LOG (content.js): Reusing existing pageToastElement.");
  }
  
  // Set the message
  pageToastElement.querySelector(".toast-text").textContent = message;
  
  // Reset any active fade-out timeout
  if (pageToastTimeout) {
    console.log("WordVault LOG (content.js): Clearing active toast fade-out timeout.");
    clearTimeout(pageToastTimeout);
  }
  
  // Force layout reflow
  pageToastElement.offsetHeight;
  
  // Make toast visible
  console.log("WordVault LOG (content.js): Starting CSS transition to show toast.");
  pageToastElement.style.opacity = "1";
  pageToastElement.style.transform = "translateX(-50%) translateY(0)";
  
  pageToastTimeout = setTimeout(() => {
    console.log("WordVault LOG (content.js): Hiding toast after timeout.");
    pageToastElement.style.opacity = "0";
    pageToastElement.style.transform = "translateX(-50%) translateY(12px)";
  }, 2000);
}

// Listen for messages from the background service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("WordVault LOG (content.js): Received message =", message);
  if (message.action === "GET_SELECTION") {
    const selectionData = getSelectionData();
    console.log("WordVault LOG (content.js): Calculated selection data =", selectionData);
    sendResponse(selectionData);
    return false; // Synchronous response
  } else if (message.action === "SHOW_TOAST") {
    console.log("WordVault LOG (content.js): SHOW_TOAST message matches. Calling showInPageToast.");
    showInPageToast(message.text);
    sendResponse({ status: "success" });
    return false; // Synchronous response
  } else if (message.action === "PING") {
    sendResponse({ status: "pong" });
    return false; // Synchronous response
  }
});
