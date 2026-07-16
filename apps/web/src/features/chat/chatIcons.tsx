import { lazy } from "react";

// Lazy-loaded MUI icons — shared across Chat.tsx and its subcomponents so
// each icon is only ever fetched/loaded once, not once per importing file.
export const SendIcon = lazy(() => import("@mui/icons-material/Send"));
export const AttachFileIcon = lazy(
  () => import("@mui/icons-material/AttachFile"),
);
export const SearchIcon = lazy(() => import("@mui/icons-material/Search"));
export const CloseIcon = lazy(() => import("@mui/icons-material/Close"));
export const ReplyIcon = lazy(() => import("@mui/icons-material/Reply"));
export const InsertDriveFileIcon = lazy(
  () => import("@mui/icons-material/InsertDriveFile"),
);
export const DoneAllIcon = lazy(() => import("@mui/icons-material/DoneAll"));
export const DoneIcon = lazy(() => import("@mui/icons-material/Done"));
export const ArrowBackIcon = lazy(
  () => import("@mui/icons-material/ArrowBack"),
);
export const DeleteIcon = lazy(() => import("@mui/icons-material/Delete"));
export const MoreVertIcon = lazy(() => import("@mui/icons-material/MoreVert"));
export const PushPinIcon = lazy(() => import("@mui/icons-material/PushPin"));
export const PushPinOutlinedIcon = lazy(
  () => import("@mui/icons-material/PushPinOutlined"),
);
export const ExpandMoreIcon = lazy(
  () => import("@mui/icons-material/ExpandMore"),
);
export const ExpandLessIcon = lazy(
  () => import("@mui/icons-material/ExpandLess"),
);
export const EmojiEmotionsIcon = lazy(
  () => import("@mui/icons-material/EmojiEmotions"),
);
export const PictureAsPdfIcon = lazy(
  () => import("@mui/icons-material/PictureAsPdf"),
);
export const TableChartIcon = lazy(
  () => import("@mui/icons-material/TableChart"),
);
export const ArticleIcon = lazy(() => import("@mui/icons-material/Article"));
export const VideoFileIcon = lazy(
  () => import("@mui/icons-material/VideoFile"),
);
