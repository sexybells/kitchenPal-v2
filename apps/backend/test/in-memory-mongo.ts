import { MongoMemoryServer } from "mongodb-memory-server";

/**
 * Boots an ephemeral in-memory MongoDB for a test suite and exports its URI via
 * `MONGODB_URI` so the app's config picks it up. Keeps suites hermetic — no
 * external database required.
 */
export async function startInMemoryMongo(): Promise<MongoMemoryServer> {
  const server = await MongoMemoryServer.create();
  process.env.MONGODB_URI = server.getUri();
  return server;
}
