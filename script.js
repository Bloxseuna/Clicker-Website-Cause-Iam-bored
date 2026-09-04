// Supabase support is optional and will only activate when the project URL is filled in.
// The app still works completely offline when opened as a direct file.
const supabaseUrl = "https://taiplbyjbzylhodxfqri.supabase.co";
const supabaseAnonKey = "sb_publishable_9m60t8PkiAelfPBG7wCjpQ_U9Zkm9Ry";

const leaderboardTable = "leaderboard";
const usernameStorageKey = "clickerUsername";
const leaderboardRefreshSeconds = 5000;
const syncDelayMs = 1500;

let score = 0;
let pendingClicks = 0;
let syncTimer = null;
let leaderboardBody = null;
let currentUsername = "";

const hasValidSupabaseConfig =
  supabaseUrl.startsWith("https://") &&
  !supabaseUrl.includes("YOUR_PROJECT_REF") &&
  supabaseAnonKey.length > 20 &&
  !supabaseAnonKey.includes("YOUR_ANON_KEY");

const supabase =
  typeof window !== "undefined" && window.supabase && hasValidSupabaseConfig
    ? window.supabase.createClient(supabaseUrl, supabaseAnonKey)
    : null;

function generateUsername() {
  const randomPart = Math.floor(Math.random() * 10000000000)
    .toString()
    .padStart(10, "0");
  return `user-${randomPart}`;
}

function getCurrentUsername() {
  const saved = localStorage.getItem(usernameStorageKey);

  if (saved && saved.trim()) {
    currentUsername = saved.trim();
    return currentUsername;
  }

  currentUsername = generateUsername();
  localStorage.setItem(usernameStorageKey, currentUsername);
  return currentUsername;
}

function setStatus(message, isError = false) {
  const statusText = document.getElementById("statusText");
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}

function updateTotalClicks() {
  const totalClicksEl = document.getElementById("totalClicks");
  if (totalClicksEl) {
    totalClicksEl.textContent = score.toLocaleString();
  }
}

function renderOfflineMessage() {
  if (!leaderboardBody) return;
  leaderboardBody.innerHTML = `
    <tr>
      <td colspan="3" class="table-empty">Offline mode: clicks work locally.</td>
    </tr>
  `;
}

function updateLeaderboardTable(rows) {
  if (!leaderboardBody) return;

  leaderboardBody.innerHTML = "";

  if (!rows || rows.length === 0) {
    leaderboardBody.innerHTML = `
      <tr>
        <td colspan="3" class="table-empty">No scores yet. Be the first!</td>
      </tr>
    `;
    return;
  }

  rows.forEach((player, index) => {
    const row = document.createElement("tr");
    const rankCell = document.createElement("td");
    const usernameCell = document.createElement("td");
    const scoreCell = document.createElement("td");

    const rank = index + 1;
    rankCell.innerHTML = `<span class="rank-pill ${rank <= 3 ? "rank-top" : ""}">${rank}</span>`;
    usernameCell.textContent = player.username;
    scoreCell.textContent = Number(player.score || 0).toLocaleString();

    row.append(rankCell, usernameCell, scoreCell);
    leaderboardBody.appendChild(row);
  });
}

async function fetchLeaderboard() {
  if (!supabase || !leaderboardBody) return;

  try {
    const { data, error } = await supabase
      .from(leaderboardTable)
      .select("username, score")
      .order("score", { ascending: false })
      .limit(10);

    if (error) throw error;
    updateLeaderboardTable(data);
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    leaderboardBody.innerHTML = `
      <tr>
        <td colspan="3" class="table-empty">Leaderboard unavailable right now.</td>
      </tr>
    `;
  }
}

function scheduleLeaderboardSync() {
  if (!supabase) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const username = getCurrentUsername();
    const safeUsername = username.replace(/[^a-zA-Z0-9 _-]/g, "").trim();

    if (!safeUsername || pendingClicks <= 0) return;

    pendingClicks = 0;

    try {
      const { error } = await supabase.from(leaderboardTable).upsert(
        {
          username: safeUsername,
          score: score,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username" }
      );

      if (error) throw error;
      setStatus(`Score synced for ${safeUsername}.`);
      await fetchLeaderboard();
    } catch (error) {
      console.error("Failed to save score:", error);
      pendingClicks = 0;
      setStatus("Sync failed. Your score is still saved locally.", true);
    }
  }, syncDelayMs);
}

function handleClick() {
  const username = getCurrentUsername();
  score += 1;
  pendingClicks += 1;
  updateTotalClicks();
  setStatus(`Excellent! ${username} is on fire.`);

  if (supabase) {
    scheduleLeaderboardSync();
  }
}

function startLeaderboardPolling() {
  if (!supabase || !leaderboardBody) return;
  fetchLeaderboard();
  setInterval(fetchLeaderboard, leaderboardRefreshSeconds);
}

let gameInitialized = false;

function initGame() {
  if (gameInitialized) return;
  gameInitialized = true;

  leaderboardBody = document.getElementById("leaderboardBody");
  const clickButton = document.getElementById("clickButton");
  const statusText = document.getElementById("statusText");

  if (!clickButton || !leaderboardBody || !statusText) {
    console.error("Missing game elements.");
    return;
  }

  const username = getCurrentUsername();
  setStatus(`Player: ${username}. Click to boost your score!`);
  updateTotalClicks();

  clickButton.addEventListener("click", handleClick);
  clickButton.disabled = false;

  if (supabase) {
    startLeaderboardPolling();
  } else {
    renderOfflineMessage();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initGame, { once: true });
} else {
  initGame();
}

window.addEventListener("load", initGame, { once: true });
