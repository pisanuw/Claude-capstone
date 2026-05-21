#!/usr/bin/env node
/**
 * Config-driven deploy runner.
 *
 * Reads deploy/target.yml and provisions + deploys the app to the chosen host
 * (Render or Netlify), creating the project if it does not exist yet. Intended
 * to run inside the GitHub Actions "deploy" workflow, where the provider tokens
 * are present as environment variables sourced from GitHub repo secrets.
 *
 * No secret ever appears in this file or in target.yml. Tokens are read from
 * the environment only:
 *   - Render:  RENDER_API_KEY
 *   - Netlify: NETLIFY_AUTH_TOKEN
 *
 * Usage:
 *   node deploy.mjs                 # real deploy
 *   node deploy.mjs --dry-run       # print the plan, make no API calls
 *   node deploy.mjs --config path   # use a different control file
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, execSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const configPath = readFlag('--config') ?? defaultConfigPath();

function readFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : undefined;
}

function defaultConfigPath() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, 'target.yml');
}

function log(...m) {
  console.log('[deploy]', ...m);
}

/** Emit a GitHub Actions error annotation (readable via the API, unlike logs). */
function ghError(message) {
  const escaped = String(message)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  console.log(`::error title=deploy::${escaped}`);
}

function fail(message) {
  ghError(message);
  console.error('[deploy] ERROR:', message);
  process.exit(1);
}

/** Load and validate the control file. */
function loadConfig() {
  let raw;
  try {
    raw = readFileSync(configPath, 'utf8');
  } catch {
    fail(`Could not read control file at ${configPath}`);
  }
  const cfg = parse(raw) ?? {};

  if (!['render', 'netlify'].includes(cfg.provider)) {
    fail(`"provider" must be "render" or "netlify" (got: ${JSON.stringify(cfg.provider)})`);
  }
  for (const field of ['projectName', 'directory']) {
    if (!cfg[field] || typeof cfg[field] !== 'string') {
      fail(`"${field}" is required and must be a string`);
    }
  }
  cfg.envPassthrough = Array.isArray(cfg.envPassthrough) ? cfg.envPassthrough : [];
  return cfg;
}

/** Collect the env vars named in envPassthrough that are actually set. */
function collectEnv(cfg) {
  const out = {};
  for (const name of cfg.envPassthrough) {
    const value = process.env[name];
    if (value && value.length > 0) out[name] = value;
    else log(`note: passthrough env "${name}" is not set; skipping it`);
  }
  return out;
}

/** Best-effort https repo URL from the local git remote. */
function gitRemoteUrl() {
  try {
    const url = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
    }).trim();
    return url
      .replace(/^git@github\.com:/, 'https://github.com/')
      .replace(/\/\/[^@/]+@/, '//') // strip any embedded user:token@ credentials
      .replace(/\.git$/, '');
  } catch {
    return '';
  }
}

// --------------------------------------------------------------------------
// Render
// --------------------------------------------------------------------------

const RENDER_API = 'https://api.render.com/v1';

async function renderFetch(token, route, init = {}) {
  const res = await fetch(`${RENDER_API}${route}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`Render API ${route} -> HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return body;
}

async function deployRender(cfg) {
  const token = process.env.RENDER_API_KEY;
  const r = cfg.render ?? {};
  const repo = r.repo || cfg.repo || gitRemoteUrl();
  const envVars = Object.entries(collectEnv(cfg)).map(([key, value]) => ({ key, value }));

  const plan = {
    action: 'create-if-missing then deploy',
    name: cfg.projectName,
    type: 'web_service',
    repo,
    branch: r.branch ?? 'main',
    rootDir: cfg.directory,
    region: r.region ?? 'oregon',
    servicePlan: r.plan ?? 'free',
    buildCommand: cfg.build,
    startCommand: r.startCommand ?? 'npm start',
    healthCheckPath: r.healthCheckPath ?? '/api/health',
    envVarsForwarded: envVars.map((e) => e.key),
  };
  log('Render plan:\n' + JSON.stringify(plan, null, 2));

  if (DRY_RUN) {
    log('dry-run: no Render API calls made.');
    return;
  }
  if (!token) fail('RENDER_API_KEY is not set in the environment.');
  if (!repo) fail('Could not determine the repo URL; set render.repo in target.yml.');

  // Resolve the owning workspace.
  let ownerId = r.ownerId;
  if (!ownerId) {
    const owners = await renderFetch(token, '/owners?limit=1');
    ownerId = owners?.[0]?.owner?.id;
    if (!ownerId) fail('Could not resolve a Render workspace (ownerId). Set render.ownerId.');
    log(`Using Render workspace ${ownerId}`);
  }

  // Find an existing service by name.
  const existing = await renderFetch(
    token,
    `/services?name=${encodeURIComponent(cfg.projectName)}&type=web_service&limit=1`,
  );
  const found = existing?.[0]?.service;

  if (found) {
    log(`Service "${cfg.projectName}" exists (${found.id}); triggering a deploy.`);
    const deploy = await renderFetch(token, `/services/${found.id}/deploys`, {
      method: 'POST',
      body: JSON.stringify({ clearCache: 'do_not_clear' }),
    });
    log(`Deploy triggered: ${deploy?.id ?? '(no id)'} status=${deploy?.status ?? 'queued'}`);
    return;
  }

  log(`Service "${cfg.projectName}" not found; creating it.`);
  const created = await renderFetch(token, '/services', {
    method: 'POST',
    body: JSON.stringify({
      type: 'web_service',
      name: cfg.projectName,
      ownerId,
      repo,
      branch: r.branch ?? 'main',
      autoDeploy: 'yes',
      rootDir: cfg.directory,
      envVars,
      serviceDetails: {
        env: r.runtime ?? 'node',
        region: r.region ?? 'oregon',
        plan: r.plan ?? 'free',
        healthCheckPath: r.healthCheckPath ?? '/api/health',
        envSpecificDetails: {
          buildCommand: cfg.build,
          startCommand: r.startCommand ?? 'npm start',
        },
      },
    }),
  });
  const svc = created?.service ?? created;
  log(`Created service ${svc?.id ?? '(unknown id)'}. Render will build and deploy it.`);
  if (svc?.serviceDetails?.url) log(`URL: ${svc.serviceDetails.url}`);
}

// --------------------------------------------------------------------------
// Netlify
// --------------------------------------------------------------------------

function netlify(argv, opts = {}) {
  try {
    return execFileSync('npx', ['--yes', 'netlify-cli@latest', ...argv], {
      encoding: 'utf8',
      // Capture stderr always so failures carry the real CLI message; stream
      // stdout to the log unless the caller needs to parse it.
      stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'pipe'],
      cwd: opts.cwd ?? process.cwd(),
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const detail = [e.stdout, e.stderr]
      .filter(Boolean)
      .map(String)
      .join('\n')
      .trim()
      .slice(-1800);
    throw new Error(`netlify ${argv.join(' ')} failed.\n${detail || e.message}`);
  }
}

/** Run the configured build command inside the app directory. */
function runBuild(cfg, appDir) {
  log(`Building in ${appDir}: ${cfg.build}`);
  execSync(cfg.build, { cwd: appDir, stdio: 'inherit', env: process.env });
}

async function deployNetlify(cfg) {
  const n = cfg.netlify ?? {};
  const appDir = path.resolve(process.cwd(), cfg.directory);
  const publishDir = path.resolve(appDir, cfg.publish ?? 'client/dist');
  const functionsDir = path.resolve(appDir, n.functionsDir ?? 'netlify/functions');
  const env = collectEnv(cfg);

  const plan = {
    action: 'build, create-if-missing, set env, deploy --prod',
    name: cfg.projectName,
    siteName: n.siteName || cfg.projectName,
    siteId: n.siteId || process.env.NETLIFY_SITE_ID || '(resolve by name)',
    build: cfg.build,
    publishDir,
    functionsDir,
    accountSlug: n.accountSlug || '(default team)',
    envVarsForwarded: Object.keys(env),
  };
  log('Netlify plan:\n' + JSON.stringify(plan, null, 2));

  if (DRY_RUN) {
    log('dry-run: no build and no Netlify CLI calls made.');
    return;
  }
  if (!process.env.NETLIFY_AUTH_TOKEN) fail('NETLIFY_AUTH_TOKEN is not set in the environment.');

  // Netlify site subdomains are GLOBALLY unique, so the site name often needs
  // to differ from the (Render) projectName. Prefer an explicit id when given.
  const siteName = n.siteName || cfg.projectName;

  try {
    log('Netlify CLI version:', netlify(['--version'], { capture: true }).trim());
  } catch {
    /* non-fatal diagnostic */
  }

  // Netlify uploads a prebuilt directory, so build locally first.
  runBuild(cfg, appDir);

  // Resolve the site id, in order of reliability:
  //   1. netlify.siteId in target.yml   2. NETLIFY_SITE_ID env
  //   3. lookup an existing site by name 4. create a new site by name
  let siteId = n.siteId || process.env.NETLIFY_SITE_ID || '';
  if (siteId) log(`Using configured Netlify site id ${siteId}`);

  if (!siteId) {
    try {
      const sitesJson = netlify(['api', 'listSites', '--data', '{}'], { capture: true });
      const sites = JSON.parse(sitesJson || '[]');
      siteId = sites.find((s) => s.name === siteName)?.id ?? '';
      if (siteId) log(`Found existing site "${siteName}" (${siteId}).`);
    } catch (e) {
      log('Could not list sites (will try to create):', String(e).slice(0, 160));
    }
  }

  if (!siteId) {
    log(`Creating Netlify site "${siteName}".`);
    const createArgs = ['sites:create', '--name', siteName, '--json'];
    if (n.accountSlug) createArgs.push('--account-slug', n.accountSlug);
    let created = '';
    try {
      created = netlify(createArgs, { capture: true });
    } catch (e) {
      fail(
        `Creating site "${siteName}" failed. The name may be taken globally on Netlify, ` +
          `or your token may have multiple teams. Fix options: set netlify.siteName to a ` +
          `unique value, set netlify.accountSlug, or create the site once and set ` +
          `netlify.siteId in target.yml. Underlying error: ${String(e).slice(0, 200)}`,
      );
    }
    // sites:create --json prints the created site as JSON; fall back to text.
    try {
      const obj = JSON.parse(created);
      siteId = obj.site_id || obj.id || '';
    } catch {
      siteId = created.match(/Site ID:\s*([a-f0-9-]+)/i)?.[1] ?? '';
    }
    if (!siteId) fail('Created the site but could not determine its Site ID.');
    log(`Created site ${siteId}.`);
  }

  // Forward environment variables to the site (for the serverless function).
  for (const [key, value] of Object.entries(env)) {
    log(`Setting Netlify env ${key}`);
    netlify(['env:set', key, value, '--site', siteId], { cwd: appDir });
  }

  // Deploy to production. Run from appDir so netlify.toml (redirects) is read;
  // pass absolute dir/functions so path resolution is unambiguous.
  netlify(
    ['deploy', '--prod', '--site', siteId, '--dir', publishDir, '--functions', functionsDir],
    { cwd: appDir },
  );
  log('Netlify production deploy complete.');
}

// --------------------------------------------------------------------------

async function main() {
  const cfg = loadConfig();
  log(`Provider: ${cfg.provider} | Project: ${cfg.projectName} | Dry run: ${DRY_RUN}`);
  if (cfg.provider === 'render') await deployRender(cfg);
  else await deployNetlify(cfg);
  log('Done.');
}

main().catch((err) => fail(err?.stack || String(err)));
