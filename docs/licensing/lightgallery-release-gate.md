# lightGallery licensing decision and compliance notes

## Decision

On 2026-10-23, the project owner selected distribution of this project under
the GNU General Public License, version 3 only (`GPL-3.0-only`). The selected
license path for lightGallery is therefore its GPL option. No commercial
license grant or license key is claimed or required for this path.

The installed `lightgallery` and `@lightgallery/react` 3.0.0 manifests both
declare `GPL-3.0-only OR LicenseRef-Commercial`. Their bundled
`LICENSE-COMMERCIAL.md` says the GPL option is available when the consuming
project is distributed under GPLv3-compatible terms. The package `LICENSE`
files contain the unmodified GPL version 3 text. The project records its own
license in the root `LICENSE` and `package.json`; third-party attribution is in
`THIRD-PARTY-NOTICES.md`.

## Distribution obligations

- Preserve the GPL text and third-party notices in source and binary/container
  distributions. The application image copies both files into `/app`.
- When a copy of the program is conveyed, provide recipients the complete
  corresponding source for that exact revision, including the source needed to
  generate the conveyed binaries and the applicable build scripts, under GPLv3
  terms. Keep the deployed revision identifiable so recipients can obtain the
  matching source.
- A web deployment is not by itself an AGPL-style network-use trigger. This
  application does send JavaScript to browsers; confirm source access for any
  recipient who receives covered client-side code. The repository is currently
  private, so its URL alone is not a sufficient source offer for recipients
  without repository access.
- Do not remove upstream copyright/license notices. Do not add an evaluation,
  trial, or placeholder commercial key as a substitute for the selected GPL
  path.

## Remaining compliance check

The project license decision is recorded, but a recipient-accessible source
delivery path for conveyed client-side code has not been established. Before
claiming full distribution compliance, verify the intended recipient group can
access the exact corresponding source and build scripts. This note is not a
commercial license grant and does not determine obligations for other
dependencies.
