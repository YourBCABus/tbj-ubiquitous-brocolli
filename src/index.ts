import SheetContext from "./google";

const main = async () => {
    const sheetId = process.env.SHEET_ID;
    if (!sheetId) throw new Error('Missing SHEET_ID env var');
    const sheet = await SheetContext.create(sheetId);

    
    sheet.getSheetData();
};


