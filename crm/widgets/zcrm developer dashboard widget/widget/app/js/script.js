// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   initialization & startup                  
// ╚══════════════════════════════════════════════════════════════════════════════╝

let context = null;

ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("Zoho Developer Dashboard: PageLoad event fired.");
});

ZOHO.embeddedApp.init().then(function() {
    console.log("SDK Initialized. Fetching Org Info...");

    ZOHO.CRM.CONFIG.getOrgInfo().then(function(orgData) {
        const orgInfo = orgData?.org?.[0];
        const zgid = orgInfo?.zgid;

        if (!zgid) {
            console.error("CRITICAL: Failed to get Org ID via SDK.", orgData);
            document.body.innerHTML = '<div style="color:white;text-align:center;padding:50px;">Failed to initialize: Could not retrieve Organization ID.</div>';
            return;
        }

        console.log("Org ID retrieved:", zgid);
        console.log("Full Org Info:", orgInfo);

        context = {
            currentTab: 'functions',
            currentScriptsSubtab: 'all',
            activeScreen: 'dashboard',
            orgId: zgid,
            crmUrl: 'https://crm.zoho.com',
            db: {
                name: `zcrm-dev-dashboard-widget-${zgid}`,
                version: 1,
                instance: null
            },
            functions: {
                all: [],
                filtered: [],
                details: {}
            },
            scripts: {
                all: [],
                filtered: [],
                details: {},
                pages: [],
                staticResources: [],
                lastCacheUpdate: null,
                updateStats: {}
            },
            status: {
                activeOperations: new Set(),
                timeoutId: null
            }
        };

        startApp();

    }).catch(err => {
        console.error("Fatal error during getOrgInfo", err);
        document.body.innerHTML = '<div style="color:white;text-align:center;padding:50px;">Initialization Error. Please check the console.</div>';
    });
});

function startApp() {
    attachEventListeners();
    setupGlobalKeyboardShortcuts();
    updateHelpLink();
    initFunctions();
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   indexeddb helpers                     
// ╚══════════════════════════════════════════════════════════════════════════════╝

const dbHelper = {
    open: function() {
        return new Promise((resolve, reject) => {
            if (!context || !context.db) return reject("Context not initialized");
            if (context.db.instance) return resolve(context.db.instance);

            const request = indexedDB.open(context.db.name, context.db.version);
            request.onerror = (event) => reject("IndexedDB error: " + event.target.errorCode);
            request.onsuccess = (event) => {
                context.db.instance = event.target.result;
                resolve(context.db.instance);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const stores = {
                    'functions': {
                        keyPath: 'id'
                    },
                    'functions-metadata': {
                        keyPath: 'key'
                    },
                    'client-scripts-metadata': {
                        keyPath: 'orgId'
                    },
                    'client-scripts': {
                        keyPath: 'id',
                        indexes: ['orgId']
                    },
                    'client-scripts-source': {
                        keyPath: 'scriptId',
                        indexes: ['orgId']
                    },
                    'client-scripts-pages': {
                        keyPath: 'uuid',
                        indexes: ['orgId']
                    },
                    'client-scripts-static': {
                        keyPath: 'id',
                        indexes: ['orgId']
                    }
                };
                for (const [name, config] of Object.entries(stores)) {
                    if (!db.objectStoreNames.contains(name)) {
                        const store = db.createObjectStore(name, {
                            keyPath: config.keyPath
                        });
                        config.indexes?.forEach(index => store.createIndex(index, index, {
                            unique: false
                        }));
                    }
                }
            };
        });
    }
};

const functionsDBHelper = {
    getItems: () => dbHelper.open().then(db => new Promise((resolve, reject) => {
        const request = db.transaction('functions', 'readonly').objectStore('functions').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    })),

    putItems: (items) => dbHelper.open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('functions', 'readwrite');
        items.forEach(item => tx.objectStore('functions').put(item));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    })),

    deleteItems: (ids) => dbHelper.open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('functions', 'readwrite');
        ids.forEach(id => tx.objectStore('functions').delete(id));
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
    })),

    getMeta: (key) => dbHelper.open().then(db => new Promise(resolve => {
        const request = db.transaction('functions-metadata', 'readonly').objectStore('functions-metadata').get(key);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = () => resolve(null);
    })),

    putMeta: (key, value) => dbHelper.open().then(db => db.transaction('functions-metadata', 'readwrite').objectStore('functions-metadata').put({
        key,
        value
    })),

    clearAll: () => dbHelper.open().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(['functions', 'functions-metadata'], 'readwrite');
        tx.objectStore('functions').clear();
        tx.objectStore('functions-metadata').clear();
        tx.oncomplete = resolve;
        tx.onerror = reject;
    }))
};

const scriptsDBHelper = {
    loadAll: () => dbHelper.open().then(db => new Promise(async (resolve) => {
        try {
            const tx = db.transaction(['client-scripts-metadata', 'client-scripts', 'client-scripts-source', 'client-scripts-pages', 'client-scripts-static'], 'readonly');
            const getStoreData = (storeName, useIndex = true) => new Promise(res => {
                const store = tx.objectStore(storeName);
                const req = useIndex && storeName !== 'client-scripts-metadata' ? store.index('orgId').getAll(context.orgId) : store.get(context.orgId);
                req.onsuccess = e => res(e.target.result);
                req.onerror = () => res(useIndex ? [] : null);
            });

            const meta = await getStoreData('client-scripts-metadata', false);
            if (!meta) return resolve(false);

            context.scripts.lastCacheUpdate = meta.lastUpdate;
            const [pages, staticRes, scripts, sources] = await Promise.all([
                getStoreData('client-scripts-pages'),
                getStoreData('client-scripts-static'),
                getStoreData('client-scripts'),
                getStoreData('client-scripts-source')
            ]);

            context.scripts.pages = pages || [];
            context.scripts.staticResources = staticRes || [];
            context.scripts.all = scripts || [];
            context.scripts.details = (sources || []).reduce((acc, item) => ({
                ...acc,
                [item.scriptId]: {
                    source_code: item.source_code,
                    async_code_url: item.async_code_url
                }
            }), {});

            updateCacheStatus(`Cache loaded: ${formatDateTime(meta.lastUpdate)}`, 'scripts');
            resolve(true);
        } catch (error) {
            console.error("Error loading script cache:", error);
            resolve(false);
        }
    })),

    saveAll: () => dbHelper.open().then(db => new Promise((resolve, reject) => {
        const storeNames = ['client-scripts-metadata', 'client-scripts', 'client-scripts-source', 'client-scripts-pages', 'client-scripts-static'];
        const tx = db.transaction(storeNames, 'readwrite');
        tx.onerror = (e) => {
            console.error("DB Save Error:", e.target.error);
            reject(e.target.error);
        };
        tx.oncomplete = () => {
            updateCacheStatus(`Cache saved: ${new Date().toLocaleTimeString()}`, 'scripts');
            resolve();
        };

        storeNames.forEach(name => tx.objectStore(name).clear());

        tx.objectStore('client-scripts-metadata').put({
            orgId: context.orgId,
            lastUpdate: new Date().toISOString()
        });
        context.scripts.pages.forEach(item => tx.objectStore('client-scripts-pages').put({
            ...item,
            orgId: context.orgId
        }));
        context.scripts.staticResources.forEach(item => tx.objectStore('client-scripts-static').put({
            ...item,
            orgId: context.orgId
        }));
        context.scripts.all.forEach(item => tx.objectStore('client-scripts').put({
            ...item,
            orgId: context.orgId
        }));
        Object.entries(context.scripts.details).forEach(([scriptId, details]) => {
            tx.objectStore('client-scripts-source').put({
                scriptId,
                orgId: context.orgId,
                source_code: details.source_code,
                async_code_url: details.async_code_url
            });
        });
    })),

    clearAll: () => dbHelper.open().then(db => new Promise((resolve, reject) => {
        const stores = ['client-scripts-metadata', 'client-scripts', 'client-scripts-source', 'client-scripts-pages', 'client-scripts-static'];
        const tx = db.transaction(stores, 'readwrite');
        tx.onerror = (e) => reject(e.target.error);
        tx.oncomplete = () => resolve();
        stores.forEach(s => tx.objectStore(s).clear());
    }))
};

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   ui + dom helpers                    
// ╚══════════════════════════════════════════════════════════════════════════════╝

function updateStatus(message, options = {}) {
    if (!context) return;
    const statusEls = document.querySelectorAll('.dashboard-status');
    if (context.status.timeoutId) clearTimeout(context.status.timeoutId);

    if (!message) {
        statusEls.forEach(el => {
            el.style.display = 'none';
            el.textContent = '';
        });
        return;
    }

    statusEls.forEach(el => {
        el.textContent = message;
        el.style.display = 'inline';
    });

    if (options.operation) {
        context.status.activeOperations.add(options.operation);
    } else if (!options.persistent) {
        context.status.timeoutId = setTimeout(() => {
            statusEls.forEach(el => el.style.display = 'none');
        }, options.duration || 3000);
    }
}

function clearOperationStatus(operationName) {
    if (!context) return;
    context.status.activeOperations.delete(operationName);
    if (context.status.activeOperations.size === 0) {
        document.querySelectorAll('.dashboard-status').forEach(el => el.style.display = 'none');
    }
}

function updateCacheStatus(message, tab) {
    if (!context) return;
    const el = document.getElementById(`${tab || context.currentTab}-cache-status`);
    if (el) el.textContent = message;
}

function showProgressModal(title) {
    const modalContainer = document.getElementById('modal-container');
    const modalId = `modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="modal-overlay">
            <div class="modal-panel" style="max-width: 50vw; text-align: center;">
                <h3 style="color:#f0f0f0;">${title}</h3>
                <div style="background: #1a1a1a; border-radius: 8px; padding: 4px; border: 1px solid #333; margin-bottom: 12px;">
                    <div class="progress-bar-inner" style="background: #007bff; height: 16px; width: 0%; border-radius: 6px; transition: width 0.3s ease;"></div>
                </div>
                <p class="progress-status" style="margin: 0; color: #aaa; font-size: 14px; min-height: 20px;"></p>
            </div>
        </div>`;
    modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    const modalEl = document.getElementById(modalId);
    const bar = modalEl.querySelector('.progress-bar-inner');
    const status = modalEl.querySelector('.progress-status');

    return {
        update: (progress, text) => {
            if (bar) bar.style.width = `${Math.min(100, Math.max(0, progress))}%`;
            if (status) status.textContent = text;
        },
        close: () => modalEl?.remove()
    };
}

function showConfirmation(action, count, callback) {
    const titles = {
        'refresh': 'Confirm Cache Refresh',
        'export': 'Confirm Export',
        'close-widget': 'Exit Dashboard'
    };

    const messages = {
        'refresh': 'This will clear the local cache and re-fetch all data from Zoho. This may take a while.',
        'export': `Export ${count} item(s)?`,
        'close-widget': 'Are you sure you want to close the dashboard?'
    };

    const confirmLabels = {
        'refresh': 'Refresh',
        'export': 'Export',
        'close-widget': 'Exit'
    };

    const confirmHTML = `
        <div class="modal-panel" style="max-width: 400px;">
            <h3 style="color:#f0f0f0">${titles[action]}</h3>
            <p style="color:#aaa">${messages[action] || 'Are you sure?'}</p>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top: 20px;">
                <button id="confirm-cancel" class="footer-button" style="width:100px;">Cancel</button>
                <button id="confirm-ok" class="footer-button" style="background:var(--accent-blue);border-color:var(--accent-blue); width:100px";>${confirmLabels[action] || 'OK'}</button>
            </div>
        </div>`;

    const modalContainer = document.getElementById('modal-container');
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';
    modalOverlay.innerHTML = confirmHTML;
    modalContainer.appendChild(modalOverlay);

    const cancelButton = modalOverlay.querySelector('#confirm-cancel');
    const okButton = modalOverlay.querySelector('#confirm-ok');

    const handleKeydown = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            if (document.activeElement === okButton) {
                cancelButton.focus();
            } else {
                okButton.focus();
            }
        }
    };

    modalOverlay.addEventListener('keydown', handleKeydown);

    const cleanup = () => {
        modalOverlay.removeEventListener('keydown', handleKeydown);
        modalOverlay.remove();
    };

    cancelButton.onclick = cleanup;

    okButton.onclick = () => {
        cleanup();
        callback();
    };

    setTimeout(() => cancelButton.focus(), 0);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   api + data fetching                   
// ╚══════════════════════════════════════════════════════════════════════════════╝

async function fetchAllLiveFunctions() {
    let allFuncs = [];
    let start = 1;
    let hasMore = true;

    while (hasMore) {
        try {
            const resp = await zrc.get(`/crm/v8/settings/functions?type=org&start=${start}&limit=200`, {
                params: {}
            });

            if (resp.data.functions && resp.data.functions.length > 0) {
                allFuncs.push(...resp.data.functions);
                if (resp.data.functions.length < 200) {
                    hasMore = false;
                }
                start += 200;
            } else {
                hasMore = false;
            }
        } catch (error) {
            console.error("Error fetching functions page:", error);
            if (error.code === 'NO_CONTENT' || error.response?.status === 204) {
                hasMore = false;
            } else if (start === 1) {
                throw error;
            } else {
                hasMore = false;
            }
        }
    }
    return allFuncs;
}

async function fetchSourceCode(functionId) {
    try {
        const resp = await zrc.get(`/crm/v8/settings/functions/${functionId}?source=crm`, {
            params: {}
        });

        if (resp.data.functions && resp.data.functions[0]) {
            return resp.data.functions[0];
        } else {
            throw new Error("No function data returned");
        }
    } catch (error) {
        console.error(`Failed to fetch source for function ID ${functionId}`, error);
        return `// Error: Could not load source code.\n// ${error.message || JSON.stringify(error)}`;
    }
}

async function fetchCurrentPages() {
    try {
        const res = await zrc.get('/crm/v2.2/settings/cscript_pages?include_extra_details=true');
        return res.data.cscript_pages || [];
    } catch (e) {
        console.error("Failed to fetch CS pages", e);
        return [];
    }
}

async function fetchCurrentScripts(pages) {
    const scriptPromises = pages.map(page =>
        zrc.get(`/crm/v2.2/settings/cscript_snippets?page_uuid=${page.uuid}`).then(res => {
            const snippets = (res.data || res).cscript_snippets || [];
            return snippets.map(s => ({
                ...s,
                page_info: {
                    definition_name: page.definition_name,
                    module: page.selectors?.Module?.value || '',
                    layout: page.selectors?.Layout?.value || '',
                    page_type: page.page_type || 'standard'
                }
            }));
        }).catch(err => {
            console.warn('Failed to fetch scripts for page:', page.uuid, err);
            return [];
        })
    );
    const scriptArrays = await Promise.all(scriptPromises);
    return scriptArrays.flat();
}

async function fetchCurrentStaticResources() {
    try {
        const res = await zrc.get('/crm/v2.2/settings/static_resources?page=1&per_page=200');
        return (res.data.static_resources || []).filter(r => r.source === 'user');
    } catch (e) {
        console.error("Failed to fetch static resources", e);
        return [];
    }
}

async function fetchScriptSourceCode(script) {
    if (!script.content || !script.content.source_code_url) {
        return 'No source code URL available';
    }

    try {
        const response = await fetch(script.content.source_code_url);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const sourceCode = await response.text();
        return sourceCode;
    } catch (error) {
        console.error(`Failed to fetch source for script ${script.id}:`, error);
        return `// Error loading source: ${error.message}`;
    }
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   functions - core logic                     
// ╚══════════════════════════════════════════════════════════════════════════════╝

async function initFunctions() {
    const listEl = document.getElementById('functions-list');
    if (!listEl) {
        console.error("functions-list element not found");
        return;
    }

    listEl.innerHTML = '<div class="loading-message">Checking cache...</div>';

    try {
        await dbHelper.open();
        const cached = await functionsDBHelper.getItems();

        if (cached && cached.length > 0) {
            context.functions.all = cached;
            finishFunctionsSetup();
            initFunctionsSmartSync(false).catch(err => {
                console.error("Background sync failed:", err);
            });
        } else {
            const progressModal = showProgressModal('Initializing Deluge Functions');
            try {
                await initFunctionsSmartSync(false, progressModal);
            } finally {
                progressModal.close();
            }
        }
    } catch (err) {
        console.error("Function init failed:", err);
        listEl.innerHTML = `<div class="no-results-message" style="color:#dc3545">Error loading database: ${escapeHtml(err.message || String(err))}</div>`;
    }
}

async function initFunctionsSmartSync(forceRefresh = false, progressModal = null) {
    const operationName = 'syncFunctions';
    try {
        if (forceRefresh) {
            await functionsDBHelper.clearAll();
            context.functions.all = [];
            updateCacheStatus('Cache cleared.', 'functions');
        }

        updateStatus('Syncing with Zoho...', {
            operation: operationName,
            persistent: true
        });

        if (progressModal) progressModal.update(10, "Fetching function list...");
        const liveFunctions = await fetchAllLiveFunctions();
        const cachedFunctions = forceRefresh ? [] : await functionsDBHelper.getItems();
        const lastUpdate = await functionsDBHelper.getMeta('lastUpdate');

        if (lastUpdate && !forceRefresh) updateCacheStatus(`Cache: ${formatDateTime(lastUpdate)}`, 'functions');

        const cachedMap = new Map(cachedFunctions.map(f => [f.id, f]));
        const toFetch = liveFunctions.filter(lf => !cachedMap.has(lf.id) || lf.updatedTime !== cachedMap.get(lf.id).updatedTime);
        const idsToDelete = cachedFunctions.filter(cf => !liveFunctions.some(lf => lf.id === cf.id)).map(f => f.id);

        if (toFetch.length === 0 && idsToDelete.length === 0 && !forceRefresh) {
            context.functions.all = cachedFunctions;
            finishFunctionsSetup();
            clearOperationStatus(operationName);
            updateStatus(`Functions are up to date.`, {
                duration: 3000
            });
            return;
        }

        let processed = 0;
        const total = toFetch.length;

        for (const func of toFetch) {
            await new Promise(r => setTimeout(r, 50));
            try {
                const res = await zrc.get(`/crm/v8/settings/functions/${func.id}?source=${func.source}`);
                const detail = res.data.functions[0];
                Object.assign(func, {
                    source_code: detail.workflow || detail.script || '// No source available',
                    modified_by: detail.modified_by,
                    modified_on: detail.modified_on,
                    return_type: detail.return_type
                });
            } catch (e) {
                func.source_code = '// Error fetching source';
            }
            processed++;
            if (progressModal) progressModal.update(10 + (processed / total) * 90, `Fetching source: ${func.display_name}`);
        }

        if (progressModal) progressModal.update(98, "Saving to local cache...");
        if (toFetch.length > 0) await functionsDBHelper.putItems(toFetch.map(f => {
            const cached = cachedMap.get(f.id) || {};
            return {
                ...cached,
                ...f
            };
        }));
        if (idsToDelete.length > 0) await functionsDBHelper.deleteItems(idsToDelete);

        context.functions.all = await functionsDBHelper.getItems();
        await functionsDBHelper.putMeta('lastUpdate', new Date().toISOString());

        finishFunctionsSetup();
        clearOperationStatus(operationName);
        updateStatus(`Synced ${context.functions.all.length} functions.`, {
            duration: 4000
        });
        updateCacheStatus(`Cache: ${new Date().toLocaleTimeString()}`, 'functions');

    } catch (error) {
        console.error('Function sync failed:', error);
        clearOperationStatus(operationName);
        document.getElementById('functions-list').innerHTML = `<div class="no-results-message" style="color:#dc3545">Sync failed: ${escapeHtml(error.message)}</div>`;
    }
}

function finishFunctionsSetup() {
    populateFunctionsCategoryFilter();
    filterAndSortFunctions();
}

function filterAndSortFunctions() {
    const searchTerm = document.getElementById('functions-search').value.toLowerCase();
    const categoryFilter = document.getElementById('functions-category').value;
    const sortBy = document.getElementById('functions-sort').value;

    context.functions.filtered = context.functions.all.filter(func => {
        const matchCat = !categoryFilter || func.category === categoryFilter;
        if (!matchCat) return false;
        if (!searchTerm) return true;

        return (func.display_name?.toLowerCase().includes(searchTerm) ||
            func.api_name?.toLowerCase().includes(searchTerm) ||
            (func.source_code && func.source_code.toLowerCase().includes(searchTerm)));
    });

    context.functions.filtered.sort((a, b) => {
        if (sortBy === 'name') return (a.display_name || '').localeCompare(b.display_name || '');
        if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '') || (a.display_name || '').localeCompare(b.display_name || '');
        if (sortBy === 'created') return (b.createdTime || 0) - (a.createdTime || 0);
        return (b.updatedTime || 0) - (a.updatedTime || 0);
    });

    renderFunctionsList();
}

function renderFunctionsList() {
    const listEl = document.getElementById('functions-list');
    const loadingEl = document.getElementById('functions-loading');

    if (loadingEl) loadingEl.style.display = 'none';

    document.getElementById('functions-count').textContent = `Showing ${context.functions.filtered.length} of ${context.functions.all.length}`;

    if (context.functions.filtered.length === 0) {
        listEl.innerHTML = `<div class="no-results-message">${context.functions.all.length === 0 ? 'No functions found in this org.' : 'No matches found.'}</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();
    const categoryColors = {
        'automation': '#ad6c0b',
        'button': '#117911',
        'crmfundamentals': '#7e160a',
        'relatedlist': '#5009d4',
        'scheduler': '#cf00a2',
        'standalone': '#0003b6',
        'default': '#4d4d4d'
    };

    context.functions.filtered.forEach(func => {
        const row = document.createElement('div');
        row.className = 'function-row';
        row.dataset.id = func.id;
        row.innerHTML = `
            <div class="row-main">
                <div class="row-content">
                    <div class="row-header">
                        <span class="category-badge" style="background:${categoryColors[func.category] || categoryColors.default};">${escapeHtml(func.category || 'N/A')}</span>
                        <span class="row-title">${escapeHtml(func.display_name)}</span>
                    </div>
                    <div class="row-subtitle">${escapeHtml(func.api_name)}</div>
                    <div class="row-description">${escapeHtml(func.description || '')}</div>
                </div>
                <div class="row-meta">
                    <div>Modified: ${formatDateTime(func.updatedTime)}</div>
                    <div>Created: ${formatDateTime(func.createdTime)}</div>
                </div>
            </div>`;
        fragment.appendChild(row);
    });

    listEl.innerHTML = '';
    listEl.appendChild(fragment);
}

function populateFunctionsCategoryFilter() {
    const select = document.getElementById('functions-category');
    const currentVal = select.value;
    const categories = [...new Set(context.functions.all.map(f => f.category).filter(Boolean))].sort();

    select.innerHTML = '<option value="">All Categories</option>' +
        categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    select.value = currentVal;
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   scripts - core logic                     
// ╚══════════════════════════════════════════════════════════════════════════════╝

async function initScripts() {
    const listEl = document.getElementById('scripts-list');
    listEl.innerHTML = '<div class="loading-message">Checking script cache...</div>';
    try {
        await dbHelper.open();
        const hasCache = await scriptsDBHelper.loadAll();
        if (hasCache) {
            finishScriptsSetup();
            performScriptsSmartCacheUpdate();
        } else {
            const progressModal = showProgressModal('Initializing Client Scripts');
            await loadAllClientScripts(progressModal);
            progressModal.close();
        }
    } catch (err) {
        listEl.innerHTML = `<div class="no-results-message" style="color:#dc3545">Error loading scripts.</div>`;
        console.error("Script init failed:", err);
    }
}

async function loadAllClientScripts(progressModal) {
    progressModal?.update(10, 'Fetching pages...');
    context.scripts.pages = await fetchCurrentPages();

    progressModal?.update(25, 'Fetching static resources...');
    context.scripts.staticResources = await fetchCurrentStaticResources();

    progressModal?.update(40, 'Fetching scripts from pages...');
    const scriptsFromPages = await fetchCurrentScripts(context.scripts.pages);

    context.scripts.all = [...scriptsFromPages, ...context.scripts.staticResources.map(createStaticScript)];

    await loadSourceCodeForScripts(progressModal);
    await scriptsDBHelper.saveAll();
    finishScriptsSetup();
    updateStatus(`Initial load complete - ${context.scripts.all.length} scripts cached.`, {
        duration: 4000
    });
}

async function performScriptsSmartCacheUpdate() {
    const operationName = 'smartUpdateScripts';
    try {
        updateStatus('Syncing scripts...', {
            operation: operationName,
            persistent: true
        });

        const [currentPages, currentStaticResources] = await Promise.all([fetchCurrentPages(), fetchCurrentStaticResources()]);
        const currentScripts = await fetchCurrentScripts(currentPages);

        const cachedScriptsMap = new Map(context.scripts.all.map(script => [script.id, script]));
        const allLiveScripts = [...currentScripts, ...currentStaticResources.map(createStaticScript)];
        const liveScriptsMap = new Map(allLiveScripts.map(script => [script.id, script]));

        const toAdd = allLiveScripts.filter(s => !cachedScriptsMap.has(s.id));
        const toUpdate = allLiveScripts.filter(s => cachedScriptsMap.has(s.id) && new Date(s.modified_time || 0) > new Date(cachedScriptsMap.get(s.id).modified_time || 0));
        const toRemove = Array.from(cachedScriptsMap.keys()).filter(id => !liveScriptsMap.has(id));

        if (toAdd.length === 0 && toUpdate.length === 0 && toRemove.length === 0) {
            clearOperationStatus(operationName);
            updateStatus('Scripts are up to date.', {
                duration: 3000
            });
            return;
        }

        await processScriptUpdates(toAdd, toUpdate, toRemove);

        context.scripts.pages = currentPages;
        context.scripts.staticResources = currentStaticResources;
        context.scripts.all = allLiveScripts;

        await scriptsDBHelper.saveAll();
        finishScriptsSetup();

        clearOperationStatus(operationName);
        updateStatus(`Script sync complete.`, {
            duration: 4000
        });
    } catch (error) {
        console.error('Script cache update failed:', error);
        clearOperationStatus(operationName);
        updateStatus('Script sync failed.', {
            duration: 5000
        });
    }
}

async function processScriptUpdates(toAdd, toUpdate, toRemove) {
    toRemove.forEach(id => delete context.scripts.details[id]);
    const toProcess = [...toAdd, ...toUpdate];
    for (const script of toProcess) {
        await new Promise(r => setTimeout(r, 50));
        const sourceCode = await fetchScriptSourceCode(script);
        context.scripts.details[script.id] = {
            source_code: sourceCode,
            async_code_url: script.content?.async_code_url
        };
    }
}

async function loadSourceCodeForScripts(progressModal) {
    const total = context.scripts.all.length;
    if (total === 0) return;

    let completed = 0;
    const batchSize = 5;

    for (let i = 0; i < context.scripts.all.length; i += batchSize) {
        const batch = context.scripts.all.slice(i, i + batchSize);

        await Promise.all(batch.map(async (script) => {
            try {
                const sourceCode = await fetchScriptSourceCode(script);
                context.scripts.details[script.id] = {
                    source_code: sourceCode,
                    async_code_url: script.content?.async_code_url
                };
            } catch (error) {
                console.error(`Error fetching source for script ${script.id}:`, error);
                context.scripts.details[script.id] = {
                    source_code: `// Error: ${error.message}`,
                    async_code_url: script.content?.async_code_url
                };
            }

            completed++;
            if (progressModal) {
                progressModal.update(50 + (completed / total) * 50, `Fetching source ${completed}/${total}`);
            }
        }));

        await new Promise(r => setTimeout(r, 100));
    }
}

function createStaticScript(resource) {
    return {
        id: resource.id,
        uuid: resource.id,
        name: resource.name,
        description: resource.description,
        active: !resource.deprecated,
        size: resource.size,
        created_time: resource.created_time,
        modified_time: resource.modified_time,
        created_by: resource.created_by,
        modified_by: resource.modified_by,
        page_info: {
            definition_name: 'static_resource',
            Module: {
                value: 'Static Resources'
            }
        },
        script_event: {
            event: resource.type || 'js',
            type: 'static'
        },
        content: {
            source_code_url: resource.uri || resource.compiled_file_uri
        }
    };
}

function finishScriptsSetup() {
    populateScriptsFilters();
    switchScriptsSubtab('all', true);
    filterAndSortScripts();
}

function filterAndSortScripts() {
    const searchTerm = document.getElementById('scripts-search').value.toLowerCase();
    const moduleFilter = document.getElementById('scripts-module').value;
    const pageFilter = document.getElementById('scripts-page').value;
    const eventFilter = document.getElementById('scripts-event').value;
    const statusFilter = document.getElementById('scripts-status').value;
    const sortBy = context.currentScriptsSubtab === 'module' || context.currentScriptsSubtab === 'all' ?
        document.getElementById('scripts-sort').value :
        document.getElementById('scripts-sort-simple').value;

    const subtabMap = {
        'module': s => s.page_info?.definition_name?.startsWith('module_'),
        'commands': s => s.page_info?.definition_name === 'commands',
        'static': s => s.page_info?.definition_name === 'static_resource',
        'all': s => true
    };

    context.scripts.filtered = context.scripts.all.filter(script => {
        const sourceCode = context.scripts.details[script.id]?.source_code?.toLowerCase() || '';
        const matchesSearch = !searchTerm ||
            script.name?.toLowerCase().includes(searchTerm) ||
            script.description?.toLowerCase().includes(searchTerm) ||
            script.page_info?.definition_name?.toLowerCase().includes(searchTerm) ||
            script.page_info?.module?.toLowerCase().includes(searchTerm) ||
            script.script_event?.event?.toLowerCase().includes(searchTerm) ||
            sourceCode.includes(searchTerm);

        return matchesSearch &&
            subtabMap[context.currentScriptsSubtab](script) &&
            (!moduleFilter || script.page_info?.module === moduleFilter) &&
            (!pageFilter || script.page_info?.definition_name === pageFilter) &&
            (!eventFilter || script.script_event?.event === eventFilter) &&
            (!statusFilter || (statusFilter === 'active' ? script.active : !script.active));
    });

    context.scripts.filtered.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return (a.name || '').localeCompare(b.name || '');
            case 'page':
                return (a.page_info?.definition_name || '').localeCompare(b.page_info?.definition_name || '');
            case 'event':
                return (a.script_event?.event || '').localeCompare(b.script_event?.event || '');
            case 'created':
                return new Date(b.created_time || 0) - new Date(a.created_time || 0);
            default:
                return new Date(b.modified_time || 0) - new Date(a.modified_time || 0);
        }
    });

    renderScriptsList();
    updateScriptsFilterBubbles();
}

function renderScriptsList() {
    const listContainer = document.getElementById('scripts-list');
    const loadingEl = document.getElementById('scripts-loading');

    if (loadingEl) loadingEl.style.display = 'none';

    let totalCount;
    if (context.currentScriptsSubtab === 'module') {
        totalCount = context.scripts.all.filter(s =>
            s.page_info?.definition_name?.startsWith('module_')
        ).length;
    } else if (context.currentScriptsSubtab === 'commands') {
        totalCount = context.scripts.all.filter(s =>
            s.page_info?.definition_name === 'commands'
        ).length;
    } else if (context.currentScriptsSubtab === 'static') {
        totalCount = context.scripts.all.filter(s =>
            s.page_info?.definition_name === 'static_resource'
        ).length;
    } else {
        totalCount = context.scripts.all.length;
    }

    document.getElementById('scripts-count').textContent =
        `Showing ${context.scripts.filtered.length} of ${totalCount} scripts`;

    if (context.scripts.filtered.length === 0) {
        listContainer.innerHTML = '<div class="no-results-message">No scripts found matching your criteria</div>';
        return;
    }

    const pageColors = {
        'module_create': '#4fdfbbff',
        'module_clone': '#f3f29eff',
        'module_edit': '#e74c3c',
        'module_detail': '#f39c12',
        'module_list': '#9b59b6',
        'commands': '#27ae60',
        'static_resource': '#037682'
    };
    const pageFontColors = {
        'module_edit': '#fff',
        'module_list': '#fff',
        'static_resource': '#fff'
    };
    const eventColors = {
        'onLoad': '#2ecc71',
        'onChange': '#ffd283ff',
        'onClick': '#e74c3c',
        'onInvoke': '#6f42c1',
        'onSave': '#ff4bd8ff',
        'js': '#ffd000ff'
    };
    const eventFontColors = {
        'onClick': '#fff',
        'onInvoke': '#fff',
        'onSave': '#fff'
    };

    const html = context.scripts.filtered.map(script => `
        <div class="script-row" data-id="${script.id}">
            <div class="row-main">
                <div class="row-content">
                    <div class="row-header">
                        <span class="category-badge" style="background:${pageColors[script.page_info?.definition_name] || '#ffa9b0ff'};color:${pageFontColors[script.page_info?.definition_name] || '#000'};">${script.page_info?.definition_name || ''}</span>
                        <span class="category-badge" style="background:${eventColors[script.script_event?.event] || '#7f8c8d'};color:${eventFontColors[script.script_event?.event] || '#000'};">${script.script_event?.event || ''}</span>
                        <span class="row-title">${escapeHtml(script.name) || 'Unnamed Script'}</span>
                        <span class="status-dot ${script.active ? 'active' : 'inactive'}">●</span>
                    </div>
                    <div class="row-subtitle">${escapeHtml([script.page_info?.module, script.page_info?.layout].filter(Boolean).join(' - '))}</div>
                    <div class="row-description">${escapeHtml(script.description) || ''}</div>
                    ${script.size ? `<div style="font-size:13px;color:#888;">Size: ${bytesToSize(script.size)}</div>` : ''}
                </div>
                <div class="row-meta">
                    <div>Created: ${formatDateTime(script.created_time)} by ${escapeHtml(script.created_by?.name)}</div>
                    <div>Modified: ${formatDateTime(script.modified_time)} by ${escapeHtml(script.modified_by?.name)}</div>
                </div>
            </div>
        </div>`).join('');

    listContainer.innerHTML = html;
}

function populateScriptsFilters() {
    const allModuleScripts = context.scripts.all.filter(s => s.page_info?.definition_name?.startsWith('module_'));
    const modules = [...new Set(allModuleScripts.map(s => s.page_info?.module).filter(Boolean))].sort();
    const pages = [...new Set(allModuleScripts.map(s => s.page_info?.definition_name).filter(Boolean))].sort();
    const events = [...new Set(allModuleScripts.map(s => s.script_event?.event).filter(Boolean))].sort();

    const moduleSelect = document.getElementById('scripts-module');
    moduleSelect.innerHTML = '<option value="">All Modules</option>' + modules.map(m => `<option value="${m}">${m}</option>`).join('');

    const pageSelect = document.getElementById('scripts-page');
    pageSelect.innerHTML = '<option value="">All Pages</option>' + pages.map(p => `<option value="${p}">${p.replace('module_', '').replace(/_/g, ' ').toUpperCase()}</option>`).join('');

    const eventSelect = document.getElementById('scripts-event');
    eventSelect.innerHTML = '<option value="">All Events</option>' + events.map(e => `<option value="${e}">${e}</option>`).join('');
}

function updateScriptsFilterBubbles() {
    const container = document.getElementById('scripts-active-filters');
    const bubbles = document.getElementById('scripts-filter-bubbles');
    bubbles.innerHTML = '';

    const filters = {
        Search: document.getElementById('scripts-search').value,
        Module: document.getElementById('scripts-module').value,
        Page: document.getElementById('scripts-page').value,
        Event: document.getElementById('scripts-event').value,
        Status: document.getElementById('scripts-status').value,
    };

    let hasFilters = false;
    Object.entries(filters).forEach(([key, value]) => {
        if (value) {
            hasFilters = true;
            const bubble = document.createElement('div');
            bubble.className = 'filter-bubble';
            bubble.innerHTML = `<span>${key}: ${value}</span><button>&times;</button>`;
            bubble.querySelector('button').onclick = () => {
                document.getElementById(`scripts-${key.toLowerCase()}`).value = '';
                filterAndSortScripts();
            };
            bubbles.appendChild(bubble);
        }
    });

    container.style.display = hasFilters ? 'flex' : 'none';
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   detail view                         
// ╚══════════════════════════════════════════════════════════════════════════════╝

function showDetailsView(item, type) {
    if (!item) return;
    context.activeScreen = 'details';

    const mainCloseBtn = document.getElementById('close-dashboard');
    if (mainCloseBtn) mainCloseBtn.style.display = 'none';

    const isFunction = type === 'function';
    const title = isFunction ? (item.display_name || 'Details') : (item.name || 'Script Details');
    const sourceCode = isFunction ? (item.source_code || 'Source code not loaded.') : ((context.scripts.details[item.id]?.source_code) || 'No source code available');
    const codeLang = isFunction ? 'clike' : 'javascript';
    const codeLangLabel = isFunction ? 'Deluge' : 'JavaScript';
    const downloadExt = isFunction ? 'dg' : 'js';
    const downloadName = isFunction ? item.display_name : item.name;
    const DETAIL_VIEW_WIDTH = '100vw';
    const DETAIL_VIEW_HEIGHT = '100vh';

    const downloadIconSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    const copyIconSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
    const checkIconSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

    let infoPanelHTML = '';
    if (isFunction) {
        infoPanelHTML = `
        <p><strong>API Name:</strong> <span>${escapeHtml(item.api_name) || ''}</span></p>
        <p><strong>Category:</strong> <span>${escapeHtml(item.category) || ''}</span></p>
        <p><strong>Return Type:</strong> <span>${escapeHtml(item.return_type?.toLowerCase()) || ''}</span></p>
        <p><strong>Modified:</strong> <span>${formatDateTime(item.modified_on) || ''} ${item.modified_by?.name ? 'by ' : ''}${escapeHtml(item.modified_by?.name) || ''}</span></p>
        ${item.description ? `<div style="padding-top:16px;margin-bottom:0;"><p><span>${escapeHtml(item.description)}</span></p></div>` : ''}
    `;
    } else {
        infoPanelHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:20px;">
            <div><p><strong>Module:</strong> <span>${escapeHtml(item.page_info?.module)}</span></p><p><strong>Layout:</strong> <span>${escapeHtml(item.page_info?.layout)}</span></p></div>
            <div><p><strong>Page:</strong> <span>${escapeHtml(toTitleCase(item.page_info?.definition_name?.replace('module_', '')))}</span></p><p><strong>Event:</strong> <span>${escapeHtml(item.script_event?.event)}</span></p></div>
            <div><p><strong>Category:</strong> <span>${escapeHtml(toTitleCase(item.script_event?.type))}</span></p><p><strong>Active:</strong> <span style="color:${item.active ? '#28a745':'#dc3545'};">${item.active ? 'Yes' : 'No'}</span></p></div>
            <div><p><strong>ID:</strong> <span>${escapeHtml(item.id)}</span></p><p><strong>Size:</strong> <span>${bytesToSize(item.size)}</span></p></div>
            <div><p><strong>Created:</strong> <span>${formatDateTime(item.created_time)} by ${escapeHtml(item.created_by?.name)}</span></p><p><strong>Modified:</strong> <span>${formatDateTime(item.modified_time)} by ${escapeHtml(item.modified_by?.name)}</span></p></div>
        </div>
        ${item.description ? `<div style="padding-top:16px;margin-bottom:0;"><p><span>${escapeHtml(item.description)}</span></p></div>` : ''}
    `;
    }

    const detailOverlay = document.createElement('div');
    detailOverlay.className = 'dashboard-detail modal-overlay';

    const detailPanel = document.createElement('div');
    detailPanel.className = 'detail-view-panel';
    detailPanel.style.width = DETAIL_VIEW_WIDTH;
    detailPanel.style.height = DETAIL_VIEW_HEIGHT;

    detailPanel.innerHTML = `
        <div class="detail-header">
            <div style="display:flex; align-items:center; gap: 16px;">
                <button class="detail-back footer-button" title="Back">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15,18 9,12 15,6"/>
                    </svg>
                </button>
                <h2 style="margin:0;font-size:18px;font-weight:500;color:#f0f0f0;white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(title)}</h2>
            </div>
        </div>
        <div class="detail-content">
            <div class="info-panel" style="flex-shrink:0;">
                ${infoPanelHTML.replace(/<p>/g, '<p style="margin:0 0 6px 0;">').replace(/<span>/g, '<span style="color:#aaa;">')}
            </div>
            <div class="code-container">
                <div class="code-header">
                    <span>${codeLangLabel}</span>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div class="detail-search-container" style="display:none;">
                            <input type="text" class="detail-search-input" placeholder="Search...">
                            <span class="detail-search-results"></span>
                            <button class="detail-search-btn detail-search-prev" title="Previous (Shift+Enter)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15,18 9,12 15,6"/></svg></button>
                            <button class="detail-search-btn detail-search-next" title="Next (Enter)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9,6 15,12 9,18"/></svg></button>
                            <button class="detail-search-btn detail-search-close" title="Close (Esc)">×</button>
                        </div>
                        <button class="detail-search-toggle detail-action-btn" title="Search Code"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></button>
                        <button class="detail-download detail-action-btn" title="Download Source">${downloadIconSVG}</button>
                        <button class="detail-copy detail-action-btn" title="Copy Source">${copyIconSVG}</button>
                    </div>
                </div>
                <pre class="code-viewer-pre"><code class="language-${codeLang}">${escapeHtml(sourceCode)}</code></pre>
            </div>
        </div>`;

    detailOverlay.appendChild(detailPanel);
    document.getElementById('modal-container').appendChild(detailOverlay);

    const detailKeyHandler = (e) => {
        if (context.activeScreen === 'details') {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                e.stopPropagation();
                if (!isSearchActive) {
                    showSearchBar();
                }
                return false;
            } else if (e.key === 'Escape' && isSearchActive) {
                e.preventDefault();
                e.stopPropagation();
                hideSearchBar();
                return false;
            }
        }
    };

    document.addEventListener('keydown', detailKeyHandler, true);

    const closeDetailView = () => {
        document.removeEventListener('keydown', detailKeyHandler, true);
        detailOverlay.remove();
        if (mainCloseBtn) mainCloseBtn.style.display = 'flex';
        context.activeScreen = 'dashboard';
    };

    detailPanel.querySelector('.detail-back').onclick = closeDetailView;
    detailPanel.querySelector('.detail-download').onclick = () => {
        downloadFile(new Blob([sourceCode], {
            type: 'text/plain'
        }), sanitizeFilename(downloadName || 'file') + '.' + downloadExt);
    };
    const copyBtn = detailPanel.querySelector('.detail-copy');
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(sourceCode).then(() => {
            copyBtn.innerHTML = checkIconSVG;
            setTimeout(() => {
                copyBtn.innerHTML = copyIconSVG;
            }, 2000);
        });
    };

    const searchToggle = detailPanel.querySelector('.detail-search-toggle');
    const searchContainer = detailPanel.querySelector('.detail-search-container');
    const searchInput = detailPanel.querySelector('.detail-search-input');
    const searchResults = detailPanel.querySelector('.detail-search-results');
    const searchPrev = detailPanel.querySelector('.detail-search-prev');
    const searchNext = detailPanel.querySelector('.detail-search-next');
    const searchClose = detailPanel.querySelector('.detail-search-close');
    const codeElement = detailPanel.querySelector('code');
    let isSearchActive = false,
        currentMatches = [],
        currentMatchIndex = -1;

    function showSearchBar() {
        isSearchActive = true;
        searchToggle.style.display = 'none';
        searchContainer.style.display = 'flex';
        searchInput.focus();
    }

    function hideSearchBar() {
        isSearchActive = false;
        searchContainer.style.display = 'none';
        searchToggle.style.display = 'flex';
        searchInput.value = '';
        highlightMatches('');
    }

    function highlightMatches(searchTerm) {
        if (!searchTerm || searchTerm.length < 2) {
            codeElement.innerHTML = escapeHtml(sourceCode);
            searchResults.textContent = '';
            if (window.Prism) Prism.highlightElement(codeElement);
            return;
        }
        currentMatches = [];
        sourceCode.split('\n').forEach((line, lineIndex) => {
            let index = 0;
            while ((index = line.toLowerCase().indexOf(searchTerm.toLowerCase(), index)) !== -1) {
                currentMatches.push({
                    line: lineIndex,
                    start: index,
                    end: index + searchTerm.length
                });
                index++;
            }
        });
        if (currentMatches.length === 0) {
            searchResults.textContent = '0/0';
            return;
        }
        currentMatchIndex = 0;
        renderHighlightedCode();
    }

    function renderHighlightedCode() {
        let html = '';
        sourceCode.split('\n').forEach((line, lineIndex) => {
            let lineHtml = '';
            let lastIndex = 0;
            currentMatches.filter(m => m.line === lineIndex).forEach(match => {
                lineHtml += escapeHtml(line.substring(lastIndex, match.start));
                const isCurrent = currentMatches.indexOf(match) === currentMatchIndex;
                lineHtml += `<mark style="background:${isCurrent ? '#ffd700' : '#ff6b35'};">${escapeHtml(line.substring(match.start, match.end))}</mark>`;
                lastIndex = match.end;
            });
            lineHtml += escapeHtml(line.substring(lastIndex));
            html += lineHtml + '\n';
        });
        codeElement.innerHTML = html;
        searchResults.textContent = `${currentMatchIndex + 1}/${currentMatches.length}`;
        const currentMark = codeElement.querySelectorAll('mark')[currentMatchIndex];
        if (currentMark) currentMark.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });
    }

    searchToggle.onclick = showSearchBar;
    searchClose.onclick = hideSearchBar;
    searchInput.oninput = (e) => highlightMatches(e.target.value);
    searchInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.shiftKey ? searchPrev.click() : searchNext.click();
        }
    };
    searchPrev.onclick = () => {
        if (currentMatches.length > 0) {
            currentMatchIndex = (currentMatchIndex - 1 + currentMatches.length) % currentMatches.length;
            renderHighlightedCode();
        }
    };
    searchNext.onclick = () => {
        if (currentMatches.length > 0) {
            currentMatchIndex = (currentMatchIndex + 1) % currentMatches.length;
            renderHighlightedCode();
        }
    };

    loadPrism(() => {
        if (window.Prism) {
            Prism.highlightElement(codeElement);
        }
    });
}

function loadPrism(callback) {
    if (window.Prism) return callback();

    const loadScript = (src) => new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
    });

    (async () => {
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-clike.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-javascript.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-css.min.js');
            callback();
        } catch (error) {
            console.warn('PrismJS failed to load from CDN.', error);
            callback();
        }
    })();
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   export functionality                         
// ╚══════════════════════════════════════════════════════════════════════════════╝

function showExportModal(type) {
    const itemsToExport = type === 'functions' ? context.functions.filtered : context.scripts.filtered;
    if (itemsToExport.length === 0) {
        alert("No items to export in the current view.");
        return;
    }

    showConfirmation('export', itemsToExport.length, () => {
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML += `
            <div class="modal-overlay" id="export-modal">
                <div class="modal-panel" style="max-width: 400px;">
                    <h3 style="color:#f0f0f0">Choose Format</h3>
                    <div style="display:flex; flex-direction:column; gap:12px; margin: 20px 0;">
                        <button id="export-json" class="footer-button" style="width:100%; text-align:left; padding: 12px;">📄 JSON Export</button>
                        <button id="export-zip" class="footer-button" style="width:100%; text-align:left; padding: 12px;">📦 ZIP Export</button>
                    </div>
                    <div style="display:flex; justify-content:flex-end;">
                        <button id="export-cancel" class="footer-button">Cancel</button>
                    </div>
                </div>
            </div>`;
        const modal = document.getElementById('export-modal');
        modal.querySelector('#export-json').onclick = () => {
            modal.remove();
            generateExport(itemsToExport, 'json', type);
        };
        modal.querySelector('#export-zip').onclick = () => {
            modal.remove();
            generateExport(itemsToExport, 'zip', type);
        };
        modal.querySelector('#export-cancel').onclick = () => modal.remove();
    });
}

function exportItemsInternal(format, type) {
    const itemsToExport = type === 'functions' ? context.functions.filtered : context.scripts.filtered;
    showConfirmation('export', itemsToExport.length, () => {
        updateStatus('Preparing export...', {
            operation: 'export',
            persistent: true
        });
        if (format === 'zip') {
            loadJSZip(() => generateExport(itemsToExport, format, type));
        } else {
            generateExport(itemsToExport, format, type);
        }
    });
}

function generateExport(itemData, format, type) {
    updateStatus('Preparing export...', {
        operation: 'export',
        persistent: true
    });

    const createZip = () => {
        const zip = new JSZip();

        if (type === 'functions') {
            itemData.forEach(item => {
                const folder = sanitizeFilename(item.category || 'Uncategorized');
                const filename = sanitizeFilename(item.api_name || item.id) + '.dg';
                const sourceCode = item.source_code || '';
                zip.folder(folder).file(filename, sourceCode);
            });
        } else {
            itemData.forEach(item => {
                const sourceCode = context.scripts.details[item.id]?.source_code || '';
                const scriptName = sanitizeFilename(item.name || item.id);
                const eventType = item.script_event?.event || 'unknown';
                const category = getScriptCategory(item);
                const definitionName = item.page_info?.definition_name || '';

                let folderPath;
                let filename;

                if (category === 'Static Resources') {
                    const ext = eventType === 'css' ? 'css' : 'js';
                    filename = `${scriptName}.${ext}`;
                    folderPath = 'Static Resources';
                } else if (category === 'Commands') {
                    filename = `${scriptName}.js`;
                    folderPath = 'Commands';
                } else if (category === 'Module Scripts') {
                    const moduleName = sanitizeFilename(item.page_info?.module || 'Unknown Module');
                    const pageType = getPageTypeFolder(definitionName);
                    const definitionFolder = sanitizeFilename(definitionName);

                    filename = `${scriptName} - ${eventType}.js`;
                    folderPath = `Module Scripts/${moduleName}/${pageType}/${definitionFolder}`;
                } else {
                    filename = `${scriptName} - ${eventType}.js`;
                    folderPath = 'Other';
                }

                zip.folder(folderPath).file(filename, sourceCode);
            });
        }

        zip.generateAsync({
            type: 'blob'
        }).then(blob => {
            downloadFile(blob, `zoho_crm_${type}_${new Date().toISOString().slice(0,10)}.zip`);
        });
    };

    if (format === 'json') {
        const dataWithSource = itemData.map(item => ({
            ...item,
            source_code: (type === 'functions' ? item.source_code : context.scripts.details[item.id]?.source_code) || ''
        }));
        const content = JSON.stringify({
            exportDate: new Date().toISOString(),
            type,
            count: dataWithSource.length,
            data: dataWithSource
        }, null, 2);
        downloadFile(new Blob([content], {
            type: 'application/json'
        }), `zoho_crm_${type}_${new Date().toISOString().slice(0,10)}.json`);
    } else if (format === 'zip') {
        if (window.JSZip) createZip();
        else loadJSZip(createZip);
    }
    clearOperationStatus('export');
    updateStatus(`Exported ${itemData.length} ${type}.`, {
        duration: 4000
    });
}

function getPageTypeFolder(definitionName) {
    if (!definitionName) return 'Standard Pages';

    const lowerName = definitionName.toLowerCase();

    if (lowerName.includes('_canvas')) {
        return 'Canvas Pages';
    } else if (lowerName.includes('_wizard')) {
        return 'Wizard Pages';
    }

    return 'Standard Pages';
}

function getScriptCategory(item) {
    const definitionName = item.page_info?.definition_name || '';
    if (definitionName === 'static_resource') {
        return 'Static Resources';
    } else if (definitionName === 'commands') {
        return 'Commands';
    } else if (definitionName.startsWith('module_')) {
        return 'Module Scripts';
    }
    return 'Other';
}

function loadJSZip(callback) {
    if (window.JSZip) return callback();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = callback;
    document.head.appendChild(script);
}

function exportData(type) {
    const data = type === 'functions' ? context.functions.filtered : [];
    if (data.length === 0) return alert("Nothing to export.");

    if (!window.JSZip) return alert("JSZip library not loaded.");

    const zip = new JSZip();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    data.forEach(item => {
        let folderName = sanitizeFilename(item.category || 'Uncategorized');
        let fileName = sanitizeFilename(item.api_name || item.id) + '.dg';
        let content = item.source_code || '// No source';
        zip.folder(folderName).file(fileName, content);
    });

    zip.generateAsync({
        type: "blob"
    }).then(function(content) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(content);
        a.download = `zoho_${type}_${timestamp}.zip`;
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   utility functions                         
// ╚══════════════════════════════════════════════════════════════════════════════╝

function escapeHtml(unsafe) {
    return unsafe?.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;") || '';
}

function bytesToSize(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDateTime(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function downloadFile(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}

function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_');
}

function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// # ─────────   event listeners & navigation                           
// ╚══════════════════════════════════════════════════════════════════════════════╝

function attachEventListeners() {
    // main tab navigation
    document.getElementById('tab-functions').onclick = () => switchTab('functions');
    document.getElementById('tab-scripts').onclick = () => switchTab('scripts');

    // scripts subtab navigation
    document.getElementById('scripts-subtab-all').onclick = () => switchScriptsSubtab('all');
    document.getElementById('scripts-subtab-module').onclick = () => switchScriptsSubtab('module');
    document.getElementById('scripts-subtab-commands').onclick = () => switchScriptsSubtab('commands');
    document.getElementById('scripts-subtab-static').onclick = () => switchScriptsSubtab('static');

    // functions controls
    document.getElementById('functions-search').addEventListener('input', () => {
        clearTimeout(window.searchDebounce);
        window.searchDebounce = setTimeout(filterAndSortFunctions, 300);
    });
    ['functions-category', 'functions-sort'].forEach(id => document.getElementById(id).addEventListener('change', filterAndSortFunctions));
    document.getElementById('functions-refresh').onclick = () => showConfirmation('refresh', 0, async () => {
        const modal = showProgressModal('Refreshing Functions');
        await initFunctionsSmartSync(true, modal);
        modal.close();
    });

    // scripts controls
    document.getElementById('scripts-search').addEventListener('input', () => {
        clearTimeout(window.searchDebounce);
        window.searchDebounce = setTimeout(filterAndSortScripts, 300);
    });
    ['scripts-module', 'scripts-page', 'scripts-event', 'scripts-status', 'scripts-sort', 'scripts-sort-simple'].forEach(id => document.getElementById(id).addEventListener('change', filterAndSortScripts));
    document.getElementById('scripts-clear-filters').onclick = () => {
        ['scripts-search', 'scripts-module', 'scripts-page', 'scripts-event', 'scripts-status'].forEach(id => document.getElementById(id).value = '');
        filterAndSortScripts();
    };
    document.getElementById('scripts-refresh').onclick = () => showConfirmation('refresh', 0, async () => {
        const modal = showProgressModal('Refreshing Scripts');
        await scriptsDBHelper.clearAll();
        await loadAllClientScripts(modal);
        modal.close();
    });

    // export buttons
    document.getElementById('functions-export').onclick = () => showExportModal('functions');
    document.getElementById('scripts-export').onclick = () => showExportModal('scripts');

    // list click delegation - functions
    document.getElementById('functions-list').addEventListener('click', (e) => {
        const row = e.target.closest('.function-row');
        if (row && row.dataset.id) {
            const item = context.functions.all.find(f => f.id === row.dataset.id);
            if (item) showDetailsView(item, 'function');
        }
    });

    // list click delegation - scripts
    document.getElementById('scripts-list').addEventListener('click', (e) => {
        const row = e.target.closest('.script-row');
        if (row?.dataset.id) {
            const item = context.scripts.all.find(s => s.id === row.dataset.id);
            if (item) showDetailsView(item, 'script');
        }
    });

    // close button
    document.getElementById('close-dashboard').onclick = () => $Client.close();

    // escape key handler
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;

        const detailView = document.querySelector('.dashboard-detail');
        const simpleModal = Array.from(document.querySelectorAll('#modal-container > .modal-overlay')).pop();

        e.preventDefault();
        if (detailView) {
            const searchContainer = detailView.querySelector('.detail-search-container');
            if (searchContainer && searchContainer.style.display === 'flex') {
                detailView.querySelector('.detail-search-close').click();
            } else {
                detailView.querySelector('.detail-back').click();
            }
        } else if (simpleModal) {
            simpleModal.remove();
        } else if (context.activeScreen === 'dashboard') {
            showConfirmation('close-widget', 0, () => $Client.close());
        }
    });
}

function setupGlobalKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && context.activeScreen === 'dashboard') {
            e.preventDefault();
            e.stopPropagation();

            const searchBoxId = context.currentTab === 'functions' ? 'functions-search' : 'scripts-search';
            const searchBox = document.getElementById(searchBoxId);

            if (searchBox) {
                searchBox.focus();
                searchBox.select();
            }

            return false;
        }
    }, true);
}

function switchTab(tabName) {
    context.currentTab = tabName;
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.style.display = 'none');
    document.getElementById(`tab-${tabName}`).classList.add('active');
    document.getElementById(`${tabName}-tab`).style.display = 'flex';
    updateHelpLink();

    if (tabName === 'scripts' && context.scripts.all.length === 0) {
        initScripts();
    }
}

function switchScriptsSubtab(subtab, skipFilter = false) {
    context.currentScriptsSubtab = subtab;
    document.querySelectorAll('.scripts-subtab').forEach(btn => btn.classList.toggle('active', btn.id === `scripts-subtab-${subtab}`));

    const isModule = subtab === 'module';
    const isAll = subtab === 'all';

    document.getElementById('scripts-module').style.display = (isModule || isAll) ? '' : 'none';
    document.getElementById('scripts-page').style.display = (isModule || isAll) ? '' : 'none';
    document.getElementById('scripts-event').style.display = (isModule || isAll) ? '' : 'none';
    document.getElementById('scripts-status').style.display = (subtab === 'static') ? 'none' : '';
    document.getElementById('scripts-sort').style.display = (isModule || isAll) ? '' : 'none';
    document.getElementById('scripts-sort-simple').style.display = (isModule || isAll) ? 'none' : '';

    if (!skipFilter) filterAndSortScripts();
}

function updateHelpLink() {
    const helpLink = document.getElementById('help-link');
    const settingsLink = document.getElementById('settings-link');
    if (context.currentTab === 'functions') {
        helpLink.href = 'https://www.zoho.com/deluge/help';
        helpLink.title = 'Deluge Help Documentation';
        settingsLink.href = `${context.crmUrl}/crm/settings/functions/myFunctions`;
        settingsLink.title = 'Open Deluge Functions Settings';
    } else {
        helpLink.href = 'https://www.zohocrm.dev/explore/client-script/clientapi';
        helpLink.title = 'Client Script Documentation';
        settingsLink.href = `${context.crmUrl}/crm/settings/cscript`;
        settingsLink.title = 'Open Client Script Settings';
    }
}