import { Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Avatar } from "../../components/Avatar";
import type {
  AppUser,
  Channel,
  ChatMessage,
  ServerMember,
} from "../../lib/types";

interface ChatViewProps {
  channel: Channel;
  messages: ChatMessage[];
  members: ServerMember[];
  currentUser: AppUser;
  sending: boolean;
  onSend: (body: string) => Promise<void>;
}

export function ChatView({
  channel,
  messages,
  members,
  currentUser,
  sending,
  onSend,
}: ChatViewProps) {
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const membersById = useMemo(
    () => new Map(members.map((member) => [member.id, member])),
    [members],
  );

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, channel.id]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setDraft("");
    try {
      await onSend(body);
    } catch {
      setDraft(body);
    }
  }

  return (
    <section className="chat-view">
      <div className="message-list" ref={listRef}>
        <div className="channel-intro">
          <span className="channel-intro__icon">#</span>
          <h2>Welcome to #{channel.name}</h2>
          <p>{channel.topic || "This is where the conversation begins."}</p>
          <span className="channel-intro__meta">
            <Sparkles size={15} /> Private room · friends only
          </span>
        </div>

        {messages.length === 0 ? (
          <div className="empty-conversation">
            <span>There is an admirably suspicious amount of peace here.</span>
            <p>Tai, yaar apna kaam kar—then send the first message.</p>
          </div>
        ) : null}

        {messages.map((message, index) => {
          const author =
            membersById.get(message.authorId) ??
            (message.authorId === currentUser.id ? currentUser : null);
          const previous = messages[index - 1];
          const grouped =
            previous?.authorId === message.authorId &&
            Date.parse(message.createdAt) - Date.parse(previous.createdAt) <
              5 * 60 * 1000;
          return (
            <article
              className={`message ${grouped ? "message--grouped" : ""} ${message.pending ? "message--pending" : ""}`}
              key={message.id}
            >
              {!grouped ? (
                <Avatar user={author ?? fallbackUser} size="medium" />
              ) : (
                <time>{formatTime(message.createdAt)}</time>
              )}
              <div className="message__body">
                {!grouped ? (
                  <header>
                    <strong>{author?.displayName ?? "Former friend"}</strong>
                    <time>{formatMessageDate(message.createdAt)}</time>
                    {message.pending ? <span>sending</span> : null}
                  </header>
                ) : null}
                <p>{message.body}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="composer-wrap">
        <form className="composer" onSubmit={handleSubmit}>
          <input
            aria-label={`Message #${channel.name}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Message #${channel.name}`}
            maxLength={4000}
          />
          <button
            type="submit"
            className="composer__send"
            aria-label="Send message"
            disabled={!draft.trim() || sending}
          >
            <Send size={17} />
          </button>
        </form>
      </div>
    </section>
  );
}

const fallbackUser: AppUser = {
  id: "unknown",
  displayName: "Friend",
  email: "",
  avatarUrl: null,
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
