import {
  CirclePlus,
  ExternalLink,
  LockKeyhole,
  Megaphone,
  MessageSquareReply,
  PartyPopper,
  Send,
  Smile,
  SmilePlus,
  Sparkles,
  Sticker as StickerIcon,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Avatar } from "../../components/Avatar";
import { Modal } from "../../components/Modal";
import {
  ProfileTrigger,
  type LoadProfileMedia,
  type OpenProfile,
} from "../../components/ProfileTrigger";
import type { OpenUserContextMenu } from "../../components/UserContextMenu";
import type {
  AppUser,
  Channel,
  ChatMessage,
  ConversationMessage,
  ConversationTarget,
  LinkPreview,
  MessageDraft,
  MessagePresentation,
  ServerMember,
  Sticker,
  SystemMessageEvent,
} from "../../lib/types";
import { openExternalLink, tokenizeMessageText } from "../../lib/link-preview";
import {
  registerGiphyAction,
  resolveGiphyAssets,
  toGiphyPresentation,
  type GiphyAsset,
} from "../../lib/giphy-service";
import {
  EMPTY_MESSAGE_DRAFT,
  findMentionQuery,
  insertMention,
  updateDraftText,
} from "./message-content";
import {
  MAX_MESSAGE_ATTACHMENTS,
  prepareMessageAttachment,
} from "./message-media";
import { EmojiPicker } from "./EmojiPicker";
import { GiphyPicker } from "./GiphyPicker";
import { RichMessageMedia } from "./RichMessageMedia";
import { StickerPicker } from "./StickerPicker";

const emptyProfileMediaLoader: LoadProfileMedia = () => Promise.resolve(null);
const ignoreProfileOpen: OpenProfile = () => undefined;
const BOTTOM_SCROLL_THRESHOLD = 96;

interface ChatViewProps {
  channel: Channel;
  messages: ChatMessage[];
  members: ServerMember[];
  currentUser: AppUser;
  sending: boolean;
  draft: MessageDraft;
  onDraftChange: (draft: MessageDraft) => void;
  onSend: (draft: MessageDraft) => Promise<void>;
  readOnlyReason?: string | null;
  onLoadOlder?: () => Promise<number>;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId?: string | null;
  stickers?: Sticker[];
  currentUserIsAdmin?: boolean;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReact?: (messageId: string, stickerId: string) => Promise<void>;
  onUploadSticker?: (file: File, label: string) => Promise<void>;
  onArchiveSticker?: (stickerId: string) => Promise<void>;
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
  readOnlyReason = null,
  onLoadOlder,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  onOpenUserContextMenu,
  openProfileId = null,
  stickers = [],
  currentUserIsAdmin = false,
  onDeleteMessage,
  onReact,
  onUploadSticker,
  onArchiveSticker,
}: ChatViewProps) {
  return (
    <ConversationView
      target={{
        kind: "channel",
        id: channel.id,
        name: channel.name,
        topic: channel.topic,
        purpose: channel.purpose ?? "chat",
      }}
      messages={messages}
      members={members}
      currentUser={currentUser}
      sending={sending}
      draft={draft}
      onDraftChange={onDraftChange}
      onSend={onSend}
      automationOnly={
        channel.purpose === "system-releases" ||
        channel.purpose === "system-general"
      }
      readOnlyReason={readOnlyReason}
      {...(onLoadOlder ? { onLoadOlder } : {})}
      loadProfileMedia={loadProfileMedia}
      onOpenProfile={onOpenProfile}
      onOpenUserContextMenu={onOpenUserContextMenu}
      openProfileId={openProfileId}
      stickers={stickers}
      currentUserIsAdmin={currentUserIsAdmin}
      {...(onDeleteMessage ? { onDeleteMessage } : {})}
      {...(onReact ? { onReact } : {})}
      {...(onUploadSticker ? { onUploadSticker } : {})}
      {...(onArchiveSticker ? { onArchiveSticker } : {})}
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
  automationOnly?: boolean;
  readOnlyReason?: string | null;
  onLoadOlder?: () => Promise<number>;
  loadProfileMedia?: LoadProfileMedia;
  onOpenProfile?: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId?: string | null;
  stickers?: Sticker[];
  currentUserIsAdmin?: boolean;
  onDeleteMessage?: (messageId: string) => Promise<void>;
  onReact?: (messageId: string, stickerId: string) => Promise<void>;
  onUploadSticker?: (file: File, label: string) => Promise<void>;
  onArchiveSticker?: (stickerId: string) => Promise<void>;
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
  automationOnly = false,
  readOnlyReason = null,
  onLoadOlder,
  loadProfileMedia = emptyProfileMediaLoader,
  onOpenProfile = ignoreProfileOpen,
  onOpenUserContextMenu,
  openProfileId = null,
  stickers = [],
  currentUserIsAdmin = false,
  onDeleteMessage,
  onReact,
  onUploadSticker,
  onArchiveSticker,
}: ConversationViewProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] =
    useState<ReturnType<typeof findMentionQuery>>(null);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [picker, setPicker] = useState<
    "emoji" | "giphy" | "sticker" | { reactionMessageId: string } | null
  >(null);
  const [preparingMedia, setPreparingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [giphyAssets, setGiphyAssets] = useState(
    () => new Map<string, GiphyAsset>(),
  );
  const [selectedGiphyAsset, setSelectedGiphyAsset] =
    useState<GiphyAsset | null>(null);
  const [deleteRequest, setDeleteRequest] = useState<{
    messageId: string;
    pending: boolean;
    hasMedia: boolean;
  } | null>(null);
  const [deletingMessage, setDeletingMessage] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const nearBottomRef = useRef(true);
  const previousThreadRef = useRef<{
    targetId: string;
    messageIds: string[];
  }>({ targetId: target.id, messageIds: [] });
  const historyAnchorRef = useRef<{
    targetId: string;
    firstMessageId: string;
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
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
  const stickersById = useMemo(
    () => new Map(stickers.map((sticker) => [sticker.id, sticker])),
    [stickers],
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.deletedAt),
    [messages],
  );
  const giphyHistoryIds = useMemo(
    () =>
      visibleMessages.flatMap((message) =>
        message.presentation?.kind === "giphy"
          ? [message.presentation.assetId]
          : [],
      ),
    [visibleMessages],
  );
  const draftGiphyId =
    draft.presentation?.kind === "giphy" ? draft.presentation.assetId : null;

  useEffect(() => {
    if (!giphyHistoryIds.length) {
      setGiphyAssets(new Map());
      return;
    }
    let cancelled = false;
    void resolveGiphyAssets(giphyHistoryIds)
      .then((assets) => {
        if (!cancelled) {
          setGiphyAssets(new Map(assets.map((asset) => [asset.id, asset])));
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setMediaError(
            caught instanceof Error
              ? caught.message
              : "GIPHY history could not be loaded.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [giphyHistoryIds]);

  useEffect(() => {
    if (!draftGiphyId) {
      setSelectedGiphyAsset(null);
      return;
    }
    let cancelled = false;
    void resolveGiphyAssets([draftGiphyId])
      .then(([asset]) => {
        if (!cancelled && asset) setSelectedGiphyAsset(asset);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [draftGiphyId]);

  const visibleMessageIds = useMemo(
    () => visibleMessages.map((message) => message.id),
    [visibleMessages],
  );
  const visibleMessageKey = visibleMessageIds.join("|");

  const isNearBottom = useCallback((list: HTMLDivElement) => {
    return (
      list.scrollHeight - list.clientHeight - list.scrollTop <=
      BOTTOM_SCROLL_THRESHOLD
    );
  }, []);

  const jumpToBottom = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
    nearBottomRef.current = true;
    setNewMessageCount(0);
  }, []);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const previous = previousThreadRef.current;
    const targetChanged = previous.targetId !== target.id;
    const previousLastId = previous.messageIds.at(-1);
    const previousLastIndex = previousLastId
      ? visibleMessageIds.indexOf(previousLastId)
      : -1;
    const appendedCount =
      previousLastIndex >= 0
        ? visibleMessageIds.length - previousLastIndex - 1
        : 0;
    const anchor = historyAnchorRef.current;

    if (targetChanged || previous.messageIds.length === 0) {
      list.scrollTop = list.scrollHeight;
      nearBottomRef.current = true;
      historyAnchorRef.current = null;
      setNewMessageCount(0);
    } else if (
      anchor?.targetId === target.id &&
      visibleMessageIds.includes(anchor.firstMessageId) &&
      visibleMessageIds[0] !== anchor.firstMessageId
    ) {
      list.scrollTop =
        anchor.scrollTop + (list.scrollHeight - anchor.scrollHeight);
      nearBottomRef.current = isNearBottom(list);
      historyAnchorRef.current = null;
      if (appendedCount > 0 && !nearBottomRef.current) {
        setNewMessageCount((current) => current + appendedCount);
      }
    } else if (appendedCount > 0) {
      if (nearBottomRef.current) {
        list.scrollTop = list.scrollHeight;
        setNewMessageCount(0);
      } else {
        setNewMessageCount((current) => current + appendedCount);
      }
    }

    previousThreadRef.current = {
      targetId: target.id,
      messageIds: visibleMessageIds,
    };
  }, [isNearBottom, target.id, visibleMessageIds, visibleMessageKey]);

  useEffect(() => setActiveSuggestion(0), [mentionQuery?.query]);

  async function handleLoadOlder() {
    const list = listRef.current;
    const firstMessageId = visibleMessageIds[0];
    if (!list || !firstMessageId || !onLoadOlder || loadingOlder) return;
    historyAnchorRef.current = {
      targetId: target.id,
      firstMessageId,
      scrollHeight: list.scrollHeight,
      scrollTop: list.scrollTop,
    };
    setLoadingOlder(true);
    try {
      const loadedCount = await onLoadOlder();
      if (loadedCount === 0) historyAnchorRef.current = null;
    } catch (caught) {
      historyAnchorRef.current = null;
      throw caught;
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isSendable(draft) || sending || preparingMedia) return;
    await submitDraft(draft);
  }

  async function submitDraft(submitted: MessageDraft) {
    const submittedGiphy =
      submitted.presentation?.kind === "giphy" &&
      selectedGiphyAsset?.id === submitted.presentation.assetId
        ? selectedGiphyAsset
        : null;
    onDraftChange(EMPTY_MESSAGE_DRAFT);
    setSelectedGiphyAsset(null);
    setMentionQuery(null);
    setPicker(null);
    try {
      await onSend(submitted);
      if (submittedGiphy) registerGiphyAction(submittedGiphy, "onsent");
    } catch {
      onDraftChange(submitted);
      setSelectedGiphyAsset(submittedGiphy);
    }
  }

  async function addFiles(files: readonly File[]) {
    if (draft.presentation) {
      setMediaError("Remove the selected GIF or sticker before adding files.");
      return;
    }
    const remaining =
      MAX_MESSAGE_ATTACHMENTS - (draft.attachments?.length ?? 0);
    if (remaining <= 0) {
      setMediaError("A message can include up to four attachments.");
      return;
    }
    setPreparingMedia(true);
    setMediaError(null);
    try {
      const prepared = [];
      for (const file of files.slice(0, remaining)) {
        prepared.push(await prepareMessageAttachment(file));
      }
      onDraftChange({
        ...draft,
        attachments: [...(draft.attachments ?? []), ...prepared],
      });
    } catch (caught) {
      setMediaError(
        caught instanceof Error
          ? caught.message
          : "That media could not be prepared.",
      );
    } finally {
      setPreparingMedia(false);
    }
  }

  function beginReply(message: ConversationMessage) {
    const author = message.authorId
      ? membersById.get(message.authorId)
      : undefined;
    onDraftChange({
      ...draft,
      replyTo: {
        id: message.id,
        authorId: message.authorId,
        authorName:
          author?.displayName ??
          (message.authorId === currentUser.id
            ? currentUser.displayName
            : "Former friend"),
        body: message.body,
        deleted: false,
      },
      notifyReplyAuthor: message.authorId !== currentUser.id,
    });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function sendPresentation(presentation: MessagePresentation) {
    const submitted: MessageDraft = {
      ...EMPTY_MESSAGE_DRAFT,
      replyTo: draft.replyTo ?? null,
      notifyReplyAuthor: draft.notifyReplyAuthor ?? true,
      presentation,
    };
    try {
      await onSend(submitted);
      onDraftChange(EMPTY_MESSAGE_DRAFT);
      setPicker(null);
    } catch {
      setMediaError("That sticker or GIF did not send.");
    }
  }

  function stageGiphy(asset: GiphyAsset) {
    setMediaError(null);
    setSelectedGiphyAsset(asset);
    onDraftChange({
      ...draft,
      presentation: toGiphyPresentation(asset),
    });
    setPicker(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  async function confirmDeleteMessage() {
    if (!deleteRequest || !onDeleteMessage) return;
    setDeletingMessage(true);
    setDeleteError(null);
    try {
      await onDeleteMessage(deleteRequest.messageId);
      setDeleteRequest(null);
    } catch (caught) {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "That message could not be deleted.",
      );
    } finally {
      setDeletingMessage(false);
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

  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.text.length;
    const end = input?.selectionEnd ?? start;
    const nextText = `${draft.text.slice(0, start)}${emoji}${draft.text.slice(end)}`;
    const cursor = start + emoji.length;
    onDraftChange(updateDraftText(draft, nextText));
    setMentionQuery(null);
    setPicker(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && draft.replyTo) {
      event.preventDefault();
      onDraftChange({ ...draft, replyTo: null, notifyReplyAuthor: true });
      return;
    }
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
      <div className="message-list-shell">
        <div
          className="message-list"
          ref={listRef}
          onScroll={(event) => {
            const nearBottom = isNearBottom(event.currentTarget);
            nearBottomRef.current = nearBottom;
            if (nearBottom) setNewMessageCount(0);
          }}
        >
          <div
            className={`conversation-flow ${visibleMessages.length === 0 ? "conversation-flow--empty" : "conversation-flow--filled"}`}
          >
            <div className="channel-intro">
              <div className="channel-intro__root">
                <span className="channel-intro__icon">
                  {target.kind === "channel" &&
                  target.purpose !== "system-releases" &&
                  target.purpose !== "system-general"
                    ? "#"
                    : target.kind === "direct"
                      ? "@"
                      : "•"}
                </span>
                <span className="channel-intro__state">
                  <i aria-hidden="true" />
                  {visibleMessages.length === 0
                    ? "Quiet room"
                    : "Conversation flowing"}
                </span>
              </div>
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
                  ? automationOnly
                    ? "Automation-only · members can view"
                    : "Private room · friends only"
                  : "Direct message · participants only"}
              </span>
            </div>

            <div className="conversation-thread">
              {onLoadOlder && visibleMessages.length >= 50 ? (
                <button
                  className="secondary-button message-list__older"
                  type="button"
                  disabled={loadingOlder}
                  onClick={() => void handleLoadOlder()}
                >
                  {loadingOlder
                    ? "Loading older messages…"
                    : "Load older messages"}
                </button>
              ) : null}

              {visibleMessages.length === 0 ? (
                <div
                  className="empty-conversation"
                  role="status"
                  aria-label="This conversation has no messages yet"
                >
                  <span
                    className="empty-conversation__spark"
                    aria-hidden="true"
                  >
                    <Sparkles size={17} />
                  </span>
                  <div>
                    <span className="empty-conversation__eyebrow">
                      {target.kind === "channel"
                        ? `#${target.name} is listening`
                        : `${target.member.displayName} is one message away`}
                    </span>
                    <strong>The first branch is yours.</strong>
                    <p>
                      Drop a thought, a plan, or a gloriously unnecessary
                      opinion.
                    </p>
                  </div>
                </div>
              ) : null}

              {visibleMessages.map((message, index) => {
                if ((message.messageKind ?? "member") === "system") {
                  const systemEvent = message.systemEvent ?? null;
                  return (
                    <SystemMessage
                      key={message.id}
                      message={message}
                      event={systemEvent}
                      member={
                        systemEvent?.type === "member_joined"
                          ? (membersById.get(systemEvent.memberId) ?? null)
                          : null
                      }
                    />
                  );
                }
                const author =
                  (message.authorId
                    ? membersById.get(message.authorId)
                    : null) ??
                  (message.authorId === currentUser.id ? currentUser : null);
                const authorMember =
                  (message.authorId
                    ? membersById.get(message.authorId)
                    : null) ??
                  (message.authorId === currentUser.id
                    ? { ...currentUser, role: "member" }
                    : null);
                const previous = visibleMessages[index - 1];
                const grouped =
                  previous?.authorId === message.authorId &&
                  Date.parse(message.createdAt) -
                    Date.parse(previous.createdAt) <
                    5 * 60 * 1000;
                return (
                  <article
                    id={`message-${message.id}`}
                    className={`message ${grouped ? "message--grouped" : ""} ${message.pending ? "message--pending" : ""} ${message.replyNotifiesAuthor && message.reply?.authorId === currentUser.id ? "message--notifies-current-user" : ""}`}
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
                          onOpenContextMenu={onOpenUserContextMenu}
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
                              onOpenContextMenu={onOpenUserContextMenu}
                              expanded={openProfileId === authorMember.id}
                            >
                              {() => (
                                <strong>{authorMember.displayName}</strong>
                              )}
                            </ProfileTrigger>
                          ) : (
                            <strong>
                              {author?.displayName ?? "Former friend"}
                            </strong>
                          )}
                          <time>{formatMessageDate(message.createdAt)}</time>
                          {message.pending ? <span>sending</span> : null}
                        </header>
                      ) : null}
                      <div
                        className="message__actions"
                        aria-label="Message actions"
                      >
                        <button
                          type="button"
                          onClick={() => beginReply(message)}
                          aria-label="Reply to message"
                        >
                          <MessageSquareReply size={15} />
                        </button>
                        {onReact && stickers.length ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPicker({ reactionMessageId: message.id })
                            }
                            aria-label="React with a sticker"
                          >
                            <SmilePlus size={15} />
                          </button>
                        ) : null}
                        {onDeleteMessage &&
                        message.authorId === currentUser.id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleteRequest({
                                messageId: message.id,
                                pending: Boolean(message.pending),
                                hasMedia: Boolean(
                                  message.attachments?.length ||
                                  message.presentation,
                                ),
                              });
                            }}
                            aria-label={
                              message.pending
                                ? "Cancel upload"
                                : "Delete message"
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                      {message.reply ? (
                        <button
                          type="button"
                          className="message-reply-preview"
                          onClick={() =>
                            document
                              .getElementById(`message-${message.reply?.id}`)
                              ?.scrollIntoView({ block: "center" })
                          }
                        >
                          <MessageSquareReply size={13} />
                          <strong>
                            {message.reply.deleted
                              ? "Original message deleted"
                              : (membersById.get(message.reply.authorId ?? "")
                                  ?.displayName ?? "Former friend")}
                          </strong>
                          {!message.reply.deleted ? (
                            <span>{message.reply.body}</span>
                          ) : null}
                        </button>
                      ) : null}
                      <p>
                        <MessageContent
                          message={message}
                          membersById={membersById}
                          currentUserId={currentUser.id}
                          loadProfileMedia={loadProfileMedia}
                          onOpenProfile={onOpenProfile}
                          onOpenUserContextMenu={onOpenUserContextMenu}
                          openProfileId={openProfileId}
                        />
                      </p>
                      <RichMessageMedia
                        message={message}
                        stickersById={stickersById}
                        giphy={
                          message.presentation?.kind === "giphy"
                            ? (giphyAssets.get(message.presentation.assetId) ??
                              null)
                            : null
                        }
                      />
                      {message.linkPreview ? (
                        <LinkPreviewCard preview={message.linkPreview} />
                      ) : null}
                      {message.pending && message.attachments?.length ? (
                        <progress
                          className="message-upload-progress"
                          value={
                            message.attachments.reduce(
                              (total, attachment) =>
                                total + (attachment.uploadProgress ?? 0),
                              0,
                            ) / message.attachments.length
                          }
                          max={1}
                          aria-label="Upload progress"
                        />
                      ) : null}
                      {message.reactions?.length ? (
                        <div
                          className="message-reactions"
                          aria-label="Sticker reactions"
                        >
                          {message.reactions.map((reaction) => {
                            const sticker = stickersById.get(
                              reaction.stickerId,
                            );
                            if (!sticker) return null;
                            const reacted = reaction.userIds.includes(
                              currentUser.id,
                            );
                            return (
                              <button
                                type="button"
                                className={reacted ? "is-active" : ""}
                                key={reaction.stickerId}
                                onClick={() =>
                                  onReact?.(message.id, reaction.stickerId)
                                }
                                title={reaction.userIds
                                  .map(
                                    (id) =>
                                      membersById.get(id)?.displayName ??
                                      (id === currentUser.id
                                        ? currentUser.displayName
                                        : "Former friend"),
                                  )
                                  .join(", ")}
                              >
                                <img
                                  src={sticker.posterUrl ?? undefined}
                                  alt={sticker.label}
                                />
                                <span>{reaction.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
              {visibleMessages.length > 0 ? (
                <span className="conversation-thread__end" aria-hidden="true" />
              ) : null}
            </div>
          </div>
        </div>
        {newMessageCount > 0 ? (
          <button
            className="message-list__new"
            type="button"
            onClick={jumpToBottom}
          >
            {newMessageCount === 1
              ? "1 new message"
              : `${newMessageCount} new messages`}
          </button>
        ) : null}
      </div>

      {automationOnly ? (
        <footer className="automation-only-footer">
          <LockKeyhole size={16} aria-hidden="true" />
          <span>
            <strong>Automation-only channel</strong>
            Bakbak posts verified updates here.
          </span>
        </footer>
      ) : (
        <div className="composer-wrap">
          {readOnlyReason ? (
            <p className="composer-status" role="status">
              {readOnlyReason}
            </p>
          ) : null}
          {mediaError ? (
            <p className="composer-status" role="alert">
              {mediaError}
            </p>
          ) : null}
          {draft.replyTo ? (
            <div className="composer-reply">
              <MessageSquareReply size={15} />
              <span>
                Replying to <strong>{draft.replyTo.authorName}</strong>
              </span>
              {draft.replyTo.authorId !== currentUser.id ? (
                <label>
                  <input
                    type="checkbox"
                    checked={draft.notifyReplyAuthor ?? true}
                    onChange={(event) =>
                      onDraftChange({
                        ...draft,
                        notifyReplyAuthor: event.target.checked,
                      })
                    }
                  />
                  Notify
                </label>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    replyTo: null,
                    notifyReplyAuthor: true,
                  })
                }
                aria-label="Cancel reply"
              >
                <X size={15} />
              </button>
            </div>
          ) : null}
          {draft.presentation?.kind === "giphy" ? (
            <div className="composer-giphy-preview">
              {selectedGiphyAsset?.id === draft.presentation.assetId ? (
                selectedGiphyAsset.previewUrl.includes(".mp4") ? (
                  <video
                    src={selectedGiphyAsset.previewUrl}
                    poster={selectedGiphyAsset.stillUrl}
                    muted
                    autoPlay
                    loop
                    playsInline
                  />
                ) : (
                  <img
                    src={selectedGiphyAsset.previewUrl}
                    alt={draft.presentation.altText}
                  />
                )
              ) : (
                <div aria-label="Loading GIF preview">GIF</div>
              )}
              <span>{draft.presentation.title || "GIPHY selection"}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedGiphyAsset(null);
                  onDraftChange({ ...draft, presentation: null });
                }}
                aria-label="Remove selected GIPHY asset"
              >
                <X size={15} />
              </button>
            </div>
          ) : null}
          {draft.attachments?.length ? (
            <div className="composer-attachments">
              {draft.attachments.map((attachment) => (
                <div key={attachment.id}>
                  <img src={attachment.previewUrl} alt="" />
                  <span>{attachment.file.name}</span>
                  {attachment.status === "uploading" ? (
                    <progress value={attachment.progress} max={1} />
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Remove ${attachment.file.name}`}
                    onClick={() => {
                      URL.revokeObjectURL(attachment.previewUrl);
                      onDraftChange({
                        ...draft,
                        attachments: draft.attachments!.filter(
                          (item) => item.id !== attachment.id,
                        ),
                      });
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
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
          {picker === "giphy" ? (
            <GiphyPicker
              onClose={() => setPicker(null)}
              onSelect={stageGiphy}
            />
          ) : picker === "emoji" ? (
            <EmojiPicker
              onClose={() => setPicker(null)}
              onSelect={insertEmoji}
            />
          ) : picker === "sticker" ? (
            <StickerPicker
              stickers={stickers}
              currentUserId={currentUser.id}
              currentUserIsAdmin={currentUserIsAdmin}
              onClose={() => setPicker(null)}
              onSelect={(sticker) =>
                void sendPresentation({
                  kind: "sticker",
                  stickerId: sticker.id,
                })
              }
              {...(onUploadSticker ? { onUpload: onUploadSticker } : {})}
              {...(onArchiveSticker ? { onArchive: onArchiveSticker } : {})}
            />
          ) : picker && typeof picker === "object" ? (
            <StickerPicker
              reactionMode
              stickers={stickers}
              currentUserId={currentUser.id}
              currentUserIsAdmin={currentUserIsAdmin}
              onClose={() => setPicker(null)}
              onSelect={(sticker) => {
                void onReact?.(picker.reactionMessageId, sticker.id);
                setPicker(null);
              }}
            />
          ) : null}
          <form
            className="composer"
            onSubmit={handleSubmit}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event: DragEvent<HTMLFormElement>) => {
              event.preventDefault();
              void addFiles([...event.dataTransfer.files]);
            }}
          >
            <input
              ref={attachmentInputRef}
              className="visually-hidden"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,video/mp4"
              onChange={(event) => {
                void addFiles([...(event.target.files ?? [])]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="composer__attachment"
              aria-label="Add attachment"
              title="Add attachment"
              disabled={Boolean(readOnlyReason) || preparingMedia}
              onClick={() => attachmentInputRef.current?.click()}
            >
              <CirclePlus size={20} />
            </button>
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
              disabled={Boolean(readOnlyReason)}
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
                  !["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(
                    event.key,
                  )
                ) {
                  refreshMentionQuery();
                }
              }}
              onKeyDown={handleComposerKeyDown}
              onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                const files = [...event.clipboardData.files];
                if (files.length) {
                  event.preventDefault();
                  void addFiles(files);
                }
              }}
              placeholder={
                readOnlyReason ??
                (target.kind === "channel"
                  ? `Message #${target.name}`
                  : `Message ${target.member.displayName}`)
              }
              maxLength={4000}
            />
            <div className="composer__actions">
              <button
                type="button"
                className="composer__gif"
                aria-label="Open GIPHY"
                aria-expanded={picker === "giphy"}
                title="GIFs"
                disabled={Boolean(readOnlyReason)}
                onClick={() =>
                  setPicker((current) => (current === "giphy" ? null : "giphy"))
                }
              >
                <span aria-hidden="true">GIF</span>
              </button>
              <button
                type="button"
                aria-label="Open Bakbak stickers"
                aria-expanded={picker === "sticker"}
                title="Bakbak stickers"
                disabled={Boolean(readOnlyReason)}
                onClick={() =>
                  setPicker((current) =>
                    current === "sticker" ? null : "sticker",
                  )
                }
              >
                <StickerIcon size={19} />
              </button>
              <button
                type="button"
                aria-label="Open emoji picker"
                aria-expanded={picker === "emoji"}
                title="Emoji"
                disabled={Boolean(readOnlyReason)}
                onClick={() =>
                  setPicker((current) => (current === "emoji" ? null : "emoji"))
                }
              >
                <Smile size={20} />
              </button>
              <button
                type="submit"
                className="composer__send"
                aria-label="Send message"
                title="Send message"
                disabled={
                  Boolean(readOnlyReason) ||
                  !isSendable(draft) ||
                  sending ||
                  preparingMedia
                }
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </div>
      )}
      {deleteRequest ? (
        <Modal
          eyebrow={
            deleteRequest.pending
              ? "Upload in progress"
              : "This can’t be undone"
          }
          title={deleteRequest.pending ? "Cancel upload?" : "Delete message?"}
          description={
            deleteRequest.pending
              ? "The pending message and its uploads will be removed."
              : deleteRequest.hasMedia
                ? "This removes the message and uploaded media for everyone. Replies will show that the original was deleted."
                : "This removes the message for everyone. Replies will show that the original was deleted."
          }
          size="compact"
          onClose={() => {
            if (!deletingMessage) setDeleteRequest(null);
          }}
        >
          <div className="message-delete-confirm">
            {deleteError ? (
              <p className="settings-error" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="message-delete-confirm__actions">
              <button
                className="secondary-button"
                type="button"
                disabled={deletingMessage}
                onClick={() => setDeleteRequest(null)}
              >
                {deleteRequest.pending ? "Keep uploading" : "Keep message"}
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={deletingMessage}
                onClick={() => void confirmDeleteMessage()}
              >
                <Trash2 size={16} />
                {deletingMessage
                  ? "Deleting…"
                  : deleteRequest.pending
                    ? "Cancel upload"
                    : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function isSendable(draft: MessageDraft): boolean {
  return Boolean(
    draft.text.trim() || draft.attachments?.length || draft.presentation,
  );
}

function MessageContent({
  message,
  membersById,
  currentUserId,
  loadProfileMedia,
  onOpenProfile,
  onOpenUserContextMenu,
  openProfileId,
}: {
  message: ConversationMessage;
  membersById: ReadonlyMap<string, ServerMember>;
  currentUserId: string;
  loadProfileMedia: LoadProfileMedia;
  onOpenProfile: OpenProfile;
  onOpenUserContextMenu?: OpenUserContextMenu | undefined;
  openProfileId: string | null;
}) {
  if (!message.content) return <LinkedText text={message.body} />;
  return message.content.map((segment, index) => {
    if (segment.type === "text") {
      return <LinkedText key={`text-${index}`} text={segment.text} />;
    }
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
        onOpenContextMenu={onOpenUserContextMenu}
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

function LinkedText({ text }: { text: string }) {
  return tokenizeMessageText(text).map((token, index) =>
    token.type === "text" ? (
      token.text
    ) : (
      <a
        className="message-link"
        href={token.url}
        key={`${token.url}-${index}`}
        rel="noopener noreferrer"
        target="_blank"
        onClick={(event) => {
          event.preventDefault();
          void openExternalLink(token.url);
        }}
      >
        {token.text}
      </a>
    ),
  );
}

function SystemMessage({
  message,
  event,
  member,
}: {
  message: ConversationMessage;
  event: SystemMessageEvent | null;
  member: ServerMember | null;
}) {
  if (!event) {
    return (
      <article className="message message--system" id={`message-${message.id}`}>
        <span className="system-message__icon" aria-hidden="true">
          <Megaphone size={18} />
        </span>
        <div className="system-message__body">
          <span>Bakbak System</span>
          <strong>{message.body}</strong>
          <time>{formatMessageDate(message.createdAt)}</time>
        </div>
      </article>
    );
  }
  if (event.type === "member_joined") {
    return (
      <article className="message message--system" id={`message-${message.id}`}>
        <span className="system-message__icon" aria-hidden="true">
          <PartyPopper size={18} />
        </span>
        <div className="system-message__body">
          <span>Bakbak System</span>
          <strong>
            Welcome {member?.displayName ?? event.memberName} to Bakbak!
          </strong>
          <time>{formatMessageDate(event.joinedAt)}</time>
        </div>
      </article>
    );
  }
  return (
    <article className="message message--system" id={`message-${message.id}`}>
      <span className="system-message__icon" aria-hidden="true">
        <Megaphone size={18} />
      </span>
      <div className="system-message__body system-message__body--release">
        <span>Bakbak release</span>
        <strong>{event.name || `Bakbak ${event.tag}`}</strong>
        <small>
          {event.tag} · {formatMessageDate(event.publishedAt)}
        </small>
        {event.notes ? <p>{event.notes}</p> : null}
        <a
          href={event.url}
          rel="noopener noreferrer"
          target="_blank"
          onClick={(click) => {
            click.preventDefault();
            void openExternalLink(event.url);
          }}
        >
          View release <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
  const [playing, setPlaying] = useState(false);
  if (preview.kind === "youtube") {
    return (
      <section className="link-preview link-preview--youtube">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${preview.videoId}?autoplay=1`}
            title={preview.title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <button type="button" onClick={() => setPlaying(true)}>
            <img
              src={`https://i.ytimg.com/vi/${preview.videoId}/hqdefault.jpg`}
              alt=""
              loading="lazy"
            />
            <span>
              <strong>{preview.title}</strong>
              <small>Click to load YouTube</small>
            </span>
          </button>
        )}
      </section>
    );
  }
  return (
    <a
      className="link-preview"
      href={preview.url}
      rel="noopener noreferrer"
      target="_blank"
      onClick={(event) => {
        event.preventDefault();
        void openExternalLink(preview.url);
      }}
    >
      <small>{preview.siteName}</small>
      <strong>{preview.title}</strong>
      {preview.description ? <span>{preview.description}</span> : null}
      <ExternalLink size={14} aria-hidden="true" />
    </a>
  );
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
