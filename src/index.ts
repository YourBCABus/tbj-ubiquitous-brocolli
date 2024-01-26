import { configDotenv } from "dotenv";
import SheetContext from "./google";
import BrocolliState from "./state";

const main = async () => {
    configDotenv();

    const state = await BrocolliState.create();

    // Every 5 seconds, sync the state
    setInterval(async () => await state.sync(), 1000 * 5);
};


main();

