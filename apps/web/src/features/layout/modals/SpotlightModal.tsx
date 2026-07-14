import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Box,
  Modal,
  TextField,
  InputAdornment,
  List,
  ListItem,
  ListItemButton,
  Typography,
  Chip,
  Fade,
  Backdrop,
  IconButton,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import { Search as SearchIcon, Mic as MicIcon } from "@mui/icons-material";
import routesConfig from "@web/app/router/routesConfig";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";

function SpotlightModal({ open, handleClose }) {
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(UserContext);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState("");
  const [filteredRoutes, setFilteredRoutes] = useState<any[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const recognitionRef = useRef(null);

  // Memoize routes and search engine to prevent re-indexing on every keystroke
  const fuse = useMemo(() => {
    const routes = routesConfig();
    return new Fuse(routes, {
      keys: ["name", "path"],
      threshold: 0.3,
      distance: 100,
    });
  }, []);

  // 2. Direct focus on transition end instead of using multiple setTimeouts
  const handleTransitionEnd = () => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  };

  useEffect(() => {
    if (open) {
      setInputValue("");
      setFilteredRoutes([]);
      setHighlightedIndex(0);
    }
  }, [open]);

  // 3. Simplified scroll logic using native browser optimization
  useEffect(() => {
    if (filteredRoutes.length > 0) {
      const element = document.querySelector(
        `[data-index="${highlightedIndex}"]`,
      );
      if (element) {
        element.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    }
  }, [highlightedIndex, filteredRoutes]);

  const handleInputChange = useCallback(
    (event) => {
      const value = event.target.value;
      setInputValue(value);

      if (!value.trim()) {
        setFilteredRoutes([]);
        return;
      }

      // Use memoized fuse instance for search
      const results = fuse
        .search(value)
        .filter(
          ({ item: route }) => !route.checkAccess || route.checkAccess(user),
        )
        .map((r) => r.item)
        .slice(0, 8);

      setFilteredRoutes(results);
      setHighlightedIndex(0);
    },
    [fuse, user],
  );

  const handleSuggestionClick = (path) => {
    handleClose();
    navigate(path);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") handleClose();
    if (filteredRoutes.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setHighlightedIndex((prev) => (prev + 1) % filteredRoutes.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setHighlightedIndex(
          (prev) => (prev - 1 + filteredRoutes.length) % filteredRoutes.length,
        );
        break;
      case "Enter":
        event.preventDefault();
        handleSuggestionClick(filteredRoutes[highlightedIndex].path);
        break;
      default:
        break;
    }
  };

  const handleMicClick = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      handleInputChange({ target: { value: transcript } });
    };
    recognition.start();
    recognitionRef.current = recognition;
  };

  const modalStyle = {
    position: "absolute",
    top: "15%",
    left: "50%",
    transform: "translateX(-50%)",
    width: { xs: "95%", sm: 600 },
    bgcolor: "background.paper",
    borderRadius: 3,
    boxShadow: 24,
    outline: 0,
    overflow: "hidden",
    border: theme === "light" ? "1px solid #e5e7eb" : "1px solid #374151",
  };

  const listboxId = "spotlight-listbox";
  const activeId =
    filteredRoutes.length > 0
      ? `spotlight-option-${highlightedIndex}`
      : undefined;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeAfterTransition
      aria-label="Quick navigation search"
      BackdropComponent={Backdrop}
      BackdropProps={{ timeout: 200, sx: { backdropFilter: "blur(4px)" } }}
    >
      <Fade in={open} timeout={200} onEntered={handleTransitionEnd}>
        <Box sx={modalStyle} onKeyDown={handleKeyDown}>
          <Box sx={{ p: 2, borderBottom: 1, borderColor: "divider" }}>
            <TextField
              inputRef={inputRef}
              fullWidth
              placeholder="Search routes…"
              value={inputValue}
              onChange={handleInputChange}
              autoComplete="off"
              // ARIA combobox pattern: the input controls the listbox below
              inputProps={{
                role: "combobox",
                "aria-expanded": filteredRoutes.length > 0,
                "aria-haspopup": "listbox",
                "aria-controls": listboxId,
                "aria-activedescendant": activeId,
                "aria-label": "Search routes",
                "aria-autocomplete": "list",
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon aria-hidden="true" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleMicClick}
                      size="small"
                      aria-label="Search by voice"
                    >
                      <MicIcon aria-hidden="true" />
                    </IconButton>
                  </InputAdornment>
                ),
                sx: { border: "none", "& fieldset": { border: "none" } },
              }}
            />
          </Box>

          {/* Live region announces result count to screen readers */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {filteredRoutes.length > 0
              ? `${filteredRoutes.length} result${filteredRoutes.length === 1 ? "" : "s"} found`
              : inputValue
                ? "No results found"
                : ""}
          </div>

          <Box
            id={listboxId}
            role="listbox"
            aria-label="Navigation suggestions"
            sx={{ maxHeight: 400, overflowY: "auto" }}
          >
            {filteredRoutes.length > 0 ? (
              <List sx={{ p: 1 }}>
                {filteredRoutes.map((route, index) => (
                  <ListItem key={route.path} disablePadding>
                    <ListItemButton
                      id={`spotlight-option-${index}`}
                      role="option"
                      aria-selected={highlightedIndex === index}
                      selected={highlightedIndex === index}
                      onClick={() => handleSuggestionClick(route.path)}
                      data-index={index}
                      sx={{
                        borderRadius: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        py: 0.9,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          noWrap
                          sx={{ fontSize: "0.9rem" }}
                        >
                          {route.name}
                        </Typography>
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.5,
                            mt: 0.25,
                          }}
                        >
                          {route.category && (
                            <Typography
                              variant="caption"
                              sx={{
                                color: "text.secondary",
                                fontSize: "0.7rem",
                                flexShrink: 0,
                              }}
                            >
                              {route.category} ›
                            </Typography>
                          )}
                          <Typography
                            variant="caption"
                            noWrap
                            sx={{
                              color: "text.disabled",
                              fontFamily: "monospace",
                              fontSize: "0.68rem",
                            }}
                          >
                            {route.path}
                          </Typography>
                        </Box>
                      </Box>
                      {highlightedIndex === index && (
                        <Chip
                          label="↵"
                          size="small"
                          color="primary"
                          aria-hidden="true"
                          sx={{ flexShrink: 0 }}
                        />
                      )}
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            ) : (
              inputValue && (
                <Typography
                  role="status"
                  sx={{ p: 4, textAlign: "center" }}
                  color="text.secondary"
                >
                  No results for "{inputValue}"
                </Typography>
              )
            )}
          </Box>
        </Box>
      </Fade>
    </Modal>
  );
}

export default memo(SpotlightModal);
