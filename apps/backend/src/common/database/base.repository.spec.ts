import { ConflictException, NotFoundException } from "@nestjs/common";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose, { Connection, Model, Schema } from "mongoose";
import { BaseRepository, ScopedRepository } from "./base.repository";
import {
  baseSchemaPlugin,
  scopedSchemaPlugin,
  BaseDocumentFields,
  ScopedDocumentFields,
} from "./base.schema";
import type { ScopeContext } from "../scope/scope-context";

interface Widget extends BaseDocumentFields {
  name: string;
  tags?: string[];
  count?: number;
}

interface Note extends ScopedDocumentFields {
  title: string;
}

class WidgetRepository extends BaseRepository<Widget> {
  constructor(model: Model<Widget>) {
    super(model);
  }
}

class NoteRepository extends ScopedRepository<Note> {
  constructor(model: Model<Note>) {
    super(model);
  }
}

describe("BaseRepository (unscoped)", () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let repo: WidgetRepository;
  let model: Model<Widget>;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongo.getUri());
    await connection.asPromise();

    const schema = new Schema<Widget>({
      name: { type: String, required: true },
      tags: { type: [String], default: [] },
      count: { type: Number, default: 0 },
    });
    schema.plugin(baseSchemaPlugin);
    model = connection.model<Widget>("Widget", schema);
    repo = new WidgetRepository(model);
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  describe("soft delete", () => {
    it("excludes soft-deleted documents from reads", async () => {
      const live = await repo.create({ name: "live" });
      const doomed = await repo.create({ name: "doomed" });

      await repo.softDelete(doomed.id);

      const all = await repo.find();
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(live.id);
      expect(await repo.findById(doomed.id)).toBeNull();
      // The document still physically exists, only filtered out.
      expect(await model.countDocuments({})).toBe(2);
    });
  });

  describe("optimistic locking", () => {
    it("bumps version on a matching-version update", async () => {
      const doc = await repo.create({ name: "v0" });
      expect(doc.version).toBe(0);

      const updated = await repo.updateWithVersion(doc.id, 0, { name: "v1" });
      expect(updated.version).toBe(1);
      expect(updated.name).toBe("v1");
    });

    it("throws a 409 conflict on a stale version", async () => {
      const doc = await repo.create({ name: "v0" });
      await repo.updateWithVersion(doc.id, 0, { name: "v1" });

      await expect(
        repo.updateWithVersion(doc.id, 0, { name: "stale" }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws not-found when the document is absent", async () => {
      const missingId = new mongoose.Types.ObjectId().toHexString();
      await expect(
        repo.updateWithVersion(missingId, 0, { name: "x" }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("forwards Mongo update operators alongside the version bump", async () => {
      const doc = await repo.create({ name: "ops", count: 0, tags: [] });

      const updated = await repo.updateWithVersion(doc.id, 0, {
        $inc: { count: 5 },
        $push: { tags: "a" },
      });

      expect(updated.version).toBe(1);
      expect(updated.count).toBe(5);
      expect(updated.tags).toEqual(["a"]);
    });
  });
});

describe("ScopedRepository", () => {
  let mongo: MongoMemoryServer;
  let connection: Connection;
  let repo: NoteRepository;
  let model: Model<Note>;

  const oid = () => new mongoose.Types.ObjectId().toHexString();
  const aliceId = oid();
  const bobId = oid();
  const h1Id = oid();
  const h2Id = oid();

  const alice: ScopeContext = { scope: "personal", userId: aliceId };
  const bob: ScopeContext = { scope: "personal", userId: bobId };
  const house1: ScopeContext = {
    scope: "household",
    userId: aliceId,
    householdId: h1Id,
  };
  const house2: ScopeContext = {
    scope: "household",
    userId: oid(),
    householdId: h2Id,
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    connection = mongoose.createConnection(mongo.getUri());
    await connection.asPromise();

    const schema = new Schema<Note>({ title: { type: String, required: true } });
    schema.plugin(baseSchemaPlugin);
    schema.plugin(scopedSchemaPlugin);
    model = connection.model<Note>("Note", schema);
    repo = new NoteRepository(model);
  });

  afterAll(async () => {
    await connection.close();
    await mongo.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  it("stamps scope, owner, and household from the context on create", async () => {
    const personal = await repo.create(alice, { title: "mine" });
    expect(personal.scope).toBe("personal");
    expect(String(personal.createdBy)).toBe(aliceId);
    expect(personal.householdId).toBeNull();

    const shared = await repo.create(house1, { title: "ours" });
    expect(shared.scope).toBe("household");
    expect(String(shared.householdId)).toBe(h1Id);
  });

  it("never returns another owner's documents on read", async () => {
    await repo.create(alice, { title: "alice-note" });

    expect(await repo.find(alice)).toHaveLength(1);
    expect(await repo.find(bob)).toHaveLength(0);
  });

  it("isolates household reads from other households", async () => {
    const owned = await repo.create(house1, { title: "h1-note" });

    expect(await repo.find(house1)).toHaveLength(1);
    expect(await repo.find(house2)).toHaveLength(0);
    expect(await repo.findById(house2, owned.id)).toBeNull();
  });

  it("blocks writes and deletes across scopes", async () => {
    const note = await repo.create(alice, { title: "alice-note" });

    await expect(
      repo.updateWithVersion(bob, note.id, 0, { title: "hijacked" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await repo.softDelete(bob, note.id)).toBeNull();

    // The document is untouched for its real owner.
    const still = await repo.findById(alice, note.id);
    expect(still?.title).toBe("alice-note");
    expect(still?.version).toBe(0);
  });
});
