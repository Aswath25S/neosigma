// Builds the seed list: tries likely board tokens for each candidate company
// on Ashby, Greenhouse and Lever, keeps the boards that exist, and counts
// postings whose titles match the stage-1 lists (US/remote only). Output goes
// to data/seed_probe.json for review before it is written to sources.csv.
//
//   npx tsx scripts/probe-seeds.ts            (first batch)
//   npx tsx scripts/probe-seeds.ts --extra    (second batch, merged)

import fs from "node:fs";
import { fetchAshby, fetchGreenhouse, fetchLever } from "../src/lib/fetchers/boards";
import type { Ats, RawPosting, Segment, Source } from "../src/lib/fetchers/types";
import { ageInDays, locationInScope, matchTitle } from "../src/lib/filters";

type Cand = [name: string, domain: string, segment: Segment, tokens: string[]];

const CANDIDATES: Cand[] = [
  // agent_native
  ["Sierra", "sierra.ai", "agent_native", ["sierra"]],
  ["Decagon", "decagon.ai", "agent_native", ["decagon"]],
  ["Fin (Intercom)", "intercom.com", "agent_native", ["intercom"]],
  ["Ada", "ada.cx", "agent_native", ["ada", "ada18", "adasupport"]],
  ["Cresta", "cresta.com", "agent_native", ["cresta"]],
  ["Parloa", "parloa.com", "agent_native", ["parloa"]],
  ["PolyAI", "poly.ai", "agent_native", ["polyai"]],
  ["Retell AI", "retellai.com", "agent_native", ["retellai", "retell-ai", "retell"]],
  ["Bland AI", "bland.ai", "agent_native", ["bland", "blandai"]],
  ["Vapi", "vapi.ai", "agent_native", ["vapi"]],
  ["Synthflow", "synthflow.ai", "agent_native", ["synthflow"]],
  ["ElevenLabs", "elevenlabs.io", "agent_native", ["elevenlabs"]],
  ["Cognition", "cognition.ai", "agent_native", ["cognition"]],
  ["Replit", "replit.com", "agent_native", ["replit"]],
  ["Cursor (Anysphere)", "cursor.com", "agent_native", ["cursor", "anysphere"]],
  ["Factory", "factory.ai", "agent_native", ["factory", "factoryai"]],
  ["Lindy", "lindy.ai", "agent_native", ["lindy"]],
  ["11x", "11x.ai", "agent_native", ["11x"]],
  ["Artisan", "artisan.co", "agent_native", ["artisan"]],
  ["Mercor", "mercor.com", "agent_native", ["mercor"]],
  ["Crescendo", "crescendo.ai", "agent_native", ["crescendo"]],
  ["Maven AGI", "mavenagi.com", "agent_native", ["mavenagi", "maven-agi"]],
  ["Siena AI", "siena.cx", "agent_native", ["siena", "sienaai"]],
  ["Giga", "giga.ai", "agent_native", ["gigaml", "giga"]],
  ["Forethought", "forethought.ai", "agent_native", ["forethought"]],
  ["Observe.AI", "observe.ai", "agent_native", ["observeai", "observe-ai"]],
  ["ASAPP", "asapp.com", "agent_native", ["asapp"]],
  ["Perplexity", "perplexity.ai", "agent_native", ["perplexity", "perplexityai"]],
  ["You.com", "you.com", "agent_native", ["you", "youcom"]],
  ["Hume AI", "hume.ai", "agent_native", ["humeai", "hume"]],
  ["Gorgias", "gorgias.com", "agent_native", ["gorgias"]],
  ["Assembled", "assembled.com", "agent_native", ["assembled"]],
  ["Micro1", "micro1.ai", "agent_native", ["micro1"]],
  ["HeyMilo", "heymilo.ai", "agent_native", ["heymilo"]],
  ["Paradox", "paradox.ai", "agent_native", ["paradox"]],
  ["Character.AI", "character.ai", "agent_native", ["character", "characterai"]],
  ["Hippocratic AI", "hippocraticai.com", "vertical_ai", ["hippocraticai", "hippocratic-ai", "hippocratic"]],
  ["Glean", "glean.com", "agent_native", ["gleanwork", "glean"]],
  ["Writer", "writer.com", "agent_platform", ["writer"]],
  ["Jasper", "jasper.ai", "saas_copilot", ["jasper", "jasperai"]],
  ["Harvey", "harvey.ai", "vertical_ai", ["harvey"]],
  ["EvenUp", "evenuplaw.com", "vertical_ai", ["evenup"]],
  ["Spellbook", "spellbook.legal", "vertical_ai", ["spellbook"]],
  ["Legora", "legora.com", "vertical_ai", ["legora"]],
  ["Eudia", "eudia.com", "vertical_ai", ["eudia"]],
  ["Clio", "clio.com", "vertical_ai", ["clio"]],
  ["Abridge", "abridge.com", "vertical_ai", ["abridge"]],
  ["Ambience Healthcare", "ambiencehealthcare.com", "vertical_ai", ["ambiencehealthcare", "ambience"]],
  ["Suki", "suki.ai", "vertical_ai", ["suki", "sukiai"]],
  ["Tennr", "tennr.com", "vertical_ai", ["tennr"]],
  ["Infinitus", "infinitus.ai", "vertical_ai", ["infinitus", "infinitussystems"]],
  ["Assort Health", "assorthealth.com", "vertical_ai", ["assorthealth", "assort"]],
  ["Hebbia", "hebbia.ai", "vertical_ai", ["hebbia"]],
  ["Rogo", "rogo.ai", "vertical_ai", ["rogo"]],
  ["AlphaSense", "alpha-sense.com", "vertical_ai", ["alphasense"]],
  ["Norm Ai", "norm.ai", "vertical_ai", ["normai", "norm-ai"]],
  ["Basis", "getbasis.ai", "vertical_ai", ["basis", "basisai"]],
  ["Hyperbound", "hyperbound.ai", "agent_native", ["hyperbound"]],
  ["Commure", "commure.com", "vertical_ai", ["commure"]],
  ["Nabla", "nabla.com", "vertical_ai", ["nabla"]],
  ["Sword Health", "swordhealth.com", "vertical_ai", ["swordhealth", "sword-health"]],
  ["Hinge Health", "hingehealth.com", "vertical_ai", ["hingehealth"]],
  ["Lemonade", "lemonade.com", "vertical_ai", ["lemonade"]],
  ["Corgi", "corgi.insure", "vertical_ai", ["corgi"]],
  ["Pilot", "pilot.com", "vertical_ai", ["pilot"]],
  ["Truebill / Rocket Money", "rocketmoney.com", "enterprise_cx", ["rocketmoney"]],
  ["Cleo", "meetcleo.com", "vertical_ai", ["cleo", "meetcleo"]],
  ["Klarna", "klarna.com", "enterprise_cx", ["klarna"]],
  ["Wealthsimple", "wealthsimple.com", "enterprise_cx", ["wealthsimple"]],
  // agent_platform
  ["Kore.ai", "kore.ai", "agent_platform", ["koreai", "kore"]],
  ["Moveworks", "moveworks.com", "agent_platform", ["moveworks"]],
  ["Aisera", "aisera.com", "agent_platform", ["aisera"]],
  ["Yellow.ai", "yellow.ai", "agent_platform", ["yellowai"]],
  ["Relevance AI", "relevanceai.com", "agent_platform", ["relevanceai", "relevance-ai"]],
  ["CrewAI", "crewai.com", "agent_platform", ["crewai"]],
  ["Dust", "dust.tt", "agent_platform", ["dust"]],
  ["Distyl AI", "distyl.ai", "agent_platform", ["distyl", "distylai"]],
  ["Sana", "sana.ai", "agent_platform", ["sana", "sanalabs"]],
  ["Cohere", "cohere.com", "agent_platform", ["cohere"]],
  ["Contextual AI", "contextual.ai", "agent_platform", ["contextualai", "contextual"]],
  ["Writer", "writer.com", "agent_platform", ["writerinc"]],
  ["Tines", "tines.com", "agent_platform", ["tines"]],
  ["Zapier", "zapier.com", "saas_copilot", ["zapier"]],
  ["n8n", "n8n.io", "agent_platform", ["n8n"]],
  ["Retool", "retool.com", "agent_platform", ["retool"]],
  ["Vercel", "vercel.com", "agent_platform", ["vercel"]],
  ["Clay", "clay.com", "saas_copilot", ["claylabs", "clay"]],
  ["Unify", "unifygtm.com", "agent_native", ["unify", "unifygtm"]],
  ["Qualified", "qualified.com", "agent_native", ["qualified"]],
  ["Regal", "regal.ai", "agent_native", ["regal", "regalvoice"]],
  ["Talkdesk", "talkdesk.com", "agent_platform", ["talkdesk"]],
  ["Dialpad", "dialpad.com", "saas_copilot", ["dialpad"]],
  ["Gong", "gong.io", "saas_copilot", ["gong", "gongio"]],
  ["Outreach", "outreach.io", "saas_copilot", ["outreach"]],
  // saas_copilot
  ["Notion", "notion.so", "saas_copilot", ["notion"]],
  ["Airtable", "airtable.com", "saas_copilot", ["airtable"]],
  ["Figma", "figma.com", "saas_copilot", ["figma"]],
  ["Grammarly", "grammarly.com", "saas_copilot", ["grammarly"]],
  ["Duolingo", "duolingo.com", "saas_copilot", ["duolingo"]],
  ["Asana", "asana.com", "saas_copilot", ["asana"]],
  ["Miro", "miro.com", "saas_copilot", ["miro", "realtimeboardglobal"]],
  ["Webflow", "webflow.com", "saas_copilot", ["webflow"]],
  ["Canva", "canva.com", "saas_copilot", ["canva"]],
  ["Linear", "linear.app", "saas_copilot", ["linear"]],
  ["Ramp", "ramp.com", "saas_copilot", ["ramp"]],
  ["Brex", "brex.com", "saas_copilot", ["brex"]],
  ["Mercury", "mercury.com", "saas_copilot", ["mercury"]],
  ["Rippling", "rippling.com", "saas_copilot", ["rippling"]],
  ["Gusto", "gusto.com", "saas_copilot", ["gusto"]],
  ["Deel", "deel.com", "saas_copilot", ["deel"]],
  ["HubSpot", "hubspot.com", "saas_copilot", ["hubspot", "hubspotjobs"]],
  ["Dropbox", "dropbox.com", "saas_copilot", ["dropbox"]],
  ["Box", "box.com", "saas_copilot", ["boxinc", "box"]],
  ["Atlassian", "atlassian.com", "saas_copilot", ["atlassian"]],
  ["Zendesk", "zendesk.com", "saas_copilot", ["zendesk"]],
  ["Freshworks", "freshworks.com", "saas_copilot", ["freshworks"]],
  ["Sprinklr", "sprinklr.com", "saas_copilot", ["sprinklr"]],
  ["Superhuman", "superhuman.com", "saas_copilot", ["superhuman"]],
  ["Attio", "attio.com", "saas_copilot", ["attio"]],
  ["Sourcegraph", "sourcegraph.com", "agent_native", ["sourcegraph", "sourcegraph91"]],
  ["GitLab", "gitlab.com", "saas_copilot", ["gitlab"]],
  // enterprise_cx
  ["Instacart", "instacart.com", "enterprise_cx", ["instacart"]],
  ["DoorDash", "doordash.com", "enterprise_cx", ["doordash", "doordashusa"]],
  ["Lyft", "lyft.com", "enterprise_cx", ["lyft"]],
  ["Airbnb", "airbnb.com", "enterprise_cx", ["airbnb"]],
  ["Robinhood", "robinhood.com", "enterprise_cx", ["robinhood"]],
  ["Chime", "chime.com", "enterprise_cx", ["chime"]],
  ["Coinbase", "coinbase.com", "enterprise_cx", ["coinbase"]],
  ["SoFi", "sofi.com", "enterprise_cx", ["sofi"]],
  ["Affirm", "affirm.com", "enterprise_cx", ["affirm"]],
  ["Discord", "discord.com", "enterprise_cx", ["discord"]],
  ["Reddit", "reddit.com", "enterprise_cx", ["reddit"]],
  ["Pinterest", "pinterest.com", "enterprise_cx", ["pinterest"]],
  ["Spotify", "spotify.com", "enterprise_cx", ["spotify"]],
  ["Peloton", "onepeloton.com", "enterprise_cx", ["peloton"]],
  ["Oscar Health", "hioscar.com", "enterprise_cx", ["oscar"]],
  ["Thumbtack", "thumbtack.com", "enterprise_cx", ["thumbtack"]],
  ["Faire", "faire.com", "enterprise_cx", ["faire"]],
  ["Turo", "turo.com", "enterprise_cx", ["turo"]],
  ["Nubank", "nubank.com.br", "enterprise_cx", ["nubank"]],
  ["Toast", "toasttab.com", "enterprise_cx", ["toast"]],
  ["Zillow", "zillow.com", "enterprise_cx", ["zillow"]],
  ["Navan", "navan.com", "enterprise_cx", ["navan", "tripactions"]],
];

// Second batch, probed with --extra and merged into the existing output.
const EXTRA: Cand[] = [
  ["Cartesia", "cartesia.ai", "agent_native", ["cartesia"]],
  ["Deepgram", "deepgram.com", "agent_native", ["deepgram"]],
  ["Rasa", "rasa.com", "agent_platform", ["rasa"]],
  ["Pylon", "usepylon.com", "agent_native", ["pylon", "usepylon"]],
  ["Plain", "plain.com", "agent_native", ["plain"]],
  ["Tavus", "tavus.io", "agent_native", ["tavus"]],
  ["Netomi", "netomi.com", "agent_native", ["netomi"]],
  ["Level AI", "thelevel.ai", "agent_native", ["levelai", "thelevelai"]],
  ["Uniphore", "uniphore.com", "agent_platform", ["uniphore"]],
  ["Replicant", "replicant.com", "agent_native", ["replicant"]],
  ["Kustomer", "kustomer.com", "saas_copilot", ["kustomer"]],
  ["Front", "front.com", "saas_copilot", ["front", "frontapp"]],
  ["Ironclad", "ironcladapp.com", "vertical_ai", ["ironclad", "ironcladhq"]],
  ["Robin AI", "robinai.com", "vertical_ai", ["robinai"]],
  ["Luminance", "luminance.com", "vertical_ai", ["luminance"]],
  ["Typeface", "typeface.ai", "saas_copilot", ["typeface"]],
  ["Ema", "ema.co", "agent_platform", ["ema", "emaunlimited"]],
  ["Cognigy", "cognigy.com", "agent_platform", ["cognigy"]],
  ["Speak", "speak.com", "agent_native", ["speak"]],
  ["Hex", "hex.tech", "saas_copilot", ["hex"]],
  ["Sardine", "sardine.ai", "vertical_ai", ["sardine"]],
  ["Fieldguide", "fieldguide.io", "vertical_ai", ["fieldguide"]],
  ["Hippocratic AI", "hippocraticai.com", "vertical_ai", ["hippocratic-ai-inc", "hippocraticaiinc"]],
  ["EvenUp", "evenuplaw.com", "vertical_ai", ["evenuplaw", "evenup-law"]],
  ["Hebbia", "hebbia.ai", "vertical_ai", ["hebbia-ai", "hebbiaai"]],
  ["Moveworks", "moveworks.com", "agent_platform", ["moveworksinc"]],
  ["Ambient.ai", "ambient.ai", "agent_native", ["ambientai"]],
  ["Zip", "ziphq.com", "saas_copilot", ["zip", "ziphq"]],
  ["Sola", "sola.ai", "agent_native", ["sola", "solasolutions"]],
  ["Anterior", "anterior.com", "vertical_ai", ["anterior"]],
  ["Thoughtful AI", "thoughtful.ai", "vertical_ai", ["thoughtful", "thoughtfulai"]],
  ["Cohere Health", "coherehealth.com", "vertical_ai", ["coherehealth"]],
  ["Ironclad", "ironcladapp.com", "vertical_ai", ["ironcladapp"]],
  ["Fireflies", "fireflies.ai", "saas_copilot", ["fireflies", "firefliesai"]],
  ["Otter.ai", "otter.ai", "saas_copilot", ["otter", "otterai"]],
  ["Gamma", "gamma.app", "saas_copilot", ["gamma"]],
  ["Lovable", "lovable.dev", "agent_native", ["lovable"]],
  ["Bolt (StackBlitz)", "bolt.new", "agent_native", ["stackblitz"]],
  ["Imbue", "imbue.com", "agent_native", ["imbue"]],
  ["Hightouch", "hightouch.com", "saas_copilot", ["hightouch"]],
];

const FETCHERS: Record<"ashby" | "greenhouse" | "lever", (s: Source) => Promise<RawPosting[]>> = {
  ashby: fetchAshby,
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
};

interface Found {
  company: string; domain: string; segment: Segment; ats: Ats; token: string;
  jobs: number; inScope: number; recent: number;
  matches: { title: string; list: string; ageDays: number | null; location: string }[];
}

async function probe(c: Cand): Promise<Found | null> {
  const [company, domain, segment, tokens] = c;
  for (const token of tokens) {
    // Try all three hosts at once; politeFetch spaces requests per host.
    const results = await Promise.all(
      (Object.keys(FETCHERS) as (keyof typeof FETCHERS)[]).map(async (ats) => {
        try {
          const src: Source = { company, domain, ats, board_token: token, segment, employee_band: "", size_source_url: "" };
          return { ats, jobs: await FETCHERS[ats](src) };
        } catch {
          return { ats, jobs: [] as RawPosting[] };
        }
      }),
    );
    const best = results.sort((a, b) => b.jobs.length - a.jobs.length)[0];
    if (best.jobs.length > 0) {
      const inScope = best.jobs.filter((j) => locationInScope(j.locations, j.remote));
      const matches = inScope
        .map((j) => ({ j, m: matchTitle(j.title) }))
        .filter(({ m }) => m.list !== "none")
        .map(({ j, m }) => ({
          title: j.title, list: m.list, ageDays: ageInDays(j.postedAt) && Math.round(ageInDays(j.postedAt)!),
          location: j.locations.join(" / "),
        }));
      return {
        company, domain, segment, ats: best.ats, token, jobs: best.jobs.length, inScope: inScope.length,
        recent: inScope.filter((j) => (ageInDays(j.postedAt) ?? 0) <= 60).length, matches,
      };
    }
  }
  return null;
}

async function main() {
  const extra = process.argv.includes("--extra");
  const prev = extra && fs.existsSync("data/seed_probe.json")
    ? JSON.parse(fs.readFileSync("data/seed_probe.json", "utf8"))
    : { found: [], missing: [] };
  const out: Found[] = prev.found;
  const missing: string[] = prev.missing;
  const queue = [...(extra ? EXTRA : CANDIDATES)];
  // Several companies in flight; per-host spacing is enforced in politeFetch.
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const c = queue.shift()!;
      const f = await probe(c);
      if (f) {
        if (out.some((o) => o.ats === f.ats && o.token === f.token)) continue;
        out.push(f);
        const i = missing.indexOf(f.company);
        if (i >= 0) missing.splice(i, 1);
        const kc = f.matches.filter((m) => m.list === "keep" || m.list === "conditional").length;
        console.log(`✓ ${f.company} ${f.ats}/${f.token} jobs=${f.jobs} inScope=${f.inScope} keep/cond=${kc} ambiguous=${f.matches.length - kc}`);
      } else {
        missing.push(c[0]);
        console.log(`✗ ${c[0]}`);
      }
    }
  }));
  fs.writeFileSync("data/seed_probe.json", JSON.stringify({ found: out, missing }, null, 2));
  console.log(`\nfound ${out.length}, missing ${missing.length}`);
}

main();
