<img src="https://www.zohowebstatic.com/sites/zweb/images/productlogos/crm.svg" width="100" alt="create-widget" style="border: 0px; solid #666; padding: 5px;">

# Dynamic Record Search Widget for Zoho CRM

A customizable widget for searching and selecting records in Zoho CRM. This widget provides a user-friendly interface for searching, filtering, and selecting multiple records from any Zoho CRM module.

![Widget Example](https://i.imgur.com/VAWVs1X.png)

## Features

*   **Live & Static Data Modes:** Works with real-time Zoho data or a local data array.
*   **Advanced Filtering & Sorting:** Clickable column headers for sorting and dynamic dropdown filters for each column.
*   **Powerful Search:** Supports both live API searches and client-side searching within loaded results.
*   **Highly Configurable UI:** Show or hide selection checkboxes, action buttons, and control the table's appearance.
*   **Data Export:** Export the currently visible (filtered) data to **CSV, XLSX (Excel), PDF, and JSON** formats.
*   **Dynamic Linking:** Automatically creates clickable links for lookup fields and supports custom link configurations.
*   **Pagination:** Intelligently handles loading more records for modules with large datasets.

## Installation

- Download the searchRecords.zip widget files
- Create a new widget in your Zoho CRM environment.  

If you intend to use the widget with a Client Script, **be sure to select "Button" as the "Type"**.  

<img src="https://i.imgur.com/4kmbkNl.png" width="450" alt="create-widget" style="border: 1px solid #666; padding: 5px;">

___

## Widget Config

The widget is configured by passing a `data` object within the `ZDK.Client.openPopup` method.

### Parameters

#### `module`
-   **Type:** `String`
-   **Required:** Yes (unless using `static_data`) 
-   **Description:** The API name of the Zoho CRM module to search within (e.g., `Contacts`, `Deals`, `Custom_Module_1`).
-   **Example:** `'Commissions'`

#### `fields`
-   **Type:** `Array of Objects`
-   **Required:** Yes
-   **Description:** An array defining the columns to display in the table. Each object must contain an `api_name` and a `label`. It can also optionally contain a `link_config` object for creating custom hyperlinks.
-   **Example:**
    ```javascript
    fields: [
        { api_name: 'Name', label: 'Commission Record' },
        { api_name: 'Company.name', label: 'Company' }, // supports nested fields
        { api_name: 'Deal.name', label: 'Deal Link', link_config: { module: 'Deals', id_field: 'Deal.id' } } // use the id from the deal lookup field
    ]
    ```

#### `<return_ids_only>`
-   **Type:** `Boolean`
-   **Optional:** Yes (Default: `false`)
-   **Description:** If `true`, the widget will return an array of selected record IDs (strings). If `false`, it will return an array of full record objects.
-   **Example:** `true`

#### `<selection_limit>`
-   **Type:** `Number`
-   **Optional:** Yes (Default: `25`)
-   **Description:** The maximum number of records a user is allowed to select.
-   **Example:** `50`

#### `<static_data>`
-   **Type:** `Array of Objects`
-   **Optional:** Yes
-   **Description:** An array of record objects to populate the table. When this is provided, the widget runs in "Static Mode" and will not make any API calls to fetch data. The `module` parameter is ignored.
-   **Example:** `[{ "id": "1", "Name": "Record A" }, { "id": "2", "Name": "Record B" }]`

#### `<show_all_records_on_load>`
-   **Type:** `Boolean`
-   **Optional:** Yes (Default: `false`)
-   **Description:** If `true`, the widget will automatically fetch and display the first page of records when it loads. If `false`, the user must perform a search first. Ignored in static mode.
-   **Example:** `true`

#### `<predefined_criteria>`
-   **Type:** `String`
-   **Optional:** Yes
-   **Description:** A Zoho CRM criteria string to pre-filter the results shown by `show_all_records_on_load`.
-   **Example:** `"(Company:equals:Sentara Health)"`

#### `<show_selection_checkboxes>`
-   **Type:** `Boolean`
-   **Optional:** Yes (Default: `true`)
-   **Description:** If `false`, hides the selection checkboxes. In this mode, clicking "Submit" will return all currently visible (filtered) records.
-   **Example:** `false`

#### `<show_widget_buttons>`
-   **Type:** `Boolean`
-   **Optional:** Yes (Default: `true`)
-   **Description:** If `false`, hides the entire footer containing the "Submit" and "Cancel" buttons. Ideal for a read-only view.
-   **Example:** `false`

#### `<default_sort_field>`
-   **Type:** `String`
-   **Optional:** Yes
-   **Description:** The `api_name` of the field to sort by when data is first loaded.
-   **Example:** `'Name'`

#### `<default_sort_order>`
-   **Type:** `String`
-   **Optional:** Yes (Default: `'asc'`)
-   **Description:** The sort order for the `default_sort_field`. Can be `'asc'` or `'desc'`.
-   **Example:** `'desc'`

#### *`<table_font_size>`
-   **Type:** `Number`
-   **Optional:** Yes (Default: `14`)
-   **Description:** The font size (in pixels) for the data table content.
-   **Example:** `12`

#### `<max_records_per_page>`
-   **Type:** `Number`
-   **Optional:** Yes (Default: `200`)
-   **Description:** The number of records to fetch per API call (max 200).
-   **Example:** `100`

#### `<close_on_escape>`
-   **Type:** `Boolean`
-   **Optional:** Yes (Default: `true`)
-   **Description:** If `true`, the widget will close when the user presses the Escape key.
-   **Example:** `true`

## Client Script Examples

Here are a few examples of how to launch and configure the widget within zCRM Client Scripts:

#### Example 1: Standard Multi-Record Selector

This is a standard configuration which allows the user to select records and then return the selected data.

```javascript
// --- pop-up window configuration ---
const popup_config = {
    api_name:           'searchRecords',
    type:               'widget',
    header:             'Select Commission Records',
    close_on_escape:    true,
    height:             '80vh',
    width:              '75vw'
};

// --- widget-specific data and settings ---
const widget_data = {
    module: 'Commissions',
    fields: [
        { api_name: 'Name', label: 'Commission'},
        { api_name: 'Company.name', label: 'Company' },
        { api_name: 'Deal.name', label: 'Deal' },
        { api_name: 'Statement_Date', label: 'Statement Date' },
        { api_name: 'Type', label: 'Type' }
    ],
    show_all_records_on_load: true,
    predefined_criteria: "(Company:equals:Anthem)",
    default_sort_field: 'Statement_Date',
    default_sort_order: 'desc',
    return_ids_only: true,
    selection_limit: 10
};

// --- launch the widget ---
const SELECTED_RECORDS = ZDK.Client.openPopup(popup_config, { data: widget_data });

// --- handle the returned data ---
SELECTED_RECORDS.forEach((rec, index) => {
    log(`Selected record #${index + 1}`);
    log(JSON.stringify(rec));
});
```

#### Example 2: Read-only data

This example configures the widget as a "view-only" tool. The user cannot select or submit records, but they can search, filter, sort, and export the data they see.

```javascript
// --- pop-up window configuration ---
const popup_config = {
    api_name:           'searchRecords',
    type:               'widget',
    header:             'View All Active Policies',
    height:             '80vh',
    width:              '75vw'
};

// --- widget-specific data and settings ---
const widget_data = {
    module: 'Policies',
    fields: [
        { api_name: 'Name', label: 'Policy #'},
        { api_name: 'Client.Full_Name', label: 'Client' },
        { api_name: 'Carrier.name', label: 'Carrier' },
        { api_name: 'Effective_Date', label: 'Effective Date' },
        { api_name: 'Premium', label: 'Premium' }
    ],
    // key settings for read-only mode
    show_selection_checkboxes: false,
    show_widget_buttons: false,
    // load data immediately
    show_all_records_on_load: true,
    predefined_criteria: "(Status:equals:Active)"
};

// --- launch the widget (no response needed as it cannot be submitted) ---
ZDK.Client.openPopup(popup_config, { data: widget_data });
```

#### Example 3: Using static data

This example shows how to use the widget to display and filter static array of data from your client script, without interacting with the Zoho API.

```javascript
// --- pop-up window configuration ---
const popup_config = {
    api_name:           'searchRecords',
    type:               'widget',
    header:             undefined,
    height:             '80vh',
    width:              '75vw'
};

// --- create your static data array ---
let local_data = [
    {id: "temp1", product_name: "Service A", quantity: 2, unit_price: 50.00, total: 100.00},
    {id: "temp2", product_name: "Service B", quantity: 1, unit_price: 75.00, total: 75.00},
    {id: "temp3", product_name: "Service A", quantity: 5, unit_price: 45.00, total: 225.00}
];

// --- widget-specific data and settings ---
const widget_data = {
    // no 'module' or 'predefined_criteria' needed
    static_data: local_data,
    fields: [
        { api_name: 'product_name', label: 'Product'},
        { api_name: 'quantity', label: 'Qty' },
        { api_name: 'unit_price', label: 'Unit Price' },
        { api_name: 'total', label: 'Total' }
    ],
    return_ids_only: false
};

// --- launch the widget ---
const response = ZDK.Client.openPopup(popup_config, { data: widget_data });
log("Selected Line Items: " + JSON.stringify(response));
```
