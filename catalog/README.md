# 收录登记

本目录是本合集唯一的收录入口。作者在这里登记身份、发布站点与包标识;资产包本体不进本仓库,CI 按 `base_url` 到作者自己的站点取。

登记只回答三个问题:谁、在哪个站点、发布哪个包。包的名称、说明、许可证、版本与内容类型一律来自作者站点上的 `asset.json`,登记里不重复一份——同一事实两处维护,迟早会不一致。

## 目录结构

```text
catalog/
├── README.md
├── removed.json              已下架的资产包清单
└── <作者>/
    ├── author.json           作者身份
    └── <包标识>/
        └── package.json      包登记:包标识、站点基址、源码地址、标签
```

- `<作者>` 是目录名,必须与 `author.json` 的 `username` 逐字符一致,也是发布目录里 `assets/<作者>/` 的目录名。
- `<作者>` 按 GitHub 用户名规则校验,字母不区分大小写:只允许字母、数字与连字符,不得以连字符开头或结尾,长度 1 到 39 字符。同一用户的目录只能出现一次:`Alice` 与 `alice` 仅大小写不同,属同一个作者,校验会点名冲突的两个目录。
- `<包标识>` 是目录名,必须与 `package.json` 的 `id` 逐字符一致,也与作者站点上各版本 `asset.json` 的 `id` 一致。
- 结构就是上面三层,不要创建版本目录、占位目录或空目录:版本由 CI 从 `base_url` 发现。

## author.json

每位作者一份,只描述作者本人。

| 字段 | 类型 | 说明 |
|:---:|:---:|:---:|
| `username` | string | 必填,非空。作者用户名,与所在目录名逐字符一致,按 GitHub 用户名规则校验 |
| `profile` | string | 必填,非空。作者主页的完整绝对地址,例如 `https://github.com/omds-chat` |

```json
{
  "username": "omds-chat",
  "profile": "https://github.com/omds-chat"
}
```

多写字段会被拒绝,结构以 [catalog-author.schema.json](../schemas/catalog-author.schema.json) 为准。

本目录没有 `author_pub.pem`:资产包不做代码签名,本合集也不收录作者公钥。作者身份只由登记目录与 PR 评审确认。

## package.json

一个包一份,放在 `catalog/<作者>/<包标识>/` 下。

| 字段 | 类型 | 说明 |
|:---:|:---:|:---:|
| `id` | string | 必填,非空。包标识,与所在目录名逐字符一致,且与各版本 `asset.json` 的 `id` 一致;小写字母开头,只含小写字母、数字与连字符,长度 3 到 64 |
| `base_url` | string | 必填,非空。作者站点基址,`http` 或 `https` 开头的绝对地址,必须以斜杠结尾,不带查询串与锚点 |
| `repo_link` | string | 必填,非空。包的源码或发布仓库地址,写完整绝对地址,供评审与追溯 |
| `tags` | string[] | 可选,省略等价于空数组。元素非空、互不重复,取值必须来自 [site/tags.json](../site/tags.json) 的预设词表 |

```json
{
  "id": "dsc-example-asset",
  "base_url": "https://omds-chat.github.io/dsc-example-asset/",
  "repo_link": "https://github.com/omds-chat/dsc-example-asset",
  "tags": ["tone", "general"]
}
```

多写字段会被拒绝,结构以 [catalog-package.schema.json](../schemas/catalog-package.schema.json) 为准。

## 预设标签

标签词表是 [site/tags.json](../site/tags.json),构建时原样随发布目录分发到 `<base_url>/tags.json`。标签表达「这个包把内容往哪个方向调」,不表达「包里有哪几类内容」——后者由包元数据的 `types` 回答,两处不重复维护同一条事实。

| 标签 | 说明 |
|:---:|:---:|
| `tone` | 调整语气与措辞的轻重。 |
| `concise` | 让输出更短、更集中。 |
| `detailed` | 让输出更展开、给出更多背景。 |
| `coding` | 面向代码与技术排查的对话。 |
| `writing` | 面向写作、改写与润色。 |
| `analysis` | 面向推理、拆解与对比分析。 |
| `general` | 不限定场景的通用调整。 |

- 标签不在预设词表内按登记错误处理:构建中止,并指出是哪个包、哪个标签,不静默丢弃、不自动补标签。
- 要新增标签,先在 `site/tags.json` 登记,再在包登记里使用,两者在同一次提交里完成。

## base_url 指向什么

`base_url` 是作者自己发布的静态站点基址。CI 只认这个地址,不从 GitHub Release 取任何东西:

```text
<base_url>
├── versions.json                    版本索引:latest、versions 与每个版本的包内文件列表
└── <版本>/                          包根,内容与资产包布局一致
    ├── asset.json                   包元数据
    ├── <类型目录>/<内容文件>.json     四类内容,按包内的 types 取舍
    └── README.md                    可选,面向人的说明,不属于内容
```

`versions.json` 的形状:

```json
{
  "latest": "1.0.0",
  "versions": ["1.0.0", "0.9.0"],
  "files": {
    "1.0.0": ["asset.json", "persona/calm.json", "injection/brief-tone.json"],
    "0.9.0": ["asset.json", "persona/calm.json"]
  }
}
```

- `files` 是这个合集对作者站点唯一的额外要求。原因是 HTTP 无法列举目录,合集必须知道每个版本有哪些包内文件;它放在包外的索引里,不进入包根,包仍然符合资产包格式。
- `files` 覆盖包内全部文件,路径相对包根,正斜杠分隔;必须含 `asset.json`。
- 包本体仍由 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 定义:包根只允许 `asset.json`、已声明的类型目录与可选 `README.md`,包里不放签名材料、暂存文件或使用状态。
- 站点必须公开可访问,静态资源可跨域读取。
- 版本顺序不要求:CI 拉取后统一按版本号降序写入发布目录。

## 版本层不进 catalog

`catalog/<作者>/<包标识>/` 下只放 `package.json`:

- 版本不在本目录登记,由 CI 从 `base_url` 自动发现:作者站点上发布了哪个版本,合集就收录哪个版本。
- 不要创建版本目录,也不要在其中放 `asset.json` 或内容文件;它们是 CI 从站点拉取、写进发布目录的东西。

## 收录后会发生什么

合并 PR 后,CI 构建发布目录时:

1. 校验登记文件的结构、作者与包标识的目录一致性、标签取值,以及 `certs/` 的证书材料。
2. 到 `base_url` 拉取该包的 `versions.json`,再按 `files` 逐个取包内文件,按字节原样写入 `assets/<作者>/<包标识>/<版本>/`。
3. 校验拉取结果的形状:元数据字段与取值、包根条目、类型声明与类型目录双向一致、内容标识在同一类型内唯一、`formatVersion` 与合集声明的格式版本一致。
4. 写目录索引 `assets.json`、作者清单 `assets/author_manifest.json` 与各包的 `versions.json`,把 `catalog/` 与 `certs/` 复制进发布目录,再生成 L1、L2、L3 三层清单。
5. 用本合集 EEC 逐层签名 `manifest.json`,产出 `manifest.json.sig`;签名由 CI 用 `openssl cms` 完成。
6. 用 `scripts/verify-bundle.mjs` 交叉校验索引、登记副本、`assets/` 树与三层清单,再独立验签一次。
7. 每次 Release 全量重建发布目录并直接替换,不做版本留存;各层 `revision` 从已发布站点的同名清单读取,内容没变时沿用。

### catalog/index.json 的边界

发布目录里的 `catalog/index.json` 是构建生成的汇总,只供自查与速览,不进任何清单、不参与验签,不是消费方取包信息的入口。消费方按 `assets.json` 枚举包,再按三层清单逐层取件:逐层取件才对得上「这一层有哪些文件、摘要是什么」。

### 登记错误与运行期异常的边界

| 类别 | 判定 | 构建行为 |
|:---:|:---:|:---:|
| 登记不合规 | `catalog/` 的文件本身不合法:缺字段、`id` 与目录不符、`base_url` 不合规、标签不在词表内、缺 EEC 证书 | 登记错误,构建以非零退出码中止,一个包都不发布 |
| 运行期异常 | 作者站点拉取失败、`versions.json` 不合规、包根出现规范之外的条目、`asset.json` 字段或取值不合规、类型声明与内容不一致 | 只把该包从本次发布剔除,其余包照常发布;剔除项写入 `catalog/anomalies.json` |

剔除是「本次不发布」,不是「解除登记」:登记目录仍留在 `catalog/` 里,修好站点后下次 Release 会自动回到发布里。真要解除托管,见下一节。

## 下架

- 下架某个包:删除 `catalog/<作者>/<包标识>/` 整个目录,并在 [removed.json](removed.json) 追加一条记录,然后提交 PR。
- 整体退出:删除 `catalog/<作者>/` 整个目录,作者名下每个包都要在 `removed.json` 各留一条记录。
- 直接删干净,不要留空目录或 TODO 文件占位;下次构建后,被删除的条目从发布目录里消失。
- `removed.json` 必须存在:没有任何记录时保持空数组 `[]`。
- `removed.json` 是顶层数组,每条记录的字段:

| 字段 | 类型 | 说明 |
|:---:|:---:|:---:|
| `id` | string | 必填,非空。被下架的包标识,与下架前的 `package.json` 一致 |
| `author` | string | 必填,非空。下架前的作者目录名 |
| `base_url` | string | 必填,非空。下架前的作者站点基址,便于外部查阅追认来源 |
| `removed_in` | string | 必填,非空。下架发生在哪个发布版本,写 release tag,例如 `v1.0.0` |
| `note` | string | 可选,非空。一句话说明下架原因或后续去向 |

```json
[
  {
    "id": "dsc-example-asset",
    "author": "omds-chat",
    "base_url": "https://omds-chat.github.io/dsc-example-asset/",
    "removed_in": "v1.0.0",
    "note": "作者改为独立分发,不再随本合集发布。"
  }
]
```

结构以 [catalog-removed.schema.json](../schemas/catalog-removed.schema.json) 为准。已下架却仍有登记的记录会被校验判错。

## 提交校验

提交 PR 前先在本地跑一遍仓库级校验,它只读 `catalog/`、`certs/` 与 `site/`,不需要构建产物:

```bash
node scripts/verify-catalog.mjs
```

schema 只约束结构,字段含义见 [schemas/README.md](../schemas/README.md)。结构合法不等于收录通过:收录还要求包本身通过 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 的校验脚本,并在 PR 里给出校验结论。

## 资产包规范只有一处

资产包的格式规范、Schema、骨架与校验脚本只在 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 维护。本仓库不复制规范正文、不复制 Schema、不复制校验脚本,只按 `spec_version` 引用,并在 `site/meta.json` 里登记当前接受的版本。

本仓库也不提供「复刻自身」的模板仓库:这里没有对应的 `awesome-dsc-humanize-asset-set-template`,需要新建合集时直接按本仓库的结构做,而不是再复制一个模板再同步。
