import { copyFile, mkdir } from "node:fs/promises";

const skills = [
  {
    source: new URL("../../konekt/SKILL.md", import.meta.url),
    target: new URL("../public/skills/konekt/SKILL.md", import.meta.url),
  },
  {
    source: new URL("../../konekt-ui/SKILL.md", import.meta.url),
    target: new URL("../public/skills/konekt-ui/SKILL.md", import.meta.url),
  },
];

await Promise.all(
  skills.map(async ({ source, target }) => {
    await mkdir(new URL(".", target), { recursive: true });
    await copyFile(source, target);
  }),
);
