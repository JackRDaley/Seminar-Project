const steps = [...document.querySelectorAll(".workflow-step")];
const states = [...document.querySelectorAll(".prototype-state")];
const stageKicker = document.querySelector("#stageKicker");
const stageTitle = document.querySelector("#stageTitle");
const stageStatus = document.querySelector("#stageStatus");
const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toastMessage");
const triggerDialog = document.querySelector("#triggerDialog");
const suggestionPanel = document.querySelector("#suggestionPanel");
const pauseToggle = document.querySelector("#pauseToggle");
const pauseStatusText = document.querySelector("#pauseStatusText");
const triggerSummary = document.querySelector("#triggerSummary");
const continuedCount = document.querySelector("#continuedCount");
const closedCount = document.querySelector("#closedCount");
const outcomeInterpretation = document.querySelector("#outcomeInterpretation");

const copyByState = {
  detect: {
    kicker: "Stage 1 · Extension popup",
    title: "Turn a detected pattern into a choice",
    status: "Suggestion ready",
  },
  pause: {
    kicker: "Stage 2 · Just-in-time interruption",
    title: "Make the repeated return visible",
    status: "Pattern matched",
  },
  review: {
    kicker: "Stage 3 · Extension popup",
    title: "Review the outcome and keep control",
    status: "Today’s result",
  },
};

let toastTimer;

function showState(name) {
  states.forEach((state) => state.classList.toggle("is-visible", state.dataset.state === name));
  steps.forEach((step) => {
    const selected = step.dataset.step === name;
    step.classList.toggle("is-active", selected);
    step.setAttribute("aria-current", selected ? "step" : "false");
  });

  const copy = copyByState[name];
  stageKicker.textContent = copy.kicker;
  stageTitle.textContent = copy.title;
  stageStatus.textContent = copy.status;
  window.location.hash = name;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function setPauseEnabled(enabled) {
  pauseToggle.classList.toggle("is-on", enabled);
  pauseToggle.setAttribute("aria-checked", String(enabled));
  pauseToggle.setAttribute("aria-label", enabled ? "Pattern pause enabled" : "Pattern pause disabled");
  pauseStatusText.textContent = enabled ? "On for today · Ends at midnight" : "Off · No check-ins will appear";
  pauseStatusText.style.color = enabled ? "var(--green)" : "var(--quiet)";
}

function resetDemo() {
  suggestionPanel.classList.remove("is-dismissed");
  suggestionPanel.querySelector("h3").textContent = "Add a gentle check-in before Instagram?";
  suggestionPanel.querySelector("p").textContent =
    "For the rest of today, Saturn can pause when this pattern repeats. You can continue in one click.";
  document.querySelector("#enablePause").disabled = false;
  document.querySelector("#dismissSuggestion").disabled = false;
  setPauseEnabled(true);
  triggerSummary.textContent = "After 3 repeated visits within 30 minutes";
  continuedCount.textContent = "2";
  closedCount.textContent = "1";
  outcomeInterpretation.textContent = "The pause interrupted one return without preventing access.";
  triggerDialog.querySelector('input[value="3"]').checked = true;
  showState("detect");
  showToast("Demo reset.");
}

steps.forEach((step) => step.addEventListener("click", () => showState(step.dataset.step)));

document.querySelector("#enablePause").addEventListener("click", () => {
  setPauseEnabled(true);
  showToast("Pattern pause enabled for today.");
  window.setTimeout(() => showState("pause"), 320);
});

document.querySelector("#dismissSuggestion").addEventListener("click", () => {
  suggestionPanel.classList.add("is-dismissed");
  suggestionPanel.querySelector("h3").textContent = "Suggestion dismissed for today";
  suggestionPanel.querySelector("p").textContent =
    "Saturn will keep observing locally, but this pattern will not trigger a pause today.";
  document.querySelector("#enablePause").disabled = true;
  document.querySelector("#dismissSuggestion").disabled = true;
  showToast("No pause added. Your existing settings are unchanged.");
});

document.querySelectorAll("[data-open-trigger]").forEach((button) => {
  button.addEventListener("click", () => triggerDialog.showModal());
});

document.querySelector("#saveTrigger").addEventListener("click", () => {
  const value = triggerDialog.querySelector('input[name="trigger"]:checked').value;
  const descriptions = {
    3: "After 3 repeated visits within 30 minutes",
    5: "After 5 repeated visits within 30 minutes",
    7: "After 7 repeated visits within 60 minutes",
  };
  triggerSummary.textContent = descriptions[value];
  showToast("Pattern trigger updated.");
});

document.querySelector("#continueInstagram").addEventListener("click", () => {
  continuedCount.textContent = "2";
  closedCount.textContent = "1";
  outcomeInterpretation.textContent = "The pause interrupted one return without preventing access.";
  showToast("Continuing to Instagram—no settings changed.");
  window.setTimeout(() => showState("review"), 320);
});

document.querySelector("#closeTab").addEventListener("click", () => {
  continuedCount.textContent = "1";
  closedCount.textContent = "2";
  outcomeInterpretation.textContent = "The pause helped end two returns without locking the site.";
  showToast("Tab closed in the prototype.");
  window.setTimeout(() => showState("review"), 320);
});

document.querySelector("#disablePattern").addEventListener("click", () => {
  setPauseEnabled(false);
  showToast("This pattern will not pause again today.");
  window.setTimeout(() => showState("review"), 320);
});

pauseToggle.addEventListener("click", () => {
  const enabled = pauseToggle.getAttribute("aria-checked") !== "true";
  setPauseEnabled(enabled);
  showToast(enabled ? "Pattern pause turned on." : "Pattern pause turned off.");
});

document.querySelector("#keepPause").addEventListener("click", () => {
  setPauseEnabled(true);
  pauseStatusText.textContent = "Ongoing · Review anytime";
  showToast("Pattern pause kept. You can change it anytime.");
});

document.querySelector("#turnOffPause").addEventListener("click", () => {
  setPauseEnabled(false);
  showToast("Pattern pause turned off.");
});

document.querySelector("#resetDemo").addEventListener("click", resetDemo);

const initialState = ["detect", "pause", "review"].includes(window.location.hash.slice(1))
  ? window.location.hash.slice(1)
  : "detect";
showState(initialState);
