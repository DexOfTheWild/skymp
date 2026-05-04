import fs from 'fs';
import path from 'path';

import { isPluginFilename } from './plugins-txt.js';

const VANILLA_PLUGIN_NAMES = new Set([
  'skyrim.esm',
  'update.esm',
  'dawnguard.esm',
  'hearthfires.esm',
  'dragonborn.esm',
]);

function pluginKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeServerPath(filePath) {
  return String(filePath || '').replace(/\\/g, '/');
}

function resolveServerSettingsPath(ctx) {
  const buildDir = ctx?.buildDir ? String(ctx.buildDir) : '';
  if (!buildDir) {
    return '';
  }
  return path.join(buildDir, 'dist', 'server', 'server-settings.json');
}

function createUnreadableDocument(serverSettingsPath, readError, exists = false) {
  return finalizeServerLoadOrderDocument({
    path: serverSettingsPath,
    exists,
    readable: false,
    readError,
    data: null,
  });
}

function finalizeServerLoadOrderDocument(document) {
  const data = document.data && typeof document.data === 'object' ? document.data : {};
  const rawLoadOrder = Array.isArray(data.loadOrder) ? data.loadOrder : [];
  const loadOrderEntries = rawLoadOrder
    .map((entry) => String(entry || '').trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => ({
      raw: entry,
      pluginName: path.basename(entry),
      key: pluginKey(path.basename(entry)),
      vanilla: VANILLA_PLUGIN_NAMES.has(pluginKey(path.basename(entry))),
    }))
    .filter((entry) => isPluginFilename(entry.pluginName));

  return {
    ...document,
    data,
    loadOrderEntries,
    pluginNames: loadOrderEntries.map((entry) => entry.pluginName),
    customEntries: loadOrderEntries.filter((entry) => !entry.vanilla),
    vanillaEntries: loadOrderEntries.filter((entry) => entry.vanilla),
  };
}

export function readServerLoadOrderDocument(ctx) {
  const serverSettingsPath = resolveServerSettingsPath(ctx);
  if (!serverSettingsPath) {
    return createUnreadableDocument('', 'Build directory is not configured.');
  }

  if (!fs.existsSync(serverSettingsPath)) {
    return createUnreadableDocument(
      serverSettingsPath,
      'server-settings.json was not found. Build the server first.',
    );
  }

  try {
    const raw = fs.readFileSync(serverSettingsPath, 'utf8');
    const data = JSON.parse(raw);
    return finalizeServerLoadOrderDocument({
      path: serverSettingsPath,
      exists: true,
      readable: true,
      readError: '',
      data,
    });
  } catch (error) {
    return createUnreadableDocument(
      serverSettingsPath,
      String(error?.message || error),
      true,
    );
  }
}

function uniquePluginNames(pluginNames) {
  const seen = new Set();
  const nextNames = [];

  for (const pluginName of pluginNames ?? []) {
    const normalizedName = String(pluginName || '').trim();
    if (!isPluginFilename(normalizedName)) {
      continue;
    }

    const key = pluginKey(normalizedName);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    nextNames.push(normalizedName);
  }

  return nextNames;
}

export function getDesiredServerLoadOrder(ctx, document, enabledPluginNames) {
  const preservedVanillaEntries =
    document.vanillaEntries.length > 0
      ? document.vanillaEntries.map((entry) => entry.raw)
      : Array.from(VANILLA_PLUGIN_NAMES).map((pluginName) =>
          normalizeServerPath(path.join(ctx?.skyrimDataDir || '', pluginName)),
        );

  const syncedPluginEntries = uniquePluginNames(enabledPluginNames).map((pluginName) =>
    normalizeServerPath(path.join(ctx?.skyrimDataDir || '', pluginName)),
  );

  return [...preservedVanillaEntries, ...syncedPluginEntries];
}

export function writeServerLoadOrderDocument(document, loadOrder) {
  if (!document.path) {
    throw new Error('server-settings.json path is not configured.');
  }

  const nextData = {
    ...(document.data ?? {}),
    loadOrder: [...(loadOrder ?? [])],
  };

  fs.mkdirSync(path.dirname(document.path), { recursive: true });
  fs.writeFileSync(document.path, JSON.stringify(nextData, null, 2), 'utf8');
}
