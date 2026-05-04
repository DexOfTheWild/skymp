import fs from 'fs';
import path from 'path';

import { expandDeep } from './expand.js';

export const ADDON_MANIFEST_FILENAME = 'skymp-addon.json';

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAddonId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createPrefixedId(addonId, localId) {
  return `addon-${addonId}-${localId}`;
}

function createAddonProducer(addonDirName) {
  return `skymp5-addons/${addonDirName}`;
}

function touchesSkyrimPlaceholder(value) {
  if (typeof value === 'string') {
    return value.includes('${skyrimPlatformDir}') || value.includes('${skyrimDataDir}');
  }

  if (Array.isArray(value)) {
    return value.some((entry) => touchesSkyrimPlaceholder(entry));
  }

  if (isPlainObject(value)) {
    return Object.values(value).some((entry) => touchesSkyrimPlaceholder(entry));
  }

  return false;
}

function resolveManifestPath(addonRoot, candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.length === 0) {
    return candidatePath;
  }

  if (path.isAbsolute(candidatePath)) {
    return path.normalize(candidatePath);
  }

  return path.normalize(path.join(addonRoot, candidatePath));
}

function normalizePathEntries(entries, addonRoot) {
  return (entries ?? []).map((entry) => ({
    ...entry,
    path: resolveManifestPath(addonRoot, entry.path),
  }));
}

function normalizeBuildExpectedOutputs(entries, addonRoot) {
  return (entries ?? []).map((entry) => ({
    ...entry,
    path: resolveManifestPath(addonRoot, entry.path),
  }));
}

function validateAddonManifest(manifest, manifestPath) {
  if (!isPlainObject(manifest)) {
    throw new Error(`Invalid addon manifest: ${manifestPath}`);
  }

  if (manifest.version !== 1) {
    throw new Error(`Unsupported addon manifest version: ${manifest.version} (${manifestPath})`);
  }

  const addonId = normalizeAddonId(manifest.addonId);
  if (!addonId) {
    throw new Error(`Addon manifest is missing addonId: ${manifestPath}`);
  }

  if (manifest.build != null) {
    if (!isPlainObject(manifest.build)) {
      throw new Error(`Addon manifest build must be an object: ${manifestPath}`);
    }

    const buildKind = manifest.build.kind;
    if (buildKind !== 'cmake-target' && buildKind !== 'command') {
      throw new Error(
        `Unsupported addon build kind "${buildKind}" in ${manifestPath}. ` +
          'Expected "cmake-target" or "command".',
      );
    }

    if (buildKind === 'cmake-target' && !normalizeAddonId(manifest.build.target)) {
      throw new Error(`Addon manifest build.target is required for ${manifestPath}`);
    }

    if (buildKind === 'command' && !normalizeText(manifest.build.command)) {
      throw new Error(`Addon manifest build.command is required for ${manifestPath}`);
    }

    if (manifest.build.installCommand != null && !normalizeText(manifest.build.installCommand)) {
      throw new Error(`Addon manifest build.installCommand must be a non-empty string for ${manifestPath}`);
    }
  }
}

function normalizeAddonArtifact(addon, rawArtifact, expandedArtifact) {
  return {
    ...expandedArtifact,
    id: createPrefixedId(addon.addonId, expandedArtifact.id),
    label: expandedArtifact.label || `${addon.label} (${expandedArtifact.id})`,
    producer: expandedArtifact.producer || createAddonProducer(addon.addonDirName),
    requiresSkyrim:
      expandedArtifact.requiresSkyrim === true ||
      rawArtifact.requiresSkyrim === true ||
      touchesSkyrimPlaceholder(rawArtifact.destinations ?? []),
    sources: normalizePathEntries(expandedArtifact.sources, addon.addonRoot),
    destinations: normalizePathEntries(expandedArtifact.destinations, addon.addonRoot),
  };
}

function normalizeStaleRemovalRule(addon, expandedRule) {
  return {
    ...expandedRule,
    id: createPrefixedId(addon.addonId, expandedRule.id),
    sourceDirectory: resolveManifestPath(addon.addonRoot, expandedRule.sourceDirectory),
    destinationDirectory: resolveManifestPath(addon.addonRoot, expandedRule.destinationDirectory),
  };
}

function normalizeWarningRule(addon, expandedRule) {
  return {
    ...expandedRule,
    id: createPrefixedId(addon.addonId, expandedRule.id),
    path: resolveManifestPath(addon.addonRoot, expandedRule.path),
  };
}

function normalizeAddonBuild(addon, expandedBuild) {
  if (!expandedBuild) {
    return null;
  }

  const normalized = {
    ...expandedBuild,
    includedInBuildAll: expandedBuild.includedInBuildAll !== false,
    expectedOutputs: normalizeBuildExpectedOutputs(expandedBuild.expectedOutputs, addon.addonRoot),
  };

  if (normalized.kind === 'command') {
    normalized.workingDirectory = resolveManifestPath(
      addon.addonRoot,
      normalized.workingDirectory || addon.addonRoot,
    );
  }

  return normalized;
}

function normalizeAddonManifest(manifest, manifestPath, addonRoot, addonDirName, ctx) {
  validateAddonManifest(manifest, manifestPath);

  const addonId = normalizeAddonId(manifest.addonId);
  const label = typeof manifest.label === 'string' && manifest.label.trim() ? manifest.label.trim() : addonId;
  const addonCtx = {
    ...ctx,
    addonDirName,
    addonId,
    addonLabel: label,
    addonManifestPath: manifestPath,
    addonRoot,
  };
  const expandedManifest = expandDeep(manifest, addonCtx);

  const addon = {
    addonDirName,
    addonId,
    addonRoot,
    label:
      typeof expandedManifest.label === 'string' && expandedManifest.label.trim()
        ? expandedManifest.label.trim()
        : label,
    manifestPath,
  };

  return {
    ...addon,
    build: normalizeAddonBuild(addon, expandedManifest.build),
    artifacts: (expandedManifest.artifacts ?? []).map((artifact, index) =>
      normalizeAddonArtifact(addon, manifest.artifacts?.[index] ?? artifact, artifact),
    ),
    staleRemoval: (expandedManifest.staleRemoval ?? []).map((rule) =>
      normalizeStaleRemovalRule(addon, rule),
    ),
    warnings: (expandedManifest.warnings ?? []).map((rule) => normalizeWarningRule(addon, rule)),
  };
}

export function discoverAddonManifests(repoRoot, ctx) {
  const addonsRoot = path.join(repoRoot, 'skymp5-addons');
  if (!fs.existsSync(addonsRoot)) {
    return [];
  }

  return fs
    .readdirSync(addonsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== 'build' && !entry.name.startsWith('.'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const addonRoot = path.join(addonsRoot, entry.name);
      const manifestPath = path.join(addonRoot, ADDON_MANIFEST_FILENAME);
      if (!fs.existsSync(manifestPath)) {
        return [];
      }

      const raw = fs.readFileSync(manifestPath, 'utf8');
      const manifest = JSON.parse(raw);
      return [normalizeAddonManifest(manifest, manifestPath, addonRoot, entry.name, ctx)];
    });
}

export function getAddonBuildExpectedOutputs(addon) {
  const explicitOutputs = addon.build?.expectedOutputs ?? [];
  if (explicitOutputs.length > 0) {
    return explicitOutputs;
  }

  const seen = new Set();
  const outputs = [];
  for (const artifact of addon.artifacts ?? []) {
    for (const source of artifact.sources ?? []) {
      if (!source?.path || seen.has(source.path)) {
        continue;
      }
      seen.add(source.path);
      outputs.push({
        path: source.path,
        label: source.label || artifact.label || artifact.id,
      });
    }
  }
  return outputs;
}

export function mergeAddonManifestData(manifestDoc, addons) {
  return {
    ...manifestDoc,
    __addons: addons,
    artifacts: [...(manifestDoc.artifacts ?? []), ...addons.flatMap((addon) => addon.artifacts ?? [])],
    staleRemoval: [
      ...(manifestDoc.staleRemoval ?? []),
      ...addons.flatMap((addon) => addon.staleRemoval ?? []),
    ],
    warnings: [...(manifestDoc.warnings ?? []), ...addons.flatMap((addon) => addon.warnings ?? [])],
  };
}
