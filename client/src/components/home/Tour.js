import React, { useMemo } from "react";
import Joyride, { STATUS } from "react-joyride";
import { tourSteps } from "../../assets/data/tourSteps";

function Tour({ run, setRun }) {
  const styles = useMemo(
    () => ({
      options: {
        arrowColor: "#fff",
        backgroundColor: "#fff",
        beaconSize: 50,
        overlayColor: "rgba(0, 0, 0, 0.5)",
        primaryColor: "#f04",
        spotlightShadow: "0 0 15px rgba(0, 0, 0, 0.5)",
        textColor: "#333",
        textAlign: "left",
        width: undefined,
        zIndex: 10000,
      },
      buttonNext: {
        backgroundColor: "#111B21",
      },
      buttonBack: {
        color: "#111B21",
      },
      tooltipContainer: { textAlign: "left" },
    }),
    []
  );

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];
    if (finishedStatuses.includes(status)) {
      setRun(false);
    }
  };

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous
      run={run}
      scrollOffset={64}
      scrollToFirstStep
      showProgress
      showSkipButton
      hideCloseButton={true}
      disableCloseOnEsc={true}
      disableOverlayClose={true}
      steps={tourSteps}
      styles={styles}
    />
  );
}

export default React.memo(Tour);
