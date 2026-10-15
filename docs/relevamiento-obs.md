# OBS survey (B0-OBS)

Date: 2026-10-15. Read-only survey via the S3-compatible API (ListBuckets, GetBucketLocation/Acl/Policy/Cors/Lifecycle/Versioning/Encryption, ListObjectsV2 top level). No writes. Credentials are not recorded here.

## Buckets found (account MINISTERIOEDUCACION)

| Bucket | Region | Access | CORS | Lifecycle | Versioning | Encryption | Content (top level) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| apptutores | la-south-2 | private | none | none | off | none | empty |
| asistencias-bucket | la-south-2 | **public READ (ACL) + policy `Principal: *` incl. PutObject** | none | none | off | none | 21 jpg |
| backupcarlos | sa-argentina-1 | private + PutObject for one external IAM user | none | none | off | none | `CloudTraces/`, `prueba/` |
| mecarchivos | la-south-2 | private | none | none | off | none | 21 objects |
| mecdni | la-south-2 | private | none | none | off | none | >50 objects |
| obs-gero | sa-argentina-1 | private | none | none | off | none | empty |
| obs-mec-moodle | sa-argentina-1 | public GetObject (policy) | none | none | off | none | 5 objects |
| obs-utilidades | sa-argentina-1 | public GetObject (policy) | none | none | off | none | 2 objects |
| snapshots-7df4 | la-south-2 | private | none | none | off | none | empty |

No bucket is referenced by this repository yet (no OBS config in code or `.env.example`).

## Findings

- **Security (outside this feature):** `asistencias-bucket` allows anonymous write and read (`Principal: *` with `s3:PutObject`, `PutObjectAcl`, `GetObject`, plus AllUsers READ ACL). Anyone can upload or overwrite objects. Recommend restricting to the app's IAM principal.
- No bucket has CORS, lifecycle, versioning or default encryption configured.
- ETag is returned on listing (MD5 for single-part uploads), so upload verification can use `HeadObject` + ETag without downloading (answers B0 open question 2).

## Changes needed for the offline reports plan (B6)

Target bucket: pending decision (dedicated private bucket recommended; must not be any public bucket above).

1. Private bucket, no ACL/policy grants to `*`; access only via presigned URLs issued by the app server.
2. CORS: allow `PUT`, `GET`, `HEAD` from the app origin(s); allowed headers `content-type`, `content-md5`, `x-amz-*`/`x-obs-*`; expose `ETag`; max-age 3600.
3. Key prefix `reportes/<movimientoId>/<attachmentId>/{optimizada,miniatura}.<ext>`.
4. Lifecycle: abort incomplete multipart uploads after 1 day; expire an `huerfanos/` (or tagged orphan) prefix after 7 days.
5. Default server-side encryption (SSE-OBS) enabled.
6. Dedicated IAM user/agency for the app limited to that bucket/prefix (Put/Get/Head/Delete), not the account owner key.
