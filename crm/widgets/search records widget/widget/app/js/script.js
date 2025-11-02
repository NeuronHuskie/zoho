// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                   configuration and initialization                   █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

var count = 0;
var recordData = [];
var selection_limit = 25;
var config = {};
var currentSortField = null;
var isAscending = true;
var activeFilters = {};
var orgDomainName = null;

// Optional parameters with defaults
var showAllRecordsOnLoad = false;
var showSelectionCheckboxes = true;
var showWidgetButtons = true;
var maxRecordsPerPage = 200;
var tableFontSize = 14;
var defaultSortField = null;
var defaultSortOrder = 'asc';
var predefinedCriteria = null;
var closeOnEscape = true;

// Static data support
var staticData = null; 
var useStaticData = false;

// Pagination variables
var currentPage = 1;
var totalPages = 1;
var hasMoreRecords = false;
var isLoadingData = false;

// Cache for storing loaded data
var cachedData = {
    allRecords: [],
    hasFullData: false,
    lastSearchTerm: null,
    searchResults: []
};

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

ZOHO.embeddedApp.on("PageLoad", async (data) => {
    try {
        console.log("PageLoad event triggered");
        console.log("Data from Client Script", data);

        console.log("Fetching organization info...");
        const orgInfo = await ZOHO.CRM.CONFIG.getOrgInfo();
        orgDomainName = orgInfo.org[0].domain_name;
        console.log("Organization domain name set:", orgDomainName);
        
        const widgetConfig = data.data || {};
        
        console.log("Widget configuration:", widgetConfig);
        
        config = {
            module: widgetConfig.module,
            fields: widgetConfig.fields,
            return_ids_only: widgetConfig.return_ids_only || false 
        };
        
        if (widgetConfig.selection_limit) selection_limit = widgetConfig.selection_limit;
        
        if (widgetConfig.static_data && Array.isArray(widgetConfig.static_data)) {
            staticData = widgetConfig.static_data;
            useStaticData = true;
            console.log("Static data mode enabled with", staticData.length, "records");
            
            hasMoreRecords = false;
            maxRecordsPerPage = staticData.length;
            
            cachedData.allRecords = [...staticData];
            cachedData.hasFullData = true;
        }
        
        if (widgetConfig.show_all_records_on_load !== undefined) {
            showAllRecordsOnLoad = widgetConfig.show_all_records_on_load;
        }
        if (widgetConfig.show_selection_checkboxes !== undefined) {
            showSelectionCheckboxes = widgetConfig.show_selection_checkboxes;
        }
        if (widgetConfig.show_widget_buttons !== undefined) {
            showWidgetButtons = widgetConfig.show_widget_buttons;
        }
        if (widgetConfig.max_records_per_page) {
            maxRecordsPerPage = Math.min(widgetConfig.max_records_per_page, 200);
        }
        if (widgetConfig.table_font_size) {
            tableFontSize = Math.max(8, Math.min(widgetConfig.table_font_size, 24));
        }
        if (widgetConfig.default_sort_field) {
            defaultSortField = widgetConfig.default_sort_field;
            const fieldExists = config.fields.some(field => field.api_name === defaultSortField);
            if (!fieldExists) {
                console.warn(`Default sort field '${defaultSortField}' not found in configured fields. Sorting disabled.`);
                defaultSortField = null;
            }
        }
        if (widgetConfig.default_sort_order) {
            defaultSortOrder = widgetConfig.default_sort_order.toLowerCase() === 'desc' ? 'desc' : 'asc';
        }
        if (widgetConfig.predefined_criteria) {
            predefinedCriteria = widgetConfig.predefined_criteria;
            console.log("Predefined criteria configured:", predefinedCriteria);
        }
        if (widgetConfig.close_on_escape) {
            closeOnEscape = widgetConfig.close_on_escape;
        }
        
        if (!config.fields) {
            console.error("Missing required configuration: fields array is required");
            return;
        }
        
        if (!useStaticData && !config.module) {
            console.error("Missing required configuration: module is required when not using static data");
            return;
        }
        
        console.log("Final configuration:", config);
        console.log("Optional parameters:", {
            showAllRecordsOnLoad, showSelectionCheckboxes, showWidgetButtons, maxRecordsPerPage,
            tableFontSize, defaultSortField, defaultSortOrder, predefinedCriteria, closeOnEscape, useStaticData
        });
        
        applyUIVisibilitySettings();
        updateTableHeaders();
        
        if(closeOnEscape) {
            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') {
                    cancelWidget();
                }
            });
        }
        
        document.getElementById('searchBox').addEventListener('keypress', function(event) {
            if (event.key === 'Enter') {
                searchRecords();
            }
        });
        
        document.getElementById('searchBox').addEventListener('input', function(event) {
            if ((showAllRecordsOnLoad || useStaticData) && event.target.value.trim() === '') {
                if (useStaticData) {
                    loadStaticData();
                } else {
                    loadAllRecords();
                }
            }
        });
        
        const focusSearchBox = () => {
            const searchBox = document.getElementById('searchBox');
            if (searchBox) {
                searchBox.focus();
                searchBox.select();
                console.log("Search box focused");
            } else {
                console.log("Search box not found");
            }
        };
        
        focusSearchBox();
        setTimeout(focusSearchBox, 100);
        setTimeout(focusSearchBox, 500);
        
        if (useStaticData) {
            loadStaticData();
        } else if (showAllRecordsOnLoad) {
            loadAllRecords();
        } else {
            document.getElementById("recordsTable").hidden = true;
            document.getElementById("noRecordsDiv").hidden = false;
        }

    } catch (error) {
        console.error("Failed during widget initialization:", error);
        document.body.innerHTML = `<div class="error-message">Failed to initialize widget. Please check the console and try again.</div>`;
    }
    
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function applyUIVisibilitySettings() {
    const body = document.body;
    
    if (!showSelectionCheckboxes) {
        body.classList.add('hide-checkboxes');
    }
    
    if (!showWidgetButtons) {
        body.classList.add('hide-footer');
        document.querySelector('.widget_content_wrap').classList.add('no-footer');
    } else if (!showSelectionCheckboxes) {
        body.classList.add('hide-selection');
    }
    
    document.documentElement.style.setProperty('--table-font-size', tableFontSize + 'px');
    
    const style = document.createElement('style');
    style.textContent = `table { font-size: ${tableFontSize}px !important; }`;
    document.head.appendChild(style);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

ZOHO.embeddedApp.init();

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                  table header and filter management                  █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

function updateTableHeaders() {
    const headerRow = document.querySelector('.widget_table_head');
    if (!headerRow) {
        console.error("Could not find table header row");
        return;
    }
    
    headerRow.innerHTML = '<th><input type="checkbox" id="selectAll" onclick="selectAll(this)"></th>';
    headerRow.innerHTML += '<th>#</th>';
    
    config.fields.forEach(field => {
        const sortIcon = currentSortField === field.api_name 
            ? (isAscending ? '▲' : '▼') 
            : '☰';
            
        const uniqueValues = getUniqueValuesForField(field.api_name);
        const filterDropdown = createFilterDropdown(field.api_name, uniqueValues);
        
        headerRow.innerHTML += `
            <th>
                <div class="header-content">
                    <div class="sortable-header" onclick="sortRecords('${field.api_name}')">
                        ${field.label} <span class="sort-icon">${sortIcon}</span>
                    </div>
                    ${filterDropdown}
                </div>
            </th>`;
    });

    config.fields.forEach(field => {
        const dropdown = document.getElementById(`filter-${field.api_name}`);
        if (dropdown) {
            dropdown.addEventListener('change', (e) => {
                applyFilter(field.api_name, e.target.value);
            });
        }
    });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function getUniqueValuesForField(fieldName, data = recordData) {
    const values = new Set();
    data.forEach(record => {
        const value = getFieldDisplayValue(record, fieldName);
        if (value) values.add(value);
    });
    return Array.from(values).sort();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function createFilterDropdown(fieldName, values) {
    const hasMultipleChoices = values.length >= 2;
    const shouldDisable = !hasMultipleChoices;
    
    if (shouldDisable && activeFilters[fieldName]) {
        delete activeFilters[fieldName];
    }
    
    const currentValue = activeFilters[fieldName] || '';
    const options = values.map(value => 
        `<option value="${escapeHtml(value)}" ${value === currentValue ? 'selected' : ''}>${escapeHtml(value)}</option>`
    ).join('');
    
    return `
        <select id="filter-${fieldName}" class="filter-dropdown" ${shouldDisable ? 'disabled' : ''}>
            <option value="">All</option>
            ${options}
        </select>
    `;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function applyFilter(fieldName, value) {
    if (!value) {
        delete activeFilters[fieldName];
    } else {
        activeFilters[fieldName] = value;
    }
    
    updateClearFiltersVisibility();
    
    if (recordData.length > 0) {
        filterCurrentResults();
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function updateClearFiltersVisibility() {
    const clearButton = document.querySelector('.filter-btn');
    if (clearButton) {
        const hasFilters = Object.keys(activeFilters).length > 0;
        clearButton.classList.toggle('has-filters', hasFilters);
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function filterCurrentResults() {
    let baseData = recordData;
    
    if (Object.keys(activeFilters).length === 0) {
        updateRecordsTable({ data: recordData });
        return;
    }

    const filteredData = baseData.filter(record => {
        return Object.entries(activeFilters).every(([fieldName, filterValue]) => {
            const recordValue = getFieldDisplayValue(record, fieldName);
            return recordValue.toLowerCase() === filterValue.toLowerCase();
        });
    });

    updateRecordsTable({ data: filteredData }, true);
    updateFilterDropdowns(filteredData);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function updateFilterDropdowns(currentData) {
    config.fields.forEach(field => {
        const dropdown = document.getElementById(`filter-${field.api_name}`);
        if (!dropdown) return;

        const currentValue = dropdown.value;
        const uniqueValues = new Set();
        currentData.forEach(record => {
            const value = getFieldDisplayValue(record, field.api_name);
            if (value) uniqueValues.add(value);
        });
        
        const values = Array.from(uniqueValues).sort();
        const hasMultipleChoices = values.length >= 2;
        const shouldDisable = !hasMultipleChoices;

        dropdown.disabled = shouldDisable;
        
        const options = values.map(value =>
            `<option value="${escapeHtml(value)}" ${value === currentValue ? 'selected' : ''}>${escapeHtml(value)}</option>`
        ).join('');
        
        dropdown.innerHTML = `<option value="">All</option>${options}`;
        
        if (shouldDisable && activeFilters[field.api_name]) {
            delete activeFilters[field.api_name];
            dropdown.value = '';
        } else if (currentValue && !uniqueValues.has(currentValue)) {
            dropdown.value = '';
            delete activeFilters[field.api_name];
        }
    });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function clearAllFilters() {
    activeFilters = {};
    filterCurrentResults();
    
    config.fields.forEach(field => {
        const dropdown = document.getElementById(`filter-${field.api_name}`);
        if (dropdown) {
            dropdown.value = '';
        }
    });
    
    updateClearFiltersVisibility();
}

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                      data handling and display                       █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

async function searchRecords() {
    const searchQuery = document.getElementById('searchBox').value.trim();
    
    if (useStaticData) {
        searchStaticData(searchQuery);
        return;
    }
    
    if (showAllRecordsOnLoad && cachedData.allRecords.length > 0) {
        searchWithinCachedData(searchQuery);
        return;
    }
    
    if (searchQuery.length < 2) {
        if (showAllRecordsOnLoad) {
            console.log("Empty search, restoring cached data");
            if (cachedData.allRecords.length > 0) {
                recordData = [...cachedData.allRecords];
                if (currentSortField) applySortToData();
                updateRecordsTable({ data: recordData });
                updatePaginationControls();
                return;
            }
            currentPage = 1;
            recordData = [];
            loadAllRecords();
        } else {
            clearResults();
        }
        return;
    }
    
    if (cachedData.lastSearchTerm === searchQuery) {
        console.log("Using cached search results for:", searchQuery);
        recordData = [...cachedData.searchResults];
        hasMoreRecords = false;
        updateRecordsTable({ data: recordData });
        updatePaginationControls();
        return;
    }

    currentPage = 1;
    recordData = [];
    hasMoreRecords = false;

    try {
        console.log("Searching module:", config.module, "Query:", searchQuery);
        const response = await ZOHO.CRM.API.searchRecord({ Entity: config.module, Type: "word", Query: searchQuery });
        console.log("Search response:", response);
        
        currentSortField = null;
        isAscending = true;
        
        recordData = response.data || [];
        cachedData.lastSearchTerm = searchQuery;
        cachedData.searchResults = [...recordData];
        
        if (defaultSortField && recordData.length > 0) {
            currentSortField = defaultSortField;
            isAscending = defaultSortOrder === 'asc';
            applySortToData();
            console.log(`Search results sorted by ${defaultSortField} (${defaultSortOrder})`);
        }
        
        updateRecordsTable({ data: recordData });
        updatePaginationControls();
    } catch (error) {
        console.error("Search failed:", error);
        document.getElementById("recordsTable").hidden = true;
        document.getElementById("noRecordsDiv").hidden = false;
        updatePaginationControls();
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

async function loadAllRecords(page = 1, forceReload = false) {
    if (useStaticData) {
        loadStaticData();
        return;
    }
    
    if (isLoadingData) return;
    
    if (page === 1 && !forceReload && cachedData.allRecords.length > 0) {
        console.log("Using cached data instead of making API call");
        recordData = [...cachedData.allRecords];
        hasMoreRecords = cachedData.hasFullData ? false : true;
        
        if (defaultSortField && recordData.length > 0) {
            currentSortField = defaultSortField;
            isAscending = defaultSortOrder === 'asc';
            applySortToData();
        }
        
        updateRecordsTable({ data: recordData });
        updatePaginationControls();
        return;
    }
    
    isLoadingData = true;
    if (page > 1) updatePaginationControls();
    updateLoadingState(true);
    
    try {
        console.log("Loading all records from module:", config.module, "page:", page);
        let response;
        
        if (predefinedCriteria) {
            console.log("Using predefined criteria:", predefinedCriteria);
            try {
                response = await ZOHO.CRM.API.searchRecord({ Entity: config.module, Type: "criteria", Query: predefinedCriteria, page: page, per_page: maxRecordsPerPage });
                if (!response.data) response.data = [];
                hasMoreRecords = response.data && response.data.length === maxRecordsPerPage;
                response.info = { more_records: hasMoreRecords };
            } catch (error) {
                console.error("Criteria search failed:", error, "Falling back to getAllRecords.");
                response = await ZOHO.CRM.API.getAllRecords({ Entity: config.module, per_page: maxRecordsPerPage, page: page });
            }
        } else {
            response = await ZOHO.CRM.API.getAllRecords({ Entity: config.module, per_page: maxRecordsPerPage, page: page });
        }

        console.log("Load all records response:", response);
        
        if (page === 1) {
            currentSortField = null;
            isAscending = true;
            currentPage = 1;
            recordData = response.data || [];
            cachedData.allRecords = [...recordData];
            if (defaultSortField && recordData.length > 0) {
                currentSortField = defaultSortField;
                isAscending = defaultSortOrder === 'asc';
                applySortToData();
                console.log(`Data sorted by ${defaultSortField} (${defaultSortOrder})`);
            }
        } else {
            recordData = [...recordData, ...(response.data || [])];
            cachedData.allRecords = [...recordData];
            if (currentSortField) {
                applySortToData();
                console.log(`Data re-sorted by ${currentSortField} (${isAscending ? 'asc' : 'desc'})`);
            }
        }
        
        hasMoreRecords = response.info && response.info.more_records;
        totalPages = page;
        if (hasMoreRecords) totalPages = page + 1;
        cachedData.hasFullData = !hasMoreRecords;
        
        console.log("Records loaded. Total:", recordData.length, "Has more:", hasMoreRecords);
        updateRecordsTable({ data: recordData });

    } catch (error) {
        console.error("Load all records failed:", error);
        document.getElementById("recordsTable").hidden = true;
        document.getElementById("noRecordsDiv").hidden = false;
    } finally {
        isLoadingData = false;
        updateLoadingState(false);
        updatePaginationControls();
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function loadStaticData() {
    if (!useStaticData || !staticData || !Array.isArray(staticData)) {
        console.error("loadStaticData called but static data is not available");
        return;
    }
    
    console.log("Loading static data with", staticData.length, "records");
    currentPage = 1;
    hasMoreRecords = false;
    recordData = [...staticData];
    
    if (defaultSortField && recordData.length > 0) {
        currentSortField = defaultSortField;
        isAscending = defaultSortOrder === 'asc';
        applySortToData();
        console.log(`Static data sorted by ${defaultSortField} (${defaultSortOrder})`);
    }
    
    updateRecordsTable({ data: recordData });
    updatePaginationControls();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function searchWithinCachedData(searchQuery) {
    console.log("Searching within cached data with query:", searchQuery);
    
    if (searchQuery.length < 2) {
        recordData = [...cachedData.allRecords];
        if (currentSortField) applySortToData();
        updateRecordsTable({ data: recordData });
        updatePaginationControls();
        return;
    }
    
    const searchLower = searchQuery.toLowerCase();
    recordData = cachedData.allRecords.filter(record => {
        return config.fields.some(field => {
            const fieldValue = getFieldDisplayValue(record, field.api_name);
            return fieldValue.toLowerCase().includes(searchLower);
        });
    });
    
    console.log(`Cached data search found ${recordData.length} results`);
    if (currentSortField) {
        applySortToData();
        console.log(`Cached search results re-sorted by ${currentSortField} (${isAscending ? 'asc' : 'desc'})`);
    }
    
    updateRecordsTable({ data: recordData });
    hasMoreRecords = false;
    updatePaginationControls();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function searchStaticData(searchQuery) {
    console.log("Searching static data with query:", searchQuery);
    
    if (searchQuery.length < 2) {
        recordData = [...staticData];
        if (currentSortField) applySortToData();
        updateRecordsTable({ data: recordData });
        return;
    }
    
    const searchLower = searchQuery.toLowerCase();
    recordData = staticData.filter(record => {
        return config.fields.some(field => {
            const fieldValue = getFieldDisplayValue(record, field.api_name);
            return fieldValue.toLowerCase().includes(searchLower);
        });
    });
    
    console.log(`Static data search found ${recordData.length} results`);
    currentSortField = null;
    isAscending = true;
    
    if (defaultSortField && recordData.length > 0) {
        currentSortField = defaultSortField;
        isAscending = defaultSortOrder === 'asc';
        applySortToData();
        console.log(`Static search results sorted by ${defaultSortField} (${defaultSortOrder})`);
    }
    
    updateRecordsTable({ data: recordData });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function getFieldDisplayValue(record, fieldName) {
    if (fieldName.includes('.')) {
        const parts = fieldName.split('.');
        let value = record;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return '';
            }
        }
        return value !== null && value !== undefined ? String(value) : '';
    }
    
    const value = record[fieldName];
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && 'name' in value) return value.name;
    return String(value);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function getFieldDisplayValueWithLink(record, fieldName, fieldConfig = null) {
    if (fieldName.includes('.')) {
        const parts = fieldName.split('.');
        let value = record;
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return '';
            }
        }
        return value !== null && value !== undefined ? escapeHtml(String(value)) : '';
    }
    
    const value = record[fieldName];
    if (value === null || value === undefined) return '';
    
    if (fieldConfig && fieldConfig.link_config) {
        const linkConfig = fieldConfig.link_config;
        let linkData = {};
        
        linkData.module = (linkConfig.module === 'current_module') ? config.module : linkConfig.module;
        
        if (linkConfig.id_field) linkData.id = record[linkConfig.id_field];
        else if (linkConfig.id === 'current_record') linkData.id = record.id;
        else if (linkConfig.id) linkData.id = linkConfig.id;
        
        let displayText = linkConfig.display_field ? record[linkConfig.display_field] : value;
        
        if (linkData.module && linkData.id) {
            const link = generateRecordLink(linkData);
            if (link) {
                return `<a href="${link}" target="_blank" rel="noopener noreferrer" style="color: #2196f3; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(String(displayText))}</a>`;
            }
        }
    }
    
    if (typeof value === 'object' && 'name' in value && 'id' in value && 'module' in value) {
        const link = generateRecordLink(value);
        if (link) {
            return `<a href="${link}" target="_blank" rel="noopener noreferrer" style="color: #2196f3; text-decoration: none; cursor: pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(value.name)}</a>`;
        }
        return escapeHtml(value.name);
    }
    
    return escapeHtml(String(value));
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function updateRecordsTable(response, isFiltered = false) {
    let dataToShow;
    
    if (isFiltered) {
        dataToShow = response.data;
    } else {
        if (response.data) recordData = response.data;
        dataToShow = recordData;
        
        if (Object.keys(activeFilters).length > 0) {
            dataToShow = recordData.filter(record => {
                return Object.entries(activeFilters).every(([fieldName, filterValue]) => {
                    const recordValue = getFieldDisplayValue(record, fieldName);
                    return recordValue.toLowerCase() === filterValue.toLowerCase();
                });
            });
        }
    }

    const resultsCountElement = document.querySelector('.results-count');
    
    if (dataToShow && dataToShow.length > 0) {
        const totalDisplayed = dataToShow.length;
        const moreIndicator = (hasMoreRecords && !useStaticData) ? '+' : '';
        resultsCountElement.textContent = `${totalDisplayed}${moreIndicator} result${totalDisplayed === 1 ? '' : 's'} found`;
        
        let htmlString = "";
        dataToShow.forEach((record, index) => {
            htmlString += '<tr>';
            htmlString += `<td><input type='checkbox' onclick='selected(this)' id='${record.id}' class='records'></td>`;
            htmlString += `<td>${index + 1}</td>`;
            config.fields.forEach(field => {
                const displayValue = getFieldDisplayValueWithLink(record, field.api_name, field);
                htmlString += `<td>${displayValue}</td>`;
            });
            htmlString += '</tr>';
        });
        
        document.getElementById("tbody").innerHTML = htmlString;
        document.getElementById("recordsTable").style.display = 'table';
        document.getElementById("noRecordsDiv").style.display = 'none';
        
        if (showSelectionCheckboxes) document.getElementById("selectAll").checked = false;
    } else {
        resultsCountElement.textContent = '';
        clearResults();
    }
    
    if (showSelectionCheckboxes) {
        document.getElementById("selectAll").checked = false;
        count = 0;
        updateSelectedCount();
    }
    
    updateTableHeaders();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function sortRecords(fieldName) {
    if (!recordData.length) return;

    if (currentSortField === fieldName) {
        isAscending = !isAscending;
    } else {
        currentSortField = fieldName;
        isAscending = true;
    }

    applySortToData();
    filterCurrentResults();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function applySortToData() {
    if (!currentSortField || !recordData.length) return;
    
    recordData.sort((a, b) => {
        const valA = getFieldDisplayValue(a, currentSortField).toLowerCase();
        const valB = getFieldDisplayValue(b, currentSortField).toLowerCase();
        if (valA < valB) return isAscending ? -1 : 1;
        if (valA > valB) return isAscending ? 1 : -1;
        return 0;
    });
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function clearResults() {
    document.getElementById("tbody").innerHTML = '';
    document.getElementById("recordsTable").style.display = 'none';
    document.getElementById("noRecordsDiv").style.display = 'block';
    document.querySelector('.results-count').textContent = '';
    
    if (showSelectionCheckboxes) {
        count = 0;
        updateSelectedCount();
    }
    
    const existingControls = document.querySelector('.pagination-controls');
    if (existingControls) existingControls.remove();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function updateLoadingState(loading) {
    const existingLoader = document.querySelector('.loading-indicator');
    if (existingLoader) existingLoader.remove();
    
    if (loading) {
        const loader = document.createElement('div');
        loader.className = 'loading-indicator';
        loader.textContent = 'Loading records...';
        document.querySelector('.widget_table_wrapper').appendChild(loader);
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function updatePaginationControls() {
    const existingControls = document.querySelector('.pagination-controls');
    if (existingControls) existingControls.remove();
    
    if (recordData.length === 0 || useStaticData) return;
    
    const tableWrapper = document.querySelector('.widget_table_wrapper');
    const paginationDiv = document.createElement('div');
    paginationDiv.className = 'pagination-controls';
    
    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.textContent = '← Previous';
        prevBtn.type = 'button';
        prevBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); loadPreviousPage(); });
        paginationDiv.appendChild(prevBtn);
    }
    
    const pageInfo = document.createElement('span');
    pageInfo.className = 'pagination-info';
    pageInfo.textContent = `Showing 1-${recordData.length} of ${recordData.length}${hasMoreRecords ? '+' : ''} records`;
    paginationDiv.appendChild(pageInfo);
    
    if (hasMoreRecords && !isLoadingData) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.textContent = 'Load More →';
        nextBtn.type = 'button';
        nextBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); loadNextPage(); });
        paginationDiv.appendChild(nextBtn);
    } else if (isLoadingData) {
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.textContent = 'Loading...';
        nextBtn.type = 'button';
        nextBtn.disabled = true;
        paginationDiv.appendChild(nextBtn);
    }
    
    tableWrapper.appendChild(paginationDiv);
    console.log("Pagination controls updated. Has more:", hasMoreRecords, "Is loading:", isLoadingData);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

async function loadNextPage() {
    if (hasMoreRecords && !isLoadingData) {
        await loadAllRecords(currentPage + 1);
        currentPage++;
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

async function loadPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        await loadAllRecordsUpToPage(currentPage);
    }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

async function loadAllRecordsUpToPage(targetPage) {
    recordData = [];
    for (let page = 1; page <= targetPage; page++) {
        await loadAllRecords(page);
        if (!hasMoreRecords && page < targetPage) break;
    }
}

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                         selection management                         █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

function updateSelectedCount() {
    if (!showSelectionCheckboxes) return;
    const plural = count !== 1 ? 's' : '';
    document.getElementById("selectedCount").innerHTML = `${count} Record${plural} selected`;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function selected(element) {
    if (!showSelectionCheckboxes) return;
    element.checked ? count++ : count--;
    updateSelectedCount();
    
    const visibleCheckboxes = Array.from(document.getElementsByClassName('records')).filter(cb => cb.closest('tr').style.display !== 'none');
    document.getElementById("selectAll").checked = visibleCheckboxes.every(cb => cb.checked);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function selectAll(selectAllCheckbox) {
    if (!showSelectionCheckboxes) return;
    const isChecked = selectAllCheckbox.checked;
    const visibleCheckboxes = Array.from(document.getElementsByClassName('records')).filter(cb => cb.closest('tr').style.display !== 'none');
    
    visibleCheckboxes.forEach(checkbox => { checkbox.checked = isChecked; });
    
    count = isChecked ? visibleCheckboxes.length : 0;
    updateSelectedCount();
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function clearSelection() {
    if (!showSelectionCheckboxes) return;
    document.getElementById("selectAll").checked = false;
    selectAll(document.getElementById("selectAll"));
}

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                            widget actions                            █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

function closeWidget() {
    if (!showSelectionCheckboxes) {
        const visibleRecords = recordData.filter(record => {
            if (Object.keys(activeFilters).length === 0) return true;
            return Object.entries(activeFilters).every(([fieldName, filterValue]) => {
                const recordValue = getFieldDisplayValue(record, fieldName);
                return recordValue.toLowerCase() === filterValue.toLowerCase();
            });
        });
        
        const returnData = visibleRecords.map(record => config.return_ids_only ? record.id : { ...record });
        console.log("Returning to Client Script with all visible records:", returnData);
        $Client.close(returnData);
        return;
    }
    
    if (count === 0) {
        alert('Please select at least one record.');
        return;
    }
    
    if (count > selection_limit) {
        alert(`Selected records cannot exceed ${selection_limit}.`);
        return;
    }

    const selectedRecords = Array.from(document.getElementsByClassName('records'))
        .filter(el => el.checked)
        .map(el => {
            const record = recordData.find(rec => rec.id === el.id);
            return config.return_ids_only ? record.id : { ...record };
        })
        .filter(Boolean);
    
    console.log("Returning to Client Script with records:", selectedRecords);
    $Client.close(selectedRecords);
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function cancelWidget() {
    $Client.close();
}

// █▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀█
// █                          utility functions                           █
// █▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄█

function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    const str = String(unsafe);
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════

function generateRecordLink(linkData) {
    if (!linkData || typeof linkData !== 'object') return null;
    
    const recordId = linkData.id || linkData.Id;
    const module = linkData.module;
    
    if (!recordId || !module) return null;
    
    if (!orgDomainName) {
        console.error("Cannot generate link: orgDomainName is not set.");
        return null; 
    }
    
    const baseUrl = `https://crm.zoho.com/crm/${orgDomainName}/tab`;
    return `${baseUrl}/${module}/${recordId}`;
}