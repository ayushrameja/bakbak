import { KeyRound, MessageCirclePlus, X } from "lucide-react";
import { Avatar } from "../../components/Avatar";
import type {
  LoadProfileMedia,
  OpenProfile,
} from "../../components/ProfileTrigger";
import type {
  AppUser,
  DataMode,
  DirectConversation,
  ServerMember,
} from "../../lib/types";
import { SidebarVoicePanel } from "../voice/SidebarVoicePanel";
import { SidebarUserDock } from "../voice/SidebarUserDock";
import type { useVoiceRoom } from "../voice/useVoiceRoom";
import { useEffect, useRef, useState } from "react";

interface PersonalSidebarProps {
  user: AppUser;
  members: ServerMember[];
  conversations: DirectConversation[];
  selectedConversationId: string | null;
  voice: ReturnType<typeof useVoiceRoom>;
  mode: DataMode;
  soundboardOpen: boolean;
  onSelect: (conversation: DirectConversation) => void;
  onStartConversation: (member: ServerMember) => Promise<void>;
  onOpenSettings: () => void;
  onToggleSoundboard: () => void;
  onOpenScreenShare: () => void;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  openProfileId: string | null;
  inviteAvailable?: boolean;
  onOpenInvite?: () => void;
  readOnly?: boolean;
}

export function PersonalSidebar({
  user,
  members,
  conversations,
  selectedConversationId,
  voice,
  mode,
  soundboardOpen,
  onSelect,
  onStartConversation,
  onOpenSettings,
  onToggleSoundboard,
  onOpenScreenShare,
  loadProfileMedia,
  onOpenProfile,
  openProfileId,
  inviteAvailable = false,
  onOpenInvite = () => undefined,
  readOnly = false,
}: PersonalSidebarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerButtonRef = useRef<HTMLButtonElement>(null);
  const availableMembers = members.filter((member) => member.id !== user.id);
  const currentMember =
    members.find((member) => member.id === user.id) ??
    ({ ...user, role: "member" } satisfies ServerMember);

  useEffect(() => {
    if (!pickerOpen) return;
    const closeFromOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !pickerRef.current?.contains(event.target) &&
        !pickerButtonRef.current?.contains(event.target)
      ) {
        setPickerOpen(false);
      }
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPickerOpen(false);
      pickerButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [pickerOpen]);

  return (
    <aside className="channel-sidebar personal-sidebar" id="context-panel">
      <header className="server-switcher personal-sidebar__header">
        <div>
          <strong>Personal</strong>
          <span>Your private conversations</span>
        </div>
        <button
          ref={pickerButtonRef}
          type="button"
          aria-label="New message"
          aria-expanded={pickerOpen}
          aria-controls="direct-message-picker"
          onClick={() => setPickerOpen((open) => !open)}
          disabled={readOnly || availableMembers.length === 0}
        >
          <MessageCirclePlus size={17} />
        </button>
        {inviteAvailable ? (
          <button
            type="button"
            onClick={onOpenInvite}
            aria-label="Use invite"
            disabled={readOnly}
          >
            <KeyRound size={16} />
          </button>
        ) : null}
      </header>
      <nav className="personal-conversations" aria-label="Direct messages">
        {conversations.length === 0 ? (
          <div className="personal-conversations__empty">
            <strong>No direct messages yet</strong>
            <span>Start one with somebody from the club.</span>
          </div>
        ) : (
          conversations.map((conversation) => (
            <button
              className={`personal-conversation ${selectedConversationId === conversation.id ? "is-active" : ""} ${conversation.hasUnread ? "is-unread" : ""}`}
              type="button"
              key={conversation.id}
              onClick={() => onSelect(conversation)}
            >
              <Avatar user={conversation.otherMember} size="small" showStatus />
              <span>
                <strong>{conversation.otherMember.displayName}</strong>
                <small>
                  {conversation.latestMessageBody ?? "Start the conversation"}
                </small>
              </span>
              {conversation.hasUnread ? <i /> : null}
            </button>
          ))
        )}
      </nav>
      <div className="sidebar-spacer" />
      <SidebarVoicePanel
        voice={voice}
        mode={mode}
        soundboardOpen={soundboardOpen}
        onToggleSoundboard={onToggleSoundboard}
        onOpenScreenShare={onOpenScreenShare}
      />
      <SidebarUserDock
        member={currentMember}
        voice={voice}
        loadProfileMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        openProfileId={openProfileId}
        onOpenSettings={onOpenSettings}
      />
      {pickerOpen ? (
        <div
          ref={pickerRef}
          className="direct-picker"
          id="direct-message-picker"
          role="dialog"
          aria-modal="false"
          aria-label="Choose a club member"
        >
          <header>
            <div>
              <span className="eyebrow">New message</span>
              <strong>Choose a club member</strong>
            </div>
            <button
              type="button"
              aria-label="Close member picker"
              onClick={() => setPickerOpen(false)}
            >
              <X size={16} />
            </button>
          </header>
          <div>
            {availableMembers.map((member) => (
              <button
                type="button"
                key={member.id}
                aria-label={member.displayName}
                disabled={readOnly}
                onClick={() => {
                  void onStartConversation(member).then(() =>
                    setPickerOpen(false),
                  );
                }}
              >
                <Avatar user={member} size="small" showStatus />
                <span>{member.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
