import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "mongoose";
import type { StorageAdapter } from "../../uploads/storage/storage-adapter";
import type { RecipeEntity } from "../repositories/recipe.repository";
import {
  SystemRecipeImageService,
  imageStemFor,
} from "./system-recipe-image.service";

/** Smallest byte sequence `detectImageExtension` accepts as a JPEG. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function directoryWith(files: Record<string, Buffer>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kp-images-"));
  for (const [name, bytes] of Object.entries(files)) {
    await writeFile(join(dir, name), bytes);
  }
  return dir;
}

interface FakeRecipe {
  _id: string;
  name: string;
  imageUrl: string | null;
}

function buildService(recipes: FakeRecipe[]) {
  const updates: { id: string; imageUrl: string }[] = [];
  const saved: string[] = [];

  const model = {
    find: () => ({ exec: () => Promise.resolve(recipes) }),
    updateOne: (filter: { _id: string }, update: { $set: { imageUrl: string } }) => {
      updates.push({ id: filter._id, imageUrl: update.$set.imageUrl });
      return { exec: () => Promise.resolve({ modifiedCount: 1 }) };
    },
  } as unknown as Model<RecipeEntity>;

  const storage: StorageAdapter = {
    save: (key: string) => {
      saved.push(key);
      return Promise.resolve({ key, url: `https://cdn.test/${key}` });
    },
  };

  return {
    service: new SystemRecipeImageService(model, storage),
    updates,
    saved,
  };
}

describe("imageStemFor", () => {
  it("keeps a leading Đ, which a naive fold silently drops", () => {
    // Lower-casing has to happen BEFORE the ASCII fold: otherwise "Đ" survives
    // as a non-ASCII letter, gets stripped, and this dish never finds its photo.
    expect(imageStemFor("Đậu hũ sốt cà chua")).toBe("dau-hu-sot-ca-chua");
  });

  it("folds Vietnamese diacritics to the file-name form", () => {
    expect(imageStemFor("Phở bò")).toBe("pho-bo");
    expect(imageStemFor("Bún chả Hà Nội")).toBe("bun-cha-ha-noi");
    expect(imageStemFor("Cá diêu hồng hấp hành gừng")).toBe(
      "ca-dieu-hong-hap-hanh-gung",
    );
    expect(imageStemFor("Xôi gấc đậu xanh")).toBe("xoi-gac-dau-xanh");
  });

  it("collapses punctuation and trims separators", () => {
    expect(imageStemFor("  Thơm (dứa) — nướng  ")).toBe("thom-dua-nuong");
  });
});

describe("SystemRecipeImageService", () => {
  it("attaches a photo to a recipe that has none", async () => {
    const dir = await directoryWith({ "pho-bo.jpg": JPEG });
    const { service, updates, saved } = buildService([
      { _id: "r1", name: "Phở bò", imageUrl: null },
    ]);

    const result = await service.attachFrom(dir);

    expect(result.attached).toBe(1);
    expect(saved).toEqual(["recipe/system/pho-bo.jpg"]);
    expect(updates).toEqual([
      { id: "r1", imageUrl: "https://cdn.test/recipe/system/pho-bo.jpg" },
    ]);
  });

  it("leaves a curated photo alone unless forced", async () => {
    const dir = await directoryWith({ "pho-bo.jpg": JPEG });
    const curated = [
      { _id: "r1", name: "Phở bò", imageUrl: "https://cdn/admin-upload.jpg" },
    ];

    const first = buildService(curated);
    const skipped = await first.service.attachFrom(dir);
    expect(skipped).toMatchObject({ attached: 0, skipped: 1 });
    expect(first.updates).toHaveLength(0);

    const second = buildService(curated);
    const forced = await second.service.attachFrom(dir, { force: true });
    expect(forced.attached).toBe(1);
  });

  it("reports recipes with no file and files matching no recipe", async () => {
    const dir = await directoryWith({
      "pho-bo.jpg": JPEG,
      "khong-co-mon-nay.jpg": JPEG,
    });
    const { service } = buildService([
      { _id: "r1", name: "Phở bò", imageUrl: null },
      { _id: "r2", name: "Bún chả Hà Nội", imageUrl: null },
    ]);

    const result = await service.attachFrom(dir);

    expect(result.attached).toBe(1);
    expect(result.missing).toEqual(["Bún chả Hà Nội"]);
    expect(result.unmatched).toEqual(["khong-co-mon-nay"]);
  });

  it("refuses a file whose bytes are not an image", async () => {
    // The name says .jpg; the bytes say otherwise. Storing it under an image
    // key would serve a non-image to every client.
    const dir = await directoryWith({
      "pho-bo.jpg": Buffer.from("<html>not an image</html>"),
    });
    const { service, saved } = buildService([
      { _id: "r1", name: "Phở bò", imageUrl: null },
    ]);

    const result = await service.attachFrom(dir);

    expect(result.attached).toBe(0);
    expect(saved).toHaveLength(0);
  });
});
