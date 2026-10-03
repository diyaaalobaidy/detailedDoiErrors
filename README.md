# Detailed DOI Errors & Queue Diagnostics Plugin for OJS 3.5

An **OJS 3.5+** plugin that surfaces deep diagnostic details for DOI submission and deposit failures. It aggregates and presents both:
1. **DOI Deposit Response Details**: Full error messages, XML diagnostics (`record_diagnostic`, `msg`), batch/submission IDs, and raw API responses stored from DOI registration agencies (e.g., Crossref, DataCite, mEDRA).
2. **Background Queue Job Failures**: Failed jobs recorded in Laravel's `failed_jobs` table associated with `DepositSubmission` and `DepositIssue` jobs, including failure timestamp, queue name, exception summary, and full stack traces.

---

## Features

- **Integrated with OJS 3.5 DOI Management**:
  - Automatically activates on the DOI management backend interface (`/management/dois`).
  - Detects articles and issues with DOI registration errors.
- **Agency Diagnostic Extraction**:
  - Parses structured XML response diagnostics from Crossref (`<record_diagnostic>`, `<msg>`) and JSON errors from DataCite.
  - Displays batch IDs and full raw payloads in a readable format.
- **Job Queue Diagnostic Matching**:
  - Queries Laravel queue `failed_jobs` table for `DepositSubmission` and `DepositIssue` jobs matching the specific submission ID or issue ID.
  - Displays the exception class, exception message, queue worker connection, failure time, and stack trace.
- **Copy Diagnostics**:
  - One-click "Copy Diagnostics" button to easily copy the complete JSON diagnostic report for reporting to Crossref, DataCite, or developers.
- **Multi-language Support**:
  - Full English (`en`) and Arabic (`ar`) translations.

---

## Directory Structure

```
detailedDoiErrors/
├── DetailedDoiErrorsPlugin.php   # Main plugin class with hooks and REST API endpoint
├── index.php                     # Plugin bootstrap file
├── version.xml                   # Plugin version declaration for OJS 3.5
├── js/
│   └── detailedDoiErrors.js      # Frontend UI script injecting diagnostics modal
├── locale/
│   ├── en/
│   │   └── locale.po             # English locale
│   └── ar/
│       └── locale.po             # Arabic locale
└── README.md                     # Documentation and installation instructions
```

---

## Installation

1. Copy or clone this folder into your OJS installation under:
   ```bash
   plugins/generic/detailedDoiErrors
   ```

2. Enable the plugin:
   - Navigate to **Settings > Website > Plugins > Generic Plugins**.
   - Find **Detailed DOI Errors & Queue Diagnostics**.
   - Check the checkbox to enable the plugin.

3. Navigate to **DOIs** management:
   - Go to **DOIs** in the left sidebar menu.
   - For any article or issue with an error status, click **Detailed Error & Job Logs** to inspect the comprehensive error report and job trace.
