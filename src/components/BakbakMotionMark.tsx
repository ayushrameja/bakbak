interface BakbakMotionMarkProps {
  className?: string;
}

export function BakbakMotionMark({ className }: BakbakMotionMarkProps) {
  const classes = ["bakbak-motion-mark", className].filter(Boolean).join(" ");

  return (
    <span className={classes} aria-hidden="true">
      <svg viewBox="0 0 80 64" focusable="false">
        <path
          className="bakbak-motion-mark__jaw bakbak-motion-mark__jaw--top"
          d="M43 18A22 22 0 0 0 12 32"
        />
        <path
          className="bakbak-motion-mark__jaw bakbak-motion-mark__jaw--bottom"
          d="M12 32A22 22 0 0 0 43 46"
        />
        <circle
          className="bakbak-motion-mark__dot bakbak-motion-mark__dot--near"
          cx="51"
          cy="32"
          r="3.4"
        />
        <circle
          className="bakbak-motion-mark__dot bakbak-motion-mark__dot--middle"
          cx="62"
          cy="32"
          r="3.4"
        />
        <circle
          className="bakbak-motion-mark__dot bakbak-motion-mark__dot--far"
          cx="73"
          cy="32"
          r="3.4"
        />
      </svg>
    </span>
  );
}
