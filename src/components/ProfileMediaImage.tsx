import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import type { LoadProfileMedia } from "./ProfileTrigger";

interface ProfileMediaImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "onError" | "src"
> {
  bucket: Parameters<LoadProfileMedia>[0];
  loadMedia: LoadProfileMedia;
  path: string | null;
  src: string;
}

export function ProfileMediaImage({
  bucket,
  loadMedia,
  path,
  src,
  ...imageProps
}: ProfileMediaImageProps) {
  const [activeSource, setActiveSource] = useState<string | null>(src);
  const attemptedPathRef = useRef<string | null>(null);

  useEffect(() => {
    attemptedPathRef.current = null;
    setActiveSource(src);
  }, [path, src]);

  if (!activeSource) return null;

  return (
    <img
      {...imageProps}
      src={activeSource}
      onError={() => {
        setActiveSource(null);
        if (!path || attemptedPathRef.current === path) return;
        attemptedPathRef.current = path;
        void loadMedia(bucket, path, { refresh: true })
          .then((recovered) => setActiveSource(recovered))
          .catch(() => undefined);
      }}
    />
  );
}
