import { configDotenv } from "dotenv";
import BrocolliState from "./state";

const main = async () => {
    configDotenv();

    console.log("Starting Brocolli...");

    const state = await BrocolliState.create();

    // Every 5 seconds, sync the state
    setInterval(async () => {
        try {
            await state.sync();
        } catch (e) {
            console.error(e);
        }
    }, 1000 * 10);
};


main();

