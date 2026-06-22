import type {
  DmRoomData,
  DmMessageData,
  DmGroupParticipantData,
  CreateGroupRequest,
  UpdateGroupRequest,
  InviteMembersRequest,
  ChangeRoleRequest,
  MuteRoomRequest,
} from './types';

// ══════════════════════════════════════════════════════════════
// DM Service — API 래핑 함수
// Phase 1: 1:1 DM + Phase 3: 그룹 채팅 (별자리 대화)
// ══════════════════════════════════════════════════════════════

export const dmService = {
  // ── 방 목록/생성 (Phase 1 + Phase 3) ──

  async getRooms(): Promise<DmRoomData[]> {
    const res = await fetch('/api/dm/rooms');
    if (!res.ok) throw new Error('Failed to fetch rooms');
    const json = await res.json();
    return json.data.rooms;
  },

  /** 1:1 DM/CS 방 생성 */
  async createRoom(targetUserId: string, type: 'DM' | 'CS' = 'DM'): Promise<{ id: string }> {
    const res = await fetch('/api/dm/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId, type }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to create room');
    }
    const json = await res.json();
    return json.data.room;
  },

  /** 그룹(별자리) 방 생성 */
  async createGroupRoom(request: CreateGroupRequest): Promise<{ id: string }> {
    const res = await fetch('/api/dm/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to create group room');
    }
    const json = await res.json();
    return json.data.room;
  },

  // ── 메시지 (Phase 1, 변경 없음) ──

  async getMessages(
    roomId: string,
    cursor?: string | null,
    limit = 50
  ): Promise<{
    messages: DmMessageData[];
    nextCursor: string | null;
    partnerLastReadAt: string | null;
  }> {
    const url = new URL(`/api/dm/rooms/${roomId}/messages`, window.location.origin);
    if (cursor) url.searchParams.append('cursor', cursor);
    url.searchParams.append('limit', limit.toString());

    const res = await fetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch messages');
    const json = await res.json();
    return json.data;
  },

  async sendMessage(
    roomId: string,
    content: string,
    type: string = 'TEXT',
    images: string[] = []
  ): Promise<DmMessageData> {
    const res = await fetch(`/api/dm/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type, images }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    const json = await res.json();
    return json.data.message;
  },

  async markAsRead(roomId: string): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}/read`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to mark as read');
  },

  async leaveRoom(roomId: string): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}/leave`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to leave room');
  },

  // ── 그룹 관리 (Phase 3) ──

  /** 멤버 초대 (KEEPER만) */
  async inviteMembers(roomId: string, request: InviteMembersRequest): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to invite members');
    }
  },

  /** 멤버 강퇴 (KEEPER만) */
  async removeMember(roomId: string, userId: string): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}/members/${userId}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to remove member');
    }
  },

  /** 그룹 설정 변경 (KEEPER만) — 이름, 프로필 이미지 */
  async updateGroupSettings(roomId: string, request: UpdateGroupRequest): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to update group settings');
    }
  },

  /** 역할 변경 (KEEPER만) */
  async changeRole(roomId: string, userId: string, request: ChangeRoleRequest): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}/members/${userId}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to change role');
    }
  },

  /** 알림 음소거 설정 (본인) */
  async muteRoom(roomId: string, request: MuteRoomRequest): Promise<void> {
    const res = await fetch(`/api/dm/rooms/${roomId}/mute`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(err.error || 'Failed to mute room');
    }
  },

  /** 그룹 멤버 목록 조회 */
  async getGroupMembers(roomId: string): Promise<DmGroupParticipantData[]> {
    const res = await fetch(`/api/dm/rooms/${roomId}`);
    if (!res.ok) throw new Error('Failed to fetch room details');
    const json = await res.json();
    return json.data.room.participants || [];
  },
};
