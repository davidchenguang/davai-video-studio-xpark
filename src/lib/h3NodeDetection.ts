import type { ObjectInfo } from "./comfyInfo"

export function findH3PreviewOverrideNode(info: ObjectInfo) {
  // The renderer only speaks the un-suffixed node's preview protocol (event
  // `<name>_override` carrying image/mime/fps/step/total). The CS-suffixed
  // Director node reuses the same class name but emits a frames array on a
  // different event, so it must never shadow the compatible node.
  return Object.keys(info).find((name) => name === 'MiniMaxH3PreviewOverride')
    ?? Object.keys(info).find((name) => name === 'MiniMaxH3PreviewOverrideCS')
    ?? Object.keys(info).find((name) => /minimax.*h3.*preview.*override/i.test(name))
}

export function findH3ParallelAttentionNode(info: ObjectInfo) {
  return Object.keys(info).find((name) => /minimax.*h3.*attention.*parallel/i.test(name))
    ?? Object.keys(info).find((name) => /h3.*parallel.*attention/i.test(name))
}

export function findSolAttentionNode(info: ObjectInfo) {
  return Object.keys(info).find((name) => name === 'SolAttnH3')
    ?? Object.keys(info).find((name) => /sol.*attn.*h3/i.test(name))
}

export function findSolCompatibleCacheNode(info: ObjectInfo) {
  return Object.keys(info).find((name) => name === 'MiniMaxH3Cache')
}

