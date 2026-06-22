import { DmRoomDrawer } from '@/widgets/dm/DmRoomDrawer'

export default async function DmRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params;
  return (
    <div className="min-h-[100dvh] bg-[#0b0f10] relative overflow-hidden">
      <DmRoomDrawer roomId={roomId} isStandalone={true} />
    </div>
  )
}
