# awesome-dsc-humanize-asset

dsc-humanize 的社区资产包合集。资产包在这里按目录登记、由 CI 从作者自己的站点拉取,再用合集证书给三层哈希清单重新签名;消费方按索引与清单逐层取包。

[English](README.en-US.md)

## 定位与收录范围

资产包是 dsc-humanize 使用的纯数据包:由包根目录的元数据 `asset.json` 与四类内容(人物设定、分类标签集、策略规则、注入文本)组成,由用户导入,不做代码签名。格式、Schema、骨架与校验脚本只在 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 维护。

本仓库是资产生态里的一个来源,做三件事:登记作者与包、按登记拉取并分发、用终端签名证书(EEC)给三层清单签名。它不改写包内容,也不替作者背书内容。

收录条件:

| 条件 | 约定 |
|:---:|:---:|
| 包本身合规 | 通过 dsc-humanize-asset-template 的校验脚本,包根只含 `asset.json`、已声明的类型目录与可选 `README.md` |
| 站点可访问 | 提供 `base_url`,按 [catalog/README.md](catalog/README.md) 的发布约定对外提供 `versions.json` 与各版本的包内文件 |
| 标识唯一 | 包标识在合集内唯一,且与各版本 `asset.json` 的 `id` 一致 |
| 标签在词表内 | 登记里的标签取自 [site/tags.json](site/tags.json) |

不收录:需要后端服务或可执行脚本的包、包内带签名材料或使用状态的包、无法在站点上按目录取到的包。

收录不等于认证。清单签名只证明分发的字节与签名者一致,不审查包内容;内容是否合用由用户判断。

## 资产包格式只有一处源头

| 项 | 位置 | 本仓库是否复制 |
|:---:|:---:|:---:|
| 格式规范与 Schema | dsc-humanize-asset-template 的 `specs/` 与 `schemas/` | 否,按 `spec_version` 引用 |
| 可复制的包骨架与示例包 | 同上仓库的 `skeleton/` 与 `examples/` | 否 |
| 包校验脚本 | 同上仓库的 `scripts/validate-asset-package.mjs` | 否 |
| 收录登记、三层清单与目录索引 | 本仓库的 `schemas/` | 是,这些是本仓库自有的格式 |

本仓库不提供「复刻自身」的模板仓库:没有 `awesome-dsc-humanize-asset-set-template`,也没有第二份资产包规范。要新建合集,直接按本仓库的结构做;要改资产包格式,回到 dsc-humanize-asset-template 改并升版本,不在本仓库就地打补丁。

## 分发结构

合集以 Pages 包的形式发布:每次 Release 由 CI 按 `catalog/` 到作者站点拉取资产包、整理成发布目录,再用合集 EEC 给三层清单签名,全量重建并直接替换,不做版本留存。包在 `assets/` 下按「作者 / 包标识 / 版本」组织,版本目录就是资产包本身,内容与作者站点逐字节一致。部署到 Pages 后的站点文件结构、入口地址形态与本仓分支情况见 [.github/pipeline.README.md](.github/pipeline.README.md) 的「Pages 环境文件结构」与「分支结构」两节。

```text
<collection>/
├── meta.json                           # L1,合集元数据:接受的规范版本与格式版本
├── tags.json                           # L1,预设标签词表
├── assets.json                         # L1,资产包目录索引,由 catalog 生成
├── manifest.json                       # L1 清单
├── manifest.json.sig                   # L1 清单签名
├── catalog/                            # 收录登记复制(含 removed.json),另含构建生成的 index.json 与 anomalies.json,不进任何清单
├── certs/                              # 信任材料,不进任何清单
│   └── awesome-dsc-humanize-asset/     # 来源文件夹,与来源 id 同名
│       ├── awesome-dsc-humanize-asset-eec.crt          # 合集终端签名证书(EEC)
│       └── awesome-dsc-humanize-asset-secret.pub       # 与 EEC 私钥配对的公钥
└── assets/
    ├── author_manifest.json            # L1,作者清单
    └── <作者>/
        ├── asset_manifest.json         # L2,该作者的包标识列表
        ├── manifest.json               # L2 清单
        ├── manifest.json.sig           # L2 清单签名
        └── <包标识>/
            ├── versions.json           # L3,版本列表与最新版本号
            ├── manifest.json           # L3 清单
            ├── manifest.json.sig       # L3 清单签名
            └── <x.y.z>/                # 资产包本体
                ├── asset.json
                ├── persona/*.json
                ├── labels/*.json
                ├── strategies/*.json
                └── injection/*.json
```

根证书不随发布目录分发:资产侧唯一的信任锚在仓库的 `certs/dsc-humanize/dsc-humanize-root-ca.crt`,消费方本地持有它,不从页面下发的链里临时取根。`certs/` 下只放来源文件夹,证书与公钥都在 `certs/<来源 id>/<文件名>` 下,私钥一律不入库。

三层之间互不引用:任何一层都可以单独发布、单独校验、单独重签。取舍是放弃「一次校验拿到全树摘要」,换取按包增量更新:改一个包只让该包所在的 L3 与 L2 的 `revision` 加一,L1 不变,消费方也只重拉这两层。

| 层 | 位置 | 覆盖的文件(相对该层目录) |
|:---:|:---:|:---:|
| L1 | 发布目录根 | `meta.json`、`assets.json`、`tags.json`、`assets/author_manifest.json` |
| L2 | `assets/<作者>/` | `asset_manifest.json` |
| L3 | `assets/<作者>/<包标识>/` | `versions.json`、各版本目录下的全部包内文件 |

`catalog/` 与 `certs/` 不纳入任何清单:前者是收录登记,后者是信任材料。

清单格式,JSON Schema 见 [schemas/manifest.schema.json](schemas/manifest.schema.json):

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "files": [
    { "path": "assets/author_manifest.json", "sha512": "<128 位小写十六进制>" }
  ]
}
```

- `path` 相对清单所在目录,使用正斜杠,不得是绝对路径,不得出现 `.` 或 `..` 段,不得指向清单自身,不得重复。
- 哈希算法 SHA-512,十六进制小写,固定 128 位。
- `revision` 每层独立的正整数:该层文件集合或哈希变化时加一,不变时沿用旧值;发布目录每次全量重建,上一份值按层从已发布站点的同名 `manifest.json` 读取,取不到时从 1 开始。
- L3 覆盖到包内每个文件,不覆盖 `manifest.json` 与其签名。资产包不做代码签名,包的每个字节都由 L3 清单绑定,没有逐文件的合集签名。

## 必需文件

| 位置 | 必需 | 可选 |
|:---:|:---:|:---:|
| 发布目录根 | `meta.json`、`tags.json`、`assets.json`、`assets/author_manifest.json`、`manifest.json`、`manifest.json.sig` | 无 |
| `certs/<来源 id>/` | `awesome-dsc-humanize-asset-eec.crt`,不进任何清单 | `awesome-dsc-humanize-asset-secret.pub`,同样不进清单 |
| `catalog/` | 每位作者的 `author.json` 与 `<包标识>/package.json`,`removed.json` 原样复制,不进任何清单 | 无 |
| `assets/<作者>/` | `asset_manifest.json`、`manifest.json`、`manifest.json.sig` | 无 |
| `assets/<作者>/<包标识>/` | `versions.json`、`manifest.json`、`manifest.json.sig` | 无 |
| `assets/<作者>/<包标识>/<x.y.z>/` | `asset.json`、每个已声明类型目录下的内容文件 | `README.md` |

版本目录里没有签名文件:资产包是纯数据,包里不放任何签名材料;它的完整性来自 L3 清单。

## 签名与校验

### 三个角色

| 角色 | 承担者 | 持有物 | 签发对象 |
|:---:|:---:|:---:|:---:|
| 根证书机构(CA) | dsc-humanize 仓库(资产侧自签根) | 根私钥(离线,不入库)、根证书 | 本合集的终端签名证书 |
| 终端签名方(EEC) | 本仓库 | EEC 私钥(CI secret `EEC_SECRET_KEY`)、`certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` | 三层清单的 CMS 分离签名 |
| 资产作者 | 外部作者 | 无密钥要求 | 不签任何东西 |

### 证书链

```text
dsc-humanize 仓库(资产侧根 CA,离线)
  certs/dsc-humanize/dsc-humanize-root-ca.crt
      │  签发
      ▼
  本仓库 certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt(终端签名证书 EEC)
      │  openssl cms -sign -binary -md sha512 -outform DER -nocerts -noattr
      ▼
  manifest.json.sig                                  L1 清单签名
  assets/<作者>/manifest.json.sig                     L2 清单签名
  assets/<作者>/<包标识>/manifest.json.sig            L3 清单签名
```

| 项 | 约定 |
|:---:|:---:|
| 资产根密钥 | ECDSA P-256,离线持有,签发发生在本仓库之外 |
| 资产根证书 | X.509 自签,`CA:TRUE` 且 `pathlen:0`,仅证书签发与 CRL 签发 |
| EEC 密钥 | ECDSA P-256,只为 CMS 签名使用 |
| EEC 证书 | 由资产根签发,`CA:FALSE`,仅数字签名;有效期由根 CA 在签发时给出,本仓库不续签、不替换 |
| 合集签名 | CMS 分离签名,`openssl cms -sign -binary -md sha512 -outform DER -nocerts -noattr`,产物为同名 `.sig`;验签固定带 `-inform DER` |
| 作者签名 | 无。资产包不做代码签名 |

两条链互不隶属:ds-chat 根证书不用于验资产来源,资产根也不用于验插件产物。

### 签什么

| 签名 | 覆盖对象 | 产物 |
|:---:|:---:|:---:|
| 合集 CMS 签名 | L1、L2、L3 各一份清单 | `manifest.json.sig`,每层一份 |
| 无 | 资产包内容 | 无。包内每个文件由 L3 清单的 SHA-512 绑定 |

### 命令

三层清单用同一条命令,只是文件名不同:

```bash
openssl cms -sign -binary -md sha512 -outform DER -in manifest.json -out manifest.json.sig -signer certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt -inkey eec_secret.pem -nocerts -noattr
openssl cms -verify -binary -md sha512 -inform DER -in manifest.json.sig -content manifest.json -CAfile root_ca.crt -certfile certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt
```

`-binary` 按原始字节处理,不经换行规范化;`-md sha512` 固定摘要算法,不依赖默认值;`-outform DER` 不可省略——默认输出是 S/MIME 包装,浏览器无法解析,消费方在浏览器里验签时只认 DER。脚本不实现签名,`scripts/` 只负责生成清单。

### 校验规则

| 编号 | 规则 |
|:---:|:---:|
| 1 | `certs/` 下只有来源文件夹;根证书自签且 `CA:TRUE`,EEC 由该根签发、`CA:FALSE`、在有效期内;配对公钥与证书里的公钥是同一把 |
| 2 | 登记目录名与 `author.json` 的 `username` 逐字符一致,按 GitHub 用户名规则校验,大小写不同视为同一作者 |
| 3 | 包目录名与 `package.json` 的 `id` 逐字符一致;包标识在合集内唯一 |
| 4 | 登记的 `base_url` 是 http 或 https 绝对地址、以斜杠结尾、不带查询串与锚点 |
| 5 | 标签取自 `tags.json` 的预设词表;不在词表内按登记错误中止构建 |
| 6 | 拉取结果:作者清单与包清单与目录一致,`versions.json` 的 `latest` 在列表内,版本号互不重复 |
| 7 | 每个版本目录的包根只含 `asset.json`、已声明的类型目录与可选 `README.md`;类型声明与类型目录双向一致 |
| 8 | 包元数据字段封闭、取值合法,`formatVersion` 与 `site/meta.json` 声明的格式版本一致,`id` 与 `version` 与目录一致 |
| 9 | 内容文件是 JSON 对象,内容标识在同一类型内唯一 |
| 10 | 三层清单结构合法,`schemaVersion` 为 1、`revision` 为正整数、条目只含 `path` 与 `sha512`;覆盖范围与该层应有的文件严格相等 |
| 11 | 清单记录的每个 SHA-512 与文件实际内容一致,不一致时报出层号与具体文件 |
| 12 | 每层 `manifest.json.sig` 就位且是 DER(CMS 验签由 CI 的 openssl 步骤完成) |
| 13 | `assets.json` 索引、`catalog/` 登记副本与 `assets/` 树三者一致;索引标签与登记一致且取自词表 |
| 14 | `removed.json` 存在且结构合法;已下架却仍有登记的包判错 |

### 校验语义

- 发布前的校验是强校验:任一规则不通过都以非零退出码中止,不合规的内容不会被分发;清单签名失败同样中止。
- 分发之后的校验是弱校验:清单签名、证书链、包内容与清单不一致都只提示警告,由用户决定是否继续,不做兜底。
- 签名覆盖文件原始字节。换行、缩进或空白的任何改动都会让校验失败,仓库统一使用 LF。
- 作者侧不需要也不应该提供任何签名;包里出现签名材料按格式错误拒绝。

### 如何申请 EEC

EEC 由 dsc-humanize 仓库的资产根签发,本仓库不能自签,也不能为其他合集签发。

1. 本地生成 EEC 私钥与证书签名请求,CN 取合集名:`openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out eec_secret.pem`,再 `openssl req -new -key eec_secret.pem -subj '/O=omds-chat/CN=awesome-dsc-humanize-asset' -out eec.csr`。
2. 把 `eec.csr` 交给资产根维护方,说明用途、有效期与联系人。
3. 拿回签发好的证书,放入 `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt`。
4. 把私钥内容放入 GitHub Actions secret `EEC_SECRET_KEY`,不要提交到仓库。
5. 合并后 CI 用根证书校验签发链;链不通、过期或 `basicConstraints` 不符都会中止构建。

## 收录流程

面向资产作者的完整收录指南见 [CONTRIBUTING.md](CONTRIBUTING.md):收录条件、包与登记文件的准备、本地校验、合并后的机器核对、签名边界与常见拒绝原因。登记字段与作者站点发布约定见 [catalog/README.md](catalog/README.md),CI 步骤与失败边界见 [.github/pipeline.README.md](.github/pipeline.README.md)。本节不重复维护步骤正文。

## 消费方如何取包

下表是本仓库对外承诺的路径契约,消费方按 `base_url` 依次取用:

| 步骤 | 路径 | 用途 |
|:---:|:---:|:---:|
| 1 | `<base_url>/assets.json` | 包目录索引:列出全部包、作者、标签与内容类型 |
| 2 | `<base_url>/tags.json` | 预设标签词表,用于界面筛选项 |
| 3 | `<base_url>/certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` | 取合集终端签名证书,用本地持有的资产根校验证书链 |
| 4 | `<base_url>/manifest.json` 与 `manifest.json.sig` | 校验 L1 清单签名与其中记录的 SHA-512 |
| 5 | `<base_url>/assets/<作者>/manifest.json` 与 `manifest.json.sig` | 校验 L2 清单,拿到该作者的包清单 |
| 6 | `<base_url>/assets/<作者>/<包标识>/manifest.json` 与 `manifest.json.sig` | 校验 L3 清单,拿到 `versions.json` 与各版本包内文件的摘要 |
| 7 | `<base_url>/assets/<作者>/<包标识>/versions.json` | 取版本列表与最新版本号 |
| 8 | `<base_url>/assets/<作者>/<包标识>/<x.y.z>/<包内路径>` | 取包内文件,与 L3 清单记录的摘要比对 |

任何一项校验失败只提示警告,不阻断使用,与「校验语义」一节的弱校验一致。

`catalog/index.json` 与 `catalog/anomalies.json` 不进任何清单、不参与验签,只供自查与速览:不要用聚合索引替代逐层取件,聚合索引一旦与清单不一致,消费方就拿不到可用于校验的摘要。

## 本地校验

| 命令 | 校验对象 | 何时运行 |
|:---:|:---:|:---:|
| `node scripts/verify-catalog.mjs` | `catalog/`、`certs/` 与 `site/` 的形状与证书材料 | 提交登记 PR 前,不需要构建产物 |
| `node scripts/verify-pull.mjs --dir dist/pages` | `assets/` 树的形状与索引一致性 | 拉取之后、签名之前 |
| `node scripts/verify-bundle.mjs --dir dist/pages` | 发布目录结构与三层清单 | 签名之后、发布之前 |

```bash
node scripts/check-syntax.mjs                              # 全部脚本的语法自检
node scripts/verify-catalog.mjs                            # 仓库级校验
node scripts/build-from-catalog.mjs --out dist/pages       # 拉取并组装发布目录,生成清单(不签名)
node scripts/verify-bundle.mjs --dir dist/pages --allow-unsigned-manifests   # 本地无 EEC 私钥时的结构校验
node scripts/verify-bundle.mjs --dir dist/pages            # 签名就位后的完整校验
```

脚本零依赖,只用 Node 内置模块(Node 20 及以上);不联网的只有校验脚本,构建脚本按登记访问作者站点。本地跑完整签名需要 OpenSSL 3.0 及以上,签名命令见 [.github/pipeline.README.md](.github/pipeline.README.md)。

## 安全提示

- 签名不通过时消费方应警告用户,不静默使用。
- 收录不等于认证。清单签名只证明分发的字节与签名者一致,不代表包内容经过审查。
- 私钥只放 CI secrets 与本地环境变量,不要提交。EEC 私钥放 `EEC_SECRET_KEY`,资产根私钥永远不进本仓库。`.gitignore` 已排除 `.env`。
- 更换 EEC 密钥对必须同时换 `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` 并向资产根重新申请签发;旧证书签出的签名将无法再验证。
- 本仓库不生成、不签发、不替换任何证书;公开材料只从组织的公开证书目录原样复制。
- 清单签名覆盖字节。任何换行或空白改动都会让校验失败,仓库统一使用 LF。

## 许可

Apache License 2.0,见 [LICENSE](LICENSE) 与 [COPYRIGHT](COPYRIGHT)。
