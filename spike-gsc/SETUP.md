# Phase 1 — Owner Google setup (manual)

Do these steps once. The spike script never creates Cloud resources or GSC users for you.

## Goal

Give a **service account** read-only access to the Simple Roster Plus Search Console property so a local script can call the Search Console API.

## 1. Google Cloud project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Prefer an existing internal project if you already have one for SRP ops.
3. Otherwise: **Select a project → New project**  
   Suggested name: `seo-ops-console` (or similar).  
   No billing is required for Search Console API read usage at this scale.

## 2. Enable Search Console API

1. In that project: **APIs & Services → Library**.
2. Search for **Google Search Console API**.
3. Open it and click **Enable**.

(This is the Webmaster / Search Console API used for sites, searchAnalytics, sitemaps, and URL Inspection.)

## 3. Create a service account

1. **APIs & Services → Credentials → Create credentials → Service account**.
2. Name: e.g. `seo-console-gsc-reader`.
3. Skip optional product roles in Cloud IAM (Search Console access is granted in GSC, not via Cloud IAM roles).
4. Finish creation.

## 4. Create a JSON key (keep offline)

1. Open the service account → **Keys → Add key → Create new key → JSON**.
2. Download the file.
3. Move it **outside git**, e.g.:

   `C:\Users\Dane\.seo-console\gsc-sa.json`

   or into this folder (gitignored):

   `spike-gsc\.secrets\gsc-sa.json`

4. Do **not** paste the private key into chat, commit it, or put it in logs.

## 5. Note the service account email

From the JSON file (or Cloud Console), copy `client_email`, shaped like:

`seo-console-gsc-reader@YOUR_PROJECT_ID.iam.gserviceaccount.com`

## 6. Add the service account to Search Console

1. Open [Google Search Console](https://search.google.com/search-console).
2. Select the **Simple Roster Plus** property (Domain or URL-prefix — whatever you actually use).
3. **Settings → Users and permissions → Add user**.
4. Paste the service account email.
5. Permission: **Full** or **Restricted** is fine for this spike.  
   The API calls use the **read-only OAuth scope** (`webmasters.readonly`).  
   GSC still requires the SA email to be a user on the property; Restricted is enough for reading Search Analytics / sitemaps / URL Inspection.
6. Save.

If you have **both** a Domain property and a URL-prefix property, add the SA to **both** so the spike can list and compare them.

## 7. Run the spike

From `spike-gsc`:

```powershell
npm install
$env:GOOGLE_APPLICATION_CREDENTIALS = "C:\Users\Dane\.seo-console\gsc-sa.json"
npm run spike
```

Optional: set `GSC_PROPERTY` only after the spike lists properties, if you want to force one identifier.

## What this does *not* do

- No OAuth consent screen for end users (not needed for service account).
- No domain-wide Google Workspace delegation (not required).
- No write access to Search Console settings.
- No live URL test (URL Inspection uses index status only).
