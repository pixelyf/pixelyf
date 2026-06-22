export type MemoryStream = 'OWNER' | 'SELF' | 'VISITOR'
export type ReflectableMemoryStream = Exclude<MemoryStream, 'VISITOR'>
export type DirectChatMode = 'OWNER_AVATAR' | 'VISITOR_AVATAR'
export type MemoryNamespace =
  | 'OWNER_FEED'
  | 'OWNER_DIRECT_CHAT'
  | 'VISITOR_DIRECT_CHAT'
  | 'SELF_ACTIVITY'
export type MemoryVisibility = 'PUBLIC' | 'PRIVATE' | 'INTERNAL'

export const DIRECT_CHAT_OWNER_SOURCE = 'DIRECT_CHAT:OWNER'
export const DIRECT_CHAT_VISITOR_SOURCE_PREFIX = 'DIRECT_CHAT:VISITOR:'
const LEGACY_OWNER_DIRECT_CHAT_THEME_PREFIX = '[주인-아바타 대화]'
const LEGACY_VISITOR_DIRECT_CHAT_THEME_PREFIX = '[방문자-아바타 대화]'

type DirectChatMemoryScope = {
  memoryStream: string
  source: string
  memoryNamespace?: string | null
  memoryVisibility?: string | null
  partnerUserId?: string | null
}

type DirectChatMemoryWriteParams = {
  mode: DirectChatMode
  userId: string
  userMessage: string
  replyContent: string
}

export type MemoryMetadata = {
  memoryNamespace: MemoryNamespace
  memoryVisibility: MemoryVisibility
  partnerUserId: string | null
}

export function buildVisitorDirectChatSource(userId: string) {
  return `${DIRECT_CHAT_VISITOR_SOURCE_PREFIX}${userId}`
}

export function isOwnerDirectChatMemory(memory: Pick<DirectChatMemoryScope, 'source'> & { theme?: string }) {
  return memory.source === DIRECT_CHAT_OWNER_SOURCE
    || (memory.source === 'DIRECT_CHAT'
      && typeof memory.theme === 'string'
      && memory.theme.startsWith(LEGACY_OWNER_DIRECT_CHAT_THEME_PREFIX))
}

export function isVisitorDirectChatMemory(
  memory: Pick<DirectChatMemoryScope, 'memoryStream' | 'source' | 'memoryNamespace' | 'partnerUserId'> & { theme?: string },
  userId?: string,
) {
  if (memory.memoryStream !== 'VISITOR') {
    return false
  }

  if (userId) {
    return memory.partnerUserId === userId
      || memory.source === buildVisitorDirectChatSource(userId)
  }

  return memory.memoryNamespace === 'VISITOR_DIRECT_CHAT'
    || memory.source.startsWith(DIRECT_CHAT_VISITOR_SOURCE_PREFIX)
    || (memory.source === 'DIRECT_CHAT'
      && typeof memory.theme === 'string'
      && memory.theme.startsWith(LEGACY_VISITOR_DIRECT_CHAT_THEME_PREFIX))
}

export function isMemoryAllowedForDirectChat(
  memory: DirectChatMemoryScope,
  mode: DirectChatMode,
  userId: string,
) {
  if (mode === 'OWNER_AVATAR') {
    return memory.memoryStream === 'OWNER' || memory.memoryStream === 'SELF'
  }

  const isPublicOwnerMemory = memory.memoryStream === 'OWNER'
    && memory.memoryNamespace === 'OWNER_FEED'
    && memory.memoryVisibility === 'PUBLIC'

  return isPublicOwnerMemory || isVisitorDirectChatMemory(memory, userId)
}

export function buildDirectChatMemoryWrite(params: DirectChatMemoryWriteParams): {
  memoryStream: MemoryStream
  source: string
  theme: string
  metadata: MemoryMetadata
} {
  const { mode, userId, userMessage, replyContent } = params

  if (mode === 'OWNER_AVATAR') {
    return {
      memoryStream: 'OWNER',
      source: DIRECT_CHAT_OWNER_SOURCE,
      theme: `[주인-아바타 대화] 주인: "${userMessage.slice(0, 100)}" / 아바타: "${replyContent.slice(0, 100)}"`,
      metadata: {
        memoryNamespace: 'OWNER_DIRECT_CHAT',
        memoryVisibility: 'PRIVATE',
        partnerUserId: userId,
      },
    }
  }

  return {
    memoryStream: 'VISITOR',
    source: buildVisitorDirectChatSource(userId),
    theme: `[방문자-아바타 대화] 방문자: "${userMessage.slice(0, 100)}" / 아바타: "${replyContent.slice(0, 100)}"`,
    metadata: {
      memoryNamespace: 'VISITOR_DIRECT_CHAT',
      memoryVisibility: 'PRIVATE',
      partnerUserId: userId,
    },
  }
}

export function getReflectionMemoryStreams(): readonly ReflectableMemoryStream[] {
  return ['SELF', 'OWNER'] as const
}

export function getReflectionMetadata(stream: ReflectableMemoryStream): MemoryMetadata {
  if (stream === 'OWNER') {
    return {
      memoryNamespace: 'OWNER_FEED',
      memoryVisibility: 'PUBLIC',
      partnerUserId: null,
    }
  }

  return {
    memoryNamespace: 'SELF_ACTIVITY',
    memoryVisibility: 'INTERNAL',
    partnerUserId: null,
  }
}

export function resolveReflectionMemoryMetadata(
  stream: ReflectableMemoryStream,
  memory: DirectChatMemoryScope & { theme?: string },
): MemoryMetadata {
  if (stream === 'OWNER' && (
    memory.memoryNamespace === 'OWNER_DIRECT_CHAT'
    || isOwnerDirectChatMemory(memory)
  )) {
    return {
      memoryNamespace: 'OWNER_DIRECT_CHAT',
      memoryVisibility: 'PRIVATE',
      partnerUserId: memory.partnerUserId ?? null,
    }
  }

  return getReflectionMetadata(stream)
}
