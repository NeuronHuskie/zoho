<img src="https://www.zohowebstatic.com/sites/zweb/images/commonroot/zoho-logo-web.svg" width="100" alt="zoho-crm" style="border: 0px solid #666; padding: 5px;">

# Misc Zoho Functions / Widgets

A collection of standalone Deluge functions, widgets, and other utilities for Zoho CRM. Each widget folder contains its own README with setup instructions.

---

## Widgets

> [!NOTE]
> The Dynamic Widget and Search Records Widget have been superseded by
> **[mosaic-zcrm](https://github.com/NeuronHuskie/mosaic-zcrm)**, which covers both
> (forms, tables with static/COQL/search sources, and much more) with a cleaner API.
> They remain here for existing users but are no longer actively developed.

| Widget | Status | Description |
|---|---|---|
| [Dynamic Widget](crm/widgets/dynamic%20widget) | Archived - see [mosaic-zcrm](https://github.com/NeuronHuskie/mosaic-zcrm) | Configurable widget launched from client scripts - messages and multi-field forms |
| [Search Records Widget](crm/widgets/search%20records%20widget) | Archived - see [mosaic-zcrm](https://github.com/NeuronHuskie/mosaic-zcrm) | Search, filter, and select records from any CRM module |
| [Developer Dashboard Widget](crm/widgets/zcrm%20developer%20dashboard%20widget) | Active | Developer dashboard for inspecting your CRM org |

---

## Standalone Functions (Deluge)

| Function | Description |
|---|---|
| [between](crm/standalone%20functions/between.dg) | Check whether a numeric value falls within a range - supports hyphenated ranges and `>=` notation |
| [create_indexed_list](crm/standalone%20functions/create_indexed_list.dg) | Generate a list of sequential indices (workaround for Deluge's lack of while loops / range functions) |
| [get_user](crm/standalone%20functions/get_user.dg) | Look up a Zoho user by full name, ID, or email |
| [local_datetime](crm/standalone%20functions/local_datetime.dg) | Current timestamp in the logged-in user's local timezone |

---

## Related Projects

- **[mosaic-zcrm](https://github.com/NeuronHuskie/mosaic-zcrm)** - a full popup/flyout widget framework for Zoho CRM client scripts: multi-field forms, data tables (static/COQL/search sources with export), HTML & PDF viewers, PDF fill/merge, command palette, and more - all from single synchronous calls. The spiritual successor to the Dynamic Widget in this repo.
