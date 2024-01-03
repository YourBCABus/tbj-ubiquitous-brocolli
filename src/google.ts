// Modified from https://github.com/googleworkspace/node-samples/blob/main/sheets/quickstart/index.js

import { readFile, writeFile } from 'fs/promises';
import { join as joinPath } from 'path';
import { cwd as currDir } from 'process';

import { authenticate } from '@google-cloud/local-auth';
import { google, sheets_v4 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import EurekaContext from 'eureka';
import GraphQLQuery from 'actions/types';

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = joinPath(currDir(), 'token.json');
const CREDENTIALS_PATH = joinPath(currDir(), 'credentials.json');




const authorize = async (): Promise<OAuth2Client> => {
    let client = await loadSavedCreds();
    if (client) {
        return client;
    }
    client = await authenticate({
        scopes: SCOPES,
        keyfilePath: CREDENTIALS_PATH,
    });
    if (client.credentials) {
        await saveCreds(client);
    }
    return client;
};

const loadSavedCreds = async (): Promise<OAuth2Client | null> => {
    try {
        const content = await readFile(TOKEN_PATH, 'utf-8');
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials) as OAuth2Client;
    } catch (err) {
        return null;
    }
};

const saveCreds = async (client: OAuth2Client) => {
    const content = await readFile(CREDENTIALS_PATH, 'utf-8');
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });
    await writeFile(TOKEN_PATH, payload);
};



export default class SheetContext {
    private constructor(
        private auth: OAuth2Client,
        private sheets: sheets_v4.Sheets,
        private sheetId: string,
    ) {}

    public static async create(sheetId: string): Promise<SheetContext> {
        const auth = await authorize();
        const sheets = google.sheets({ version: 'v4', auth });
        const context = new SheetContext(auth, sheets, sheetId);
        return context;
    }

    public async updateSheetId(eureka: EurekaContext) {
        const res = await eureka.execQuery<GraphQLQuery<{}, { id: string }>>(
            "query GetId { id: currSpreadsheetId }",
            "GetId",
            {}
        );

        if (res.id) this.sheetId = res.id;
    }

    public async getSheetData(): Promise<string[][]> {
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.sheetId,
            majorDimension: "ROWS",
            auth: this.auth,
            valueRenderOption: "UNFORMATTED_VALUE",
            range: "Teachers!A:ZZ"
        });
        const rawValues = response.data.values || [];
        return rawValues.map(row => row.map(String));
    }
}
// export default authorize;

