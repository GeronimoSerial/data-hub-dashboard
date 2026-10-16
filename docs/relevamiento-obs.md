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

- A security finding about another bucket is tracked outside the repository.
- No bucket has CORS, lifecycle, versioning or default encryption configured.
- ETag is returned on listing (MD5 for single-part uploads), so upload verification can use `HeadObject` + ETag without downloading (answers B0 open question 2).

## Changes needed for the offline reports plan (B6)

Target bucket: **`reportes-infraestructura`** (la-south-2, Santiago), created 2026-10-15: private ACL, SSE AES256, CORS PUT/GET/HEAD from `https://analisis.sistemas.mec.gob.ar` and `http://localhost:3000` exposing ETag, lifecycle abort-incomplete-MPU 1 day + expire `huerfanos/` 7 days. Items 1–6 below are applied. App IAM user `reportes-infraestructura-app` (programmatic only) is granted by bucket policy (Sids `app-objects`, `app-bucket`); verified: put/list/delete allowed on this bucket, denied on others. The IAM custom policy `reportes-infraestructura-obs` attached to group `reportes-infraestructura-app` did not take effect for OBS; the bucket policy is the source of truth. Access key stored outside the repo.

1. Private bucket, no ACL/policy grants to `*`; access only via presigned URLs issued by the app server.
2. CORS: allow `PUT`, `GET`, `HEAD` from the app origin(s); allowed headers `content-type`, `content-md5`, `x-amz-*`/`x-obs-*`; expose `ETag`; max-age 3600.
3. Key prefix `reportes/<movimientoId>/<attachmentId>/{optimizada,miniatura}.<ext>`.
4. Lifecycle: abort incomplete multipart uploads after 1 day; expire an `huerfanos/` (or tagged orphan) prefix after 7 days.
5. Default server-side encryption (SSE-OBS) enabled.
6. Dedicated IAM user/agency for the app limited to that bucket/prefix (Put/Get/Head/Delete), not the account owner key.
