// Upload samples + catalog.json para S3 + invalidação CloudFront.
// Rodar ANTES do evento, depois de generate-samples.ts.
//
// Pré-requisitos:
//   - AWS creds configuradas (AWS_PROFILE ou AWS_ACCESS_KEY_ID/SECRET)
//   - SAMPLES_BUCKET, CDN_DOMAIN no ambiente (ex. loop-ai-samples, cdn.loop-ai.app)
//   - npm i -D @aws-sdk/client-s3 tsx
//
// Uso:
//   SAMPLES_BUCKET=loop-ai-samples CDN_DOMAIN=d123.cloudfront.net npx tsx scripts/upload-catalog.ts

import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

async function main(): Promise<void> {
  const bucket = process.env.SAMPLES_BUCKET;
  const cdn = process.env.CDN_DOMAIN;
  if (!bucket || !cdn) throw new Error("SAMPLES_BUCKET and CDN_DOMAIN required");

  // Lazy import — só instalar o SDK antes do evento.
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1" });

  const samplesDir = join(process.cwd(), "public", "samples");
  const files = await readdir(samplesDir);
  const wavs = files.filter((f) => f.endsWith(".wav"));

  for (const file of wavs) {
    const key = `samples/${file}`;
    const body = await readFile(join(samplesDir, file));
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: "audio/wav",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    console.log(`✓ s3://${bucket}/${key}`);
  }

  // Reescreve catalog.json apontando pra CDN.
  const catalogPath = join(process.cwd(), "public", "catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as {
    samples: Array<{ id: string; url: string }>;
  };
  for (const s of catalog.samples) {
    const filename = s.url.split("/").pop();
    s.url = `https://${cdn}/samples/${filename}`;
  }
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "catalog.json",
      Body: JSON.stringify(catalog, null, 2),
      ContentType: "application/json",
      CacheControl: "public, max-age=60",
    }),
  );
  console.log(`✓ s3://${bucket}/catalog.json`);
  console.log(`\nPublic URL: https://${cdn}/catalog.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
