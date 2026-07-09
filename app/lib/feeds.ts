import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";

// Shared helpers for the NDW open-data feeds. Most are gzipped XML (DATEX II or
// a SOAP/custom schema); `removeNSPrefix` drops the `sit:`/`loc:`/`vms:`/`com:`
// namespaces so downstream code can use plain keys.
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  attributeNamePrefix: "@_",
});

export async function fetchGzipXml(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Feed ${url} responded ${res.status}`);
  const compressed = Buffer.from(await res.arrayBuffer());
  const xml = gunzipSync(compressed).toString("utf8");
  return parser.parse(xml);
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

// Recursively find the first value for `key` anywhere in a nested object.
// DATEX II nests fields (coordinates, causes, …) differently per record type,
// so a structural search is more robust than hard-coding each path.
// biome-ignore lint/suspicious/noExplicitAny: parsed XML is dynamically shaped
export function findFirst(node: any, key: string): any {
  if (!node || typeof node !== "object") return null;
  if (node[key] != null) return node[key];
  for (const k of Object.keys(node)) {
    const found = findFirst(node[k], key);
    if (found != null) return found;
  }
  return null;
}
