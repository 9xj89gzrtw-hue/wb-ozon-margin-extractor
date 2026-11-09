/**
 * Entry point. On Apify it runs as an Actor; locally it is a CLI:
 *
 *   node src/main.js --input examples/input.json --out result.json
 *   node src/main.js --table "товар;цена;закуп" --marketplace wb --max-rows 5
 */
import fs from "node:fs";
import { run } from "./run.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === "--input" && next) { args.input = next; i += 1; }
    else if (key === "--out" && next) { args.out = next; i += 1; }
    else if (key === "--table" && next) { args.tableText = next; i += 1; }
    else if (key === "--table-url" && next) { args.tableUrl = next; i += 1; }
    else if (key === "--marketplace" && next) { args.marketplace = next; i += 1; }
    else if (key === "--max-rows" && next) { args.maxRows = Number(next); i += 1; }
    else if (key === "--no-stress") { args.stressTest1111 = false; }
    else if (key === "--no-offer") { args.includeOffer = false; }
  }
  return args;
}

async function localMain() {
  const args = parseArgs(process.argv);
  const base = args.input ? JSON.parse(fs.readFileSync(args.input, "utf8")) : {};
  const input = { ...base, ...args };
  delete input.input;
  delete input.out;
  const out = [];
  const summary = await run(input, async (row) => out.push(row));
  const payload = JSON.stringify({ summary, items: out }, null, 2);
  if (args.out) fs.writeFileSync(args.out, payload + "\n");
  else process.stdout.write(payload + "\n");
}

async function actorMain() {
  const { Actor } = await import("apify");
  await Actor.init();
  try {
    const input = (await Actor.getInput()) || {};
    const summary = await run(input, (row) => Actor.pushData(row));
    console.log("run summary:", JSON.stringify(summary, null, 2));
    await Actor.setValue("SUMMARY", summary);
  } finally {
    await Actor.exit();
  }
}

const isActor = Boolean(process.env.APIFY_IS_AT_HOME || process.env.ACTOR_ID || process.env.APIFY_TOKEN);
(isActor ? actorMain() : localMain()).catch((err) => {
  console.error(err);
  process.exit(1);
});
