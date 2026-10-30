# Nominal student access

Infrastructure nominal reads accept `admin`, the SSO administrator role
`admin_ge`, and `director_nivel` without a separate temporary grant. This does
not grant SSO administrators staff privileges or permission to administer
nominal grants. Editors and consultation users still need an unexpired,
unrevoked grant. Banned users and establishment operators remain denied.

The nominal permission does not replace section/resource checks or data scope.
Directors can read affected students only within their assigned jurisdictional
levels; missing levels give no nominal scope. Draft reads retain their redacted
response outside those levels, including when the director has a nominal grant.
Successful nominal reads remain transactionally audited and `private, no-store`.

Regression checks:

```sh
pnpm test lib/infraestructura/permiso-nominal.test.ts lib/ge-sso/ge-sso.test.ts \
  app/api/mapas/infraestructura/nominal/route.test.ts \
  'app/api/infraestructura/borradores/[cueAnexo]/nominal-scope.test.ts'
```
