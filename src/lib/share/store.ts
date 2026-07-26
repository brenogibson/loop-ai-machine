import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";
import type { SharePayload } from "./types";

// Shares live as JSON objects in a private S3 bucket, keyed by a short id —
// simple, cheap, zero-maintenance (matches the "single event" scope; no TTL
// or listing needed). All access goes through these server-side helpers.
const BUCKET =
  process.env.SHARE_BUCKET ?? "loop-ai-machine-shares-881464459139";

let cached: S3Client | null = null;
function s3(): S3Client {
  if (cached) return cached;
  cached = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });
  return cached;
}

// URL-friendly, unambiguous alphabet (no 0/O/1/l/I).
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const SHARE_ID_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

function newShareId(): string {
  const bytes = randomBytes(8);
  let id = "";
  for (const b of bytes) id += ALPHABET[b % ALPHABET.length];
  return id;
}

export async function putShare(payload: SharePayload): Promise<string> {
  const id = newShareId();
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: `shares/${id}.json`,
      Body: JSON.stringify(payload),
      ContentType: "application/json",
    }),
  );
  return id;
}

// Store a rendered MP3 and return a presigned download URL. The bucket is
// fully private (account rule: nothing public on AWS, ever) — the QR code
// carries this short-lived signed URL instead. 10-minute expiry: whoever scans
// at the booth downloads on the spot.
export const MP3_URL_EXPIRY_S = 10 * 60;

export async function putShareMp3(
  id: string,
  mp3: Buffer,
): Promise<{ url: string; expiresInS: number }> {
  const key = `mp3/${id}.mp3`;
  await s3().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: mp3,
      ContentType: "audio/mpeg",
      ContentDisposition: `attachment; filename="loop-machine-${id}.mp3"`,
    }),
  );
  const url = await getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: MP3_URL_EXPIRY_S },
  );
  return { url, expiresInS: MP3_URL_EXPIRY_S };
}

export async function getShare(id: string): Promise<SharePayload | null> {
  if (!SHARE_ID_RE.test(id)) return null;
  try {
    const res = await s3().send(
      new GetObjectCommand({ Bucket: BUCKET, Key: `shares/${id}.json` }),
    );
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as SharePayload;
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}
