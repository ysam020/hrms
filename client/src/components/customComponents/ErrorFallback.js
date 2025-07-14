import React from "react";

function ErrorFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
      }}
    >
      <p>Something went wrong</p>
    </div>
  );
}

export default React.memo(ErrorFallback);
