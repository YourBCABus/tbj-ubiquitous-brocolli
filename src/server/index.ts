import { createHash } from 'crypto';
import express from 'express';

const setupExpressServer = (manualConfirm: () => Promise<void>, summary: () => Promise<string>) => {
    const app = express();
    const port = 3000;

    const baseUrl = (process.env.BASE_URL || '/passthrough/broccoli').replace(/\/$/g, '');


    app.get(`${baseUrl}/ping`, (_, res) => {
        res.send('pong');
    });

    app.put(`${baseUrl}/manual-confirm`, async (req, res) => {
        const passedApiKey = req.header('X-Api-Key');
        const actualApiKey = process.env.API_KEY;
        if (!actualApiKey) {
            res.status(500).send('No API key set');
            return;
        }
        if (!passedApiKey) {
            res.status(400).send('No API key');
            return;
        }

        const passedApiKeyHash = createHash('sha256').update(passedApiKey).digest('hex');
        const actualApiKeyHash = createHash('sha256').update(actualApiKey).digest('hex');

        if (passedApiKeyHash !== actualApiKeyHash) {
            res.status(403).send('Invalid API key');
            return;
        }

        try {
            await manualConfirm();
            res.send('confirmed');
        } catch (e) {
            res.status(500).send(String(e));
        }
    });

    app.get(`${baseUrl}/sheet-summary`, async (_, res) => {
        try {
            res.send(await summary());
        } catch (e) {
            res.status(500).send(String(e));
        }
    });

    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
    });
};

export default setupExpressServer;
