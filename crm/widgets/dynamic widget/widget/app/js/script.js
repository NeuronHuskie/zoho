// ════════════════════════════════════════════════════════════════════════
//      GLOBAL VARIABLES
// ════════════════════════════════════════════════════════════════════════

let widgetConfig = {};
let formData = {};
let currentEntity = null;
let currentRecordId = null;
let statusMessageEl;

// ════════════════════════════════════════════════════════════════════════
//      WIDGET INITIALIZATION
// ════════════════════════════════════════════════════════════════════════

if (typeof marked !== 'undefined') {
    // override the 'marked' default link renderer to ensure hyperlinks open in a new tab
    const renderer = new marked.Renderer();
    const linkRenderer = renderer.link;

    renderer.link = (href, title, text) => {
        const html = linkRenderer.call(renderer, href, title, text);
        return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
    };

    marked.setOptions({
        renderer: renderer
    });
    
    console.log("Marked.js configured to open links in a new tab.");
}

/**
 * Main entry point for the widget. This listener is attached immediately
 * to ensure it catches the PageLoad event without any race conditions.
 */
ZOHO.embeddedApp.on("PageLoad", function(data) {
    console.log("Widget loaded with data:", data);

    // Extract configuration from the passed data.
    widgetConfig = data || {};
    currentEntity = data.crm_module;
    currentRecordId = data.crm_record_id;

    // Build the dynamic interface.
    buildDynamicInterface();

    // Setup keyboard event listeners after a short delay to ensure DOM is ready.
    setTimeout(() => {
        setupKeyboardControls();
    }, 200);
});

/**
 * Initialize the Zoho SDK connection. This call should be made after
 * all event listeners like on("PageLoad") have been set up.
 */
ZOHO.embeddedApp.init();

// ════════════════════════════════════════════════════════════════════════
//      MAIN UI BUILDERS
// ════════════════════════════════════════════════════════════════════════

/**
 * The main router function that determines which type of widget UI to build
 */
function buildDynamicInterface() {
    const contentContainer = document.getElementById('dynamicContent');
    const buttonContainer = document.getElementById('buttonContainer');

    contentContainer.innerHTML = '';
    buttonContainer.innerHTML = '';

    const widgetType = widgetConfig.type || 'message';

    switch (widgetType) {
        case 'message':
            buildMessageWidget();
            break;
        case 'form':
            buildFormWidget();
            break;
        case 'dropdown':
            buildDropdownWidget();
            break;
        case 'confirmation':
            buildConfirmationWidget();
            break;
        default:
            buildMessageWidget();
    }
}

/**
 * Builds a simple message-only widget
 */
function buildMessageWidget() {
    const contentContainer = document.getElementById('dynamicContent');
    const buttonContainer = document.getElementById('buttonContainer');
    const title = widgetConfig.title;
    const message = widgetConfig.message || 'This is a default message.';
    const messageType = widgetConfig.message_type || 'info';
    const showIcon = widgetConfig.show_icon !== false;
    const typeConfig = getMessageTypeConfig(messageType);
    const container = document.querySelector('.container');

    if (container) {
        container.className = 'container'; // reset classes
        container.classList.add(`message-${messageType}-bg`);
    }

    let messageHtml;
    if (widgetConfig.enable_markdown === true && typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        messageHtml = marked.parse(message);
    } else {
        messageHtml = `<p>${message}</p>`;
    }

    const iconHtml = showIcon ? `<div class="message-icon ${typeConfig.iconClass}">${typeConfig.icon}</div>` : '';

    contentContainer.innerHTML = ` <div class="message-content"> ${iconHtml} ${title ? `<h2 class="widget-title">${title}</h2>` : ''} <div class="message-text">${messageHtml}</div> </div> `;
   
    buttonContainer.innerHTML = `<button class="${typeConfig.buttonClass}" onclick="closeWidget()">${typeConfig.buttonText}</button>`;
}

/**
 * Builds a confirmation dialog with a message and custom buttons.
 */
function buildConfirmationWidget() {
    const contentContainer = document.getElementById('dynamicContent');
    const buttonContainer = document.getElementById('buttonContainer');
    resetContainerBackground();

    const title = widgetConfig.title;
    const message = widgetConfig.message || 'Please confirm your action.';
    const buttons = widgetConfig.buttons || ['Cancel', 'OK']; // default button names

    let messageHtml;
    if (widgetConfig.enable_markdown === true && typeof marked !== 'undefined' && typeof marked.parse === 'function') {
        messageHtml = marked.parse(message);
    } else {
        messageHtml = `<p>${message}</p>`;
    }

    // build the message part of the ui (reuses existing message styles)
    contentContainer.innerHTML = ` <div class="message-content"> ${title ? `<h2 class="widget-title">${title}</h2>` : ''} <div class="message-text">${messageHtml}</div> </div> `;

    // dynamically build the buttons
    let buttonsHTML = '';
    buttons.forEach(buttonText => {
        let buttonClass = 'primary-btn'; // default style is the primary action button
        const lowerCaseText = buttonText.toLowerCase();

        // style buttons based on their text
        if (['delete', 'remove', 'discard', 'yes, delete'].includes(lowerCaseText)) {
            buttonClass = 'destructive-btn';
        } else if (['cancel', 'no', 'later'].includes(lowerCaseText)) {
            buttonClass = 'negative-outline-btn';
        }
        
        // add the button with an onclick event that calls our new handler
        buttonsHTML += `<button class="${buttonClass}" onclick="closeWithSelection('${buttonText}')">${buttonText}</button>`;
    });

    buttonContainer.innerHTML = buttonsHTML;
}

/**
 * Builds a widget with a dynamic form based on the 'fields' configuration
 */
function buildFormWidget() {
    const contentContainer = document.getElementById('dynamicContent');
    const buttonContainer = document.getElementById('buttonContainer');
    
    resetContainerBackground();

    const title = widgetConfig.title;
    const fields = widgetConfig.fields || [];
    
  let formHTML = `<div class="form-wrapper"> ${title ? `<div class="form-title"><h2 class="widget-title">${title}</h2></div>` : ''} <form id="dynamicForm">`;
    
    fields.forEach(field => {
        const required = field.required ? 'required' : '';
        const placeholder = field.placeholder || '';
        
        formHTML += `<div class="field-group">`;
        
        switch(field.type) {
            case 'file':
                formHTML += buildFileField(field, required);
                break;
            case 'select':
            case 'dropdown':
                formHTML += buildSelectField(field, required);
                break;
            case 'checkbox':
                formHTML += buildCheckboxField(field, required);
                break;
            case 'radio':
                formHTML += buildRadioField(field, required);
                break;
            case 'textarea':
                formHTML += buildTextareaField(field, required, placeholder);
                break;
            default:
                formHTML += buildInputField(field, required, placeholder);
                break;
        }
        
        formHTML += `</div>`;
    });
    
    formHTML += `</form> <div id="uploadStatusMessage"></div> </div>`;
    
    contentContainer.innerHTML = formHTML;
    
    buttonContainer.innerHTML = `<button class="negative-outline-btn" onclick="closeWidget()">Cancel</button> <button class="primary-btn" id="submitFormButton" onclick="submitForm()">Submit</button>`;
    
    statusMessageEl = document.getElementById('uploadStatusMessage');

    const form = document.getElementById('dynamicForm');
    if (form) {
        form.addEventListener('change', function(e) {  // add 'change' event listener to the entire form
            if (e.target.matches('input[type="file"]')) { // check if the element that triggered the event was a file input
                const changedInput = e.target; 
                const inputId = changedInput.id; 

                // construct the ids for the related elements directly
                const wrapperId = `wrapper_${inputId}`;
                const displayId = `display_${inputId}`;

                const wrapper = document.getElementById(wrapperId); // find the elements using their unique id
                const fileNameDisplay = document.getElementById(displayId);

                if (wrapper && fileNameDisplay) { // ensure the elements were found before trying to modify them
                    if (changedInput.files.length > 0) { // a file was selected for this input
                        fileNameDisplay.textContent = changedInput.files[0].name;
                        wrapper.classList.add('file-selected');
                    } else { // the file selection was cancelled for this input
                        fileNameDisplay.textContent = '';
                        wrapper.classList.remove('file-selected');
                    }
                } else {
                    console.error(`Could not find wrapper or display for input with ID: ${inputId}`);
                }
            }
        });
    }
    
    forceFocus();
}

/**
 * Builds a widget with a single dropdown/select menu
 */
function buildDropdownWidget() {
    const contentContainer = document.getElementById('dynamicContent');
    const buttonContainer = document.getElementById('buttonContainer');
    resetContainerBackground();

    const title = widgetConfig.title;
    const label = widgetConfig.label || 'Please select an option';
    const options = widgetConfig.options || [{ actual_value: 'option1', display_value: 'Option 1' }];
    const allowMultiple = widgetConfig.allow_multiple || false;

    let selectHTML = `<div class="form-wrapper"> ${title ? `<div class="form-title"><h2 class="widget-title">${title}</h2></div>` : ''} <div class="field-group"> <label for="dynamicSelect">${label}</label> <select id="dynamicSelect" name="selection" ${allowMultiple ? 'multiple' : ''}> <option value="">-- Select ${allowMultiple ? 'options' : 'an option'} --</option>`;
    
    options.forEach(option => {
        const actualValue = option.actual_value || option.value;
        const displayValue = option.display_value || option.text;
        selectHTML += `<option value="${actualValue}">${displayValue}</option>`;
    });

    selectHTML += `</select></div></div>`;
    contentContainer.innerHTML = selectHTML;
    buttonContainer.innerHTML = `<button class="negative-outline-btn" onclick="closeWidget()">Cancel</button><button class="primary-btn" onclick="submitSelection()">Submit</button>`;
    forceFocus();
}

// ════════════════════════════════════════════════════════════════════════
//      SUBMISSION & ACTION HANDLERS
// ════════════════════════════════════════════════════════════════════════

/**
 * Gathers data, handles file uploads and renaming, and submits the form
 */
async function submitForm() {
    const form = document.getElementById('dynamicForm');
    if (!form) { console.error("Form element not found."); return; }

    const submitButton = document.getElementById('submitFormButton');
    if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'Processing...'; }
    clearStatusMessage();

    const formData = new FormData(form);
    const data = {};
    const filesToUpload = [];

    widgetConfig.fields.forEach(field => {
        const fieldName = field.name;
        if (field.type === 'file') {
            const fileInput = form.querySelector(`input[name="${fieldName}"]`);
            if (fileInput && fileInput.files.length > 0) {
                for (let i = 0; i < fileInput.files.length; i++) {
                    filesToUpload.push({ fieldConfig: field, file: fileInput.files[i] });
                }
            }
        } else {
            switch(field.type) {
                case 'checkbox':
                    if (field.options && field.options.length > 0) {
                        data[fieldName] = Array.from(form.querySelectorAll(`input[name="${fieldName}"]:checked`)).map(cb => cb.value);
                    } else {
                        data[fieldName] = form.querySelector(`input[name="${fieldName}"]`) ? form.querySelector(`input[name="${fieldName}"]`).checked : false;
                    }
                    break;
                case 'select': case 'dropdown':
                    const select = form.querySelector(`select[name="${fieldName}"]`);
                    data[fieldName] = select && select.multiple ? Array.from(select.selectedOptions).map(opt => opt.value) : formData.get(fieldName);
                    break;
                case 'radio':
                    const radioButton = form.querySelector(`input[name="${fieldName}"]:checked`);
                    data[fieldName] = radioButton ? radioButton.value : null;
                    break;
                default:
                    data[fieldName] = formData.get(fieldName);
                    break;
            }
        }
    });

    const requiredFields = widgetConfig.fields?.filter(field => field.required) || [];
    const missingFields = [];
    requiredFields.forEach(field => {
        if (field.type === 'file') {
            if (filesToUpload.filter(f => f.fieldConfig.name === field.name).length === 0) {
                missingFields.push(field.label);
            }
        } else {
            const value = data[field.name];
            let isEmpty = !value || (Array.isArray(value) && value.length === 0) || (typeof value === 'string' && value.trim() === '');
            if (field.type === 'checkbox' && !Array.isArray(value)) { isEmpty = !value; }
            if (isEmpty) { missingFields.push(field.label); }
        }
    });
    if (missingFields.length > 0) {
        showAlert(`Please fill in/select the following required fields: ${missingFields.join(', ')}`);
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit'; }
        return;
    }

     if (filesToUpload.length > 0) {
        let allUploadsSucceeded = true;
        let processedFileNames = [];
        for (const uploadItem of filesToUpload) {
            const originalFile = uploadItem.file;
            const fieldConfig = uploadItem.fieldConfig;
            let finalFile; // handle renaming
            if (fieldConfig.default_file_name) {
                const lastDotIndex = originalFile.name.lastIndexOf('.');
                const originalExtension = (lastDotIndex !== -1) ? originalFile.name.substring(lastDotIndex) : '';
                const finalFileName = fieldConfig.default_file_name + originalExtension;
                finalFile = new File([originalFile], finalFileName, { type: originalFile.type });
            } else {
                finalFile = originalFile;
            }

            showStatusMessage(`Processing ${finalFile.name}...`, 'info');
            try {
                let response;
                const destination = fieldConfig.destination || 'attachment';
                const field_type = fieldConfig.field_type || 'file';

                if (destination === 'field') {
                    if (!fieldConfig.target_field) { throw new Error(`'target_field' is required for ${finalFile.name}.`); }
                    
                    if (field_type === 'image') {
                        response = await handleImageUploadField(finalFile, fieldConfig);
                        console.log('Image file upload response', response);
                    } else {
                        response = await handleFileUploadField(finalFile, fieldConfig);
                        console.log('File upload response', response);
                    }
                } else {
                    response = await handleAttachmentUpload(finalFile);
                    console.log('Attachment response', response);
                }

                let isSuccess = false;
                let errorMessage = "An unknown API error occurred.";

                if (response.data && response.data[0]) { // check for a response from attachFile
                    isSuccess = (response.data[0].code === "SUCCESS");
                    errorMessage = response.data[0].message;
                } else if (response.details && response.details.statusMessage && response.details.statusMessage.data && response.details.statusMessage.data[0]) { // check for a response from handlefileuploadfield or handleimageuploadfield 
                    const statusData = response.details.statusMessage.data[0];
                    isSuccess = (statusData.code === "SUCCESS");
                    errorMessage = statusData.message;
                } else { // unexpected response - log it and fail
                    console.error("Unknown API Response Structure:", response);
                }

                if (!isSuccess) {
                    throw new Error(errorMessage);
                }
                
                processedFileNames.push(finalFile.name);

            } catch (error) {
                console.error("File processing or upload failed:", error);
                const errorMessage = error.message || "An unknown error occurred.";
                showStatusMessage(errorMessage, 'error');
                allUploadsSucceeded = false;
                break;
            }
        }
        if (allUploadsSucceeded) {
            showStatusMessage(`Successfully processed: ${processedFileNames.join(', ')}`, 'success');
            await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
            if (submitButton) { submitButton.disabled = false; submitButton.textContent = 'Submit'; }
            return;
        }
    }

    $Client.close({ type: 'form', data: data, success: true, filesUploaded: filesToUpload.length > 0 });
}

/**
 * Closes the widget and returns the text of the selected button.
 * Used by the 'confirmation' and 'dropdown' modes.
 * @param {String} selection The text of the button or option that was chosen.
 */
function closeWithSelection(selection) {
    // for dropdowns, the data is structured. for confirmations, it's just the string
    const isDropdown = widgetConfig.type === 'dropdown';
    const payload = {
        success: true,
        type: widgetConfig.type,
        [isDropdown ? 'data' : 'selection']: selection
    };
    
    $Client.close(payload);
}

/**
 * Handles the submission of the dropdown selection widget
 */
function submitSelection() {
    const select = document.getElementById('dynamicSelect');
    if (!select) return;

    let selectedData;
    if (select.multiple) {
        selectedData = Array.from(select.selectedOptions).map(option => ({ actual_value: option.value, display_value: option.text }));
        if (selectedData.length === 0) { showAlert("Please select at least one option!"); return; }
    } else {
        if (!select.value) { showAlert("Please select an option!"); return; }
        selectedData = { actual_value: select.value, display_value: select.options[select.selectedIndex].text };
    }

    closeWithSelection(selectedData);
}

/**
 * Closes the widget and indicates the action was cancelled
 */
function closeWidget() {
    $Client.close({ success: false, cancelled: true });
}

// ════════════════════════════════════════════════════════════════════════
//      FORM FIELD BUILDER HELPERS
// ════════════════════════════════════════════════════════════════════════

function buildInputField(field, required, placeholder) {
    const requiredHtml = field.required ? ' <span class="required-indicator">*</span>' : '';
    let defaultValue = '';

    if (['date', 'time', 'datetime-local'].includes(field.type)) {
        defaultValue = formatDefaultDateValue(field);
    } else {
        defaultValue = field.default_value || '';
    }
    
    return ` <label for="${field.name}">${field.label}${requiredHtml}</label> <input type="${field.type || 'text'}" id="${field.name}" name="${field.name}" placeholder="${placeholder}" value="${defaultValue}" autocomplete="off" ${required} > `;
}

function buildTextareaField(field, required, placeholder) {
    const requiredHtml = field.required ? ' <span class="required-indicator">*</span>' : '';
    const defaultValue = field.default_value || '';
    return ` <label for="${field.name}">${field.label}${requiredHtml}</label> <textarea id="${field.name}" name="${field.name}" rows="${field.rows || 4}" placeholder="${placeholder}" ${required} >${defaultValue}</textarea> `;
}

function buildSelectField(field, required) {
    const multiple = field.multiple ? 'multiple' : '';
    const size = field.multiple ? `size="${Math.min(field.options?.length || 3, 5)}"` : '';
    const requiredHtml = field.required ? ' <span class="required-indicator">*</span>' : '';
    const defaultValue = field.default_value;
    let selectHTML = `<label for="${field.name}">${field.label}${requiredHtml}</label><select id="${field.name}" name="${field.name}" ${multiple} ${size} ${required}>`;
    if (!field.multiple && !field.required) { selectHTML += `<option value="">-- Select ${field.label} --</option>`; }
    if (field.options) {
        field.options.forEach(option => {
            const actualValue = option.actual_value || option.value || option;
            const displayValue = option.display_value || option.text || option;
            let selected = '';
            if (defaultValue) {
                if (field.multiple && Array.isArray(defaultValue)) {
                    if (defaultValue.includes(actualValue)) {
                        selected = 'selected';
                    }
                } else {
                    if (defaultValue === actualValue) {
                        selected = 'selected';
                    }
                }
            }
            selectHTML += `<option value="${actualValue}" ${selected}>${displayValue}</option>`;
        });
    }
    selectHTML += `</select>`;
    return selectHTML;
}

function buildFileField(field, required) {
    const fieldName = field.name;
    const accept = field.accept || '*/*';
    const multiple = field.multiple ? 'multiple' : '';
    const requiredHtml = field.required ? ' <span class="required-indicator">*</span>' : '';
    return `<label>${field.label}${requiredHtml}</label> <div class="file-upload-wrapper" id="wrapper_${fieldName}"> <label for="${fieldName}" class="file-upload-label"> <i class="fa fa-cloud-upload"></i> <span>Choose File...</span> </label> <input type="file" id="${fieldName}" name="${fieldName}" accept="${accept}" ${multiple} ${required} > <span class="file-name-display" id="display_${fieldName}" data-placeholder="No file selected"></span> </div>`;
}

function buildCheckboxField(field, required) {
    const requiredHtml = field.required ? ' <span class="required-indicator">*</span>' : '';
    if (field.options && field.options.length > 0) {
        let checkboxHTML = `<label class="field-label">${field.label}${requiredHtml}</label><div class="checkbox-group">`;
        field.options.forEach((option, index) => {
            const actualValue = option.actual_value || option.value || option;
            const displayValue = option.display_value || option.text || option;
            let checked = '';
            if (Array.isArray(defaultValue) && defaultValue.includes(actualValue)) {
                checked = 'checked';
            }
            checkboxHTML += `<div class="checkbox-item"><input type="checkbox" id="${field.name}_${index}" name="${field.name}" value="${actualValue}" ${checked}><label for="${field.name}_${index}" class="checkbox-label">${displayValue}</label></div>`;
        });
        checkboxHTML += `</div>`;
        return checkboxHTML;
    } else {
        const checked = defaultValue === true ? 'checked' : '';
        return `<div class="checkbox-item single-checkbox"><input type="checkbox" id="${field.name}" name="${field.name}" value="${field.value || 'true'}" ${checked} ${required}><label for="${field.name}" class="checkbox-label">${field.label}${requiredHtml}</label></div>`;
    }
}

function buildRadioField(field, required) {
    const requiredHtml = field.required ? ' <span class="required-indicator">*</span>' : '';
    let radioHTML = `<label class="field-label">${field.label}${requiredHtml}</label><div class="radio-group">`;
    const defaultValue = field.default_value;
    if (field.options) {
        field.options.forEach((option, index) => {
            const actualValue = option.actual_value || option.value || option;
            const displayValue = option.display_value || option.text || option;
            const checked = (defaultValue === actualValue) ? 'checked' : '';
            radioHTML += `<div class="radio-item"><input type="radio" id="${field.name}_${index}" name="${field.name}" value="${actualValue}" ${checked} ${required}><label for="${field.name}_${index}" class="radio-label">${displayValue}</label></div>`;
        });
    }
    radioHTML += `</div>`;
    return radioHTML;
}

// ════════════════════════════════════════════════════════════════════════
//      EVENT HANDLING & CONTROLS 
// ════════════════════════════════════════════════════════════════════════

function setupKeyboardControls() {
    document.removeEventListener('keydown', handleKeyDown);
    document.removeEventListener('submit', handleFormSubmit);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('submit', handleFormSubmit);
    console.log('Keyboard controls setup complete');
}

function handleKeyDown(event) {
    if (event.key === 'Enter' && widgetConfig.submit_on_enter) {
        event.preventDefault();
        event.stopPropagation();
        const widgetType = widgetConfig.type || 'message';
        if (widgetType === 'form') { submitForm(); }
        else if (widgetType === 'dropdown') { submitSelection(); }
        else { closeWidget(); }
        return false;
    }
    if (event.key === 'Escape' && widgetConfig.close_on_escape) {
        event.preventDefault();
        event.stopPropagation();
        closeWidget();
        return false;
    }
}

function handleFormSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    if (widgetConfig.submit_on_enter && (widgetConfig.type || 'message') === 'form') {
        submitForm();
    }
    return false;
}

// ════════════════════════════════════════════════════════════════════════
//      UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════════════════

// --- UI & Message Utilities ---

function showAlert(message) {
    document.getElementById("alertMessage").textContent = message;
    document.getElementById("customAlert").style.display = "block";
}

function closeAlert() {
    document.getElementById("customAlert").style.display = "none";
}

function showStatusMessage(message, type = 'info') {
    if (!statusMessageEl) { return; }
    statusMessageEl.textContent = message;
    statusMessageEl.className = ''; 
    statusMessageEl.classList.add(`status-${type}`);
}

function clearStatusMessage() {
    if (statusMessageEl) {
        statusMessageEl.textContent = '';
        statusMessageEl.className = '';
    }
}

function resetContainerBackground() {
    const container = document.querySelector('.container');
    if (container) {
        container.className = 'container'; // resets to just the base class
    }
}

// --- Date Conversion ---

/**
 * Parses and formats a default date/time value to be HTML input-compatible.
 * Accepts a JS Date object or a string (YYYY-MM-DD or ISO format).
 * This version correctly handles timezone issues for YYYY-MM-DD strings.
 * @param {Object} field The field configuration object.
 * @returns {String} The correctly formatted string for the input's 'value' attribute, or an empty string.
 */
function formatDefaultDateValue(field) {
    if (!field.default_value) {
        return ''; // no default value provided
    }

    let dateObj;

    // check if the input is a string specifically in the yyyy-mm-dd format
    if (typeof field.default_value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(field.default_value)) {
        // if it is, we parse it manually to avoid the utc conversion trap. "2025-01-01" is split into parts ["2025", "01", "01"]
        const parts = field.default_value.split('-');
        // we create the date using these parts. the month is 0-indexed in the date constructor, so we subtract 1. this creates a date at midnight in the user's local timezone.
        dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        // for all other formats (like a js date object or a full iso string with a timezone), let the constructor handle it normally
        dateObj = new Date(field.default_value);
    }

    // check if the created date is valid.
    if (isNaN(dateObj.getTime())) {
        console.warn(`Invalid default_value for date field '${field.name}':`, field.default_value);
        return '';
    }

    // helper function for padding numbers with a leading zero
    const pad = (num) => String(num).padStart(2, '0');

    const year = dateObj.getFullYear();
    const month = pad(dateObj.getMonth() + 1); // month is 0-indexed
    const day = pad(dateObj.getDate());
    const hours = pad(dateObj.getHours());
    const minutes = pad(dateObj.getMinutes());

    switch (field.type) {
        case 'date':
            return `${year}-${month}-${day}`;
        case 'datetime-local':
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        case 'time':
            return `${hours}:${minutes}`;
        default:
            return field.default_value || ''; 
    }
}

// --- File Utilities ---

async function handleAttachmentUpload(file) {
    const blob = await fileToBlob(file);
    const attachConfig = {
        Entity: currentEntity,
        RecordID: currentRecordId,
        File: { Name: file.name, Content: blob }
    };
    showStatusMessage(`Attaching ${file.name}...`, 'info');
    return await ZOHO.CRM.API.attachFile(attachConfig);
}

async function handleFileUploadField(file, fieldConfig) {
    const uploadConfig = { "CONTENT_TYPE": "multipart", "PARTS": [{"headers": {"Content-Disposition": "file;"}, "content": "__FILE__"}], "FILE": {"fileParam": "content", "file": file} };
    showStatusMessage(`Uploading ${file.name}...`, 'info');
    const uploadResponse = await ZOHO.CRM.API.uploadFile(uploadConfig);
    if (!uploadResponse?.data?.[0]?.details?.id) { throw new Error(uploadResponse?.data?.[0]?.message || "Failed to get file ID."); }
    const fileId = uploadResponse.data[0].details.id;
    const apiPayload = { "data": [ { "id": currentRecordId, [fieldConfig.target_field]: [ { "file_id": fileId } ] } ] };
    const apiDomain = widgetConfig.api_domain || 'https://www.zohoapis.com';
    const connectionName = widgetConfig.connection_name;
    const req_data = { "method": "PUT", "url": `${apiDomain}/crm/v2.1/${currentEntity}`, "param_type": 2, "parameters": apiPayload };
    console.log(`Uploading file to ${fieldConfig.target_field}`, req_data);
    showStatusMessage(`Updating record for ${file.name}...`, 'info');
    return await ZOHO.CRM.CONNECTION.invoke(connectionName, req_data); 
}

async function handleImageUploadField(file, fieldConfig) {
    const uploadConfig = { "CONTENT_TYPE": "multipart", "PARTS": [{"headers": {"Content-Disposition": "file;"}, "content": "__FILE__"}], "FILE": {"fileParam": "content", "file": file} };
    showStatusMessage(`Uploading ${file.name}...`, 'info');
    const uploadResponse = await ZOHO.CRM.API.uploadFile(uploadConfig);
    if (!uploadResponse?.data?.[0]?.details?.id) { throw new Error(uploadResponse?.data?.[0]?.message || "Failed to get file ID."); }
    const fileId = uploadResponse.data[0].details.id;
    const apiPayload = { "data": [ { "id": currentRecordId, [fieldConfig.target_field]: [ { "Encrypted_Id": fileId } ] } ] };
    const apiDomain = widgetConfig.api_domain || 'https://www.zohoapis.com';
    const connectionName = widgetConfig.connection_name;
    const req_data = { "method": "PUT", "url": `${apiDomain}/crm/v2.1/${currentEntity}`, "param_type": 2, "parameters": apiPayload };
    console.log(`Uploading image to ${fieldConfig.target_field}`, req_data);
    showStatusMessage(`Updating record for ${file.name}...`, 'info');
    return await ZOHO.CRM.CONNECTION.invoke(connectionName, req_data); 
}

// --- Data Utilities ---

function fileToBlob(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(new Blob([reader.result], { type: file.type }));
        };
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

// --- Configuration Utilities ---

function getMessageTypeConfig(messageType) {
    const configs = {
        info: { icon: 'ℹ️', iconClass: 'icon-info', buttonClass: 'primary-btn', buttonText: 'OK' },
        success: { icon: '✅', iconClass: 'icon-success', buttonClass: 'primary-btn success-btn', buttonText: 'OK' },
        warning: { icon: '⚠️', iconClass: 'icon-warning', buttonClass: 'primary-btn warning-btn', buttonText: 'OK' },
        error: { icon: '❌', iconClass: 'icon-error', buttonClass: 'primary-btn error-btn', buttonText: 'OK' },
        question: { icon: '❓', iconClass: 'icon-question', buttonClass: 'primary-btn', buttonText: 'OK' }
    };
    return configs[messageType] || configs.info;
}

// --- Focus Utilities ---

function forceFocus() {
    setTimeout(() => focusFirstElement(), 50);
    setTimeout(() => focusFirstElement(), 150);
    setTimeout(() => focusFirstElement(), 300);
    setTimeout(() => focusFirstElement(), 500);
}

function focusFirstElement() {
    let attempts = 0;
    const maxAttempts = 5;

    function tryFocus() {
        attempts++;
        
        // finds all focusable form fields in the order they appear
        const focusableSelector = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';

        try {
            // use queryselectorall to get a list of all focusable elements in dom order
            const focusableElements = document.querySelectorAll(focusableSelector);

            if (focusableElements.length > 0) {
                // the first element in the list is the one we want to focus
                const firstElement = focusableElements[0];
                
                firstElement.focus();
                
                // verify that the focus was successful
                if (document.activeElement === firstElement) {
                    // for text-like inputs, also select the content
                    if (['text', 'email', 'tel', 'url', 'password', 'number'].includes(firstElement.type)) {
                        firstElement.select();
                    }
                    firstElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    console.log('Successfully focused the first element:', firstElement);
                    return true; // success! stop the retry attempts
                }
            }

            // if we get here, focus failed or no elements were found. retry if we have attempts left.
            if (attempts < maxAttempts) {
                setTimeout(tryFocus, 200 * attempts);
                return false;
            }
                
        } catch (error) {
            console.error('Auto-focus attempt failed:', error);
            if (attempts < maxAttempts) {
                setTimeout(tryFocus, 200 * attempts);
                return false;
            }
        }
        
        console.warn('Auto-focus failed after', attempts, 'attempts');
        return false;
    }

    // start the focus attempts
    tryFocus();
}
