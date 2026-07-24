interface BakbakMarkProps {
  className?: string;
}

export function BakbakMark({ className }: BakbakMarkProps) {
  const classes = ["bakbak-mark", className].filter(Boolean).join(" ");

  return (
    <span className={classes} aria-hidden="true">
      <svg viewBox="0 0 80 64" focusable="false">
        <path
          className="bakbak-mark__glyph bakbak-mark__glyph--first"
          d="M16 10v44m0-26h13c9 0 15 5 15 13s-6 13-15 13H16"
        />
        <path
          className="bakbak-mark__glyph bakbak-mark__glyph--second"
          d="M44 15v39m0-26h8c9 0 14 5 14 13s-5 13-14 13h-8"
        />
      </svg>
    </span>
  );
}
