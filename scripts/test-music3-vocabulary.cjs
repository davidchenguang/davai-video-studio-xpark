'use strict'
// Music 3 的「显示 / 提示词」双语层校验。
//
// 流派、调性、情绪走向、关键词、风格描述预设这些值同时出现在界面上
// （下拉建议、芯片按钮、预设卡片）和 Music 3 的提示词里。按分层规则，
// 每一个值都必须有中文显示标签；提示词层（英文原值）必须保持不变。
//
// 同时校验：中文标签本身不含英文残留（除登记在 keep 列表里的流派专名），
// 以及提示词层的值里没有混入中文字符。
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const exportsObject = {}
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('src/lib/music3Vocabulary.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: exportsObject },
)
const {
  music3Genres, music3Keys, music3Progressions, music3KeywordGroups, music3MetadataPresets,
  music3GenreLabels, music3KeyLabels, music3ProgressionLabels, music3KeywordLabels, music3MetadataLabels,
} = exportsObject

// 没有通行中文译名的流派专名也译成中文（见 glossary「音乐术语」），
// 所以这里没有 keep 名单：每个提示词值都必须有中文显示标签。

const CJK = /[\u2E80-\u2EFF\u3000-\u303F\u31C0-\u31EF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/

const allKeywords = [...music3KeywordGroups.vocals, ...music3KeywordGroups.arrangement]
const groups = [
  { name: 'genres', values: music3Genres, labels: music3GenreLabels, known: music3Genres },
  { name: 'keys', values: music3Keys, labels: music3KeyLabels, known: music3Keys },
  { name: 'progressions', values: music3Progressions, labels: music3ProgressionLabels, known: music3Progressions },
  { name: 'metadataPresets', values: music3MetadataPresets, labels: music3MetadataLabels, known: music3MetadataPresets },
  { name: 'keywordGroups.vocals', values: music3KeywordGroups.vocals, labels: music3KeywordLabels, known: allKeywords },
  { name: 'keywordGroups.arrangement', values: music3KeywordGroups.arrangement, labels: music3KeywordLabels, known: allKeywords },
]

for (const group of groups) {
  for (const value of group.values) {
    // 提示词层：值本身不得含中文。
    assert.ok(!CJK.test(value), `${group.name}: 提示词层值不能含中文：${value}`)
    const label = group.labels[value]
    assert.ok(label, `${group.name}: 缺少中文显示标签：${value}`)
    assert.ok(CJK.test(label), `${group.name}: 显示标签必须是中文：${value}`)
    assert.ok(!/[A-Za-z]{2,}/.test(label), `${group.name}: 显示标签不应残留英文单词：${value} -> ${label}`)
  }
}

// 反向：映射表不得有悬空键（提示词层已不存在的英文值）。
for (const group of groups) {
  for (const key of Object.keys(group.labels)) {
    assert.ok(group.known.includes(key), `${group.name}: 映射表里的键不在值列表中：${key}`)
  }
}

// 关键词映射表被两组共用，两组都要覆盖到。
for (const key of Object.keys(music3KeywordLabels)) {
  assert.ok(
    music3KeywordGroups.vocals.includes(key) || music3KeywordGroups.arrangement.includes(key),
    `keywordLabels: 映射表里的键不属于任何一组关键词：${key}`,
  )
}

console.log(`PASS: Music 3 双语层完整（${groups.reduce((sum, group) => sum + group.values.length, 0)} 个提示词值全部有中文显示标签，提示词层保持英文）`)
