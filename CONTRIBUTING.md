# 贡献指南

本文面向想把资产包收录进本合集的资产作者,只回答「怎么把包收进来」:收录条件、目录与清单怎么准备、校验怎么跑、合并后机器会核对什么、证书与签名如何配合、常见拒绝原因。

分工边界:包的格式、Schema、骨架与示例只在 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 维护;登记字段的完整定义与作者站点发布约定见 [catalog/README.md](catalog/README.md);本仓库的分发结构与签名机制总述见 [README.md](README.md)。本文不重复这些正文,只按作者的作业顺序把入口串起来。

## 一、收录条件

| 条件 | 作者要做的事 | 由谁判定 |
|:---:|:---:|:---:|
| 包本身合规 | 用上游校验脚本检查包;包根只含 `asset.json`、已声明的类型目录与可选 `README.md` | dsc-humanize-asset-template 的 `scripts/validate-asset-package.mjs` |
| 站点可访问 | 在 `base_url` 上按约定发布 `versions.json` 与各版本包内文件;站点公开可访问、静态资源可跨域读取 | CI 拉取阶段的形状校验 |
| 标识唯一 | 包标识在合集内唯一,并与各版本 `asset.json` 的 `id` 一致 | `scripts/lib/catalog.mjs` 与 `scripts/lib/versions.mjs` |
| 标签在词表内 | 登记里的 `tags` 只取 [site/tags.json](site/tags.json) 的预设值 | `scripts/lib/catalog.mjs` |

不收录:需要后端服务或可执行脚本的包、包内带签名材料或使用状态的包、无法在站点上按目录取到的包。收录不等于认证:清单签名只证明分发的字节与签名者一致,不审查包内容。

## 二、准备包与发布站点

1. 包本体按 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 的 `skeleton/` 与 `examples/` 制作,格式与 Schema 以该仓库为准,本仓库不复制、不另立规范。
2. 在 `base_url` 指向的静态站点上发布:

```text
<base_url>
├── versions.json                    版本索引:latest、versions 与每个版本的包内文件列表
└── <版本>/                          包根,内容与资产包布局一致
    ├── asset.json                   包元数据
    ├── <类型目录>/<内容文件>.json     四类内容,按包内的 types 取舍
    └── README.md                    可选,面向人的说明,不属于内容
```

3. `versions.json` 的要点:`latest` 必须出现在 `versions` 列表内,版本互不重复;`files` 覆盖包内全部文件,路径相对包根、正斜杠分隔,且必须含 `asset.json`。完整形状与示例见 [catalog/README.md](catalog/README.md) 的「base_url 指向什么」。
4. CI 只认 `base_url`,不从 GitHub Release 取任何资产;HTTP 无法列举目录,所以 `files` 是合集对作者站点的唯一额外要求。

## 三、准备登记文件

本仓库收录登记只回答「谁、在哪个站点、发布哪个包」;包的名称、说明、许可证、版本与内容类型一律来自作者站点上的 `asset.json`,登记里不重复维护。

```text
catalog/
└── <作者>/
    ├── author.json           作者身份:username、profile
    └── <包标识>/
        └── package.json      包登记:id、base_url、repo_link、可选 tags
```

要点:

- `<作者>` 目录名与 `author.json` 的 `username` 逐字符一致(含大小写),按 GitHub 用户名规则校验;同一用户只允许一个目录,`Alice` 与 `alice` 属冲突。
- `<包标识>` 目录名与 `package.json` 的 `id` 逐字符一致:小写字母开头,只含小写字母、数字与连字符,长度 3 到 64。
- `base_url` 是 http 或 https 的绝对地址,以斜杠结尾,不带查询串与锚点。
- 字段封闭,多写的字段会被拒绝;字段表、示例与 Schema 见 [catalog/README.md](catalog/README.md) 与 [schemas/](schemas/README.md)。
- 不要创建版本目录、占位目录或空目录:版本由 CI 从 `base_url` 自动发现。仓库级校验对缺 `author.json` 或 `package.json` 的目录直接报错。
- 作者不登记公钥,目录里没有 `author_pub.pem`:资产包不做代码签名。

## 四、本地校验

提交 PR 前在本地跑两处校验,都是零依赖脚本,Node 20 及以上,不签名、不联网:

| 位置 | 命令 | 检查什么 |
|:---:|:---:|:---:|
| 包仓库 | `node scripts/validate-asset-package.mjs <包目录>`(dsc-humanize-asset-template) | 包本身:元数据字段、包根条目、类型声明与内容 |
| 本仓库 | `node scripts/verify-catalog.mjs` | `catalog/`、`certs/` 与 `site/` 的形状:目录一致性、字段封闭、标签词表、下架记录与登记一致 |

两点边界:

- 作者不需要跑 `scripts/build-from-catalog.mjs`(那是维护者复现构建用的,会按登记访问作者站点),也不需要本地签名。
- 本地校验通过不等于收录通过:收录还要求站点拉取结果通过形状校验,并经 PR 评审确认来源与内容。

## 五、提交 PR 与机器核对

- PR 的改动只应落在 `catalog/` 下(新增或删除登记);若要使用新标签,先在 `site/tags.json` 登记,与包登记放在同一次提交里。
- 本仓库当前没有在 PR 上触发的 CI 工作流:`build-and-deploy.yml` 只在 Release 发布与手动触发(`workflow_dispatch`)时运行。PR 阶段的把关是人工评审加作者本地校验,请在 PR 描述里附上游校验脚本的运行结论。
- 合并后,Release 构建按以下顺序对登记与拉取结果做机器核对;登记不合规则整个构建以非零退出码中止,一个包都不发布:

| 顺序 | 核对内容 | 执行者 |
|:---:|:---:|:---:|
| 1 | 脚本语法;仓库级校验(`catalog/`、`certs/`、`site/` 形状,标签词表,下架记录与登记一致) | `check-syntax.mjs`、`verify-catalog.mjs` |
| 2 | 合集 EEC 证书链:由资产根签发、未过期、`keyUsage` 与 `basicConstraints` 合规 | `openssl verify` 与 `openssl x509` |
| 3 | 按登记拉取:`versions.json` 合规、`latest` 在列表内、版本不重复、包根条目、元数据字段封闭且取值合法、类型声明与类型目录双向一致、内容标识唯一、`formatVersion` 与 `site/meta.json` 一致 | `build-from-catalog.mjs` |
| 4 | 生成索引与三层清单,核对覆盖范围与 SHA-512、索引与登记副本一致 | `verify-bundle.mjs` |
| 5 | 三层清单签名就位且是 DER,并用 `openssl cms -verify` 独立验签 | workflow 的 openssl 步骤 |
| 6 | 发布目录结构自检:必需文件齐全、根证书不下发、`certs/` 下只有来源文件夹 | workflow 的 shell 检查 |

- 拉取阶段的运行期异常(站点临时不可达、单个包不合规)只把该包从本次发布剔除并写入 `catalog/anomalies.json`,其余包照常发布;剔除是「本次不发布」,登记仍在,修好后下次 Release 自动恢复。
- 步骤表与失败边界的完整叙述见 [.github/pipeline.README.md](.github/pipeline.README.md)。

## 六、证书与签名如何配合

- 作者不持有任何密钥、不签任何东西,也不提交公钥:资产包不做代码签名,包的完整性由发布目录 L3 清单的 SHA-512 逐文件绑定。
- 三层清单的 CMS 分离签名由合集 EEC 在 CI 里完成:私钥只在 CI secret `EEC_SECRET_KEY`,证书公开放在 `certs/awesome-dsc-humanize-asset/`。签名命令、信任链与校验规则见 [README.md](README.md) 的「签名与校验」与 [.github/pipeline.README.md](.github/pipeline.README.md)。
- EEC 的申请与更换是维护者的事,作者不接触任何证书;本仓库不生成、不签发、不替换任何证书。
- 清单签名覆盖原始字节,仓库统一使用 LF:作者站点上的文件按字节原样进入发布目录,站点响应不应做换行转换之类的内容改写。
- 包内出现签名材料按格式错误拒绝。

## 七、常见拒绝原因

| 表现 | 判定 |
|:---:|:---:|
| 标签不在 `site/tags.json` 词表内,或用了新标签却没同步登记词表 | 登记错误,构建中止 |
| 作者或包目录名与 `username`、`id` 不一致(含大小写),或同一作者出现仅大小写不同的两个目录 | 登记错误,构建中止 |
| `base_url` 不是 http(s) 绝对地址、不以斜杠结尾、带查询串或锚点 | 登记错误,构建中止 |
| 登记文件多写字段(字段封闭) | 登记错误,构建中止 |
| 已在 `removed.json` 的包仍有登记 | 登记错误,构建中止 |
| `versions.json` 缺 `files`、`files` 缺 `asset.json`、`latest` 不在 `versions` 内、版本重复 | 运行期异常,该包本次被剔除 |
| 包根出现 `asset.json`、已声明类型目录与 `README.md` 之外的条目,如签名材料、暂存文件或使用状态 | 运行期异常,该包本次被剔除;带签名材料按格式错误拒绝 |
| `types` 声明与类型目录不一致、内容标识在同一类型内重复 | 运行期异常,该包本次被剔除 |
| `formatVersion` 与 `site/meta.json` 声明的不一致,`id` 或 `version` 与目录不符 | 运行期异常,该包本次被剔除 |
| 包需要后端服务或可执行脚本 | 不收录 |
| 站点不可公开访问或静态资源不可跨域读取 | 收录后拉取失败,该包本次被剔除 |

## 八、下架与退出

下架单个包、整体退出与 `removed.json` 的字段约定见 [catalog/README.md](catalog/README.md) 的「下架」一节,本文不重复。
