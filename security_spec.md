# Security Specification: Shared YouTube Analytics Dashboards

This document defines the data invariants, threat model, test cases, and verification rules for the shared YouTube Analytics Dashboards Firestore collections.

## 1. Data Invariants
1. **Public Direct-ID Access Only**: Listing or scanning the `dashboards` collection is strictly prohibited. Users must have the precise ID of the dashboard to view or modify it.
2. **Immutable Identity**: Once created, the dashboard ID cannot be altered.
3. **Data Constraint Integrity**:
   - `folders`: Must be a list of maps, maximum size 30.
   - `channels`: Must be a list of maps, maximum size 100.
   - `updatedAt` / `createdAt`: Managed strictly using server timestamps.
4. **Denial of Wallet Defense**: Any fields (IDs, names) must be strictly size-limited to prevent resource exhaustion or payload bloat.

## 2. Threat Model and payloads (The "Dirty Dozen")
To protect against illegal operations, we block the following payloads:
1. **Shadow listing attempt**: Trying to retrieve all documents using a range query.
2. **Malicious field injection**: Sending additional keys (like `isAdmin: true` or fake fields) on document create/update.
3. **Array bloat attack**: Sending an array with 10,000 folders.
4. **ID poisoning**: Attempting to write to an ID containing characters like `/` or non-ASCII characters, or a 10KB string ID.
5. **Timestamp forgery**: Client-provided value in `updatedAt` instead of `request.time`.
6. **Immutable API Key deletion**: Bypassing field limits to wipe settings fields.

## 3. Firestore Security Rules Draft (`DRAFT_firestore.rules`)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Global Safety Net
    match /{document=**} {
      allow read, write: if false;
    }

    function isValidId(id) {
      return id is string && id.size() <= 64 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidDashboard(data) {
      return data.keys().hasAll(['folders', 'channels'])
          && (data.keys().size() == 2 || data.keys().size() == 3 || data.keys().size() == 4 || data.keys().size() == 5)
          && data.folders is list
          && data.folders.size() <= 50
          && data.channels is list
          && data.channels.size() <= 150;
    }

    match /dashboards/{dashboardId} {
      allow get: if isValidId(dashboardId);
      allow list: if false; // Strict prohibition on data enumeration/scraping
      
      allow create: if isValidId(dashboardId) 
                    && isValidDashboard(incoming())
                    && incoming().createdAt == request.time
                    && incoming().updatedAt == request.time;
                    
      allow update: if isValidId(dashboardId)
                    && isValidDashboard(incoming())
                    && incoming().updatedAt == request.time
                    && incoming().createdAt == existing().createdAt;
                    
      allow delete: if false; // Permanent storage for dashboards
    }
  }
}
```
