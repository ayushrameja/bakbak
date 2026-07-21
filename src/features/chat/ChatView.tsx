import { Send, Sparkles } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Avatar } from "../../components/Avatar";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type {
  AppUser,
  Channel,
  ChatMessage,
  ConversationMessage,
  ConversationTarget,
  MessageDraft,
  ServerMember,
} from "../../lib/types";
import {
  EMPTY_MESSAGE_DRAFT,
  findMentionQuery,
  insertMention,
  updateDraftText,
} from "./message-content";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;

interface ChatViewProps {
  channel: Channel;
  messages: ChatMessage[];
  members: ServerMember[];
  currentUser: AppUser;
  sending: boolean;
  draft: MessageDraft;
  onDraftChange: (draft: MessageDraft) => void;
  onSend: (draft: MessageDraft) => Promise<void>;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  openProfileId?: string | null;
}

export function ChatView({
  channel,
  messages,
  members,
  currentUser,
  sending,
  draft,
  onDraftChange,
  onSend,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  openProfileId = null,
}: ChatViewProps) {
  return (
    <ConversationView
      target={{
        kind: "channel",
        id: channel.id,
        name: channel.name,
        topic: channel.topic,
      }}
      messages={messages}
      members={members}
      currentUser={currentUser}
      sending={sending}
      draft={draft}
      onDraftChange={onDraftChange}
      onSend={onSend}
      loadProfileMedia={loadProfileMedia}
      onOpenProfile={onOpenProfile}
      openProfileId={openProfileId}
    />
  );
}

interface ConversationViewProps {
  target: ConversationTarget;
  messages: ConversationMessage[];
  members: ServerMember[];
  currentUser: AppUser;
  sending: boolean;
  draft: MessageDraft;
  onDraftChange: (draft: MessageDraft) => void;
  onSend: (draft: MessageDraft) => Promise<void>;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  openProfileId?: string | null;
}

export function ConversationView({
  target,
  messages,
  members,
  currentUser,
  sending,
  draft,
  onDraftChange,
  onSend,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  openProfileId = null,
}: ConversationViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] =
    useState<ReturnType<typeof findMentionQuery>>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );
  const suggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const query = mentionQuery.query.toLocaleLowerCase();
    return members
      .filter((member) =>
        member.displayName.toLocaleLowerCase().includes(query),
      )
      .sort((left, right) => {
        const leftStarts = left.displayName
          .toLocaleLowerCase()
          .startsWith(query);
        const rightStarts = right.displayName
          .toLocaleLowerCase()
          .startsWith(query);
        return (
          Number(rightStarts) - Number(leftStarts) ||
          left.displayName.localeCompare(right.displayName) ||
          left.id.localeCompare(right.id)
        );
      })
      .slice(0, 8);
  }, [members, mentionQuery]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (typeof list.scrollTo === "function") {
      list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }, [messages, target.id]);

  useEffect(() => setActiveSuggestion(0), [mentionQuery?.query]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.text.trim() || sending) return;
    const submitted = draft;
    onDraftChange(EMPTY_MESSAGE_DRAFT);
    setMentionQuery(null);
    try {
      await onSend(submitted);
    } catch {
      onDraftChange(submitted);
    }
  }

  function refreshMentionQuery(text = draft.text) {
    const input = inputRef.current;
    setMentionQuery(
      findMentionQuery(text, input?.selectionStart ?? text.length),
    );
  }

  function chooseMention(member: ServerMember) {
    if (!mentionQuery) return;
    const next = insertMention(
      draft,
      member,
      mentionQuery.start,
      mentionQuery.end,
    );
    onDraftChange(next);
    setMentionQuery(null);
    const cursor = mentionQuery.start + member.displayName.length + 2;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!mentionQuery || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion(
        (current) => (current - 1 + suggestions.length) % suggestions.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const member = suggestions[activeSuggestion];
      if (member) chooseMention(member);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMentionQuery(null);
    }
  }

  return (
    <section className="chat-view">
      <div className="message-list" ref={listRef}>
        <div className="channel-intro">
          <span className="channel-intro__icon">
            {target.kind === "channel" ? "#" : "@"}
          </span>
          <h2>
            {target.kind === "channel"
              ? `Welcome to #${target.name}`
              : `Your conversation with ${target.member.displayName}`}
          </h2>
          <p>
            {target.kind === "channel"
              ? target.topic || "This is where the conversation begins."
              : "A private conversation between the two of you."}
          </p>
          <span className="channel-intro__meta">
            <Sparkles size={15} />{" "}
            {target.kind === "channel"
              ? "Private room · friends only"
              : "Direct message · participants only"}
          </span>
        </div>

        {messages.length === 0 ? (
          <div className="empty-conversation">
            <span>There is an admirably suspicious amount of peace here.</span>
            <p>Send the first message before someone schedules a meeting.</p>
          </div>
        ) : null}

        {messages.map((message, index) => {
          const author =
            membersById.get(message.authorId) ??
            (message.authorId === currentUser.id ? currentUser : null);
          const authorMember =
            membersById.get(message.authorId) ??
            (message.authorId === currentUser.id
              ? { ...currentUser, role: "member" }
              : null);
          const previous = messages[index - 1];
          const grouped =
            previous?.authorId === message.authorId &&
            Date.parse(message.createdAt) - Date.parse(previous.createdAt) <
              5 * 60 * 1000;
          return (
            <article
              className={`message ${grouped ? "message--grouped" : ""} ${message.pending ? "message--pending" : ""}`}
              key={message.id}
              style={
                {
                  "--startup-order": Math.min(index, 7),
                } as CSSProperties
              }
            >
              {!grouped ? (
                authorMember ? (
                  <ProfileTrigger
                    className="message__profile-avatar"
                    member={authorMember}
                    loadMedia={loadProfileMedia}
                    onOpenProfile={onOpenProfile}
                    expanded={openProfileId === authorMember.id}
                    aria-label={`View ${authorMember.displayName}'s profile`}
                  >
                    {({ animationUrl, animated }) => (
                      <Avatar
                        user={authorMember}
                        size="medium"
                        animationUrl={animationUrl}
                        animated={animated}
                      />
                    )}
                  </ProfileTrigger>
                ) : (
                  <Avatar user={fallbackUser} size="medium" />
                )
              ) : (
                <time>{formatTime(message.createdAt)}</time>
              )}
              <div className="message__body">
                {!grouped ? (
                  <header>
                    {authorMember ? (
                      <ProfileTrigger
                        className="message__profile-name"
                        member={authorMember}
                        loadMedia={loadProfileMedia}
                        onOpenProfile={onOpenProfile}
                        expanded={openProfileId === authorMember.id}
                      >
                        {() => <strong>{authorMember.displayName}</strong>}
                      </ProfileTrigger>
                    ) : (
                      <strong>{author?.displayName ?? "Former friend"}</strong>
                    )}
                    <time>{formatMessageDate(message.createdAt)}</time>
                    {message.pending ? <span>sending</span> : null}
                  </header>
                ) : null}
                <p>
                  <MessageContent
                    message={message}
                    membersById={membersById}
                    currentUserId={currentUser.id}
                    loadProfileMedia={loadProfileMedia}
                    onOpenProfile={onOpenProfile}
                    openProfileId={openProfileId}
                  />
                </p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="composer-wrap">
        {mentionQuery && suggestions.length > 0 ? (
          <div
            className="mention-suggestions"
            id={`mention-suggestions-${target.id}`}
            role="listbox"
            aria-label="Mention a friend"
          >
            {suggestions.map((member, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === activeSuggestion}
                className={index === activeSuggestion ? "is-active" : ""}
                id={`mention-option-${target.id}-${member.id}`}
                key={member.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseMention(member)}
              >
                <Avatar user={member} size="small" />
                <span>
                  <strong>{member.displayName}</strong>
                  {member.id === currentUser.id ? <small>(you)</small> : null}
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <form className="composer" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            aria-label={
              target.kind === "channel"
                ? `Message #${target.name}`
                : `Message ${target.member.displayName}`
            }
            aria-controls={
              mentionQuery && suggestions.length > 0
                ? `mention-suggestions-${target.id}`
                : undefined
            }
            aria-activedescendant={
              mentionQuery && suggestions[activeSuggestion]
                ? `mention-option-${target.id}-${suggestions[activeSuggestion].id}`
                : undefined
            }
            aria-expanded={Boolean(mentionQuery && suggestions.length)}
            aria-autocomplete="list"
            role="combobox"
            value={draft.text}
            onChange={(event) => {
              const next = updateDraftText(draft, event.target.value);
              onDraftChange(next);
              setMentionQuery(
                findMentionQuery(
                  event.target.value,
                  event.target.selectionStart ?? event.target.value.length,
                ),
              );
            }}
            onClick={() => refreshMentionQuery()}
            onKeyUp={(event) => {
              if (
                !["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)
              ) {
                refreshMentionQuery();
              }
            }}
            onKeyDown={handleComposerKeyDown}
            placeholder={
              target.kind === "channel"
                ? `Message #${target.name}`
                : `Message ${target.member.displayName}`
            }
            maxLength={4000}
          />
          <button
            type="submit"
            className="composer__send"
            aria-label="Send message"
            disabled={!draft.text.trim() || sending}
          >
            <Send size={17} />
          </button>
        </form>
      </div>
    </section>
  );
}

function MessageContent({
  message,
  membersById,
  currentUserId,
  loadProfileMedia,
  onOpenProfile,
  openProfileId,
}: {
  message: ConversationMessage;
  membersById: ReadonlyMap<string, ServerMember>;
  currentUserId: string;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  openProfileId: string | null;
}) {
  if (!message.content) return message.body;
  return message.content.map((segment, index) => {
    if (segment.type === "text") return segment.text;
    const member = membersById.get(segment.userId);
    const className = `message-mention ${segment.userId === currentUserId ? "message-mention--self" : ""}`;
    return member ? (
      <ProfileTrigger
        className={className}
        data-user-id={segment.userId}
        key={`${segment.userId}-${index}`}
        member={member}
        loadMedia={loadProfileMedia}
        onOpenProfile={onOpenProfile}
        expanded={openProfileId === member.id}
        aria-label={`View ${member.displayName}'s profile`}
      >
        {() => <>@{member.displayName}</>}
      </ProfileTrigger>
    ) : (
      <span
        className={className}
        data-user-id={segment.userId}
        key={`${segment.userId}-${index}`}
      >
        @{segment.fallback}
      </span>
    );
  });
}

const fallbackUser: AppUser = {
  id: "unknown",
  displayName: "Friend",
  email: "",
  avatarUrl: null,
  avatarAnimationUrl: null,
  avatarPath: null,
  avatarAnimationPath: null,
  coverUrl: null,
  coverAnimationUrl: null,
  coverPath: null,
  coverAnimationPath: null,
  coverPositionX: 50,
  coverPositionY: 50,
  description: "",
  status: "offline",
};

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatMessageDate(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  return `${isToday ? "Today" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)} at ${formatTime(value)}`;
}
