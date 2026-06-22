export function isAiDirectChatRoom(
  roomType: string | null | undefined,
  isOwnerAvatarRoom: boolean,
): boolean {
  if (roomType === 'GROUP') return false
  return roomType === 'CS' || isOwnerAvatarRoom
}
