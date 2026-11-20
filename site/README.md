# 合集设置

本目录是合集设置的唯一位置,构建时原样进入发布目录,仓库根不再另存一份。

| 文件 | 发布目录中的位置 | 作用 |
|:---:|:---:|:---:|
| `tags.json` | `tags.json` | 预设标签词表;登记里的 `tags` 只能取这里的值 |
| `meta.json` | `meta.json` | 合集元数据;声明本合集按哪个规范版本与格式版本校验资产包 |

## 标签词表

标签表达「这个包把内容往哪个方向调」,不表达「包里有哪几类内容」:后者由包元数据的 `types` 回答,两处不重复维护同一条事实。

| 标签 | 说明 |
|:---:|:---:|
| `tone` | 调整语气与措辞的轻重。 |
| `concise` | 让输出更短、更集中。 |
| `detailed` | 让输出更展开、给出更多背景。 |
| `coding` | 面向代码与技术排查的对话。 |
| `writing` | 面向写作、改写与润色。 |
| `analysis` | 面向推理、拆解与对比分析。 |
| `general` | 不限定场景的通用调整。 |

- 标签不存在于 `tags.json` 时按登记错误处理:构建中止,并指出是哪个包、哪个标签,不静默丢弃。
- 要新增标签,先在 `tags.json` 登记,再在包登记里使用,两者在同一次提交里完成。

## 版本声明

`meta.json` 的两个字段与 [dsc-humanize-asset-template](https://github.com/omds-chat/dsc-humanize-asset-template) 的 `specs/spec-version.json` 对应:

| 字段 | 对应上游 | 含义 |
|:---:|:---:|:---:|
| `assetSpecVersion` | `spec_version` | 本合集据以判定资产包合规的规范版本 |
| `assetFormatVersion` | `format_version` | 拉取时接受的包元数据 `formatVersion` |

上游升版时,改这两个字段并同步 `scripts/lib/fetch.mjs` 的字段约束;不做静默兼容。

## 没有站点工程

本合集不发展示站点:发布目录里只有索引、清单、信任材料与收录的资产包。`dist/pages` 需要一个静态服务时由本地或 CI 自行起,端口约定见仓库根的 `.env.example`。
