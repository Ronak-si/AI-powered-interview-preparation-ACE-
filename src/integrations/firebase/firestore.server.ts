const projectId = process.env.FIREBASE_PROJECT_ID ?? "gen-lang-client-0224543585";
const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

type FirestoreValue = Record<string, unknown>;
function encode(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) } };
  throw new Error("Unsupported Firestore value");
}

function decode(value: FirestoreValue): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("arrayValue" in value) return (((value.arrayValue as { values?: FirestoreValue[] }).values ?? []).map(decode));
  if ("mapValue" in value) return Object.fromEntries(Object.entries((value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {}).map(([key, item]) => [key, decode(item)]));
  return null;
}

async function request(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: { message?: string } }).error?.message ?? "Firestore request failed");
  return body as Record<string, unknown>;
}

export function firestoreRecord(document: Record<string, unknown>) {
  const fields = (document.fields ?? {}) as Record<string, FirestoreValue>;
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decode(value)]));
}

export async function createInterview(token: string, record: Record<string, unknown>) {
  const id = String(record.id ?? crypto.randomUUID());
  await request(`/interviews?documentId=${id}`, token, {
    method: "POST",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encode(value)])) }),
  });
  return id;
}

export async function getInterviewDocument(token: string, id: string): Promise<Record<string, unknown>> {
  const document = await request(`/interviews/${encodeURIComponent(id)}`, token);
  return { id: String(document.name).split("/").pop(), ...firestoreRecord(document) };
}

export async function updateInterview(token: string, id: string, record: Record<string, unknown>): Promise<Record<string, unknown>> {
  const body = await request(`/interviews/${encodeURIComponent(id)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(record).map(([key, value]) => [key, encode(value)])) }),
  });
  return { id, ...firestoreRecord(body) };
}
