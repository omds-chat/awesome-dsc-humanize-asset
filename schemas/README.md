# JSON Schema 索引

本目录只登记**本仓库自己的**数据格式:收录登记、下架记录、三层清单与发布目录索引。资产包本身的 Schema 不在本仓库,它在 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 的 `schemas/` 下,本仓库不复制。

| 文件 | 约束对象 | 要点 |
|:---:|:---:|:---:|
| [catalog-author.schema.json](catalog-author.schema.json) | `catalog/<作者>/author.json` | `username` 与目录名逐字符一致;字段封闭;没有作者公钥 |
| [catalog-package.schema.json](catalog-package.schema.json) | `catalog/<作者>/<包标识>/package.json` | `id` 与目录名一致;`base_url` 以斜杠结尾;`tags` 取自预设词表;字段封闭 |
| [catalog-removed.schema.json](catalog-removed.schema.json) | `catalog/removed.json` | 顶层数组,没有记录时为空数组;每条含 `id`、`author`、`base_url`、`removed_in` 与可选 `note` |
| [manifest.schema.json](manifest.schema.json) | 三层 `manifest.json` | `schemaVersion` 固定 1;`revision` 每层独立;`files` 只含 `path` 与 SHA-512 |
| [assets.schema.json](assets.schema.json) | 发布目录 `assets.json` | 每个包一条;`tag` 与 `types` 分属两个维度;不含版本号与摘要 |

## 约束范围

Schema 表达结构:字段集合、类型、格式与取值范围。下面几类判定写不进 Schema,由 `scripts/lib/` 承担,两者合起来才是完整的校验口径:

| 判定 | 承担者 |
|:---:|:---:|
| 目录名与 `username`、`id` 的逐字符一致,含大小写 | `scripts/lib/catalog.mjs` |
| 标签取值属于 `site/tags.json` 的预设词表 | `scripts/lib/catalog.mjs` |
| 已下架却仍有登记的矛盾 | `scripts/lib/catalog.mjs` |
| 索引、登记副本与 `assets/` 树三者一致 | `scripts/lib/tree.mjs` 与 `scripts/verify-bundle.mjs` |
| 清单覆盖范围与该层应有文件严格相等 | `scripts/lib/manifest.mjs` |
| 包内类型声明与类型目录双向一致 | `scripts/lib/asset-package.mjs` |

## 结构合法不等于收录通过

Schema 只管形状。收录还要求:标签在词表内、站点可访问、拉取结果通过形状校验、包本身通过 dsc-humanize-asset-template 的校验脚本。收录不等于认证,清单签名只证明分发的字节与签名者一致。
