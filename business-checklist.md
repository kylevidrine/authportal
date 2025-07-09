# 🚨 Business Debugging Checklist

## Off-site Debugging Items

### Dashboard Issues

- [ ] **Google Workspace Services Display Bug**

  - **Issue**: Dashboard shows "Services Available: Gmail, Google Sheets, Calendar, Drive, Contacts"
  - **Problem**: Not reflecting actual OAuth scopes being used
  - **Action Needed**: Update dashboard to show only authorized scopes
  - **Location**: `/routes/pages.js` line with "Services Available" text
  - **Priority**: Medium

- [ ] **N8N Workflow Integration - Remove API Endpoints Text**

  - **Issue**: Unnecessary API endpoints text showing in N8N section
  - **Action Needed**: Remove API endpoints display text
  - **Location**: Dashboard N8N section
  - **Priority**: Low

- [ ] **Customer ID Display - Inconsistent Button Styling**
  - **Issue**: Two Customer ID displays with different button styles
  - **Problem**: Top one has small gray button, bottom has proper blue button
  - **Action Needed**: Move blue-styled Customer ID from bottom to top, remove the gray one
  - **Location**: Dashboard customer ID sections
  - **Priority**: Medium
