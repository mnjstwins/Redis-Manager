// Imports
import express = require("express");

// Imports middleware
import bodyParser = require('body-parser');
import * as cors from 'cors';
import expressWinston = require('express-winston');

// Imports routes
import { FeaturesRouter } from './routes/features';
import { GroupsRouter } from './routes/groups';
import { ProjectsRouter } from './routes/projects';

// Imports logger
import { logger } from './logger';

// Imports configurations
import { config } from './config';

export class RedisManagerApi {

    constructor(private app: express.Express, private port: number) {

        this.configureMiddleware(app);
        this.configureRoutes(app);
        this.configureErrorHandling(app);
    }

    public getApp(): express.Application {
        return this.app;
    }

    public run() {
        this.app.listen(this.port);
    }

    private configureMiddleware(app: express.Express) {

        // Configure body-parser
        app.use(bodyParser.json());
        app.use(bodyParser.urlencoded({ extended: false }));

        // Configure CORS
        app.use(cors());

        // Configure express-winston
        app.use(expressWinston.logger({
            meta: false,
            msg: 'HTTP Request: {{res.statusCode}} {{req.method}} {{res.responseTime}}ms {{req.url}}',
            winstonInstance: logger,
        }));

    }

    private configureRoutes(app: express.Express) {
        app.use("/api/projects", new ProjectsRouter().GetRouter());
        app.use("/api/features", new FeaturesRouter().GetRouter());
        app.use("/api/groups", new GroupsRouter().GetRouter());
    }

    private configureErrorHandling(app: express.Express) {
        app.use((err: Error, req: express.Request, res: express.Response, next: () => void) => {
            logger.error(err.message);
            if (err.name === 'UnauthorizedError') {
                res.status(401).end();
            } else {
                res.status(500).send(err.message);
            }
        });
    }
}

const port = process.env.PORT | 3000;

const api = new RedisManagerApi(express(), port);
api.run();
logger.info(`Listening on ${port}`);
