import fs from "node:fs";

const LOGIN = process.env.GITHUB_USER || "saimdenizertunc";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

if (!TOKEN) {
  console.error("Missing GITHUB_TOKEN (or GH_TOKEN) env var.");
  process.exit(1);
}

const endpoint = "https://api.github.com/graphql";

async function graphql(query, variables) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL HTTP ${res.status}: ${text}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function iso(d) {
  return d.toISOString();
}

function formatInt(n) {
  return new Intl.NumberFormat("en-US").format(n);
}

function replaceSection(readme, start, end, body) {
  const re = new RegExp(`(${start})([\\s\\S]*?)(${end})`, "m");
  if (!re.test(readme)) {
    throw new Error(`README markers not found: ${start} ... ${end}`);
  }
  return readme.replace(re, `$1\n${body}\n$3`);
}

const now = new Date();
const oneYearAgo = new Date(now);
oneYearAgo.setUTCFullYear(now.getUTCFullYear() - 1);
const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));

const query = `
query($login: String!, $from12: DateTime!, $to12: DateTime!, $fromY: DateTime!, $toY: DateTime!) {
  user(login: $login) {
    last12: contributionsCollection(from: $from12, to: $to12) {
      contributionCalendar { totalContributions }
    }
    ytd: contributionsCollection(from: $fromY, to: $toY) {
      contributionCalendar { totalContributions }
    }
  }
}
`;

const data = await graphql(query, {
  login: LOGIN,
  from12: iso(oneYearAgo),
  to12: iso(now),
  fromY: iso(yearStart),
  toY: iso(now),
});

const last12 = data.user.last12.contributionCalendar.totalContributions;
const ytd = data.user.ytd.contributionCalendar.totalContributions;

const updated = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

const body = [
  `**Last 12 months:** ${formatInt(last12)} contributions`,
  `**Year to date:** ${formatInt(ytd)} contributions`,
  `\n_Last updated: ${updated}_`,
].join("\n");

const readmePath = "README.md";
const readme = fs.readFileSync(readmePath, "utf8");

const updatedReadme = replaceSection(
  readme,
  "<!--START_SECTION:contribs-->",
  "<!--END_SECTION:contribs-->",
  body
);

fs.writeFileSync(readmePath, updatedReadme, "utf8");
console.log("README updated with contribution counts.");
