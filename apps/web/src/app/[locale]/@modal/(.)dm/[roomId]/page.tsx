import { DmRoomDrawer } from '@/widgets/dm/DmRoomDrawer'

export default async function InterceptedDmRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return <DmRoomDrawer roomId={roomId} />
}
