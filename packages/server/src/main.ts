import { createApp } from './app.ts';
import { createDependenciesFromEnv } from './composition.ts';
import { startServer } from './server.ts';

const DEFAULT_PORT = 3000;

await startServer(createApp(createDependenciesFromEnv()), DEFAULT_PORT);
