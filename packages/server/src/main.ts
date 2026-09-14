import { createApp } from './app.ts';
import {
  backendDescriptorFromEnv,
  createDependenciesFromEnv,
} from './composition.ts';
import { startServer } from './server.ts';

const DEFAULT_PORT = 3000;

await startServer(
  createApp(createDependenciesFromEnv(), backendDescriptorFromEnv()),
  DEFAULT_PORT,
);
