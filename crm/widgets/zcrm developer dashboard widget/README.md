<img src="https://www.zohowebstatic.com/sites/zweb/images/productlogos/crm.svg" width="100" alt="create-widget" style="border: 0px; solid #666; padding: 5px;">

# Zoho CRM Developer Dashboard Widget

![Zoho CRM](https://img.shields.io/badge/Zoho%20CRM-Widget-red)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow)
![License](https://img.shields.io/badge/License-MIT-blue)

A widget for Zoho CRM that lets developers browse, search, and export all Deluge functions and Client Scripts.

> Inspired by the [Search CRM Functions bookmarklet](https://learn.powered-by-haiku.co.uk/external/manual/solutions/article/search-crm-functions-a-helpful-tool-for-developers?p=a1e8a1a1878ebad0289cd08282240314dfdf2048db657e08fabff9b3d4b66575) by [Powered by Haiku](https://powered-by-haiku.co.uk/).

## Table of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Export Folder Structure](#-export-folder-structure)
- [Installation](#-installation)
- [Usage](#-usage)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Technical Details](#-technical-details)
- [Known Limitations](#-known-limitations)
- [License](#-license)
- [Acknowledgments](#acknowledgments)

## Screenshots

<details>
<summary><strong>Dashboard Views</strong></summary>

#### Deluge Functions
![Dashboard Example - Functions](https://i.imgur.com/NXycQa0.png)

#### Client Scripts
![Dashboard Example - Client Scripts](https://i.imgur.com/rrNFi3F.png)

</details>

<details>
<summary><strong>Code Viewer</strong></summary>

#### Deluge Functions
![Source Code Example - Functions](https://i.imgur.com/wKGfUck.png)

#### Client Scripts
![Source Code Example - Client Scripts](https://i.imgur.com/bDIObYx.png)

</details>

## Features

### Deluge Functions
- **Browse & Search** – View all org-level Deluge functions with full-text search across names, API names, and source code
- **Category Filtering** – Filter by function category (automation, button, scheduler, standalone, etc.)
- **Smart Sorting** – Sort by name, category, created date, or modified date

### Client Scripts
- **All Script Types** – Support for Module Scripts, Commands, and Static Resources
- **Advanced Filtering** – Filter by module, page type, event type, and active status
- **Page Type Detection** – Automatic categorization of Standard, Canvas, and Wizard pages
  
### Export Capabilities
- **JSON Export** – Full data export with metadata and source code
- **ZIP Export** – Organized folder structure for easy backup and migration
  - Functions: Organized by category
  - Scripts: Organized by type → module → page type → definition

### Performance & UX
- **Local Caching** – IndexedDB-powered cache for instant loading
- **Background Sync** – Automatic detection of new/modified items
- **Keyboard Shortcuts** – `Ctrl+F` for search, `Escape` for navigation
- **Source Code Viewer** – Syntax-highlighted code viewer with in-code search functionality
- **Progress Indicators** – Visual feedback during sync operations

## 📁 Export Folder Structure

<details>
<summary><strong>Deluge Functions</strong></summary>

```
zoho_crm_functions_YYYY-MM-DD.zip
├── automation/
│   └── function_name.dg
├── button/
│   └── function_name.dg
├── scheduler/
│   └── function_name.dg
└── standalone/
    └── function_name.dg
```

</details>

<details>
<summary><strong>Client Scripts</strong></summary>

```
zoho_crm_scripts_YYYY-MM-DD.zip
├── Module Scripts/
│   └── {Module Name}/
│       ├── Standard Pages/
│       │   ├── module_create/
│       │   │   └── Script Name - onLoad.js
│       │   └── module_edit/
│       │       └── Script Name - onChange.js
│       ├── Canvas Pages/
│       │   └── module_view_canvas/
│       │       └── Script Name - onLoad.js
│       └── Wizard Pages/
│           └── module_wizard/
│               └── Script Name - onClick.js
├── Commands/
│   └── Command Name.js
└── Static Resources/
    └── Resource Name.js
```

</details>

## 📦 Installation

1. **Download** the widget zip
2. **Upload** to Zoho CRM:
   - Go to **Setup** → **Developer Space** → **Widgets**
   - Click **Create Widget** → **Upload**
   - Upload the `.zip` file
3. **Note the API name** (e.g., `zcrm_developer_dashboard`) for triggering the widget

## 📖 Usage

The easiest way to launch the dashboard is via a **Client Script Command**:

1. Go to **Setup** → **Developer Space** → **Client Script**
2. Create a new **Command** (e.g., "Developer Dashboard")
3. Add the following code:

```js
ZDK.Client.openPopup({
    api_name: 'zcrm_developer_dashboard',  // Use your widget's API name
    type: 'widget',
    header: undefined,
    close_on_escape: true,
    close_icon: false,
    animation_type: 5,
    height: '98vh',
    width: '98vw'
}, {
    data: {}
});
```

4. Save and run the Client Script Command

> [!NOTE]  
> Initial sync may take several minutes for orgs with many functions/scripts. Subsequent loads will be instant due to local caching.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + F` | Focus search box (dashboard) or open code search (detail view) |
| `Escape` | Close detail view / Close modal / Exit confirmation |
| `Enter` | Next search result (in code search) |
| `Shift + Enter` | Previous search result (in code search) |

## 🔧 Technical Details

### Dependencies
| Library | Purpose |
|---------|---------|
| Zoho CRM JS SDK | CRM API access |
| [PrismJS](https://prismjs.com/) | Syntax highlighting (loaded from CDN) |
| [JSZip](https://stuk.github.io/jszip/) | ZIP file generation (loaded from CDN) |

### Browser Storage
- Uses **IndexedDB** for local caching
- Cache is org-specific (separate data per Zoho org)
- Cache auto-syncs in background on each load

### API Endpoints Used
| Endpoint | Purpose |
|----------|---------|
| `GET /crm/v8/settings/functions` | List all functions |
| `GET /crm/v8/settings/functions/{id}` | Get function details & source |
| `GET /crm/v2.2/settings/cscript_pages` | List script pages |
| `GET /crm/v2.2/settings/cscript_snippets` | Get scripts per page |
| `GET /crm/v2.2/settings/static_resources` | List static resources |

## ⚠️ Known Limitations

- **Rate Limiting** – Heavy sync operations may hit Zoho API rate limits on very large orgs
- **Initial Load** – First-time sync can be slow depending on the number of functions/scripts

## 📝 License

This project is licensed under the MIT License – see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Powered by Haiku](https://powered-by-haiku.co.uk/) – Original Search CRM Functions bookmarklet inspiration
- [Zoho CRM](https://www.zoho.com/crm/) – Widget platform
- [PrismJS](https://prismjs.com/) – Syntax highlighting
- [JSZip](https://stuk.github.io/jszip/) – ZIP generation
