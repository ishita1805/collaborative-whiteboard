import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  createContext,
  useContext,
} from "react";
import {
  Tldraw,
  Editor,
  createTLStore,
  defaultShapeUtils,
  defaultBindingUtils,
  useActions,
  useCanUndo,
  useCanRedo,
  TldrawUiButton,
  TldrawUiButtonIcon,
} from "tldraw";
import type { TLComponents } from "tldraw";
import "tldraw/tldraw.css";

import { useWhiteboard } from "./context";
import type { WhiteboardConfig } from "./config";
import { initializeCanvas } from "./features/canvas";
import { createAssetStore } from "./features/images";
import {
  loadExistingRecords,
  attachOutboundSync,
  attachInboundSync,
} from "./features/sync";
import {
  loadExistingPages,
  attachPageSync,
  createPageControls,
  PageInfo,
} from "./features/pagination";
import { initPresence } from "./features/presence";
import { initUsers, OnlineUser } from "./features/users";
import { initFollow } from "./features/follow";
import { applyAutoScale } from "./features/auto-scale";
import { enforceCameraBounds } from "./features/bounded-canvas";
import { randomColor } from "./utils/helpers";

import Settings from "./components/settings/Settings";
import Presence from "./components/presence/Presence";
import Badge from "./components/badge/Badge";
import ErrorModal from "./components/error/Error";

import logo from "./assets/icon.png";
import logoWhite from "./assets/logo-white.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

// --- Header context: passes dynamic state into tldraw's MenuPanel override ---

interface HeaderContextValue {
  syncing: boolean;
  config: WhiteboardConfig;
  autoScale: boolean;
  setAutoScale: (v: boolean) => void;
  paginationControls: {
    addPage: () => Promise<void>;
    deletePage: (pageId: string) => Promise<void>;
    switchPage: (pageId: string) => void;
  } | null;
  pages: PageInfo[];
  currentPage: PageInfo;
  following: string | null;
  onlineUsers: Map<string, OnlineUser>;
  currentUserId: string;
  followControls: {
    follow: (userId: string) => Promise<void>;
    unfollow: () => Promise<void>;
  } | null;
  setError: (error: string) => void;
}

const HeaderContext = createContext<HeaderContextValue | null>(null);

/**
 * Undo/Redo buttons using tldraw's hooks and styled components.
 * Uses TldrawUiButton so they inherit pointer-events: all from .tlui-button.
 */
function UndoRedoButtons() {
  const actions = useActions();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  return (
    <>
      <TldrawUiButton
        type="icon"
        disabled={!canUndo}
        onClick={() => actions["undo"].onSelect("menu")}
      >
        <TldrawUiButtonIcon icon="undo" />
      </TldrawUiButton>
      <TldrawUiButton
        type="icon"
        disabled={!canRedo}
        onClick={() => actions["redo"].onSelect("menu")}
      >
        <TldrawUiButtonIcon icon="redo" />
      </TldrawUiButton>
    </>
  );
}

/**
 * Custom MenuPanel replacing tldraw's default. Renders (left to right):
 *   1. Page selector (Pagination)
 *   2. Presence avatars
 *   3. Undo / Redo buttons
 *
 * Defined outside Whiteboard so the component reference is stable (no unmount/remount).
 */
function CustomMenuPanel() {
  const ctx = useContext(HeaderContext);

  return (
    <div className="tlui-menu-zone">
      <div className="header-elements">
        {ctx && !ctx.syncing && (
          <>
            <Settings
              config={ctx.config}
              autoScale={ctx.autoScale}
              setAutoScale={ctx.setAutoScale}
              paginationControls={ctx.paginationControls}
              pages={ctx.pages}
              currentPage={ctx.currentPage}
              following={ctx.following}
            />
            <Presence
              config={ctx.config}
              onlineUsers={ctx.onlineUsers}
              following={ctx.following}
              currentUserId={ctx.currentUserId}
              followControls={ctx.followControls}
              setError={ctx.setError}
            />
          </>
        )}
        <UndoRedoButtons />
      </div>
    </div>
  );
}

/** Stable components override — reference never changes. */
const tldrawComponents: TLComponents = {
  MenuPanel: CustomMenuPanel,
  MainMenu: null,
  PageMenu: null,
  QuickActions: null,
  ActionsMenu: null,
};

interface WhiteboardProps {
  client: CollabKitClient;
}

const Whiteboard = ({ client }: WhiteboardProps) => {
  const { config, setError } = useWhiteboard();

  // Stable tldraw store -- created once, never changes
  const [store] = useState(() =>
    createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
      assets: createAssetStore(client),
    }),
  );

  // Local state for rendering
  const [syncing, setSyncing] = useState(true);
  const [following, setFollowing] = useState<string | null>(null);
  const [autoScale, setAutoScale] = useState(config.canvas.autoScale);
  const [onlineUsers, setOnlineUsers] = useState<Map<string, OnlineUser>>(
    new Map(),
  );
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [currentPage, setCurrentPage] = useState<PageInfo>({
    id: "page:page",
    name: "Page 1",
  });

  // Refs
  const editorRef = useRef<Editor | null>(null);
  const cleanupsRef = useRef<Array<() => void>>([]);
  const followControlsRef = useRef<ReturnType<typeof initFollow> | null>(null);
  const paginationControlsRef = useRef<ReturnType<
    typeof createPageControls
  > | null>(null);
  const userColorRef = useRef(randomColor());
  const userColorMapRef = useRef(new Map<string, string>());
  const followingRef = useRef<string | null>(following);
  const autoScaleRef = useRef(autoScale);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupsRef.current.forEach((fn) => fn());
      cleanupsRef.current = [];
    };
  }, []);

  // Keep refs in sync with state so store listeners always read current values
  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  useEffect(() => {
    autoScaleRef.current = autoScale;
  }, [autoScale]);

  /**
   * Phase 2: Called when tldraw editor mounts.
   * By this point, CollabKit is already connected and joined (guaranteed by App.tsx).
   */
  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;

    // Apply config-driven settings
    initializeCanvas(editor, config);

    // Start async collaboration setup
    setupCollaboration(editor).catch((err) => {
      console.error("[whiteboard] Setup failed:", err);
      setError(
        err instanceof Error ? err.message : "Collaboration setup failed",
      );
      setSyncing(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Async collaboration setup. Runs once after editor mounts.
   */
  async function setupCollaboration(editor: Editor): Promise<void> {
    const userId = client.currentUser?.id || client.userId;
    const userName = client.currentUser?.name || "Participant";

    // --- Step 1: Sync document store from server and load existing records ---
    try {
      await client.stores.document.sync();
      const existingRecords = client.stores.document.getAll();
      loadExistingRecords(store, existingRecords);
    } catch (err) {
      console.error("[whiteboard] Document sync failed:", err);
    }

    // --- Step 2: Attach outbound sync (AFTER loading existing records to avoid echo) ---
    // Uses editor.sideEffects.registerOperationCompleteHandler to batch changes
    // and only flush to CollabKit once per completed operation (not per point in a stroke)
    try {
      const outboundCleanup = attachOutboundSync(editor, store, client);
      cleanupsRef.current.push(outboundCleanup);
    } catch (err) {
      console.error("[whiteboard] Outbound sync setup failed:", err);
    }

    // --- Step 3: Attach inbound sync ---
    try {
      const inboundCleanup = attachInboundSync(store, client);
      cleanupsRef.current.push(inboundCleanup);
    } catch (err) {
      console.error("[whiteboard] Inbound sync setup failed:", err);
    }

    // --- Step 4: Sync pages store and load existing pages ---
    try {
      await client.stores.pages.sync();
      const existingPageEntries = client.stores.pages.getAll();
      const { pages: loadedPages, currentPage: loadedCurrentPage } =
        loadExistingPages(editor, existingPageEntries);
      if (loadedPages.length > 0) {
        setPages(loadedPages);
      } else {
        // Initialize default page list from editor
        const editorPages = editor.getPages();
        setPages(editorPages.map((p) => ({ id: p.id, name: p.name })));
      }
      if (loadedCurrentPage) {
        setCurrentPage(loadedCurrentPage);
      }
    } catch (err) {
      console.error("[whiteboard] Pages sync failed:", err);
    }

    // --- Step 5: Attach page change listener ---
    try {
      const pageSyncCleanup = attachPageSync(editor, client, {
        onPagesChanged: (p) => setPages(p),
        onCurrentPageChanged: (p) => setCurrentPage(p),
      });
      cleanupsRef.current.push(pageSyncCleanup);
    } catch (err) {
      console.error("[whiteboard] Page sync listener failed:", err);
    }

    // --- Step 6: Create page controls ---
    try {
      paginationControlsRef.current = createPageControls(editor, client, {
        onPagesChanged: (p) => setPages(p),
        onCurrentPageChanged: (p) => setCurrentPage(p),
      });
    } catch (err) {
      console.error("[whiteboard] Page controls failed:", err);
    }

    // --- Step 7: Initialize presence ---
    try {
      const presenceCleanup = initPresence(
        editor,
        client,
        userName,
        userColorRef.current,
        userColorMapRef.current,
      );
      cleanupsRef.current.push(presenceCleanup);
    } catch (err) {
      console.error("[whiteboard] Presence setup failed:", err);
    }

    // --- Step 8: Initialize user tracking ---
    try {
      const usersCleanup = initUsers(
        editor,
        client,
        {
          onUsersChanged: (users) => setOnlineUsers(users),
          onUserLeft: (leftUserId) => {
            // Query CollabKit's live state to avoid stale closure over `following`
            const me = client.users.all.get(userId);
            if (me?.following?.includes(leftUserId)) {
              followControlsRef.current?.unfollow();
            }
          },
        },
        userColorMapRef.current,
      );
      cleanupsRef.current.push(usersCleanup);
    } catch (err) {
      console.error("[whiteboard] Users setup failed:", err);
    }

    // --- Step 9: Initialize follow system ---
    try {
      const followSystem = initFollow(editor, client, {
        onFollowChanged: (id) => setFollowing(id),
      });
      followControlsRef.current = followSystem;
      cleanupsRef.current.push(followSystem.cleanup);

      // Restore follow UI if the user was already following someone
      const me = client.users.all.get(userId);
      if (me?.following?.length > 0) {
        const targetId = me.following[0];
        const targetUser = client.users.all.get(targetId);
        if (targetUser?.status === "online") {
          followSystem.restoreFollow(targetId);
        }
      }
    } catch (err) {
      console.error("[whiteboard] Follow setup failed:", err);
    }

    // --- Step 10: Bounded canvas ---
    if (!config.canvas.infinite) {
      try {
        const boundedCleanup = editor.store.listen(
          () => enforceCameraBounds(editor, config.canvas.bounds),
          { source: "user", scope: "session" },
        );
        cleanupsRef.current.push(boundedCleanup);
      } catch (err) {
        console.error("[whiteboard] Bounded canvas setup failed:", err);
      }
    }

    // --- Step 11: Auto-scale ---
    // Always register the listener; it reads from refs so the UI toggle
    // and follow state are evaluated at call-time (no stale closure).
    try {
      const autoScaleCleanup = editor.store.listen(
        () =>
          applyAutoScale(editor, {
            autoScale: autoScaleRef.current,
            isFollowing: !!followingRef.current,
            isBounded: !config.canvas.infinite,
          }),
        { source: "all", scope: "document" },
      );
      cleanupsRef.current.push(autoScaleCleanup);
    } catch (err) {
      console.error("[whiteboard] Auto-scale setup failed:", err);
    }

    // --- Done ---
    setSyncing(false);
  }

  const isDark = config.settings.theme === "dark";

  // Memoize the header context value to avoid unnecessary re-renders
  const headerContextValue = useMemo<HeaderContextValue>(
    () => ({
      syncing,
      config,
      autoScale,
      setAutoScale,
      paginationControls: paginationControlsRef.current,
      pages,
      currentPage,
      following,
      onlineUsers,
      currentUserId: client.currentUser?.id || client.userId,
      followControls: followControlsRef.current,
      setError,
    }),
    [
      syncing,
      config,
      autoScale,
      setAutoScale,
      pages,
      currentPage,
      following,
      onlineUsers,
      client,
      setError,
    ],
  );

  return (
    <div className="container">
      <HeaderContext.Provider value={headerContextValue}>
        <div style={{ position: "fixed", inset: 0 }}>
          <Tldraw
            store={store}
            onMount={handleMount}
            components={tldrawComponents}
            autoFocus
            colorScheme={isDark ? "dark" : "light"}
          />
        </div>
      </HeaderContext.Provider>

      {/* Syncing overlay -- shown while collaboration features initialize */}
      {syncing && (
        <div className={isDark ? "loading-page-dark" : "loading-page"}>
          <img src={isDark ? logoWhite : logo} alt="Whiteboard" />
          <p>Whiteboard</p>
        </div>
      )}

      {/* Badge overlay -- only visible after sync completes */}
      {!syncing && (
        <Badge
          config={config}
          following={following}
          client={client}
          followControls={followControlsRef.current}
        />
      )}

      <ErrorModal />
    </div>
  );
};

export default Whiteboard;
