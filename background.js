// background.js - Handle downloads

// Create context menu for right-click
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'downloadTree',
    title: 'Download folder structure from Vibe PowerApps',
    contexts: ['action']
  });
  chrome.contextMenus.create({
    id: 'downloadAll',
    title: 'Download all files as ZIP',
    contexts: ['action']
  });
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (command === 'download-file') {
    await downloadFile(tab);
  } else if (command === 'download-tree') {
    await downloadTree(tab);
  } else if (command === 'download-all') {
    await downloadAllFiles(tab);
  }
});

// Right-click menu handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'downloadTree') {
    await downloadTree(tab);
  } else if (info.menuItemId === 'downloadAll') {
    await downloadAllFiles(tab);
  }
});

// Left-click handler
chrome.action.onClicked.addListener(async (tab) => {
  await downloadFile(tab);
});

// Inject content script
async function injectScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
  } catch (e) {
    // Script already injected, ignore
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Get MIME type based on file extension
function getMimeType(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
    'tsx': 'text/tsx',
    'ts': 'text/typescript',
    'jsx': 'text/jsx',
    'js': 'text/javascript',
    'css': 'text/css',
    'html': 'text/html',
    'json': 'application/json',
    'md': 'text/markdown',
    'yml': 'text/yaml',
    'yaml': 'text/yaml',
    'xml': 'text/xml',
    'txt': 'text/plain',
    'svg': 'image/svg+xml'
  };
  return mimeTypes[ext] || 'text/plain';
}

// Download current file
async function downloadFile(tab) {
  try {
    console.log('[Vibe Extension BG] Starting download process...');
    await injectScript(tab.id);

    console.log('[Vibe Extension BG] Sending getSource message...');
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSource' });

    console.log('[Vibe Extension BG] Received response:', {
      hasContent: !!response?.content,
      contentLength: response?.content?.length || 0,
      filename: response?.filename
    });

    if (response?.content) {
      const mimeType = getMimeType(response.filename);
      const dataUrl = `data:${mimeType};charset=utf-8,` + encodeURIComponent(response.content);

      console.log('[Vibe Extension BG] Triggering download for:', response.filename);
      chrome.downloads.download({
        url: dataUrl,
        filename: response.filename,
        saveAs: false
      }, (downloadId) => {
        console.log('[Vibe Extension BG] Download started with ID:', downloadId);
        // After successful download, mark file as downloaded in the tree panel
        if (downloadId) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'markDownloaded',
            filename: response.filename
          }).catch(err => {
            console.log('Could not mark file as downloaded:', err);
          });
        }
      });
    } else {
      console.error('[Vibe Extension BG] No content received from content script');
    }
  } catch (error) {
    console.error('[Vibe Extension BG] Error downloading file:', error);
  }
}

// Download folder structure
async function downloadTree(tab) {
  try {
    await injectScript(tab.id);

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTree' });

    if (response?.structure) {
      const jsonContent = JSON.stringify(response.structure, null, 2);
      const dataUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonContent);
      const filename = `vibe.powerapps.${response.planId}.json`;

      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      });
    }
  } catch (error) {
    console.error('Error downloading tree:', error);
  }
}

// Inject content script with JSZip for full downloads
async function injectScriptForAll(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['lib/jszip.min.js', 'content.js']
    });
  } catch (e) {
    // Scripts already injected, ignore
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}

// Handle messages from content script (Monaco bridge)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getMonacoContent') {
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      world: 'MAIN',
      func: () => {
        const debug = {};
        try {
          debug.hasMonaco = typeof window.monaco !== 'undefined';
          debug.hasEditor = debug.hasMonaco && typeof window.monaco.editor !== 'undefined';
          if (debug.hasEditor) {
            const models = window.monaco.editor.getModels();
            debug.modelCount = models ? models.length : 0;
            if (models && models.length > 0) {
              const content = models[0].getValue();
              debug.contentLen = content ? content.length : 0;
              return { content, debug };
            }
          }
        } catch (e) {
          debug.error = e.message;
        }
        return { content: null, debug };
      }
    }).then(results => {
      const result = results?.[0]?.result;
      sendResponse({ content: result?.content || null, debug: result?.debug || null });
    }).catch(err => {
      sendResponse({ content: null, error: err.message });
    });
    return true;
  }
});

// Download all files as ZIP
async function downloadAllFiles(tab) {
  try {
    console.log('[Vibe Extension BG] Starting full project download...');
    await injectScriptForAll(tab.id);

    console.log('[Vibe Extension BG] Sending downloadAll message...');
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'downloadAll' });

    console.log('[Vibe Extension BG] Download all result:', response);
  } catch (error) {
    console.error('[Vibe Extension BG] Error downloading all files:', error);
  }
}
