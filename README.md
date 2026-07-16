# WordVault Chrome Extension

WordVault is a complete, production-ready Manifest V3 Chrome Extension that allows you to instantly save and organize vocabulary words, expressions, and phrases directly from any web page. 

It is designed to be lightweight, secure, and fully local—**no login, no backend, and no database**. All items are stored safely in your browser using `chrome.storage.local`.

---

## 🌟 Features

*   **Instant Selection Capture**: Highlight any word or phrase on a webpage and save it.
*   **Dual Capture Methods**:
    *   **Keyboard Shortcut**: Press `Alt + Shift + S` (customizable) to capture instantly.
    *   **Context Menu**: Right-click selected text and select *"Save '[word]' to WordVault"*.
*   **Smart Content Detection**: Automatically extracts the selected word, surrounding sentence context, page title, page URL, and timestamps.
*   **Deduplication & Encounter Tracking**: If you save a word you've saved before, WordVault updates the `lastSeen` timestamp and increments an encounter counter instead of creating duplicates.
*   **Aesthetic Action Popup**:
    *   Quick live search across words, meanings, notes, and tags.
    *   Favorite items toggle.
    *   Inline edit modal (meanings, notes, synonyms, tags, favorites).
    *   One-click JSON import/export.
*   **Analytics Dashboard (Options Page)**:
    *   Total words, favorites, and unique tags counters.
    *   Detailed statistics like "Most Encountered", "Newest", and "Oldest" word.
    *   Encounter leaderboard.
    *   Tag cloud explorer.
    *   Full searchable, sortable inventory management datagrid.

---

## 📂 Folder Structure

```text
wordvault/
├── manifest.json       # extension configuration & keyboard commands
├── background.js      # service worker context menu & keyboard listeners
├── content.js         # web page and input element selection extractor
├── storage.js         # local CRUD operations, backups, and merging engine
├── utils.js           # date relative formatting, HTML sanitizers
├── popup.html         # action popup structure
├── popup.js           # action popup UI controllers
├── popup.css          # action popup premium styles
├── options.html       # analytics dashboard structure
├── options.js         # analytics dashboard UI controllers
├── options.css        # analytics dashboard styles
├── create_icons.ps1   # PowerShell utility script to draw standard PNG icons
├── README.md          # this project documentation
└── icons/             # mandatory icon assets
    ├── icon16.png     # context menu & tab icon
    ├── icon32.png     # window sizing support
    ├── icon48.png     # management list page icon
    └── icon128.png    # store card & installation icon
```

---

## ⚙️ Installation

To load and use WordVault locally as an unpacked developer extension:

1.  Open Google Chrome and navigate to `chrome://extensions/`.
2.  Enable **Developer mode** using the toggle switch in the top-right corner.
3.  Click the **Load unpacked** button in the top-left corner.
4.  Select the `wordvault/` directory from this workspace:
    `d:\Final - Projects\Vocab-Extension\wordvault`
5.  WordVault is now loaded! Pin it to your Chrome toolbar for easy access.

---

## 🛡️ Permissions Explanation

WordVault requests the following permissions in its `manifest.json`:

*   `storage`: Enables saving, deleting, and updating vocabulary lists locally inside `chrome.storage.local`.
*   `activeTab`: Allows the background script to temporarily interact with the active page content when the keyboard shortcut or context menu is triggered, ensuring high privacy by not constantly scraping all pages.
*   `contextMenus`: Registers the right-click menu item so users can save words without using the keyboard.
*   `notifications`: Displays native desktop popups when words are successfully saved, updated, or when imports/exports finish.
*   `host_permissions (<all_urls>)`: Allows injecting the content script to extract selection text and surrounding sentences from any standard web domain.

---

## ⌨️ How Keyboard Shortcut Works

1.  **Selection**: Select any word or phrase on a website.
2.  **Trigger**: Press `Alt + Shift + S` (default shortcut).
3.  **Extraction**: The background service worker sends a message to the active tab's `content.js` to extract:
    *   The selected text.
    *   The surrounding sentence (calculated backward/forward until `.`, `!`, or `?`).
4.  **Save**: The background worker saves the entry.
5.  **Notify**: A Chrome notification appears to confirm the word was successfully stored.

*Note: You can customize or change the shortcut by going to `chrome://extensions/shortcuts` in your browser.*

---

## 📦 How to Publish to the Chrome Web Store

1.  **Prepare the Package**:
    *   Remove any utility files like `create_icons.ps1`.
    *   Compress the remaining files in the `wordvault/` directory into a `.zip` archive.
2.  **Chrome Developer Dashboard**:
    *   Go to the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).
    *   Sign in with a developer account (a one-time $5 fee is charged by Google).
3.  **Upload & Store Listing**:
    *   Click **Add new item** and upload the `.zip` archive.
    *   Fill out the store listing fields: descriptions, screenshots (using WordVault Dashboard screenshots), privacy practices, and categories.
4.  **Review and Launch**:
    *   Submit the item for review. Google reviews usually take 24–72 hours to approve and publish.

---

## 🚀 Future Roadmap

WordVault is built modularly using clean ES Modules (`storage.js`, `utils.js`), making it easy to expand in future versions:

*   [ ] **Notion API Integration**: Sync saved words and meanings directly to a user's database page.
*   [ ] **AI Definitions**: Integrate a lightweight LLM API key configuration to automatically generate meanings, synonyms, and translations.
*   [ ] **Pronunciation Audio**: Add audio play buttons to cards using standard Web Speech APIs.
*   [ ] **Spaced Repetition (SRS)**: Add flashcards study options in the dashboard based on encounter weights and review schedules.
