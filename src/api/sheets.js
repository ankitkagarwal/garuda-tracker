// ── Config ─────────────────────────────────────────────────────────────────
const CLIENT_ID = '286994967726-o6knq1qimh672fqavc5ksbhe7taoj3q1.apps.googleusercontent.com';
const SHEET_ID  = '1eLr2WO_Zj0B_7mbW3JpuKpPg9p2Hye1n_i2-BfYLDZQ';
const TAB_NAME  = 'Tesla_Charge_Tracker';
const RANGE     = `${TAB_NAME}!A:L`;
const SCOPE     = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient = null;
let accessToken = null;

const waitForGapi = () => new Promise((resolve) => {
  const check = () => { if (window.gapi && window.google) resolve(); else setTimeout(check, 200); };
  check();
});

export const initGapi = () => new Promise(async (resolve, reject) => {
  await waitForGapi();
  window.gapi.load('client', async () => {
    try {
      await window.gapi.client.init({
        discoveryDocs: ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
      });
      resolve();
    } catch (e) { reject(e); }
  });
});

export const signIn = () => new Promise((resolve, reject) => {
  if (accessToken) { resolve(accessToken); return; }
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) { reject(resp); return; }
      accessToken = resp.access_token;
      window.gapi.client.setToken({ access_token: accessToken });
      resolve(accessToken);
    },
  });
  tokenClient.requestAccessToken({ prompt: '' });
});

export const signOut = () => {
  if (accessToken) {
    window.google.accounts.oauth2.revoke(accessToken);
    accessToken = null;
    window.gapi.client.setToken(null);
  }
};

export const isSignedIn = () => !!accessToken;

// ── Read all rows ──────────────────────────────────────────────────────────
export const readRows = async () => {
  await signIn();
  const res = await window.gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: RANGE,
  });
  const rows = (res.result.values || []).slice(1);
  return rows.map(rowToSession);
};

// ── Append new row ─────────────────────────────────────────────────────────
export const appendRow = async (session) => {
  await signIn();
  await window.gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    resource: { values: [sessionToRow(session)] },
  });
};

// ── Update specific row by 0-based index ──────────────────────────────────
export const updateRow = async (rowIndex, session) => {
  await signIn();
  const sheetRow = rowIndex + 2;
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${TAB_NAME}!A${sheetRow}:L${sheetRow}`,
    valueInputOption: 'RAW',
    resource: { values: [sessionToRow(session)] },
  });
};

// ── Converters ─────────────────────────────────────────────────────────────
// Columns: DateTime, Odometer, Range_Plug_In, Range_Unplug, kWh_Added,
//          Range_Added, Range_Used, kms_Driven, Cost_AED, kWh_Used,
//          Plugin_Timestamp, Unplug_Timestamp
export const rowToSession = (row, idx) => ({
  id:           idx,
  datetime:     row[0]  || '',
  odometer:     toNum(row[1]),
  range_plugin: toNum(row[2]),
  range_unplug: toNum(row[3]),
  kwh_added:    toNum(row[4]),
  range_added:  toNum(row[5]),
  range_used:   toNum(row[6]),
  kms_driven:   toNum(row[7]),
  cost_aed:     toNum(row[8]),
  kwh_used:     toNum(row[9]),
  plugin_ts:    row[10] || null,
  unplug_ts:    row[11] || null,
});

export const sessionToRow = (s) => [
  s.datetime     ?? '',
  s.odometer     ?? '',
  s.range_plugin ?? '',
  s.range_unplug ?? '',
  s.kwh_added    ?? '',
  s.range_added  ?? '',
  s.range_used   ?? '',
  s.kms_driven   ?? '',
  s.cost_aed     ?? '',
  s.kwh_used     ?? '',
  s.plugin_ts    ?? '',
  s.unplug_ts    ?? '',
];

const toNum = (v) => (v !== '' && v != null) ? Number(v) : null;
