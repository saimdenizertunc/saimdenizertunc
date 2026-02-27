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

const queryUser = `
query($login: String!) {
  user(login: $login) { createdAt }
}
`;

const queryRange = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { totalContributions }
    }
  }
}
`;

// last 12 months
const last12Data = await graphql(queryRange, {
  login: LOGIN,
  from: iso(oneYearAgo),
  to: iso(now),
});
const last12 = last12Data.user.contributionsCollection.contributionCalendar.totalContributions;

// all-time (sum year-by-year from account creation)
const userData = await graphql(queryUser, { login: LOGIN });
const createdAt = new Date(userData.user.createdAt);
const startYear = createdAt.getUTCFullYear();
const currentYear = now.getUTCFullYear();

let allTime = 0;
for (let y = startYear; y <= currentYear; y++) {
  const from = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
  const to = y === currentYear ? now : new Date(Date.UTC(y + 1, 0, 1, 0, 0, 0));

  const yearData = await graphql(queryRange, {
    login: LOGIN,
    from: iso(from),
    to: iso(to),
  });

  allTime += yearData.user.contributionsCollection.contributionCalendar.totalContributions;
}

const updated = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

const body = [
  `**All time:** ${formatInt(allTime)} contributions`,
  `**Last 12 months:** ${formatInt(last12)} contributions`,
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
