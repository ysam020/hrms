const targetHour = 17;
const targetMinute = 20;
const targetSecond = 0;

const interval = setInterval(() => {
  const currDate = new Date();
  const currTime = currDate.getTime();

  const currHours = currDate.getHours().toString().padStart(2, "0");
  const currMinutes = currDate.getMinutes().toString().padStart(2, "0");
  const currSeconds = currDate.getSeconds().toString().padStart(2, "0");

  const targetTime = new Date(
    currDate.getFullYear(),
    currDate.getMonth(),
    currDate.getDate(),
    targetHour,
    targetMinute,
    targetSecond
  ).getTime();

  let timeRemaining = targetTime - currTime;

  if (timeRemaining <= 0) {
    console.log("Time is up!");
    clearInterval(interval);
    return;
  }

  const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
  const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

  const totalMinutes = Math.floor(timeRemaining / (1000 * 60));
  const totalSeconds = Math.floor(timeRemaining / 1000);

  console.log(
    `Current time: ${currHours}:${currMinutes}:${currSeconds} | Time remaining: ${hours
      .toString()
      .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")} | ${
      totalMinutes + 1
    } minutes | ${totalSeconds} seconds`
  );
}, 1000);
