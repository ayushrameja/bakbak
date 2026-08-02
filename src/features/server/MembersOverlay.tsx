import { Modal } from "../../components/Modal";
import type {
  LoadProfileMedia,
  OpenProfile,
} from "../../components/ProfileTrigger";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import type { ServerMember } from "../../lib/types";
import { MemberPanel, type MemberVoiceActivity } from "./MemberPanel";

interface MembersOverlayProps {
  members: ServerMember[];
  voiceActivities: ReadonlyArray<MemberVoiceActivity>;
  currentUserId: string;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId: string | null;
  onMessage: (member: ServerMember) => void;
  onWatchStream: (member: ServerMember, channelId: string) => void;
  onClose: () => void;
}

export function MembersOverlay({
  members,
  voiceActivities,
  currentUserId,
  loadProfileMedia,
  onOpenProfile,
  onOpenUserContextMenu,
  openProfileId,
  onMessage,
  onWatchStream,
  onClose,
}: MembersOverlayProps) {
  return (
    <Modal
      eyebrow="Bakbak"
      title="Members"
      description="See who is around, in voice, or taking a very committed offline nap."
      size="wide"
      overlayOwner="members"
      onClose={onClose}
    >
      <MemberPanel
        members={members}
        voiceActivities={voiceActivities}
        currentUserId={currentUserId}
        loadProfileMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        onOpenUserContextMenu={onOpenUserContextMenu}
        openProfileId={openProfileId}
        onMessage={(member) => {
          onClose();
          onMessage(member);
        }}
        onWatchStream={(member, channelId) => {
          onClose();
          onWatchStream(member, channelId);
        }}
      />
    </Modal>
  );
}
