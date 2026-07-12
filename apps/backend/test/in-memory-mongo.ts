import mongoose from "mongoose";
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
 *
 * A single-node replica set can briefly report a primary before it can actually
 * serve a transactional write, and under the CPU pressure of the full in-band
 * run it can transiently miss its own heartbeats and hold a spurious election.
 * That instability surfaced as rare, order-dependent failures when a suite's
 * first operations (or a concurrent-write test) raced the replica set becoming
 * writable. A generous election timeout removes the spurious step-downs, and the
 * transaction-readiness probe below blocks until the set can actually commit a
 * transaction, so suites never start issuing operations against a not-yet-ready
 * primary.
 */
export async function startInMemoryReplSet(): Promise<MongoMemoryReplSet> {
  const replSet = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
      storageEngine: "wiredTiger",
      // Tolerate missed heartbeats under a loaded event loop so the lone node
      // does not spuriously step down mid-suite.
      configSettings: { electionTimeoutMillis: 60000 },
    },
  });
  const uri = replSet.getUri();
  process.env.MONGODB_URI = uri;
  await waitForTransactionReady(uri);
  return replSet;
}

/**
 * Blocks until the replica set can commit a real multi-document transaction,
 * retrying briefly. This eliminates the cold-start window where the set reports
 * a primary but a transactional write (or a read of a just-committed write) can
 * still fail, which is the source of the rare cross-suite flakiness.
 */
async function waitForTransactionReady(uri: string): Promise<void> {
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    const probe = connection.collection("__readiness_probe");
    const attempts = 40;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const session = await connection.startSession();
        try {
          await session.withTransaction(async () => {
            await probe.insertOne({ at: new Date() }, { session });
            await probe.findOne({}, { session });
          });
        } finally {
          await session.endSession();
        }
        await probe.deleteMany({});
        return;
      } catch (error) {
        if (attempt === attempts) {
          throw error;
        }
        await delay(50);
      }
    }
  } finally {
    await connection.close();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
