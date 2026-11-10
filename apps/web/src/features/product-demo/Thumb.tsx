import {
  CDN_CONFIGURED,
  clock,
  thumbnailSrc,
  type DemoVideo,
} from "./catalogue";
import s from "./productDemo.module.css";

/** A video's thumbnail with its length (and "Now Playing" on the current one). */
export function Thumb({ video, now }: { video: DemoVideo; now?: boolean }) {
  return (
    <span className={s.thumbBox}>
      {CDN_CONFIGURED && (
        <img
          src={thumbnailSrc(video.thumbnail)}
          crossOrigin="anonymous"
          alt=""
          loading="lazy"
          decoding="async"
          width={1280}
          height={720}
        />
      )}
      {now && <span className={s.nowBadge}>Now Playing</span>}
      <span className={`${s.duration} px-num`}>{clock(video.duration)}</span>
    </span>
  );
}
