import { useEffect, useRef, useState } from "react";
import CollabKitClient from "@collab-kit/client";

import { useWhiteboard } from "./context";
import { authenticate, storeSchemas, COLLABKIT_SERVER_URL } from "./collabkit";
import Whiteboard from "./Whiteboard";

import logo from "./assets/icon.png";
import logoWhite from "./assets/logo-white.png";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClientType = any;

const App = () => {
  const { config, setError } = useWhiteboard();
  const [status, setStatus] = useState<"connecting" | "ready" | "error">(
    "connecting",
  );
  const collabkitRef = useRef<CollabKitClientType>(null);
  const connectingRef = useRef(false);

  useEffect(() => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    const connect = async () => {
      try {
        let roomCustomId: string;
        let roomName: string;
        let participantCustomId: string;
        let participantName: string;
        let participantProfilePicture: string | undefined;

        // Standalone mode: use URL params
        const params = new URLSearchParams(window.location.search);
        roomCustomId = params.get("roomId") || "default-room";
        roomName = params.get("roomName") || "Whiteboard";
        participantCustomId = params.get("userId") || `user-${Date.now()}`;
        participantName = params.get("userName") || "Participant";
        participantProfilePicture = params.get("profilePicture") || undefined;

        const serverUrl = window.location.origin;

        // Step 1: Authenticate (Generates JWT Token)
        const authResult = await authenticate({
          serverUrl,
          room: { customId: roomCustomId, name: roomName },
          participant: {
            customId: participantCustomId,
            name: participantName,
            profilePicture: participantProfilePicture,
          },
        });

        const token = authResult.user.token;
        if (!token) throw new Error("No auth token received");

        // Step 2: Connect and join CollabKit room
        const client = new CollabKitClient({
          serverUrl: COLLABKIT_SERVER_URL,
          authToken: token,
          stores: storeSchemas,
        });
        await client.connect();
        await client.join();

        collabkitRef.current = client;
        setStatus("ready");
      } catch (err) {
        console.error("[app] Failed to connect:", err);
        setError(err instanceof Error ? err.message : "Failed to connect");
        setStatus("error");
      }
    };

    connect();

    // Graceful disconnect on tab close
    const handleBeforeUnload = () => {
      try {
        collabkitRef.current?.disconnect();
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try {
        collabkitRef.current?.disconnect();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const isDark = config.settings.theme === "dark";

  // Connecting or error -- show loading screen
  if (status !== "ready") {
    return (
      <div className="container">
        <div className={isDark ? "loading-page-dark" : "loading-page"}>
          <img src={isDark ? logoWhite : logo} alt="Whiteboard" />
          <p>Whiteboard</p>
          {status === "error" && (
            <span style={{ color: "#ef4444", marginTop: 8 }}>
              Failed to connect. Please refresh.
            </span>
          )}
        </div>
      </div>
    );
  }

  // Ready -- render the whiteboard
  return <Whiteboard client={collabkitRef.current!} />;
};

export default App;
