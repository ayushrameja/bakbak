import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

interface EmojiEntry {
  emoji: string;
  label: string;
  keywords: string;
}

interface EmojiCategory {
  id: string;
  label: string;
  icon: string;
  entries: EmojiEntry[];
}

const emojiCategories: EmojiCategory[] = [
  {
    id: "people",
    label: "Smileys & people",
    icon: "😀",
    entries: [
      ["😀", "Grinning face", "happy smile"],
      ["😃", "Smiling face", "happy cheerful"],
      ["😄", "Smiling eyes", "happy laugh"],
      ["😁", "Beaming face", "grin teeth"],
      ["😂", "Tears of joy", "laugh crying"],
      ["🤣", "Rolling laughing", "rofl laugh"],
      ["😊", "Warm smile", "blush happy"],
      ["🥰", "Smiling with hearts", "love adore"],
      ["😍", "Heart eyes", "love crush"],
      ["😘", "Blowing a kiss", "kiss love"],
      ["😎", "Cool face", "sunglasses"],
      ["🤓", "Nerd face", "glasses smart"],
      ["🫡", "Saluting face", "respect yes"],
      ["🤔", "Thinking face", "hmm consider"],
      ["🤨", "Raised eyebrow", "skeptical doubt"],
      ["😐", "Neutral face", "blank"],
      ["🙄", "Rolling eyes", "whatever"],
      ["😬", "Grimacing face", "awkward"],
      ["🥲", "Smiling through tears", "sad happy"],
      ["😭", "Crying loudly", "sad tears"],
      ["😤", "Huffing face", "angry triumph"],
      ["😡", "Angry face", "mad rage"],
      ["🤯", "Exploding head", "mind blown"],
      ["🥳", "Party face", "celebrate birthday"],
      ["🤡", "Clown face", "silly circus"],
      ["💀", "Skull", "dead lol"],
      ["👻", "Ghost", "spooky"],
      ["👀", "Eyes", "look watching"],
      ["👍", "Thumbs up", "yes agree"],
      ["👎", "Thumbs down", "no disagree"],
      ["👏", "Clapping hands", "applause"],
      ["🙌", "Raising hands", "celebrate"],
      ["🙏", "Folded hands", "please thanks"],
      ["💪", "Flexed biceps", "strong muscle"],
      ["🤝", "Handshake", "deal agree"],
      ["🫶", "Heart hands", "love support"],
    ].map(toEmojiEntry),
  },
  {
    id: "nature",
    label: "Animals & nature",
    icon: "🐻",
    entries: [
      ["🐶", "Dog", "pet puppy"],
      ["🐱", "Cat", "pet kitten"],
      ["🐭", "Mouse", "animal"],
      ["🐹", "Hamster", "pet"],
      ["🐰", "Rabbit", "bunny"],
      ["🦊", "Fox", "animal"],
      ["🐻", "Bear", "animal"],
      ["🐼", "Panda", "animal"],
      ["🐨", "Koala", "animal"],
      ["🐯", "Tiger", "animal"],
      ["🦁", "Lion", "animal"],
      ["🐸", "Frog", "animal"],
      ["🐵", "Monkey", "animal"],
      ["🦄", "Unicorn", "fantasy"],
      ["🐝", "Bee", "insect"],
      ["🦋", "Butterfly", "insect"],
      ["🌵", "Cactus", "plant"],
      ["🌴", "Palm tree", "plant tropical"],
      ["🌻", "Sunflower", "flower"],
      ["🌹", "Rose", "flower love"],
      ["🌈", "Rainbow", "weather"],
      ["⭐", "Star", "night favorite"],
      ["🔥", "Fire", "hot lit"],
      ["✨", "Sparkles", "shine magic"],
    ].map(toEmojiEntry),
  },
  {
    id: "food",
    label: "Food & drink",
    icon: "🍕",
    entries: [
      ["🍎", "Apple", "fruit"],
      ["🍉", "Watermelon", "fruit"],
      ["🍌", "Banana", "fruit"],
      ["🍓", "Strawberry", "fruit"],
      ["🍒", "Cherries", "fruit"],
      ["🥑", "Avocado", "food"],
      ["🍔", "Burger", "food fast"],
      ["🍟", "French fries", "food fast"],
      ["🍕", "Pizza", "food"],
      ["🌮", "Taco", "food"],
      ["🍿", "Popcorn", "movie snack"],
      ["🍩", "Doughnut", "dessert"],
      ["🍪", "Cookie", "dessert"],
      ["🎂", "Birthday cake", "dessert party"],
      ["☕", "Coffee", "drink hot"],
      ["🍵", "Tea", "drink hot"],
      ["🥤", "Cup with straw", "drink soda"],
      ["🍺", "Beer", "drink"],
      ["🍻", "Cheers", "beer drink"],
      ["🥂", "Clinking glasses", "cheers celebrate"],
    ].map(toEmojiEntry),
  },
  {
    id: "activities",
    label: "Activities",
    icon: "🎮",
    entries: [
      ["⚽", "Football", "sport soccer"],
      ["🏀", "Basketball", "sport"],
      ["🏏", "Cricket", "sport bat"],
      ["🎮", "Game controller", "gaming play"],
      ["🎲", "Game die", "gaming random"],
      ["🎯", "Bullseye", "target"],
      ["🎸", "Guitar", "music"],
      ["🎧", "Headphones", "music audio"],
      ["🎤", "Microphone", "music sing"],
      ["🎬", "Clapper board", "movie film"],
      ["🏆", "Trophy", "winner"],
      ["🥇", "Gold medal", "winner first"],
      ["🎉", "Party popper", "celebrate"],
      ["🎊", "Confetti ball", "celebrate"],
      ["🎁", "Gift", "present birthday"],
      ["🚀", "Rocket", "launch space"],
    ].map(toEmojiEntry),
  },
  {
    id: "objects",
    label: "Objects",
    icon: "💡",
    entries: [
      ["💡", "Light bulb", "idea"],
      ["💻", "Laptop", "computer work"],
      ["📱", "Phone", "mobile"],
      ["📷", "Camera", "photo"],
      ["🔊", "Speaker", "audio sound"],
      ["🔔", "Bell", "notification"],
      ["🎵", "Music note", "audio"],
      ["💬", "Speech bubble", "chat"],
      ["💭", "Thought bubble", "think"],
      ["📌", "Pushpin", "pin"],
      ["✅", "Check mark button", "done yes"],
      ["❌", "Cross mark", "no cancel"],
      ["⚠️", "Warning", "alert caution"],
      ["💯", "Hundred points", "perfect"],
      ["❤️", "Red heart", "love"],
      ["💔", "Broken heart", "sad love"],
      ["💜", "Purple heart", "love"],
      ["🖤", "Black heart", "love"],
      ["💥", "Collision", "boom"],
      ["💤", "Sleeping", "tired"],
    ].map(toEmojiEntry),
  },
];

function toEmojiEntry([emoji, label, keywords]: string[]): EmojiEntry {
  return {
    emoji: emoji ?? "",
    label: label ?? "",
    keywords: keywords ?? "",
  };
}

export function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const [categoryId, setCategoryId] = useState(emojiCategories[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleEntries = useMemo(() => {
    const entries = normalizedQuery
      ? emojiCategories.flatMap((category) => category.entries)
      : (emojiCategories.find((category) => category.id === categoryId)
          ?.entries ?? []);
    if (!normalizedQuery) return entries;
    return entries.filter(({ label, keywords }) =>
      `${label} ${keywords}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [categoryId, normalizedQuery]);

  return (
    <div
      className="media-picker emoji-picker"
      role="dialog"
      aria-label="Emoji picker"
    >
      <header>
        <div>
          <strong>Emoji</strong>
          <span>Add one to your message</span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close emoji picker">
          <X size={17} />
        </button>
      </header>
      <label className="emoji-picker__search">
        <Search size={16} aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search emoji"
          aria-label="Search emoji"
          maxLength={40}
        />
      </label>
      <div
        className="emoji-picker__categories"
        role="tablist"
        aria-label="Emoji categories"
      >
        {emojiCategories.map((category) => (
          <button
            type="button"
            role="tab"
            aria-selected={!normalizedQuery && category.id === categoryId}
            aria-label={category.label}
            title={category.label}
            key={category.id}
            onClick={() => {
              setCategoryId(category.id);
              setQuery("");
            }}
          >
            {category.icon}
          </button>
        ))}
      </div>
      <div className="emoji-picker__grid">
        {visibleEntries.map((entry) => (
          <button
            type="button"
            key={`${entry.emoji}-${entry.label}`}
            aria-label={`Add ${entry.label}`}
            title={entry.label}
            onClick={() => onSelect(entry.emoji)}
          >
            {entry.emoji}
          </button>
        ))}
      </div>
      {!visibleEntries.length ? (
        <p className="media-picker__status">No emoji found.</p>
      ) : null}
    </div>
  );
}
