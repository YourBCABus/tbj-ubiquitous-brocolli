import { configDotenv } from "dotenv";
import BrocolliState from "./logic/state";
import TimingCtx from "./meta/timing";
import Logger from "./meta/logging";
import setupExpressServer from "./server";

const main = async () => {
    configDotenv();

    console.log("Starting Brocolli...");

    const logger = new Logger();

    const state = await BrocolliState.create();

    setupExpressServer(
        async () => await state.sync(logger, new TimingCtx(), true),
        async () => {
            await state.lock;
            return state.summary;
        },
        logger,
    );

    // Every 5 seconds, sync the state
    setInterval(async () => {
        try {
            await state.sync(logger, new TimingCtx());
        } catch (e) {
            console.error(e);
        }
    }, 1000 * 10);
};


main();

