// content.js - Extract code and folder structure from vibe.powerapps.com

// Extract code from Monaco Editor by scrolling through it
async function extractCodeByScrolling() {
  try {
    console.log('[Vibe Extension] Starting scroll-based extraction...');

    const scrollContainer = document.querySelector('.monaco-scrollable-element');
    const viewLines = document.querySelector('.view-lines');

    if (!scrollContainer || !viewLines) {
      console.error('[Vibe Extension] Could not find Monaco scrollable container or view-lines');
      return null;
    }

    // Store lines by their top position to avoid duplicates
    const lines = new Map();
    const lineHeight = 18;
    const viewportHeight = scrollContainer.clientHeight;

    console.log('[Vibe Extension] Starting scrape... this will take a few seconds.');
    console.log('[Vibe Extension] Viewport height:', viewportHeight);

    // Save original scroll position
    const originalScrollTop = scrollContainer.scrollTop;

    try {
      // Scroll to the top first
      scrollContainer.scrollTop = 0;
      await new Promise(r => setTimeout(r, 200));

      let previousLineCount = 0;
      let noNewLinesCount = 0;
      let iteration = 0;
      const maxIterations = 1000; // Safety limit

      // Keep scrolling until we stop finding new lines
      while (iteration < maxIterations) {
        // Collect lines currently in the DOM
        try {
          const viewLineElements = document.querySelectorAll('.view-line');
          for (let j = 0; j < viewLineElements.length; j++) {
            const line = viewLineElements[j];
            try {
              const top = parseFloat(line.style.top);
              if (!isNaN(top)) {
                const text = line.innerText !== undefined ? line.innerText : (line.textContent || '');
                lines.set(top, text);
              }
            } catch (lineError) {
              // Skip this line if there's an error
            }
          }
        } catch (e) {
          console.error('[Vibe Extension] Error collecting lines:', e);
        }

        // Check if we got new lines
        if (lines.size === previousLineCount) {
          noNewLinesCount++;
          // If we haven't found new lines in 3 consecutive iterations, we're done
          if (noNewLinesCount >= 3) {
            console.log('[Vibe Extension] No new lines found, stopping');
            break;
          }
        } else {
          noNewLinesCount = 0;
          previousLineCount = lines.size;
        }

        // Progress log every 10 iterations
        if (iteration % 10 === 0) {
          console.log(`[Vibe Extension] Iteration ${iteration}, captured ${lines.size} unique lines...`);
        }

        // Scroll down by viewport height minus one line to ensure overlap
        scrollContainer.scrollTop += viewportHeight - lineHeight;

        // Wait for Monaco to render
        await new Promise(r => setTimeout(r, 30));

        iteration++;
      }

      if (iteration >= maxIterations) {
        console.warn('[Vibe Extension] Reached maximum iterations');
      }

    } finally {
      // Always restore original scroll position
      scrollContainer.scrollTop = originalScrollTop;
    }

    // Sort lines by their top position and join
    const fullCode = Array.from(lines.entries())
      .sort((a, b) => a[0] - b[0])
      .map(entry => entry[1])
      .join('\n');

    console.log(`[Vibe Extension] Done! Captured ${lines.size} lines, ${fullCode.length} chars`);
    console.log('[Vibe Extension] Full code extraction complete');

    return fullCode;
  } catch (error) {
    console.error('[Vibe Extension] Fatal error in extractCodeByScrolling:', error);
    return null;
  }
}

// Extract code from Monaco Editor or other code viewers
async function extractCode() {
  console.log('[Vibe Extension] Starting code extraction...');

  // Method 0: World bridge — inject script into main world for O(1) access to monaco.editor
  console.log('[Vibe Extension] Trying world bridge...');
  const bridgeContent = await extractCodeViaBridge();
  if (bridgeContent && bridgeContent.length > 0) {
    console.log('[Vibe Extension] Got content via world bridge:', bridgeContent.length, 'chars');
    return bridgeContent;
  }

  // Try to get the Monaco editor instance from the global monaco object
  if (window.monaco && window.monaco.editor) {
    console.log('[Vibe Extension] Found window.monaco.editor');
    const editors = window.monaco.editor.getModels();
    if (editors && editors.length > 0) {
      const content = editors[0].getValue();
      console.log('[Vibe Extension] Got content from monaco.editor.getModels():', content.length, 'chars');
      return content;
    }
  }

  // Check if Monaco editor exists
  const monacoElement = document.querySelector('.monaco-editor');
  if (!monacoElement) {
    console.log('[Vibe Extension] No .monaco-editor element found, trying alternative viewers...');

    // Try to find content in a pre or code element (for markdown/json viewers)
    const preElement = document.querySelector('pre');
    if (preElement) {
      const content = preElement.textContent || preElement.innerText || '';
      if (content.length > 0) {
        console.log('[Vibe Extension] Got content from <pre> element:', content.length, 'chars');
        return content;
      }
    }

    // Try to find any code block
    const codeElement = document.querySelector('code');
    if (codeElement) {
      const content = codeElement.textContent || codeElement.innerText || '';
      if (content.length > 0) {
        console.log('[Vibe Extension] Got content from <code> element:', content.length, 'chars');
        return content;
      }
    }

    // Try to find content in a textarea (some simple editors use this)
    const textarea = document.querySelector('textarea');
    if (textarea) {
      const content = textarea.value || '';
      if (content.length > 0) {
        console.log('[Vibe Extension] Got content from <textarea>:', content.length, 'chars');
        return content;
      }
    }

    console.error('[Vibe Extension] No code viewer found');
    return null;
  }

  console.log('[Vibe Extension] Found monaco-editor element');

  // Method 1: Look for Monaco's internal property (e.g., __monaco_editor_*)
  const editorKey = Object.keys(monacoElement).find(k => k.startsWith('__monaco_editor_'));
  if (editorKey) {
    console.log('[Vibe Extension] Found editor key:', editorKey);
    const editorInstance = monacoElement[editorKey];
    if (editorInstance.getValue) {
      const content = editorInstance.getValue();
      console.log('[Vibe Extension] Got content via', editorKey, ':', content.length, 'chars');
      return content;
    }
    if (editorInstance.getModel && editorInstance.getModel().getValue) {
      const content = editorInstance.getModel().getValue();
      console.log('[Vibe Extension] Got content via', editorKey, '.getModel():', content.length, 'chars');
      return content;
    }
  }

  // Method 2: Try common property names
  const editorInstance = monacoElement.__editor ||
                        monacoElement.editorInstance ||
                        monacoElement._editorInstance;

  if (editorInstance) {
    console.log('[Vibe Extension] Found editorInstance via common properties');
    if (editorInstance.getValue) {
      const content = editorInstance.getValue();
      console.log('[Vibe Extension] Got content via common property:', content.length, 'chars');
      return content;
    }

    if (editorInstance.getModel) {
      const model = editorInstance.getModel();
      if (model && model.getValue) {
        const content = model.getValue();
        console.log('[Vibe Extension] Got content via common property getModel():', content.length, 'chars');
        return content;
      }
    }
  }

  // Method 3: Search through all properties for anything that looks like an editor
  console.log('[Vibe Extension] Searching through all element properties...');
  for (const key of Object.keys(monacoElement)) {
    const obj = monacoElement[key];
    if (obj && typeof obj === 'object') {
      // Check if it has getValue method
      if (typeof obj.getValue === 'function') {
        try {
          const content = obj.getValue();
          if (typeof content === 'string' && content.length > 0) {
            console.log('[Vibe Extension] Got content via property', key, ':', content.length, 'chars');
            return content;
          }
        } catch (e) {
          // Continue searching
        }
      }
      // Check if it has getModel method
      if (typeof obj.getModel === 'function') {
        try {
          const model = obj.getModel();
          if (model && typeof model.getValue === 'function') {
            const content = model.getValue();
            if (typeof content === 'string' && content.length > 0) {
              console.log('[Vibe Extension] Got content via property', key, '.getModel():', content.length, 'chars');
              return content;
            }
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
  }

  // Method 4: Scroll-based extraction (most reliable fallback)
  console.log('[Vibe Extension] API methods failed, trying scroll-based extraction...');
  const scrollContent = await extractCodeByScrolling();
  if (scrollContent && scrollContent.length > 0) {
    return scrollContent;
  }

  // Last resort fallback: Try visible lines only (incomplete but better than nothing)
  console.warn('[Vibe Extension] Falling back to visible lines only (incomplete)');
  const monacoLines = document.querySelector('.view-lines');
  if (monacoLines) {
    const lines = Array.from(monacoLines.querySelectorAll('.view-line'));
    const content = lines.map(line => line.innerText || line.textContent || '').join('\n');
    console.log('[Vibe Extension] Got content from visible lines:', content.length, 'chars,', lines.length, 'lines');
    return content;
  }

  console.error('[Vibe Extension] All extraction methods failed');
  return null;
}

// Extract filename from UI - look for filename above Monaco editor
function extractFilename() {
  // Strategy 1: Find Monaco editor and look for filename above it
  const monacoEditor = document.querySelector('.monaco-editor');

  if (monacoEditor) {
    const editorRect = monacoEditor.getBoundingClientRect();
    const editorTop = editorRect.top;

    // Look for span elements that are just above the editor (within 200px above)
    const allSpans = document.querySelectorAll('span');
    let closestFilename = null;
    let closestDistance = Infinity;

    for (const span of allSpans) {
      if (span.children.length > 0) continue;

      const text = span.textContent?.trim();
      if (!text || text.length > 100) continue;

      const match = text.match(/^([\w\-_\.]+\.(tsx|ts|jsx|js|css|html|json|md|yml|yaml|xml|txt|svg))$/i);
      if (match) {
        const spanRect = span.getBoundingClientRect();
        const distance = editorTop - spanRect.bottom;

        // Only consider elements above the editor (within 200px)
        if (distance > 0 && distance < 200 && distance < closestDistance) {
          closestDistance = distance;
          closestFilename = match[1];
        }
      }
    }

    if (closestFilename) {
      console.log('Found filename above editor:', closestFilename, 'distance:', closestDistance);
      return closestFilename;
    }
  }

  // Strategy 2: Fallback - look in top of page
  const candidates = [];
  const elements = document.querySelectorAll('span');

  for (const el of elements) {
    if (el.children.length > 0) continue;

    const text = el.textContent?.trim();
    if (!text || text.length > 100) continue;

    const match = text.match(/^([\w\-_\.]+\.(tsx|ts|jsx|js|css|html|json|md|yml|yaml|xml|txt|svg))$/i);
    if (match) {
      const rect = el.getBoundingClientRect();
      if (rect.y > 0 && rect.y < 150 && rect.width > 0) {
        candidates.push({
          filename: match[1],
          y: rect.y,
          x: rect.x
        });
      }
    }
  }

  console.log('Found filename candidates:', candidates);

  if (candidates.length === 0) {
    console.log('No candidates found, using default');
    return 'download.txt';
  }

  candidates.sort((a, b) => a.y - b.y);

  console.log('Selected filename:', candidates[0].filename);
  return candidates[0].filename;
}

// Extract folder structure from file tree sidebar
function getFolderStructure() {
  const treeItems = Array.from(document.querySelectorAll('.fui-TreeItem'));

  if (treeItems.length === 0) {
    return [];
  }

  const root = { name: "root", children: [], type: "folder" };
  const stack = [{ level: 0, node: root }];

  treeItems.forEach(item => {
    const nameElement = item.querySelector('.fui-TreeItemLayout__main') || item;
    const name = nameElement.textContent.trim();
    const level = parseInt(item.getAttribute('aria-level'), 10);
    const isFolder = item.getAttribute('aria-expanded') !== null;

    const newNode = { name, type: isFolder ? "folder" : "file" };
    if (isFolder) newNode.children = [];

    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].node;
    parent.children.push(newNode);

    if (isFolder) {
      stack.push({ level, node: newNode });
    }
  });

  return root.children;
}

// Get Monaco editor instance from DOM element (fast, no scrolling)
function getMonacoEditor() {
  const monacoElement = document.querySelector('.monaco-editor');
  if (!monacoElement) return null;

  const editorKey = Object.keys(monacoElement).find(k => k.startsWith('__monaco_editor_'));
  if (editorKey) return monacoElement[editorKey];

  return null;
}

// Get quick content length from Monaco (for change detection, avoids full extraction)
function getEditorContentLength() {
  const editor = getMonacoEditor();
  if (editor && editor.getValue) {
    try {
      return editor.getValue().length;
    } catch (e) { /* fall through */ }
  }
  // Fallback: count visible lines
  const viewLines = document.querySelector('.view-lines');
  return viewLines ? viewLines.querySelectorAll('.view-line').length : 0;
}

// Extract code via world bridge — sends message to background service worker
// which uses chrome.scripting.executeScript({world:'MAIN'}) to access window.monaco.editor.
// This replaces the old inline <script> injection which was blocked by the page's CSP.
let bridgeFailCount = 0;
async function extractCodeViaBridge() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getMonacoContent' });
    if (response?.error) {
      if (bridgeFailCount === 0) {
        console.error('[Vibe Extension] Bridge error from background:', response.error);
      }
      bridgeFailCount++;
      return null;
    }
    // Log probe on first call
    if (bridgeFailCount === 0 && response?.debug) {
      console.log('[Vibe Extension] Bridge MAIN world probe:', JSON.stringify(response.debug));
    }
    if (!response?.content) bridgeFailCount++;
    return response?.content || null;
  } catch (e) {
    if (bridgeFailCount === 0) {
      console.error('[Vibe Extension] Bridge sendMessage failed:', e.message);
    }
    bridgeFailCount++;
    return null;
  }
}

// Auto-expand all collapsed folders in the file tree
async function expandAllFolders() {
  console.log('[Vibe Extension] Auto-expanding all folders...');
  let round = 0;
  const maxRounds = 30;

  while (round < maxRounds) {
    const collapsed = document.querySelectorAll('.fui-TreeItem[aria-expanded="false"]');
    if (collapsed.length === 0) {
      console.log('[Vibe Extension] All folders expanded');
      break;
    }

    console.log(`[Vibe Extension] Round ${round + 1}: expanding ${collapsed.length} collapsed folders...`);

    for (const folder of collapsed) {
      const clickTarget = folder.querySelector('.fui-TreeItemLayout__main') || folder;
      clickTarget.click();
      await new Promise(r => setTimeout(r, 30));
    }

    // Wait for DOM to update with newly expanded children
    await new Promise(r => setTimeout(r, 200));
    round++;
  }

  if (round >= maxRounds) {
    console.warn('[Vibe Extension] Max expand rounds reached, some folders may not be expanded');
  }
}

// Find the tree's scrollable parent container
function getTreeScrollContainer() {
  const treeItem = document.querySelector('.fui-TreeItem');
  if (!treeItem) return null;
  let el = treeItem.parentElement;
  while (el) {
    const style = window.getComputedStyle(el);
    if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
      if (el.scrollHeight > el.clientHeight) return el;
    }
    el = el.parentElement;
  }
  return null;
}

// Scroll the tree container to force virtualized items to render
async function scrollTreeToRenderAll() {
  const container = getTreeScrollContainer();
  if (!container) {
    console.log('[Vibe Extension] No scrollable tree container found, skipping scroll');
    return;
  }

  console.log('[Vibe Extension] Scrolling tree to render all virtualized items...');
  const viewportHeight = container.clientHeight;
  const totalHeight = container.scrollHeight;
  const steps = Math.ceil(totalHeight / viewportHeight);

  for (let i = 1; i <= steps; i++) {
    container.scrollTop = i * viewportHeight;
    await new Promise(r => setTimeout(r, 150));
  }

  // Scroll back to top
  container.scrollTop = 0;
  await new Promise(r => setTimeout(r, 200));
  console.log('[Vibe Extension] Tree scroll complete');
}

// Flatten nested folder structure JSON into a flat list of file paths
function flattenStructure(structure, prefix = '') {
  const paths = [];
  for (const node of structure) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'folder' && node.children) {
      paths.push(...flattenStructure(node.children, fullPath));
    } else if (node.type === 'file') {
      paths.push(fullPath);
    }
  }
  return paths;
}

// Collect all file paths from the expanded tree
// Returns [{element, path, name}]
function collectFilePaths() {
  const treeItems = Array.from(document.querySelectorAll('.fui-TreeItem'));
  const pathStack = []; // [{name, level}]
  const fileEntries = [];

  for (const item of treeItems) {
    const nameElement = item.querySelector('.fui-TreeItemLayout__main') || item;
    const name = nameElement.textContent.trim();
    const level = parseInt(item.getAttribute('aria-level'), 10);
    const isFolder = item.getAttribute('aria-expanded') !== null;

    // Pop stack to the correct level
    while (pathStack.length > 0 && pathStack[pathStack.length - 1].level >= level) {
      pathStack.pop();
    }

    if (isFolder) {
      pathStack.push({ name, level });
    } else {
      const folderPath = pathStack.map(p => p.name).join('/');
      const fullPath = folderPath ? `${folderPath}/${name}` : name;
      fileEntries.push({ element: item, path: fullPath, name });
    }
  }

  return fileEntries;
}

// Get a snapshot of the Monaco editor's visible text content from DOM.
// Used for fast polling to detect when a file has loaded (no Monaco API needed).
function getViewLinesSnapshot() {
  const viewLines = document.querySelector('.view-lines');
  return viewLines ? viewLines.textContent || '' : '';
}

// Wait for a file to load in Monaco after clicking its tree node.
// Uses DOM-based detection (.view-lines text content change) since window.monaco
// is no longer exposed globally on vibe.powerapps.com.
async function waitForFileLoad(expectedFilename, previousContent, timeout = 15000) {
  const startTime = Date.now();
  let filenameMatched = false;
  let iterations = 0;
  const prevSnapshot = getViewLinesSnapshot();

  while (Date.now() - startTime < timeout) {
    iterations++;
    const currentSnapshot = getViewLinesSnapshot();

    // Check if .view-lines content changed (DOM updated = file loaded)
    if (currentSnapshot && currentSnapshot.length > 0 && currentSnapshot !== prevSnapshot) {
      console.log(`[Vibe Extension] View-lines changed for ${expectedFilename} (${currentSnapshot.length} chars)`);
      return await extractCode();
    }

    // Fallback: check filename for extra confidence
    if (!filenameMatched) {
      const currentFilename = extractFilename();
      if (currentFilename === expectedFilename) {
        filenameMatched = true;
        console.log(`[Vibe Extension] Filename matched: ${expectedFilename} (viewLines: ${currentSnapshot.length} chars, iter: ${iterations})`);
      }
    }

    await new Promise(r => setTimeout(r, 200));
  }

  // Timeout — try full extraction
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  if (filenameMatched) {
    console.log(`[Vibe Extension] File ${expectedFilename} appears loaded, doing final extraction`);
    return await extractCode();
  }

  throw new Error(`Timeout waiting for file: ${expectedFilename} (elapsed: ${elapsed}s, iterations: ${iterations}, filenameMatched: ${filenameMatched})`);
}

// Download all files as a structured ZIP
async function downloadAllFiles() {
  console.log('[Vibe Extension] ═══════════════════════════════════════');
  console.log('[Vibe Extension] ║  Starting full project download  ║');
  console.log('[Vibe Extension] ═══════════════════════════════════════');
  const overallStart = Date.now();
  const phaseTimings = {};
  const fileTimings = []; // Per-file timing records

  // Step 1: Expand all folders
  let t0 = Date.now();
  await expandAllFolders();
  phaseTimings.expand = Date.now() - t0;
  console.log(`[Vibe Extension] ⏱  Phase 1 (expand folders): ${phaseTimings.expand}ms`);

  // Step 2: Scroll tree to force virtualized items to render in DOM
  t0 = Date.now();
  await scrollTreeToRenderAll();
  phaseTimings.scroll = Date.now() - t0;
  console.log(`[Vibe Extension] ⏱  Phase 2 (scroll tree): ${phaseTimings.scroll}ms`);

  // Step 3: Get folder structure JSON as authoritative checklist
  t0 = Date.now();
  const folderStructure = getFolderStructure();
  const expectedPaths = flattenStructure(folderStructure);
  phaseTimings.collect = Date.now() - t0;
  console.log(`[Vibe Extension] ⏱  Phase 3 (collect structure): ${phaseTimings.collect}ms`);
  console.log(`[Vibe Extension] Checklist from folder structure: ${expectedPaths.length} files expected`);

  // Step 4: Collect file entries from DOM
  const fileEntries = collectFilePaths();
  console.log(`[Vibe Extension] Found ${fileEntries.length} files in DOM tree`);

  // Warn if DOM count doesn't match checklist
  if (fileEntries.length < expectedPaths.length) {
    console.warn(`[Vibe Extension] ⚠️ DOM has ${fileEntries.length} files but structure has ${expectedPaths.length}. Some files may be missing from DOM.`);
  }

  if (fileEntries.length === 0) {
    console.error('[Vibe Extension] No files found in tree');
    return { successCount: 0, failCount: 0, total: 0, expectedTotal: expectedPaths.length, error: 'No files found in tree' };
  }

  if (typeof JSZip === 'undefined') {
    console.error('[Vibe Extension] JSZip not loaded');
    return { successCount: 0, failCount: 0, total: 0, expectedTotal: expectedPaths.length, error: 'JSZip not loaded' };
  }

  // Step 5: Create ZIP
  const zip = new JSZip();
  let successCount = 0;
  let failCount = 0;
  const downloadedPaths = new Set();

  // Step 6: Iterate through each file
  console.log(`[Vibe Extension] ── Downloading ${fileEntries.length} files ──`);
  const downloadStart = Date.now();
  let previousContent = '';
  for (let i = 0; i < fileEntries.length; i++) {
    const entry = fileEntries[i];
    const fileStart = Date.now();
    const timing = { path: entry.path, index: i + 1 };

    try {
      let content;
      let clickTime = 0, waitTime = 0, extractTime = 0;

      // First file: check if it's already open in Monaco
      if (i === 0) {
        const currentFilename = extractFilename();
        if (currentFilename === entry.name) {
          console.log(`[Vibe Extension] [${i + 1}/${fileEntries.length}] ${entry.path} — already open, extracting directly`);
          const et0 = Date.now();
          content = await extractCodeViaBridge() || await extractCode();
          extractTime = Date.now() - et0;
          if (content) previousContent = content;
        }
      }

      // If not already extracted, click and wait for load
      if (!content) {
        const ct0 = Date.now();
        const clickTarget = entry.element.querySelector('.fui-TreeItemLayout__main') || entry.element;
        entry.element.scrollIntoView({ block: 'center', behavior: 'instant' });
        clickTarget.click();
        clickTime = Date.now() - ct0;

        const wt0 = Date.now();
        content = await waitForFileLoad(entry.name, previousContent);
        waitTime = Date.now() - wt0;
        previousContent = content;
      }

      // Fallback: if bridge failed, try full extraction
      if (!content || content.length === 0) {
        const et0 = Date.now();
        content = await extractCode();
        extractTime += Date.now() - et0;
        if (content) previousContent = content;
      }

      if (!content || content.length === 0) {
        console.warn(`[Vibe Extension] [${i + 1}/${fileEntries.length}] ✗ ${entry.path} — no content`);
        failCount++;
        timing.result = 'fail';
        timing.total = Date.now() - fileStart;
        fileTimings.push(timing);
        continue;
      }

      // Add to ZIP preserving folder structure
      zip.file(entry.path, content);
      successCount++;
      downloadedPaths.add(entry.path);

      // Visual feedback
      markFileAsDownloaded(entry.name);
      try {
        const el = entry.element;
        if (el && el.isConnected) {
          const nameEl = el.querySelector('.fui-TreeItemLayout__main') || el;
          if (!nameEl.querySelector('.downloaded-marker')) {
            const marker = document.createElement('span');
            marker.className = 'downloaded-marker';
            marker.textContent = '✓ ';
            marker.style.cssText = 'color:#28a745;font-weight:bold;margin-right:4px';
            nameEl.insertBefore(marker, nameEl.firstChild);
          }
          nameEl.style.color = '#28a745';
          el.style.opacity = '0.7';
        }
      } catch (e) { /* ignore */ }

      timing.result = 'ok';
      timing.total = Date.now() - fileStart;
      timing.clickTime = clickTime;
      timing.waitTime = waitTime;
      timing.extractTime = extractTime;
      timing.contentLen = content.length;
      fileTimings.push(timing);

      console.log(`[Vibe Extension] [${i + 1}/${fileEntries.length}] ✓ ${entry.path} — ` +
        `click:${clickTime}ms wait:${waitTime}ms extract:${extractTime}ms total:${timing.total}ms (${content.length} chars)`);
    } catch (error) {
      timing.result = 'error';
      timing.total = Date.now() - fileStart;
      timing.error = error.message;
      fileTimings.push(timing);
      console.error(`[Vibe Extension] [${i + 1}/${fileEntries.length}] ✗ ${entry.path} — ${error.message}`);
      failCount++;
    }
  }

  const downloadElapsed = Date.now() - downloadStart;

  // Step 7: Generate and download ZIP
  console.log(`[Vibe Extension] ── Generating ZIP (${successCount} files) ──`);
  try {
    t0 = Date.now();
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });
    phaseTimings.zipGen = Date.now() - t0;
    console.log(`[Vibe Extension] ⏱  ZIP generation: ${phaseTimings.zipGen}ms (${(blob.size / 1024).toFixed(1)} KB)`);

    const planId = getPlanId();
    const zipFilename = `vibe.powerapps.${planId}.zip`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const overallElapsed = ((Date.now() - overallStart) / 1000).toFixed(1);

    // ─── Timing Summary ───
    console.log(`[Vibe Extension] ═══════════════════════════════════════`);
    console.log(`[Vibe Extension] ║  Download Complete: ${zipFilename}`);
    console.log(`[Vibe Extension] ╠══════════════════════════════════════`);
    console.log(`[Vibe Extension] ║  Total time:    ${overallElapsed}s`);
    console.log(`[Vibe Extension] ║  Expand:        ${phaseTimings.expand}ms`);
    console.log(`[Vibe Extension] ║  Scroll tree:   ${phaseTimings.scroll}ms`);
    console.log(`[Vibe Extension] ║  Collect:       ${phaseTimings.collect}ms`);
    console.log(`[Vibe Extension] ║  File download: ${(downloadElapsed / 1000).toFixed(1)}s`);
    console.log(`[Vibe Extension] ║  ZIP generate:  ${phaseTimings.zipGen}ms`);
    console.log(`[Vibe Extension] ╠══════════════════════════════════════`);
    console.log(`[Vibe Extension] ║  Files: ${successCount} ok, ${failCount} fail, ${fileEntries.length} total`);
    console.log(`[Vibe Extension] ║  ZIP size: ${(blob.size / 1024).toFixed(1)} KB`);

    // Per-file stats
    const okFiles = fileTimings.filter(f => f.result === 'ok');
    if (okFiles.length > 0) {
      const avgTotal = okFiles.reduce((s, f) => s + f.total, 0) / okFiles.length;
      const avgWait = okFiles.reduce((s, f) => s + (f.waitTime || 0), 0) / okFiles.length;
      const sorted = [...okFiles].sort((a, b) => b.total - a.total);
      console.log(`[Vibe Extension] ║  Avg per file:  ${avgTotal.toFixed(0)}ms (wait: ${avgWait.toFixed(0)}ms)`);
      console.log(`[Vibe Extension] ║  Slowest 3 files:`);
      sorted.slice(0, 3).forEach(f => {
        console.log(`[Vibe Extension] ║    ${f.total}ms — ${f.path} (wait:${f.waitTime || 0}ms extract:${f.extractTime || 0}ms)`);
      });
    }

    // Completeness check
    const missingFiles = expectedPaths.filter(p => !downloadedPaths.has(p));
    const extraFiles = Array.from(downloadedPaths).filter(p => !expectedPaths.includes(p));

    console.log(`[Vibe Extension] ╠══════════════════════════════════════`);
    console.log(`[Vibe Extension] ║  Completeness:`);
    console.log(`[Vibe Extension] ║    Expected: ${expectedPaths.length}`);
    console.log(`[Vibe Extension] ║    Downloaded: ${downloadedPaths.size}`);
    console.log(`[Vibe Extension] ║    Missing: ${missingFiles.length}`);
    console.log(`[Vibe Extension] ║    Extra: ${extraFiles.length}`);

    if (missingFiles.length > 0) {
      console.warn(`[Vibe Extension] ═══════════════════════════════════════`);
      console.warn(`[Vibe Extension] ⚠️  MISSING FILES (${missingFiles.length}):`);
      missingFiles.forEach(p => console.warn(`[Vibe Extension]     - ${p}`));
    } else {
      console.log(`[Vibe Extension] ║    ✅ All expected files downloaded!`);
    }
    console.log(`[Vibe Extension] ═══════════════════════════════════════`);

    return { successCount, failCount, total: downloadedPaths.size, expectedTotal: expectedPaths.length, missingFiles, elapsed: overallElapsed, phaseTimings, fileTimings };
  } catch (error) {
    console.error('[Vibe Extension] Failed to generate ZIP:', error);
    return { successCount, failCount, total: fileEntries.length, expectedTotal: expectedPaths.length, error: 'ZIP generation failed: ' + error.message };
  }

  return { successCount, failCount, total: downloadedPaths.size, expectedTotal: expectedPaths.length };
}
function getPlanId() {
  const match = window.location.pathname.match(/\/plan\/([^\/]+)/);
  return match ? match[1] : 'unknown';
}

// Mark file as downloaded in the tree panel with green checkmark
function markFileAsDownloaded(filename) {
  // Find the tree item that contains this filename
  const treeItems = Array.from(document.querySelectorAll('.fui-TreeItem'));

  for (const item of treeItems) {
    const nameElement = item.querySelector('.fui-TreeItemLayout__main') || item;

    // Check if this tree item matches the downloaded filename
    // Only match files (items without aria-expanded attribute)
    const isFolder = item.getAttribute('aria-expanded') !== null;

    if (isFolder) {
      continue; // Skip folders
    }

    // Get text content, removing the checkmark if it already exists
    let itemText = nameElement.textContent.trim();
    // Remove checkmark prefix if present
    itemText = itemText.replace(/^✓\s*/, '');

    if (itemText === filename) {
      // Add visual indicators
      // 1. Add a green checkmark before the filename
      if (!nameElement.querySelector('.downloaded-marker')) {
        const marker = document.createElement('span');
        marker.className = 'downloaded-marker';
        marker.textContent = '✓ ';
        marker.style.color = '#28a745';
        marker.style.fontWeight = 'bold';
        marker.style.marginRight = '4px';
        nameElement.insertBefore(marker, nameElement.firstChild);
      }

      // 2. Change text color to green
      nameElement.style.color = '#28a745';

      // 3. Add a subtle opacity change
      item.style.opacity = '0.7';

      console.log('Marked as downloaded:', filename);
      break;
    }
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  console.log('[Vibe Extension] Received message:', msg.action);

  if (msg.action === 'getSource') {
    // Handle async extractCode
    console.log('[Vibe Extension] Starting code extraction...');
    extractCode()
      .then(content => {
        console.log('[Vibe Extension] Extraction complete, content length:', content?.length || 0);
        const filename = extractFilename();
        console.log('[Vibe Extension] Filename:', filename);
        console.log('[Vibe Extension] Sending response to background script...');
        respond({ content, filename });
      })
      .catch(error => {
        console.error('[Vibe Extension] Error extracting code:', error);
        const filename = extractFilename();
        respond({ content: null, filename });
      });
    return true; // Keep the message channel open for async response
  }

  if (msg.action === 'getTree') {
    const structure = getFolderStructure();
    const planId = getPlanId();
    respond({ structure, planId });
    return true;
  }

  if (msg.action === 'markDownloaded') {
    markFileAsDownloaded(msg.filename);
    respond({ success: true });
    return true;
  }

  if (msg.action === 'downloadAll') {
    console.log('[Vibe Extension] Starting downloadAll...');
    downloadAllFiles()
      .then(result => {
        console.log('[Vibe Extension] downloadAll result:', result);
        respond(result);
      })
      .catch(error => {
        console.error('[Vibe Extension] downloadAll error:', error);
        respond({ successCount: 0, failCount: 0, total: 0, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});
