import React from "react";
import NotFound from "@web/assets/lottie/not-found.json";
import Lottie from "lottie-react";
import Button from "@web/shared/components/Button";

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
      <Button onClick={handleClick}>Go Back</Button>
    </div>
  );
}

export default React.memo(UnAuthorisedRoute);
