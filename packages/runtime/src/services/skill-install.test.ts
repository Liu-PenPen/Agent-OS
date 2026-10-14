import { describe, it, expect } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SkillLibrary, skillNotReadyMessage } from "./skill-install.js";

describe("SkillLibrary", () => {
  it("binds a skill that is already in the user library", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-skill-bind-"));
    const dir = join(home, ".claude", "skills", "grill-me");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "SKILL.md"), "# installed\n", "utf-8");
    let called = false;
    const library = new SkillLibrary({
      install: true,
      home,
      runInstall: async () => {
        called = true;
      },
    });

    const [binding] = await library.ensure(["grill-me"]);
    expect(called).toBe(false);
    expect(binding).toMatchObject({
      id: "grill-me",
      status: "ready",
      localPath: join(dir, "SKILL.md"),
    });
  });

  it("installs owner/repo@skill through the installer", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-skill-add-"));
    const library = new SkillLibrary({
      install: true,
      home,
      runInstall: async (spec) => {
        expect(spec).toBe("acme/skills@my-skill");
        const dir = join(home, ".agents", "skills", "my-skill");
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "SKILL.md"), "# my\n", "utf-8");
      },
    });

    const [binding] = await library.ensure(["acme/skills@my-skill"]);
    expect(binding.status).toBe("ready");
    expect(binding.localPath).toBe(
      join(home, ".agents", "skills", "my-skill", "SKILL.md"),
    );
  });

  it("installs a bundled pipeline skill into the user library", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-skill-bundle-"));
    const library = new SkillLibrary({
      install: true,
      home,
      runInstall: async () => {
        throw new Error("upstream installer should not run");
      },
    });

    const [binding] = await library.ensure(["product-spec"]);
    expect(binding).toMatchObject({
      id: "product-spec",
      source: "bundled:product-spec",
      status: "ready",
    });
    expect(existsSync(binding.localPath ?? "")).toBe(true);
    const again = await library.ensure(["product-spec"]);
    expect(again[0]?.status).toBe("ready");
  });

  it("leaves unknown skills failed and does not invent a file", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-skill-miss-"));
    const library = new SkillLibrary({ install: true, home });
    const [binding] = await library.ensure(["zz-not-a-real-skill"]);
    expect(binding.status).toBe("failed");
    expect(
      existsSync(join(home, ".agents", "skills", "zz-not-a-real-skill")),
    ).toBe(false);
    expect(skillNotReadyMessage([binding])).toContain("zz-not-a-real-skill");
  });

  it("does not install when install is disabled", async () => {
    const home = await mkdtemp(join(tmpdir(), "ml-aos-skill-off-"));
    const library = new SkillLibrary({ install: false, home });
    const [binding] = await library.ensure(["product-spec"]);
    expect(binding.status).toBe("failed");
    expect(
      existsSync(join(home, ".agents", "skills", "product-spec", "SKILL.md")),
    ).toBe(false);
  });
});
