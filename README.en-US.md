# awesome-dsc-humanize-asset

The community asset package collection for dsc-humanize. Asset packages are registered by directory here, pulled by CI from each author's own site, and the three-layer hash manifests are re-signed with the collection certificate; consumers fetch packages through the index and the manifests.

[简体中文](README.md)

## Positioning and scope

An asset package is a pure data package used by dsc-humanize: a root metadata file `asset.json` plus up to four kinds of content (persona, label sets, strategy rules, injection text). Users import it, and it is never code-signed. The format, JSON Schema, skeleton and validator live only in [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template).

This repository is one source in the asset ecosystem. It does three things: register authors and packages, pull and distribute packages according to that registration, and sign the three-layer manifests with its end-entity certificate (EEC). It never rewrites package content and never vouches for what a package says.

Inclusion conditions:

| Condition | Convention |
|:---:|:---:|
| Package is valid | Passes the dsc-humanize-asset-template validator; the package root holds only `asset.json`, declared type directories and an optional `README.md` |
| Site is reachable | A `base_url` serving `versions.json` and the package files of every version, as described in [catalog/README.md](catalog/README.md) |
| Identifier is unique | The package id is unique in the collection and equals `id` in every version's `asset.json` |
| Tags are known | Tags taken from [site/tags.json](site/tags.json) |

Not accepted: packages that need a backend or executable scripts, packages carrying signature material or user state, and packages that cannot be fetched by directory from a site.

Inclusion is not endorsement. A manifest signature only proves that the distributed bytes match the signer; it does not review package content.

## One single source for the package format

| Item | Location | Copied here |
|:---:|:---:|:---:|
| Format spec and JSON Schema | `specs/` and `schemas/` of dsc-humanize-asset-template | No, referenced by `spec_version` |
| Copyable skeleton and examples | `skeleton/` and `examples/` of the same repository | No |
| Package validator | `scripts/validate-asset-package.mjs` of the same repository | No |
| Registration, manifests and directory index | `schemas/` of this repository | Yes, these formats belong to this repository |

This repository does not ship a template repository that replicates itself: there is no `awesome-dsc-humanize-asset-set-template` and no second copy of the asset package spec. To start a new collection, follow the structure of this repository; to change the package format, change it upstream and bump the version there.

## Distribution layout

The collection is published as a Pages bundle. On every release, CI pulls packages from their author sites according to `catalog/`, assembles the release directory, signs the three-layer manifests with the collection EEC, and replaces the published content wholesale. Packages are organised as author / package id / version, and a version directory *is* the package itself, byte for byte as the author published it. For the deployed Pages file structure, the entry-address form and this repository's branch layout, see the "Pages environment file structure" and "Branch structure" sections of [.github/pipeline.README.md](.github/pipeline.README.md).

```text
<collection>/
├── meta.json                           # L1, collection metadata: spec and format versions accepted
├── tags.json                           # L1, preset tag vocabulary
├── assets.json                         # L1, package index generated from catalog
├── manifest.json                       # L1 manifest
├── manifest.json.sig                   # L1 manifest signature
├── catalog/                            # copy of the registration (incl. removed.json) plus generated index.json and anomalies.json, in no manifest
├── certs/                              # trust material, in no manifest
│   └── awesome-dsc-humanize-asset/     # source folder, named after the source id
│       ├── awesome-dsc-humanize-asset-eec.crt          # collection end-entity certificate (EEC)
│       └── awesome-dsc-humanize-asset-secret.pub       # public key paired with the EEC private key
└── assets/
    ├── author_manifest.json            # L1, author list
    └── <author>/
        ├── asset_manifest.json         # L2, package ids of this author
        ├── manifest.json               # L2 manifest
        ├── manifest.json.sig           # L2 manifest signature
        └── <package id>/
            ├── versions.json           # L3, version list and latest version
            ├── manifest.json           # L3 manifest
            ├── manifest.json.sig       # L3 manifest signature
            └── <x.y.z>/                # the asset package itself
                ├── asset.json
                ├── persona/*.json
                ├── labels/*.json
                ├── strategies/*.json
                └── injection/*.json
```

The root certificate is not distributed with the bundle: the single trust anchor of the asset ecosystem stays at `certs/dsc-humanize/dsc-humanize-root-ca.crt` in the repository, held locally by consumers instead of being taken from a served chain. `certs/` only holds source folders, with certificates and public keys at `certs/<source id>/<file name>`; private keys never enter the repository.

The three layers do not reference each other: each layer can be published, verified and re-signed on its own. The trade-off gives up "one verification for the whole tree digest" in exchange for per-package updates: changing one package bumps the `revision` of its L3 and of L2 only, leaving L1 untouched.

| Layer | Location | Files covered (relative to the layer directory) |
|:---:|:---:|:---:|
| L1 | release directory root | `meta.json`, `assets.json`, `tags.json`, `assets/author_manifest.json` |
| L2 | `assets/<author>/` | `asset_manifest.json` |
| L3 | `assets/<author>/<package id>/` | `versions.json` and every package file under each version directory |

`catalog/` and `certs/` are in no manifest: one is registration, the other is trust material.

Manifest format, JSON Schema in [schemas/manifest.schema.json](schemas/manifest.schema.json):

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "files": [
    { "path": "assets/author_manifest.json", "sha512": "<128 lowercase hex characters>" }
  ]
}
```

- `path` is relative to the manifest directory, uses forward slashes, is never absolute, contains no `.` or `..` segment, never points at the manifest itself and never repeats.
- Hash algorithm is SHA-512, lowercase hex, exactly 128 characters.
- `revision` is a positive integer per layer: it increases when that layer's file set or hashes change and is reused otherwise. The release directory is rebuilt from scratch, so the previous value is read per layer from the same-named `manifest.json` on the published site, starting at 1 when unavailable.
- L3 covers every package file but not `manifest.json` or its signature. Asset packages are not code-signed: every byte of the package is bound by the L3 manifest, and there is no per-file collection signature.

## Required files

| Location | Required | Optional |
|:---:|:---:|:---:|
| release directory root | `meta.json`, `tags.json`, `assets.json`, `assets/author_manifest.json`, `manifest.json`, `manifest.json.sig` | none |
| `certs/<source id>/` | `awesome-dsc-humanize-asset-eec.crt`, in no manifest | `awesome-dsc-humanize-asset-secret.pub`, also in no manifest |
| `catalog/` | each author's `author.json` and `<package id>/package.json`; `removed.json` copied verbatim, in no manifest | none |
| `assets/<author>/` | `asset_manifest.json`, `manifest.json`, `manifest.json.sig` | none |
| `assets/<author>/<package id>/` | `versions.json`, `manifest.json`, `manifest.json.sig` | none |
| `assets/<author>/<package id>/<x.y.z>/` | `asset.json`, content files under every declared type directory | `README.md` |

Version directories contain no signature files: an asset package is pure data and carries no signature material; its integrity comes from the L3 manifest.

## Signing and verification

### Three roles

| Role | Held by | Material | Signs |
|:---:|:---:|:---:|:---:|
| Certificate authority (CA) | dsc-humanize repository (self-signed asset root) | root private key (offline, never committed), root certificate | this collection's end-entity certificate |
| End-entity signer (EEC) | this repository | EEC private key (CI secret `EEC_SECRET_KEY`), `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` | CMS detached signatures of the three manifests |
| Asset author | external authors | no key required | nothing |

### Certificate chain

```text
dsc-humanize repository (asset root CA, offline)
  certs/dsc-humanize/dsc-humanize-root-ca.crt
      │  issues
      ▼
  this repository's certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt (EEC)
      │  openssl cms -sign -binary -md sha512 -outform DER -nocerts -noattr
      ▼
  manifest.json.sig                                  L1 manifest signature
  assets/<author>/manifest.json.sig                  L2 manifest signature
  assets/<author>/<package id>/manifest.json.sig     L3 manifest signature
```

| Item | Convention |
|:---:|:---:|
| Asset root key | ECDSA P-256, held offline; issuance happens outside this repository |
| Asset root certificate | X.509 self-signed, `CA:TRUE` with `pathlen:0`, certificate and CRL signing only |
| EEC key | ECDSA P-256, used only for CMS signing |
| EEC certificate | Issued by the asset root, `CA:FALSE`, digital signature only; its validity is set by the root at issuance, and this repository never renews or replaces it |
| Collection signature | CMS detached signature, `openssl cms -sign -binary -md sha512 -outform DER -nocerts -noattr`, written to the same-named `.sig`; verification always passes `-inform DER` |
| Author signature | none; asset packages are not code-signed |

The two chains are unrelated: the ds-chat root certificate is never used to verify asset sources, and the asset root is never used to verify plugin artifacts.

### What is signed

| Signature | Covers | Artifact |
|:---:|:---:|:---:|
| Collection CMS signature | each of the L1, L2, L3 manifests | `manifest.json.sig`, one per layer |
| none | package content | none; every package file is bound by the SHA-512 entries of the L3 manifest |

### Commands

All three layers use the same command, only the file names differ:

```bash
openssl cms -sign -binary -md sha512 -outform DER -in manifest.json -out manifest.json.sig -signer certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt -inkey eec_secret.pem -nocerts -noattr
openssl cms -verify -binary -md sha512 -inform DER -in manifest.json.sig -content manifest.json -CAfile root_ca.crt -certfile certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt
```

`-binary` signs raw bytes without newline normalisation; `-md sha512` pins the digest algorithm instead of relying on a default; `-outform DER` is mandatory because the default S/MIME wrapper is unreadable for browsers, and consumers that verify in a browser only accept DER. The scripts do not implement signing: `scripts/` only produces manifests.

### Verification rules

| # | Rule |
|:---:|:---:|
| 1 | `certs/` holds source folders only; the root certificate is self-signed with `CA:TRUE`; the EEC is issued by that root, `CA:FALSE` and still valid; the paired public key matches the key inside the certificate |
| 2 | Author directory names equal `username` in `author.json` character for character, follow the GitHub username rules, and collide case-insensitively |
| 3 | Package directory names equal `id` in `package.json`; package ids are unique in the collection |
| 4 | `base_url` is an absolute http or https URL ending with a slash, without query or fragment |
| 5 | Tags come from the preset vocabulary in `tags.json`; an unknown tag aborts the build as a registration error |
| 6 | Pulled result: author and package lists match their directories, `versions.json` has `latest` inside `versions`, and versions are unique |
| 7 | Each version directory's package root contains only `asset.json`, declared type directories and an optional `README.md`; declarations and directories match in both directions |
| 8 | Package metadata has closed fields and valid values; `formatVersion` equals the format version declared in `site/meta.json`; `id` and `version` match the path |
| 9 | Content files are JSON objects, and content ids are unique within a type |
| 10 | The three manifests are structurally valid (`schemaVersion` 1, positive `revision`, entries limited to `path` and `sha512`) and their coverage equals the layer's expected file set exactly |
| 11 | Every recorded SHA-512 matches the actual file, reporting layer and file on mismatch |
| 12 | Every layer has a `manifest.json.sig` in DER form; CMS verification itself runs in the CI `openssl` step |
| 13 | `assets.json`, the `catalog/` copy and the `assets/` tree agree; index tags match the registration and the vocabulary |
| 14 | `removed.json` exists and is valid; a package that is both removed and still registered is an error |

### Verification semantics

- Before publishing, verification is strict: any failing rule exits non-zero and nothing is distributed; a failed manifest signature aborts as well.
- After distribution, verification is lenient: manifest signatures, certificate chains and content mismatches only produce warnings, leaving the decision to the user.
- Signatures cover raw bytes. Any newline, indentation or whitespace change fails verification, and the repository uses LF throughout.
- Authors neither need nor should provide signatures; signature material inside a package is rejected as a format error.

### Requesting an EEC

The EEC is issued by the asset root in the dsc-humanize repository; this repository cannot self-sign and cannot issue certificates for other collections.

1. Generate an EEC private key and a certificate signing request locally with CN set to the collection name: `openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out eec_secret.pem`, then `openssl req -new -key eec_secret.pem -subj '/O=omds-chat/CN=awesome-dsc-humanize-asset' -out eec.csr`.
2. Send `eec.csr` to the maintainers of the asset root with purpose, validity and contact.
3. Store the returned certificate at `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt`.
4. Put the private key into the GitHub Actions secret `EEC_SECRET_KEY`; never commit it.
5. After merging, CI verifies the chain with the root certificate; a broken chain, expiry or wrong `basicConstraints` aborts the build.

## How to get a package included

The complete inclusion guide for asset authors is [CONTRIBUTING.md](CONTRIBUTING.md) (written in Chinese): inclusion conditions, preparing the package and the registration files, local checks, what the machine verifies after merge, the signing boundary and common rejection reasons. Registration fields and the site conventions are described in [catalog/README.md](catalog/README.md), and the CI steps and failure boundaries in [.github/pipeline.README.md](.github/pipeline.README.md). This section no longer maintains its own copy of the steps.

## How consumers fetch packages

The table below is the path contract this repository promises; consumers walk it from `base_url`:

| Step | Path | Purpose |
|:---:|:---:|:---:|
| 1 | `<base_url>/assets.json` | package index: every package, author, tag and content type |
| 2 | `<base_url>/tags.json` | preset tag vocabulary for filtering |
| 3 | `<base_url>/certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` | collection EEC, validated against the locally held asset root |
| 4 | `<base_url>/manifest.json` and `manifest.json.sig` | verify the L1 manifest and its SHA-512 entries |
| 5 | `<base_url>/assets/<author>/manifest.json` and `manifest.json.sig` | verify L2 and read that author's package list |
| 6 | `<base_url>/assets/<author>/<package id>/manifest.json` and `manifest.json.sig` | verify L3 and read `versions.json` plus every package file digest |
| 7 | `<base_url>/assets/<author>/<package id>/versions.json` | version list and latest version |
| 8 | `<base_url>/assets/<author>/<package id>/<x.y.z>/<package path>` | package files, compared against the L3 digests |

Any failed check only warns and never blocks use, matching the lenient semantics above.

`catalog/index.json` and `catalog/anomalies.json` are in no manifest and take no part in verification; they exist for self-checks and quick browsing. Do not replace layer-by-layer fetching with an aggregate index: if the aggregate drifts from the manifests, consumers lose the digests they need.

## Local checks

| Command | Object | When |
|:---:|:---:|:---:|
| `node scripts/verify-catalog.mjs` | shape of `catalog/`, `certs/` and `site/`, plus certificate material | before opening a registration pull request; needs no build output |
| `node scripts/verify-pull.mjs --dir dist/pages` | `assets/` tree shape and index consistency | after pulling, before signing |
| `node scripts/verify-bundle.mjs --dir dist/pages` | release directory structure and three manifests | after signing, before publishing |

```bash
node scripts/check-syntax.mjs                              # syntax check of every script
node scripts/verify-catalog.mjs                            # repository-level checks
node scripts/build-from-catalog.mjs --out dist/pages       # pull and assemble the release directory (no signing)
node scripts/verify-bundle.mjs --dir dist/pages --allow-unsigned-manifests   # structure only, no EEC key locally
node scripts/verify-bundle.mjs --dir dist/pages            # full check once signatures exist
```

The scripts have no dependencies and use Node built-in modules only (Node 20 or newer). Only the verifiers are offline; the build script contacts author sites as registered. Full signing needs OpenSSL 3.0 or newer locally, with the commands in [.github/pipeline.README.md](.github/pipeline.README.md).

## Security notes

- When verification fails, consumers should warn the user rather than silently proceed.
- Inclusion is not endorsement. A manifest signature proves the distributed bytes match the signer, not that content was reviewed.
- Keep private keys in CI secrets and local environment variables. The EEC key goes to `EEC_SECRET_KEY`; the asset root private key never enters this repository. `.gitignore` already excludes `.env`.
- Replacing the EEC key pair requires replacing `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` and requesting a new issuance from the asset root; signatures made with the old certificate stop verifying.
- This repository never generates, issues or replaces certificates; public material is copied verbatim from the organization's public certificate directory.
- Manifest signatures cover bytes. Any newline or whitespace change fails verification; the repository uses LF throughout.

## License

Apache License 2.0, see [LICENSE](LICENSE) and [COPYRIGHT](COPYRIGHT).
