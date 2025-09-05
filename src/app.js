import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  addDoc,
  onSnapshot,
  collection,
  updateDoc,
  runTransaction,
  query,
  orderBy,
  limit,
  setDoc,
  where,
  getDocs,
} from "firebase/firestore";

import "./icons.js"; // Importing the icons module to set up FontAwesome icons

const screens = {
  auth: document.getElementById("auth-screen"),
  lounge: document.getElementById("game-lounge"),
  game: document.getElementById("game-screen"),
};
const nameInput = document.getElementById("name-input");
const loginBtn = document.getElementById("login-btn");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const joinGameInput = document.getElementById("join-game-input");
const playerNameDisplay = document.getElementById("player-name-display");
const turnIndicator = document.getElementById("turn-indicator");
const boardElement = document.getElementById("board");
const winningMessage = document.getElementById("winningMessage");
const winningMessageText = document.getElementById("winning-message-text");
const restartBtn = document.getElementById("restartBtn");
const leaderboardList = document.getElementById("leaderboard");
const playerXInfo = document.getElementById("player-x-info");
const playerOInfo = document.getElementById("player-o-info");
const shareInviteBtn = document.getElementById("share-invite-btn");
const shareFeedback = document.getElementById("share-feedback");
const leaveGameBtn = document.getElementById("leave-game-btn");
const nameTakenModal = document.getElementById("name-taken-modal");
const closeModalBtn = document.getElementById("close-modal-btn");

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Game State Variables ---
let currentUserId = null; // This will now be the Firebase Auth UID
let currentUsername = null;
let firebaseUser = null;
let currentGameId = null;
let unsubscribeFromGame = null;
let unsubscribeFromLeaderboard = null;
let playerStatUnsubscribes = [];

const Winning_Combinations = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

// --- Core App Functions ---
const showScreen = (screenName) => {
  Object.values(screens).forEach((s) => s.classList.add("hidden"));
  screens[screenName].classList.remove("hidden");
};

async function displayInviteMessage() {
  const urlParams = new URLSearchParams(window.location.search);
  const gameIdFromUrl = urlParams.get("gId");
  const inviteMessageEl = document.getElementById("invite-message");
  const hostNameEl = document.getElementById("host-name");
  const authPromptEl = document.getElementById("auth-prompt-message");

  if (gameIdFromUrl && inviteMessageEl) {
    try {
      // Perform a quick, anonymous read of the game document
      const gameRef = doc(db, "games", gameIdFromUrl);
      const gameSnap = await getDoc(gameRef);

      if (gameSnap.exists()) {
        const gameData = gameSnap.data();
        // Find the host (Player X)
        const hostId = Object.keys(gameData.players).find(
          (id) => gameData.players[id].symbol === "X"
        );
        if (hostId) {
          const hostName = gameData.players[hostId].name;
          hostNameEl.textContent = hostName;
          inviteMessageEl.classList.remove("hidden");
          // Hide the generic prompt for a more tailored message
          authPromptEl.classList.add("hidden");
        }
      }
    } catch (error) {
      console.error("Could not fetch invite details:", error);
      // Fail silently if gId is invalid or a network error occurs
    }
  }
}

// --- App Initialization and Auth Flow ---
function initializeAppUI() {
  const storedUserName = localStorage.getItem("ticTacToeUserName");
  if (storedUserName) {
    currentUsername = storedUserName;
    playerNameDisplay.textContent = currentUsername;
    showScreen("lounge");
  } else {
    showScreen("auth");
  }
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    firebaseUser = user;
    currentUserId = user.uid; // Use the official Firebase UID

    const storedUserName = localStorage.getItem("ticTacToeUserName");
    if (storedUserName) {
      currentUsername = storedUserName;
      playerNameDisplay.textContent = currentUsername;
      showScreen("lounge");
      listenForLeaderboard();

      const urlParams = new URLSearchParams(window.location.search);
      const gameIdFromUrl = urlParams.get("gId");
      if (gameIdFromUrl) await joinGame(gameIdFromUrl);
    } else {
      showScreen("auth");
      await displayInviteMessage(); // Check for and show the invite message
    }
  } else {
    firebaseUser = null;
    currentUserId = null;
    if (unsubscribeFromLeaderboard) unsubscribeFromLeaderboard();
  }
});

loginBtn.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  if (!name) return alert("Please enter a name!");
  if (!currentUserId)
    return alert("Still authenticating... please wait a moment.");

  const statsRef = collection(db, "playerStats");
  const q = query(statsRef, where("name", "==", name));
  const querySnapshot = await getDocs(q);
  if (!querySnapshot.empty) {
    nameTakenModal.classList.remove("hidden");
    nameTakenModal.classList.add("flex");
    return;
  }

  currentUsername = name;
  localStorage.setItem("ticTacToeUserName", currentUsername);

  const userStatsRef = doc(db, "playerStats", currentUserId);
  await setDoc(userStatsRef, {
    name: currentUsername,
    wins: 0,
    losses: 0,
    draws: 0,
  });

  playerNameDisplay.textContent = currentUsername;
  showScreen("lounge");
  listenForLeaderboard();

  const urlParams = new URLSearchParams(window.location.search);
  const gameIdFromUrl = urlParams.get("gId");
  if (gameIdFromUrl) await joinGame(gameIdFromUrl);
});

closeModalBtn.addEventListener("click", () => {
  nameTakenModal.classList.add("hidden");
  nameTakenModal.classList.remove("flex");
});

// --- Game Creation and Joining ---
createGameBtn.addEventListener("click", async () => {
  if (!currentUserId) return;
  const gameRef = await addDoc(collection(db, "games"), {
    players: { [currentUserId]: { symbol: "X", name: currentUsername } },
    playerIds: [currentUserId],
    board: Array(9).fill(null),
    currentPlayer: "X",
    status: "waiting",
    winner: null,
    statsProcessed: false,
  });
  await joinGame(gameRef.id);
});

joinGameBtn.addEventListener("click", () => {
  const input = joinGameInput.value.trim();
  let gameId = input;
  if (input.includes("?gId=")) {
    try {
      gameId = new URL(input).searchParams.get("gId");
    } catch (e) {
      return alert("The URL you pasted is not valid.");
    }
  }
  if (gameId) joinGame(gameId);
});

async function joinGame(gameId) {
  if (!currentUserId) return alert("You need to be logged in to join a game!");
  const gameRef = doc(db, "games", gameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw "Game not found!";
      const gameData = gameSnap.data();
      if (
        gameData.playerIds.length === 1 &&
        !gameData.playerIds.includes(currentUserId)
      ) {
        transaction.update(gameRef, {
          players: {
            ...gameData.players,
            [currentUserId]: { symbol: "O", name: currentUsername },
          },
          playerIds: [...gameData.playerIds, currentUserId],
          status: "playing",
        });
      } else if (!gameData.playerIds.includes(currentUserId)) {
        throw "This game is already full!";
      }
    });
    subscribeToGame(gameId);
  } catch (error) {
    alert(error);
  }
}

function createBoard() {
  boardElement.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell");
    cell.dataset.index = i;
    cell.addEventListener("click", handleCellClick);
    boardElement.appendChild(cell);
  }
}

function subscribeToGame(gameId) {
  if (unsubscribeFromGame) unsubscribeFromGame();
  currentGameId = gameId;
  showScreen("game");
  createBoard();
  const gameRef = doc(db, "games", gameId);
  unsubscribeFromGame = onSnapshot(gameRef, (doc) => {
    const gameData = doc.data();
    if (gameData) {
      renderGame(gameData);
      subscribeToPlayerStats(gameData);
    }
  });
}

function renderGame(gameData) {
  gameData.board.forEach((mark, i) => {
    const cell = boardElement.children[i];
    cell.classList.remove("x", "circle");
    if (mark) cell.classList.add(mark === "X" ? "x" : "circle");
  });

  const pX = Object.values(gameData.players).find((p) => p.symbol === "X");
  const pO = Object.values(gameData.players).find((p) => p.symbol === "O");
  playerXInfo.querySelector(
    "p.font-bold"
  ).innerHTML = `<span class="text-2xl" style="color: #00d4ff;">X</span> ${
    pX ? pX.name : "..."
  }`;
  playerOInfo.querySelector("p.font-bold").innerHTML = `${
    pO ? pO.name : "..."
  } <span class="text-2xl" style="color: #ff4d94;">O</span>`;
  playerXInfo.dataset.playerId =
    Object.keys(gameData.players).find(
      (id) => gameData.players[id].symbol === "X"
    ) || "";
  playerOInfo.dataset.playerId =
    Object.keys(gameData.players).find(
      (id) => gameData.players[id].symbol === "O"
    ) || "";

  playerXInfo.classList.remove("player-active");
  playerOInfo.classList.remove("player-active");

  if (gameData.status === "playing") {
    const activeInfo =
      gameData.currentPlayer === "X" ? playerXInfo : playerOInfo;
    activeInfo.classList.add("player-active");
    activeInfo.style.setProperty(
      "--active-color",
      gameData.currentPlayer === "X" ? "#00d4ff" : "#ff4d94"
    );
  }

  if (!gameData.players[currentUserId]) return;
  const mySymbol = gameData.players[currentUserId].symbol;
  const isMyTurn = gameData.currentPlayer === mySymbol;

  if (gameData.status === "playing") {
    winningMessage.classList.add("hidden");
    const cName = gameData.currentPlayer === "X" ? pX.name : pO ? pO.name : "";
    turnIndicator.textContent = isMyTurn ? "Your turn!" : `${cName}'s turn`;
  } else if (gameData.status === "finished") {
    winningMessage.classList.remove("hidden");
    winningMessage.classList.add("flex");
    if (gameData.winner) {
      winningMessageText.textContent =
        mySymbol === gameData.winner ? "You Win!" : "You Lose!";
    } else {
      winningMessageText.textContent = "It's a Draw!";
    }
    if (mySymbol === "X") updatePlayerStats(gameData);
  } else if (gameData.status === "waiting") {
    turnIndicator.textContent = "Waiting for an opponent...";
  }
}

function subscribeToPlayerStats(gameData) {
  playerStatUnsubscribes.forEach((unsub) => unsub());
  playerStatUnsubscribes = [];
  gameData.playerIds.forEach((id) => {
    const playerRef = doc(db, "playerStats", id);
    const unsub = onSnapshot(playerRef, (doc) => {
      const data = doc.data();
      if (data) {
        const statsText = `W:${data.wins} L:${data.losses} D:${data.draws}`;
        if (playerXInfo.dataset.playerId === id)
          playerXInfo.querySelector(".player-stats").textContent = statsText;
        else if (playerOInfo.dataset.playerId === id)
          playerOInfo.querySelector(".player-stats").textContent = statsText;
      }
    });
    playerStatUnsubscribes.push(unsub);
  });
}

async function handleCellClick(e) {
  const index = parseInt(e.target.dataset.index);
  if (!currentGameId || !currentUserId) return;
  const gameRef = doc(db, "games", currentGameId);
  try {
    await runTransaction(db, async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      if (!gameSnap.exists()) throw "Game does not exist!";
      const gameData = gameSnap.data();
      const pSym = gameData.players[currentUserId]?.symbol;
      if (
        gameData.status === "playing" &&
        gameData.currentPlayer === pSym &&
        !gameData.board[index]
      ) {
        const nBoard = [...gameData.board];
        nBoard[index] = pSym;
        const win = Winning_Combinations.some((c) =>
          c.every((i) => nBoard[i] === pSym)
        );
        const draw = !win && nBoard.every((cell) => cell !== null);
        transaction.update(gameRef, {
          board: nBoard,
          currentPlayer: pSym === "X" ? "O" : "X",
          status: win || draw ? "finished" : "playing",
          winner: win ? pSym : null,
        });
      }
    });
  } catch (error) {
    console.error("Cell click transaction failed: ", error);
  }
}

restartBtn.addEventListener("click", async () => {
  if (!currentGameId) return;
  await updateDoc(doc(db, "games", currentGameId), {
    board: Array(9).fill(null),
    currentPlayer: "X",
    status: "playing",
    winner: null,
    statsProcessed: false,
  });
});

leaveGameBtn.addEventListener("click", () => {
  if (unsubscribeFromGame) unsubscribeFromGame();
  playerStatUnsubscribes.forEach((unsub) => unsub());
  currentGameId = null;
  showScreen("lounge");
  window.history.pushState({}, document.title, window.location.pathname);
});

shareInviteBtn.addEventListener("click", async () => {
  const shareUrl = `${window.location.origin}${window.location.pathname}?gId=${currentGameId}`;
  const shareData = {
    title: "Tic-Tac-Toe Challenge!",
    text: `Come play Tic-Tac-Toe with me!`,
    url: shareUrl,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      shareFeedback.textContent = "Invite sent!";
    } else {
      await navigator.clipboard.writeText(shareUrl);
      shareFeedback.textContent = "Invite URL copied!";
    }
  } catch (err) {
    try {
      await navigator.clipboard.writeText(shareUrl);
      shareFeedback.textContent = "Sharing failed, URL copied!";
    } catch (copyErr) {
      shareFeedback.textContent = "Could not copy URL.";
      shareFeedback.classList.replace("text-green-400", "text-red-400");
    }
  }
  shareFeedback.classList.remove("opacity-0");
  setTimeout(() => {
    shareFeedback.classList.add("opacity-0");
    shareFeedback.classList.replace("text-red-400", "text-green-400");
  }, 3000);
});

async function updatePlayerStats(gameData) {
  if (gameData.statsProcessed) return;
  const wSym = gameData.winner;
  const wId = Object.keys(gameData.players).find(
    (key) => gameData.players[key].symbol === wSym
  );
  const isDraw = !wSym;
  for (const pId of gameData.playerIds) {
    const pRef = doc(db, "playerStats", pId);
    try {
      await runTransaction(db, async (transaction) => {
        const pDoc = await transaction.get(pRef);
        const data = pDoc.data() || {};
        let { wins = 0, losses = 0, draws = 0 } = data;
        if (isDraw) draws++;
        else if (pId === wId) wins++;
        else losses++;
        transaction.set(
          pRef,
          { ...data, wins, losses, draws },
          { merge: true }
        );
      });
    } catch (e) {
      console.error(`Stat update for player ${pId} failed:`, e);
    }
  }
  await updateDoc(doc(db, "games", currentGameId), { statsProcessed: true });
}

function listenForLeaderboard() {
  if (unsubscribeFromLeaderboard) unsubscribeFromLeaderboard();
  const q = query(
    collection(db, "playerStats"),
    orderBy("wins", "desc"),
    limit(10)
  );
  unsubscribeFromLeaderboard = onSnapshot(q, (snapshot) => {
    leaderboardList.innerHTML = "";
    if (snapshot.empty) {
      leaderboardList.innerHTML =
        "<p class='text-gray-400 text-center'>No games played yet!</p>";
      return;
    }
    let rank = 1;
    snapshot.forEach((doc) => {
      const data = doc.data();
      const li = document.createElement("li");
      li.className =
        "grid grid-cols-[auto_1fr_auto] items-center gap-4 p-3 rounded-2xl bg-black/20";
      li.innerHTML = `
            <span class="font-bold text-xl w-8 text-center text-gray-400">${rank}</span>
            <span class="font-semibold text-white truncate" title="${
              data.name || "Anonymous"
            }">${data.name || "Anonymous"}</span>
            <div class="flex items-center justify-end gap-3 sm:gap-4 text-xs sm:text-sm font-mono">
                <span class="flex items-center gap-1.5 text-green-400" title="Wins"><i class="fa-solid fa-crown"></i> ${
                  data.wins || 0
                }</span>
                <span class="flex items-center gap-1.5 text-red-400" title="Losses"><i class="fa-solid fa-shield-halved"></i> ${
                  data.losses || 0
                }</span>
                <span class="flex items-center gap-1.5 text-gray-400" title="Draws"><i class="fa-solid fa-handshake"></i> ${
                  data.draws || 0
                }</span>
            </div>`;
      leaderboardList.appendChild(li);
      rank++;
    });
  });
}

// --- Initialize the App ---
initializeAppUI();
signInAnonymously(auth);

// PWA Service Worker Registration
// --- PWA Service Worker Registration ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(new URL("/sw.js", import.meta.url))
      .then((registration) => {
        console.log("SW registered: ", registration.scope);
      })
      .catch((registrationError) => {
        console.log("SW registration failed: ", registrationError);
      });
  });
}
