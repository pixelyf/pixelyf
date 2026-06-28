// ══════════════════════════════════════════════════════════════
// DM 타입 정의 (Phase 1: 1:1 DM + Phase 3: 그룹 채팅)
// ══════════════════════════════════════════════════════════════

/** 방 유형 */
export type DmRoomType = 'DM' | 'GROUP' | 'CS';

/** 참여자 역할 */
export type DmParticipantRole = 'KEEPER' | 'MEMBER';

/** 메시지 타입 */
export type DmMessageType = 'TEXT' | 'IMAGE' | 'SYSTEM' | 'AI_TEXT';

export interface DmMessageTranslationData {
  locale: string;
  content: string;
  status: string;
  tokensUsed: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/** 시스템 메시지 액션 코드 */
export type SystemMessageAction =
  | 'GROUP_CREATED'
  | 'MEMBER_INVITED'
  | 'MEMBER_LEFT'
  | 'MEMBER_REMOVED'
  | 'ROLE_CHANGED'
  | 'GROUP_UPDATED';

// ── 참여자 ──

export interface DmParticipantData {
  id: string;
  display_name: string;
  avatar_image_url: string | null;
  current_aura: string;
}

export interface DmGroupParticipantData {
  userId: string;
  role: DmParticipantRole;
  muteUntil: string | null;
  joinedAt: string;
  user: {
    id: string;
    display_name: string;
    avatar_image_url: string | null;
    current_aura: string;
  };
}

// ── 방 ──

export interface DmRoomData {
  id: string;
  /** 방 유형 (하위 호환: 없으면 'DM' 취급) */
  type: DmRoomType;
  /** 1:1 DM 상대방 (GROUP에서는 null) */
  partner: DmParticipantData | null;
  /** 그룹명 (DM에서는 null) */
  name: string | null;
  /** 그룹 프로필 이미지 (DM에서는 null) */
  avatarUrl: string | null;
  /** 현재 참여자 수 (GROUP에서만 유의미) */
  participantCount: number;
  /** 마지막 메시지 */
    lastMessage: {
      id: string;
      content: string;
      originalContent?: string;
      displayContent?: string;
      displayLanguage?: string;
      translationStatus?: string;
      translations?: DmMessageTranslationData[];
      createdAt: string;
      type: string;
    } | null;
  unreadCount: number;
  updatedAt: string | null;
}

// ── 메시지 ──

export interface DmMessageData {
  id: string;
  roomId: string;
    senderId: string;
    content: string;
    originalContent?: string;
    displayContent?: string;
    displayLanguage?: string;
    translationStatus?: string;
    translations?: DmMessageTranslationData[];
    images: string[];
  type: string;
  deletedAt: string | null;
  createdAt: string;
  sender?: {
    id: string;
    display_name: string;
    avatar_image_url: string | null;
  };
}

// ── API 요청/응답 ──

/** 그룹 생성 요청 */
export interface CreateGroupRequest {
  type: 'GROUP';
  targetUserIds: string[];
  name?: string;
  avatarUrl?: string;
}

/** 그룹 설정 변경 요청 */
export interface UpdateGroupRequest {
  name?: string;
  avatarUrl?: string;
}

/** 멤버 초대 요청 */
export interface InviteMembersRequest {
  userIds: string[];
}

/** 역할 변경 요청 */
export interface ChangeRoleRequest {
  role: DmParticipantRole;
}

/** 알림 음소거 요청 */
export interface MuteRoomRequest {
  /** ISO 8601 날짜 또는 null (해제) */
  muteUntil: string | null;
}
