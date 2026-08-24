import { APP_NAME, APP_VERSION, AUTHOR, MANAGED_PATHS } from '../domain/constants';
import { assertValidState, compareCodePoints } from '../domain/state';
import type { ItemState } from '../domain/types';
import { encodeGbk } from '../encoding/gbk';

type NamedState = { name: string; state: ItemState };

type ExportFile = { filename: string; bytes: Uint8Array; text: string };

export type ExportBatch = {
  fingerprint: string;
  timestamp: string;
  pickup: ExportFile;
  sell: ExportFile;
};

const PICKUP_SETTINGS: Array<{ path: string; value: string }> = [
  { path: 'MY_GKPDoodad.bCustom', value: 'true' },
  { path: 'MY_GKPDoodad.bOpenLoot', value: 'true' },
  { path: 'MY_GKPDoodad.fNameScale', value: '1.1' },
  { path: 'MY_GKPDoodad.bReadInscriptionDoodad', value: 'true' },
  { path: 'MY_GKPLoot.anchor', value: '{y=360.26452636719,x=189.7861328125,s="TOPLEFT",r="TOPCENTER"}' },
  { path: 'MY_GKPDoodad.bOpenLootEvenFight', value: 'true' },
  { path: 'MY_GKPLoot.bAutoPickupFilterBookRead', value: 'false' },
  { path: MANAGED_PATHS.skipLoot, value: '__TARGET__' },
  { path: 'MY_GKPDoodad.bQuestDoodad', value: 'true' },
  { path: 'MY_GKPDoodad.bShowName', value: 'true' },
  { path: 'MY_GKPLoot.bOn', value: 'true' },
  { path: 'MY_GKPLoot.bAutoPickupBook', value: 'true' },
  { path: 'MY_GKPLoot.bInBattlefield', value: 'true' },
  { path: 'MY_GKPLoot.bAutoPickupFilterBookHave', value: 'false' },
  { path: 'MY_GKPLoot.bInRaidDungeon', value: 'true' },
  { path: 'MY_GKPDoodad.bUnreadInscriptionDoodad', value: 'true' },
  { path: 'MY_GKPDoodad.bMiniFlag', value: 'true' },
  { path: 'MY_GKPLoot.bInTeamDungeon', value: 'true' },
  { path: 'MY_GKPDoodad.bAllDoodad', value: 'true' },
  { path: 'MY_GKPDoodad.szCustom', value: '"芙蓉出水宴|烧尾宴|玉笛谁家听落梅|二十四桥明月夜|同泽宴|同袍宴|水晶芙蓉宴|炼狱水煮鱼"' },
  { path: 'MY_GKPLoot.bInOtherMap', value: 'true' },
  { path: 'MY_GKPDoodad.bRecent', value: 'true' },
  { path: 'MY_GKPLoot.bAutoPickupQuality', value: 'true' },
  { path: 'MY_GKPLoot.bAutoPickupTaskItem', value: 'true' },
];

function quoteLua(value: string): string {
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new Error(`字符串“${value}”包含控制字符。`);
  return `"${value.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
}

function serializeMap(names: string[], marker?: string): string {
  const sorted = [...new Set(names)].sort(compareCodePoints);
  const entries = marker ? [marker, ...sorted.filter((name) => name !== marker)] : sorted;
  return `{${entries.map((name) => `[${quoteLua(name)}]=true`).join(',')}}`;
}

function wrap(path: string, value: string): string {
  return `[${quoteLua(path)}]={d=${value},v=""}`;
}

function formatShanghaiTimestamp(now: Date): { marker: string; filename: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
  const date = `${parts.year}${parts.month}${parts.day}`;
  const time = `${parts.hour}${parts.minute}${parts.second}`;
  return { marker: `${date}_${time}`, filename: `${date}-${time}` };
}

export function createFingerprint(timestamp: string): string {
  return `『${APP_NAME}』 v${APP_VERSION} by ${AUTHOR} <${timestamp}>`;
}

export function buildExportBatch(namedStates: NamedState[], now = new Date()): ExportBatch {
  for (const entry of namedStates) assertValidState(entry.state);
  const { marker: markerTimestamp, filename: filenameTimestamp } = formatShanghaiTimestamp(now);
  const fingerprint = createFingerprint(markerTimestamp);
  const skipLoot = namedStates.filter((entry) => entry.state.skipLoot).map((entry) => entry.name);
  const autoSell = namedStates.filter((entry) => entry.state.autoSell).map((entry) => entry.name);
  const protect = namedStates.filter((entry) => entry.state.protect).map((entry) => entry.name);

  const pickupEntries = PICKUP_SETTINGS.map((setting) => wrap(
    setting.path,
    setting.value === '__TARGET__' ? serializeMap(skipLoot, fingerprint) : setting.value,
  ));
  const pickupText = `return {${pickupEntries.join(',')}}`;
  const sellText = `return {${[
    wrap(MANAGED_PATHS.protect, serializeMap(protect)),
    wrap(MANAGED_PATHS.autoSell, serializeMap(autoSell, fingerprint)),
    wrap('MY_AutoSell.bEnable', 'true'),
  ].join(',')}}`;

  return {
    fingerprint,
    timestamp: markerTimestamp,
    pickup: {
      filename: `跳过拾取_${filenameTimestamp}.us.jx3dat`,
      text: pickupText,
      bytes: encodeGbk(pickupText),
    },
    sell: {
      filename: `自动出售_${filenameTimestamp}.us.jx3dat`,
      text: sellText,
      bytes: encodeGbk(sellText),
    },
  };
}
