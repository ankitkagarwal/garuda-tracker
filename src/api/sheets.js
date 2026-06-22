// ── Config ─────────────────────────────────────────────────────────────────
const CLIENT_ID = '286994967726-o6knq1qimh672fqavc5ksbhe7taoj3q1.apps.googleusercontent.com';
const SHEET_ID  = '1eLr2WO_Zj0B_7mbW3JpuKpPg9p2Hye1n_i2-BfYLDZQ';
const TAB_NAME  = 'Tesla_Charge_Tracker';
const RANGE     = `${TAB_NAME}!A:J`;
const SCOPE     = 'https://www.googleapis.com/auth/spreadsheets';

let tokenClient = null;
let accessToken = null;

// ── Wait for GAPI + GIS ────────────────────────────────────────────────────
const waitForGapi = () => new Promise((resolve) => {
  const check = () => {
    if (window.gapi && window.google) resolve();
    else setTimeout(check, 200);
  };
  check();
});

// ── Init GAPI client ───────────────────────────────────────────────────────
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

// ── Sign in ────────────────────────────────────────────────────────────────
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

// ── Sign out ───────────────────────────────────────────────────────────────
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
  const rows = (res.result.values || []).slice(1); // skip header row
  return rows.map(rowToSession);
};

// ── Append a new row (Plug In) ─────────────────────────────────────────────
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

// ── Update a specific row by index (0-based, excluding header) ─────────────
// rowIndex 0 = row 2 in sheet (row 1 is header)
export const updateRow = async (rowIndex, session) => {
  await signIn();
  const sheetRow = rowIndex + 2; // +1 for header, +1 for 1-based index
  const range = `${TAB_NAME}!A${sheetRow}:J${sheetRow}`;
  await window.gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'RAW',
    resource: { values: [sessionToRow(session)] },
  });
};

// ── Row ↔ Session converters ───────────────────────────────────────────────
export const rowToSession = (row, idx) => ({
  id:           idx,
  datetime:     row[0] || '',
  odometer:     row[1] !== '' && row[1] != null ? Number(row[1]) : null,
  range_plugin: row[2] !== '' && row[2] != null ? Number(row[2]) : null,
  range_unplug: row[3] !== '' && row[3] != null ? Number(row[3]) : null,
  kwh_added:    row[4] !== '' && row[4] != null ? Number(row[4]) : null,
  kms_added:    row[5] !== '' && row[5] != null ? Number(row[5]) : null,
  kms_driven:   row[6] !== '' && row[6] != null ? Number(row[6]) : null,
  cost_aed:     row[7] !== '' && row[7] != null ? Number(row[7]) : null,
  plugin_ts:    row[8] || null,
  unplug_ts:    row[9] || null,
});

export const sessionToRow = (s) => [
  s.datetime     ?? '',
  s.odometer     ?? '',
  s.range_plugin ?? '',
  s.range_unplug ?? '',
  s.kwh_added    ?? '',
  s.kms_added    ?? '',
  s.kms_driven   ?? '',
  s.cost_aed     ?? '',
  s.plugin_ts    ?? '',
  s.unplug_ts    ?? '',
];
