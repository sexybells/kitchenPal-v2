import { MongoMemoryReplSet, MongoMemoryServer } from "mongodb-memory-server";

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

/**
 * Like {@link startInMemoryMongo} but boots a single-node replica set, which is
 * required for MongoDB multi-document transactions. Suites that exercise the
 * transactional consume/cook paths use this; others stay on the standalone.
 */
export async function startInMemoryReplSet(): Promise<MongoMemoryReplSet> {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri();
  return replSet;
}
