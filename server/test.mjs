import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let timerInterval = null;
let currentMode = null; // "timer", "chess", "punch", or null
let punchRecords = [];

function startAppMenu() {
  currentMode = null;
  console.log(`\n📋 Choose an app:
1. ⏳ Timer App
2. ♞ Knight Move Checker
3. 🔨 Punch Hours Calculator
Type '1', '2', or '3' to choose, or type 'exit' to quit.`);
}

function startTimerApp() {
  currentMode = "timer";
  const targetHour = 17;
  const targetMinute = 46;
  const targetSecond = 0;
  console.clear();
  console.log(
    `\n⏳ Timer started ${targetHour}:${String(targetMinute).padStart(
      2,
      "0"
    )} — type 'exit' to return or 'clear' to clear screen.\n`
  );

  timerInterval = setInterval(() => {
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
      console.log("⏰ Time is up!");
      clearInterval(timerInterval);
      timerInterval = null;
      currentMode = null;
      startAppMenu();
      return;
    }

    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
    );
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    const totalSeconds = Math.floor(timeRemaining / 1000);

    console.log(
      `🕒 ${currHours}:${currMinutes}:${currSeconds} | Time remaining: ${hours
        .toString()
        .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")} | ${Math.floor(totalSeconds / 60)}m ${String(
        totalSeconds % 60
      ).padStart(2, "0")}s | ${Math.floor(totalSeconds)}s`
    );
  }, 1000);
}

const columns = ["a", "b", "c", "d", "e", "f", "g", "h"];
const rows = ["1", "2", "3", "4", "5", "6", "7", "8"];
const knightMoves = [
  [2, 1],
  [1, 2],
  [-1, 2],
  [-2, 1],
  [-2, -1],
  [-1, -2],
  [1, -2],
  [2, -1],
];

function isValidInput(input) {
  if (!input || input.length !== 2) return false;
  const [col, row] = input.toLowerCase().split("");
  return columns.includes(col) && rows.includes(row);
}

function getValidKnightMoves(position) {
  const [col, row] = position.toLowerCase().split("");
  const x = columns.indexOf(col);
  const y = parseInt(row) - 1;
  const validMoves = [];

  for (const [dx, dy] of knightMoves) {
    const newX = x + dx;
    const newY = y + dy;
    if (newX >= 0 && newX < 8 && newY >= 0 && newY < 8) {
      validMoves.push(`${columns[newX]}${newY + 1}`);
    }
  }
  return validMoves;
}

function startChessApp() {
  currentMode = "chess";
  console.clear();
  console.log(
    "♞ Enter knight's position (e.g., a1, e4), or type 'exit' to return to menu, 'clear' to clear screen:"
  );
}

function startPunchApp() {
  currentMode = "punch";
  punchRecords = [];
  console.clear();
  console.log(`Punch Hours Calculator Started!
Type:
- 'in HHMM' to punch in (e.g., in 0930)
- 'out HHMM' to punch out (e.g., out 1300)
- 'calc' to calculate total hours
- 'reset' to clear all punches
- 'exit' to return to menu
- 'clear' to clear screen`);
}

function parseTimeStr(timeStr) {
  if (!/^\d{4}$/.test(timeStr)) return null;
  const hh = parseInt(timeStr.slice(0, 2));
  const mm = parseInt(timeStr.slice(2, 4));
  if (hh > 23 || mm > 59) return null;
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0);
}

rl.on("line", (input) => {
  const trimmed = input.trim().toLowerCase();

  if (trimmed === "clear") {
    console.clear();
    if (currentMode === "chess") {
      console.log(
        "♞ Enter knight's position (e.g., a1, e4), or type 'exit' to return to menu, 'clear' to clear screen:"
      );
    } else if (currentMode === "timer") {
      console.log("🧼 Screen cleared. Timer continues running...");
    } else if (currentMode === "punch") {
      console.log("🧼 Screen cleared. Continue punching...");
    } else {
      console.log("🧼 Screen cleared.");
      startAppMenu();
    }
    return;
  }

  if (trimmed === "exit") {
    if (currentMode === "timer") {
      console.log("↩️ Exiting Timer App...");
      clearInterval(timerInterval);
      timerInterval = null;
      currentMode = null;
      startAppMenu();
    } else if (currentMode === "chess") {
      console.log("↩️ Exiting Knight Move Checker...");
      currentMode = null;
      startAppMenu();
    } else if (currentMode === "punch") {
      console.log("↩️ Exiting Punch Hours Calculator...");
      currentMode = null;
      startAppMenu();
    } else {
      console.log("👋 Exiting the app. Goodbye!");
      rl.close();
      process.exit(0);
    }
    return;
  }

  if (currentMode === "chess") {
    if (!isValidInput(trimmed)) {
      console.log("❌ Invalid input. Use format like 'b1', 'h8'.");
    } else {
      const moves = getValidKnightMoves(trimmed);
      console.log(`✅ Knight's valid moves from '${trimmed}':`);
      console.log(moves.join(", "));
    }
    console.log("\n⏎ Enter another position, or type 'exit' / 'clear':");
    return;
  }

  if (currentMode === "punch") {
    if (trimmed === "calc") {
      if (punchRecords.length < 2) {
        console.log("⚠️ Not enough punch records to calculate.");
      } else {
        let totalMs = 0;
        for (let i = 0; i < punchRecords.length; i += 2) {
          const inTime = punchRecords[i];
          const outTime = punchRecords[i + 1];
          if (!outTime) {
            console.log(`⚠️ Missing out time for punch at ${inTime.time}`);
            break;
          }
          totalMs += outTime.date - inTime.date;
        }
        const totalMins = Math.floor(totalMs / 60000);
        const hrs = Math.floor(totalMins / 60)
          .toString()
          .padStart(2, "0");
        const mins = (totalMins % 60).toString().padStart(2, "0");
        console.log(
          `✅ Total worked time: ${hrs}:${mins} (${totalMins} minutes)`
        );

        if (totalMins < 480) {
          const remainingMins = 480 - totalMins;
          const now = new Date();
          now.setMinutes(now.getMinutes() + remainingMins);
          const extraHrs = now.getHours().toString().padStart(2, "0");
          const extraMins = now.getMinutes().toString().padStart(2, "0");
          console.log(
            `🕒 You need to work ${remainingMins} more minutes. Stay until ${extraHrs}:${extraMins}`
          );
        }
      }
      console.log("\n⏎ Enter more, or type 'reset', 'exit', or 'clear':");
      return;
    }

    if (trimmed === "reset") {
      punchRecords = [];
      console.log("🔁 Punch records cleared.");
      return;
    }

    const [cmd, timeStr] = trimmed.split(" ");
    if ((cmd === "in" || cmd === "out") && timeStr) {
      const parsedDate = parseTimeStr(timeStr);
      if (!parsedDate) {
        console.log("❌ Invalid time format. Use HHMM (e.g., 0930)");
      } else {
        punchRecords.push({ type: cmd, time: timeStr, date: parsedDate });
        console.log(`✅ Recorded '${cmd}' at ${timeStr}`);
      }
    } else {
      console.log(
        "❌ Invalid command. Use 'in HHMM', 'out HHMM', 'calc', 'reset'"
      );
    }

    console.log(
      "\n⏎ Continue entering punches, or type 'calc' / 'reset' / 'exit' / 'clear':"
    );
    return;
  }

  if (!currentMode) {
    if (trimmed === "1") {
      startTimerApp();
    } else if (trimmed === "2") {
      startChessApp();
    } else if (trimmed === "3") {
      startPunchApp();
    } else {
      console.log("❌ Invalid choice. Type '1', '2', '3', 'exit', or 'clear'.");
    }
  }
});

console.log("🎯 Welcome to the Multi-App CLI!");
startAppMenu();

// import axios from "axios";

// const resp = await axios.post(
//   "https://api.perplexity.ai/chat/completions",
//   {
//     model: "sonar-pro",
//     messages: [{ role: "user", content: "Define RAG in LLMs" }],
//   },
//   {
//     headers: {
//       Authorization: `Bearer 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`,
//     },
//   }
// );
// console.log(resp.data.choices[0].message.content);
