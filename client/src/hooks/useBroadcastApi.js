import { useEffect } from "react";

function useBroadcastApi(channel, setBroadcastModal) {
  useEffect(() => {
    // Notify other tabs that a new instance has opened
    channel.postMessage({ type: "tab-opened", tabId: Math.random() });

    // Listen for messages from other tabs
    channel.onmessage = (event) => {
      if (
        event.data.type === "tab-opened" ||
        event.data.type === "activate-tab"
      ) {
        // Show the modal in the current tab
        setBroadcastModal(true);
      }
    };

    return () => {
      channel.close();
    };
    // eslint-disable-next-line
  }, [channel]);

  // Function to activate this tab and deactivate others
  const handleUseInThisTab = () => {
    // Broadcast a message to other tabs to display the modal
    channel.postMessage({ type: "activate-tab" });
    // Hide the modal in this tab
    setBroadcastModal(false);
  };

  return handleUseInThisTab;
}

export default useBroadcastApi;
