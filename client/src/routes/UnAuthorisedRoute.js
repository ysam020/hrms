import React from "react";
import NotFound from "../assets/lottie/not-found.json";
import Lottie from "lottie-react";

function UnAuthorisedRoute() {
  const handleClick = () => {
    window.history.back();
  };
  return (
    <div
      style={{
        height: "80vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ width: "30%" }}>
        <Lottie loop={true} animationData={NotFound}></Lottie>
      </div>
      <button onClick={handleClick} className="btn">
        Go Back
      </button>
    </div>
  );
}

export default React.memo(UnAuthorisedRoute);
