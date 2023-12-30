import { configDotenv } from "dotenv";
import SheetContext from "./google";
import BrocolliState from "./state";

const main = async () => {
    configDotenv();

    const sheetId = process.env.SHEET_ID;
    if (!sheetId) throw new Error('Missing SHEET_ID env var');
    const state = await BrocolliState.create(sheetId);

    // Every 5 seconds, sync the state
    setInterval(async () => await state.sync(), 1000 * 5);
};


main();

