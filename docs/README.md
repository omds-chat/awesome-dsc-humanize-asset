# 文档索引

> 本文是本仓库全部文档的索引入口。只回答「有哪些文档、各自负责什么、什么时候该读哪一份、冲突时听谁的」,不复述任何文档正文。

## 一、文档主表

| 文档 | 职责一句话 | 主要内容 | 什么时候需要读 | 主要读者 |
|:---:|:---:|:---:|:---:|:---:|
| [README.md](../README.md) | 合集对外的总说明 | 定位与收录范围、发布目录结构、三层清单与签名、校验规则、收录流程、消费方取件表、本地校验 | 第一次了解本合集、核对分发结构与签名边界 | 用户、贡献者 |
| [README.en-US.md](../README.en-US.md) | 上一行的英文版 | 与 README.md 逐节对应 | 需要英文说明或对外沟通时 | 用户、贡献者 |
| [catalog/README.md](../catalog/README.md) | 收录登记的唯一入口说明 | 登记目录结构、`author.json` 与 `package.json` 字段、作者站点发布约定、标签词表、收录后的处理、下架与 `removed.json` | 提交收录、修改登记、撤回或下架包时 | 贡献者 |
| [.github/pipeline.README.md](../.github/pipeline.README.md) | 构建流水线说明 | 步骤与失败边界、证书位置与是否下发、签名命令、发布目录结构与清单覆盖、revision 语义、本地复现 | 改流水线、复现构建、排查发布失败 | 维护者 |
| [site/README.md](../site/README.md) | 合集设置说明 | `tags.json` 词表、`meta.json` 的规范版本声明、为什么没有站点工程 | 改标签、改接受的格式版本、排查构建版本判定 | 维护者、贡献者 |
| [schemas/README.md](../schemas/README.md) | JSON Schema 索引 | 五份 schema 的约束对象与要点、Schema 管不到而由脚本承担的判定 | 改字段、加校验、判断某份 JSON 结构是否合法 | 维护者、Agent |
| [docs/design/asset-collection-pipeline.md](design/asset-collection-pipeline.md) | 流水线机制与取舍的设计说明 | catalog 驱动模型、拉取模型与 `files` 清单的理由、三层清单与 revision、证书与签名边界、异常剔除、与插件合集的差异、已否决方案、未定稿项 | 判断「为什么这样定」「这样改会不会破坏既有取舍」时 | 维护者、Agent |
| [docs/README.md](index.md) | 本索引 | 文档主表、冲突时的优先级、文档分层、目录结构、维护约定 | 找文档、判断该读哪一份、新增或删除文档时 | Agent、维护者 |

## 二、冲突时以谁为准

优先级从高到低:

| 优先级 | 来源 | 说明 |
|:---:|:---:|:---:|
| 1 | `scripts/` 的实际行为与 `schemas/` 的 JSON Schema | 可执行事实:构建与校验实际做什么,只以这里为准 |
| 2 | 各 README | 对外规范叙述;README.md 与 README.en-US.md 互为译本,冲突时以中文版为准 |
| 3 | `docs/design/` 下的设计文档 | 解释机制与取舍;与上两层冲突时以脚本与 README 为准,并回改设计文档 |

两条配套规则:

- 资产包的格式与字段语义不属本仓库判定:以 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 的规范正文与 Schema 为准,本仓库只按 `site/meta.json` 登记的版本引用。上游与本仓库脚本冲突时以上游为准并修脚本。
- README 与脚本冲突时以脚本为准并回改 README;README 与设计文档冲突时以 README 为准并回改设计文档。

## 三、文档分层

| 层 | 文档 | 面向谁 | 读它的前提 |
|:---:|:---:|:---:|:---:|
| 对外文档 | README.md、README.en-US.md、catalog/README.md | 用户与投稿作者 | 不需要先读设计文档:收录范围、登记规则与分发结构在这三份里自足 |
| 维护者文档 | .github/pipeline.README.md、site/README.md、schemas/README.md、docs/design/asset-collection-pipeline.md | 改流水线、字段与合集设置的维护者 | 先读过对外文档,再按本次改动对象选一份 |
| Agent 执行文档 | 本索引、`schemas/` 的 JSON 与 `scripts/` 的实际行为 | Agent | 从本索引找入口:结构与合法性读 schema,实际行为读脚本,取舍读设计文档 |

## 四、目录结构

```text
awesome-dsc-humanize-asset/
├── .env.example                    本地联调地址
├── .gitattributes                  统一 LF 换行
├── .gitignore
├── .github/
│   ├── pipeline.README.md          构建流水线说明:步骤、证书位置、签名命令
│   └── workflows/
│       └── build-and-deploy.yml    仓库级校验、拉取资产包、清单签名、独立验签、发布
├── COPYRIGHT
├── LICENSE
├── README.md                       中文总览
├── README.en-US.md                 英文总览
├── package.json                    工程信息与脚本入口
├── catalog/                        收录登记:作者、站点基址与包标识
│   ├── README.md                   登记说明与作者站点发布约定
│   └── removed.json                已下架的包清单
├── certs/                          公开信任材料,随发布目录分发,不进任何清单
│   ├── dsc-humanize/               资产侧唯一信任锚:根证书与配对公钥
│   └── awesome-dsc-humanize-asset/ 本合集终端签名证书与配对公钥
├── docs/
│   ├── index.md                    文档索引(本文)
│   └── design/
│       └── asset-collection-pipeline.md   流水线机制与取舍
├── schemas/                        本仓库自有格式的 JSON Schema
│   ├── README.md
│   ├── assets.schema.json
│   ├── catalog-author.schema.json
│   ├── catalog-package.schema.json
│   ├── catalog-removed.schema.json
│   └── manifest.schema.json
├── scripts/                        零依赖脚本:校验登记与拉取形状、整理发布目录、生成清单
│   ├── check-syntax.mjs            语法自检
│   ├── verify-catalog.mjs          仓库级校验
│   ├── verify-pull.mjs             拉取结果的形状校验
│   ├── verify-bundle.mjs           发布目录结构与三层清单校验
│   ├── build-from-catalog.mjs      拉取并整理发布目录,生成清单(不签名)
│   └── lib/                        上述脚本共用的判定与文件操作
└── site/                           合集设置
    ├── README.md
    ├── meta.json                   接受的规范版本与格式版本
    └── tags.json                   预设标签词表
```

`dist/`、`temp/` 与 `node_modules/` 是生成目录,不入库;发布目录每次 Release 全量重建,也不入库。

## 五、维护约定

- 新增或删除任何文档,同一次改动内更新本索引主表;文档改名或移动时,同时修正所有引用它的链接。
- 机制变更当轮更新对应文档:改字段同步 schemas/README.md;改登记字段或站点发布约定同步 catalog/README.md;改标签或版本声明同步 site/README.md;改拉取模型、清单覆盖范围、签名归属或剔除边界同步 docs/design/asset-collection-pipeline.md。
- README.md 与 README.en-US.md 同步维护,改一节时两版一起改。
- 文档内链接一律指向最新文件,不在链接 URL 里写死标签名。
- 本索引与设计文档只描述机制、边界与读者入口,不写时间戳、不写进度、不写时间计划。
