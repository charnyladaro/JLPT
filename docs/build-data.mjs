// Wraps data/*.json into data/*.js so the app works from file:// (no fetch/CORS).
// Rerun after re-scraping or editing reviewers:  node build-data.mjs
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename } from "path";

const dir = join(import.meta.dirname, "data");
let total = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith(".json")) continue;
  const key = basename(f, ".json");
  const json = readFileSync(join(dir, f), "utf8");
  if (json.includes("</script>")) throw new Error(`${f} contains </script>`);
  const out = `window.JLPT_DATA=window.JLPT_DATA||{};window.JLPT_DATA[${JSON.stringify(key)}]=${json};`;
  writeFileSync(join(dir, key + ".js"), out, "utf8");
  total++;
}
console.log(`wrapped ${total} data files`);
