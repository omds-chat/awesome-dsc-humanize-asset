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
