# 构建流水线说明

本仓库按 `catalog/` 的登记到作者站点拉取资产包,整理成发布目录,用本合集 EEC 给三层清单签名,再把发布目录部署到 Pages。
分发模型只有一种来源:资产作者自己发布的站点(`base_url`),Release 不放任何资产。

## 一、步骤

| 顺序 | 步骤 | 做什么 | 失败时 |
|:---:|:---:|:---:|:---:|
| 1 | 语法自检 | `node scripts/check-syntax.mjs` | 中止 |
| 2 | 仓库级校验 | `node scripts/verify-catalog.mjs`:`catalog/`、`certs/`、`site/` 的形状 | 中止,一个包都不发布 |
| 3 | 拉取与组装 | `node scripts/build-from-catalog.mjs`:`dist/pages` | 登记错误中止;运行期异常只剔除该包 |
| 4 | 清单签名 | 循环 `openssl cms -sign` 给每层 `manifest.json` 生成 `.sig` | 中止 |
| 5 | 发布目录校验 | `node scripts/verify-bundle.mjs --dir dist/pages` | 中止 |
| 6 | 独立验签 | 循环 `openssl cms -verify` | 中止 |
| 7 | 结构自检 | shell 检查必需文件、根证书不下发、`certs/` 只有来源文件夹 | 中止 |
| 8 | 部署 | `upload-pages-artifact` + `deploy-pages` | 中止 |

第 3 步与第 4 步分开是有意的:脚本不实现签名,签名只在 `openssl` 命令里发生,语义只有一个实现。

## 二、证书位置

| 材料 | 仓库内位置 | 是否随发布目录分发 |
|:---:|:---:|:---:|
| 资产根证书 | `certs/dsc-humanize/dsc-humanize-root-ca.crt` | 否,锚只在本仓库 |
| 根公钥 | `certs/dsc-humanize/dsc-humanize-root-ca-secret.pub` | 否 |
| 本合集 EEC | `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt` | 是,发布目录 `certs/awesome-dsc-humanize-asset/` |
| EEC 配对公钥 | `certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-secret.pub` | 是,同上;不进任何清单 |
| EEC 私钥 | CI secret `EEC_SECRET_KEY` | 否 |

`certs/` 下只允许来源文件夹,文件夹名即来源 id。根证书不下发的理由:信任锚只能有一处,也不由页面下发,否则校验方读到的锚可能随分发方改变。

## 三、签名命令

三层清单用同一条命令,只是文件名不同:

```bash
openssl cms -sign -binary -md sha512 -outform DER \
  -in manifest.json -out manifest.json.sig \
  -signer certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt \
  -inkey "$EEC_SECRET_KEY_FILE" -nocerts -noattr

openssl cms -verify -binary -md sha512 -inform DER \
  -in manifest.json.sig -content manifest.json \
  -CAfile root_ca.crt -certfile certs/awesome-dsc-humanize-asset/awesome-dsc-humanize-asset-eec.crt
```

- `-binary` 保证按原始字节签名,不做换行规范化。
- `-md sha512` 显式指定,不依赖 OpenSSL 默认值。
- `-outform DER` 与验签侧的 `-inform DER` 必须成对:默认的 S/MIME 包装浏览器无法解析。
- 资产包不做代码签名,因此没有 `asset.json.sig` 之类的东西;包内全部字节由 L3 清单的 SHA-512 绑定。

## 四、发布目录结构

| 位置 | 来源 |
|:---:|:---:|
| `meta.json`、`tags.json` | 取自 `site/meta.json` 与 `site/tags.json`,原样复制 |
| `assets.json` | 资产包目录索引,由 `scripts/build-from-catalog.mjs` 生成 |
| `assets/author_manifest.json` | 作者清单,由构建生成 |
| `manifest.json`、`manifest.json.sig` | L1 清单及其签名 |
| `assets/<作者>/` | 该作者的 `asset_manifest.json`、L2 清单与签名,以及各包目录 |
| `assets/<作者>/<包标识>/` | `versions.json`、L3 清单与签名、各版本目录 |
| `assets/<作者>/<包标识>/<版本>/` | 资产包本体,与作者站点逐字节一致 |
| `catalog/` | 登记副本,含 `README.md`、`removed.json`,另加构建生成的 `index.json` 与 `anomalies.json`;本次剔除的作者与包不复制 |
| `certs/` | 只含 `awesome-dsc-humanize-asset/`,根证书不下发 |

`catalog/` 与 `certs/` 不进任何清单:前者是登记信息,后者是信任材料。

## 五、清单覆盖范围

| 层 | 目录 | 覆盖文件 |
|:---:|:---:|:---:|
| L1 | 发布目录根 | `meta.json`、`assets.json`、`tags.json`、`assets/author_manifest.json` |
| L2 | `assets/<作者>` | `asset_manifest.json` |
| L3 | `assets/<作者>/<包标识>` | `versions.json` 与各版本目录下的全部包内文件 |

清单格式是 `schemaVersion`、`revision`、`files` 三项,哈希算法 SHA-512,结构见 [schemas/manifest.schema.json](../schemas/manifest.schema.json)。

## 六、revision 语义

发布目录每次全量重建并直接替换,源码树里没有可沿用的旧值,因此每层的 `revision` 从已发布站点的同名 `manifest.json` 读取:
文件集合与哈希都没变时沿用旧值,有变化时加一,取不到时从 1 开始。清单内容变化时,构建会删除该层失效的旧签名,让缺签名在签名的下一步显式失败。

## 七、本地复现

```bash
node scripts/check-syntax.mjs
node scripts/verify-catalog.mjs

node scripts/build-from-catalog.mjs \
  --catalog catalog --certs certs --meta site/meta.json --tags site/tags.json \
  --out dist/pages --published-base https://omds-chat.github.io/awesome-dsc-humanize-asset/

# 本地没有 EEC 私钥时,先只校验结构与形状
node scripts/verify-bundle.mjs --dir dist/pages --allow-unsigned-manifests

# 有私钥时按第三节的命令逐层签名,再跑不带 --allow-unsigned-manifests 的完整校验
node scripts/verify-bundle.mjs --dir dist/pages
```

## 八、异常剔除

构建把「作者要改的东西」与「运行时偶然失败」分开,边界在 `scripts/build-from-catalog.mjs` 里:

| 类别 | 判定 | 构建行为 |
|:---:|:---:|:---:|
| 登记不合规 | 登记文件不合法、标签越界、缺 EEC 证书 | 中止,不发布任何包 |
| 运行期异常 | 站点拉取失败、`versions.json` 不合规、包根条目或元数据不合规、类型声明与内容不一致 | 只剔除该包,其余照常发布;写入 `catalog/anomalies.json` |

`catalog/anomalies.json` 随发布目录分发,不进任何清单。它是「本次没发布什么」的公开记录,与 `removed.json`(永久下架)不是一回事。

## 九、Pages 环境文件结构

第 8 步用 `upload-pages-artifact` 把 `dist/pages` 整体作为 Pages 制品上传,部署后的站点根就是它的内容,站点入口地址是 `https://omds-chat.github.io/awesome-dsc-humanize-asset/`(与 `package.json` 的 `homepage` 一致,CI 侧由仓库名推导)。站点没有 HTML 首页,也不发展示站点(见 [site/README.md](../site/README.md)):直接访问根路径得不到页面,消费方按 README.md「消费方如何取包」的路径契约直接取 JSON 与证书。

```text
<站点根>/
├── meta.json                                # 合集元数据,原样复制自 site/meta.json;L1 覆盖
├── tags.json                                # 预设标签词表,原样复制自 site/tags.json;L1 覆盖
├── assets.json                              # 资产包目录索引,构建生成;L1 覆盖
├── manifest.json                            # L1 清单,构建生成
├── manifest.json.sig                        # L1 清单签名,CI 用本合集 EEC 经 openssl 生成
├── assets/
│   ├── author_manifest.json                 # 作者清单,构建生成;L1 覆盖
│   └── <作者>/
│       ├── asset_manifest.json              # 该作者的包标识列表,构建生成;L2 覆盖
│       ├── manifest.json                    # L2 清单,构建生成
│       ├── manifest.json.sig                # L2 清单签名,CI 生成
│       └── <包标识>/
│           ├── versions.json                # 版本列表与最新版本号,构建生成;L3 覆盖
│           ├── manifest.json                # L3 清单,构建生成
│           ├── manifest.json.sig            # L3 清单签名,CI 生成
│           └── <x.y.z>/                     # 资产包本体,按字节原样复制自作者站点;L3 覆盖
│               ├── asset.json               # 包元数据
│               ├── <类型目录>/*.json          # 四类内容,按包内 types 取舍
│               └── README.md                # 可选,面向人的说明
├── catalog/                                 # 登记副本,复制自 catalog/ 并剔除本次被剔除的包;不进任何清单
│   ├── README.md                            # 随登记目录原样复制
│   ├── removed.json                         # 原样复制
│   ├── index.json                           # 构建生成的汇总,只供自查与速览
│   └── anomalies.json                       # 构建生成的本次剔除记录
└── certs/                                   # 信任材料,只含本合集来源文件夹;不进任何清单
    └── awesome-dsc-humanize-asset/
        ├── awesome-dsc-humanize-asset-eec.crt       # 合集 EEC,复制自仓库 certs/
        └── awesome-dsc-humanize-asset-secret.pub    # EEC 配对公钥,复制自仓库 certs/
```

| 项 | 来源 | 谁生成或放置 |
|:---:|:---:|:---:|
| `meta.json`、`tags.json` | 仓库 `site/`,原样复制 | 构建脚本 |
| `assets.json`、`assets/author_manifest.json`、各层 `manifest.json` | 构建产物 | `scripts/build-from-catalog.mjs` |
| 各层 `manifest.json.sig` | CI 签名产物 | 工作流第 4 步的 `openssl cms` |
| `assets/<作者>/<包标识>/<x.y.z>/` | 作者站点 | 构建脚本按 `base_url` 拉取,逐字节落盘 |
| `catalog/` | 仓库 `catalog/` 副本,加构建生成的 `index.json` 与 `anomalies.json` | 构建脚本 |
| `certs/awesome-dsc-humanize-asset/` | 仓库 `certs/` 同名来源文件夹,原样复制 | 构建脚本 |

站点上没有版本留存,也没有 `version/` 归档目录:每次 Release 全量重建 `dist/pages` 并直接替换,旧 Release 的内容被整体覆盖。站点上的版本化路径只有一种形态——`assets/<作者>/<包标识>/<x.y.z>/`,它按版本组织资产包本体,不承载本仓发布历史的归档。本仓也没有归档分支,因此不涉及组织主线仓库(dsce)组装页面包时把归档分支的 `version/` 释放合并进站点的机制。

## 十、分支结构

本仓只有 `main` 一条分支,没有组织口径所说的孤立并行分支(与 `main` 无公共祖先的分支)。`main` 的顶层布局一句话:`catalog/` 收录登记,`certs/` 公开信任材料,`site/` 合集设置,`scripts/` 与 `schemas/` 构建校验脚本与自有格式,`docs/` 文档;`dist/` 与 `temp/` 是本地生成目录,不入库。

跨构建需要延续的三层清单 `revision` 不靠并行分支保存:构建从已发布站点的同名 `manifest.json` 读取上一版(见第六节),已发布站点承担了「上一版」的存储。这与 `awesome-dsc-plugin` 用 `ci-memory` 并行分支存放 `layer-manifests/` 的做法不同,两者互不相干。

组织级口径见 `.github` 仓库的 `docs/repo-spec/side-branches.md`;其第五节的登记与本节一致:本仓属「其余仓库,无并行分支」。
